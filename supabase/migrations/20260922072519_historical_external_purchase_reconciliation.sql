begin;
-- Issue #98: truthful historical provenance; no receipt or inventory authority.
alter table public.purchase_orders
  add column record_origin text not null default 'planned' check(record_origin in('planned','historical_external')),
  add column reconciliation_key uuid,
  add column reconciliation_fingerprint text,
  add column reconstruction_evidence jsonb,
  alter column source_purchase_plan_id drop not null,
  alter column source_purchase_plan_revision drop not null,
  add constraint purchase_orders_origin_lineage check(
    (record_origin='planned' and source_purchase_plan_id is not null and source_purchase_plan_revision is not null
      and reconciliation_key is null and reconciliation_fingerprint is null and reconstruction_evidence is null)
    or
    (record_origin='historical_external' and source_purchase_plan_id is null and source_purchase_plan_revision is null
      and source_purchase_plan_version is null and source_purchase_plan_basket_id is null and source_round_id is null and source_scenario_id is null
      and reconciliation_key is not null and reconciliation_fingerprint is not null and reconstruction_evidence is not null
      and jsonb_typeof(reconstruction_evidence)='object' and reconstruction_evidence->>'acknowledgement' is not distinct from 'already_completed_external_purchase'
      and external_order_date is not null and status<>'draft')),
  add constraint purchase_orders_origin_key unique(workspace_id,id,record_origin),
  add constraint purchase_orders_reconciliation_key unique(workspace_id,reconciliation_key);

alter table public.purchase_order_lines
  add column record_origin text not null default 'planned' check(record_origin in('planned','historical_external')),
  alter column source_purchase_plan_line_id drop not null,
  add constraint purchase_order_lines_origin_lineage check(
    (record_origin='planned' and source_purchase_plan_line_id is not null) or
    (record_origin='historical_external' and source_purchase_plan_line_id is null and source_purchase_plan_basket_id is null
      and source_requirement_id is null and source_scenario_line_id is null)),
  add constraint purchase_order_lines_order_origin_fk foreign key(workspace_id,purchase_order_id,record_origin)
    references public.purchase_orders(workspace_id,id,record_origin);

-- Keep duplicate protection after confirmation/shipping, too. Existing conflicting
-- references deliberately fail migration rather than selecting an arbitrary order.
drop index public.purchase_orders_supplier_reference;
create unique index purchase_orders_supplier_reference on public.purchase_orders(workspace_id,supplier_id,lower(btrim(order_reference))) where order_reference is not null;
create unique index purchase_orders_supplier_order_number on public.purchase_orders(workspace_id,supplier_id,lower(btrim(supplier_order_number))) where supplier_order_number is not null;

-- Existing downstream RPCs truthfully copy the PO lineage into audit events.
alter table public.purchase_order_audit_events alter column source_purchase_plan_id drop not null;
create function public.enforce_purchase_order_audit_lineage() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from public.purchase_orders o where o.workspace_id=new.workspace_id and o.id=new.purchase_order_id
    and o.owner_id=new.owner_id and o.source_purchase_plan_id is not distinct from new.source_purchase_plan_id) then
    raise exception 'PURCHASE_ORDER_AUDIT_LINEAGE_INVALID';
  end if;
  return new;
end $$;
create trigger purchase_order_audit_lineage before insert or update on public.purchase_order_audit_events
  for each row execute function public.enforce_purchase_order_audit_lineage();
revoke all on function public.enforce_purchase_order_audit_lineage() from public,anon,authenticated;

-- Immutable command receipts retain the original response, even after downstream
-- receiving or later identity retirement. JSONB text is the canonical fingerprint.
create table public.historical_purchase_command_receipts(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  owner_id uuid not null,
  command text not null check(command in('owner_mapping','historical_purchase')),
  idempotency_key uuid not null,
  payload_fingerprint text not null,
  result jsonb not null check(jsonb_typeof(result)='object'),
  recorded_at timestamptz not null default now(),
  unique(workspace_id,command,idempotency_key)
);
alter table public.historical_purchase_command_receipts enable row level security;
create policy owner_select on public.historical_purchase_command_receipts for select to authenticated
  using(owner_id=(select auth.uid()) and exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid()) and w.lifecycle_state='active'));
revoke all on public.historical_purchase_command_receipts from public,anon,authenticated;
grant select on public.historical_purchase_command_receipts to authenticated;
grant all on public.historical_purchase_command_receipts to service_role;

create function public.accept_owner_reviewed_supplier_product_mapping(
  target_workspace_id uuid, candidate_idempotency_key uuid, mapping_payload jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); sp public.supplier_products; m public.supplier_product_ingredient_mappings;
  prior public.historical_purchase_command_receipts; result jsonb;
  fingerprint text:=encode(extensions.digest(mapping_payload::text,'sha256'),'hex');
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  perform 1 from public.workspaces where id=target_workspace_id and owner_id=uid and lifecycle_state='active' for update;
  if not found then raise exception 'WORKSPACE_UNAVAILABLE'; end if;
  if candidate_idempotency_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  select * into prior from public.historical_purchase_command_receipts where workspace_id=target_workspace_id and command='owner_mapping' and idempotency_key=candidate_idempotency_key;
  if found then
    if prior.payload_fingerprint is distinct from fingerprint then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return prior.result;
  end if;
  if jsonb_typeof(mapping_payload) is distinct from 'object' or nullif(btrim(mapping_payload->>'evidenceReference'),'') is null
    or nullif(btrim(mapping_payload->>'acceptanceNote'),'') is null then raise exception 'MAPPING_EVIDENCE_AND_NOTE_REQUIRED'; end if;
  select * into sp from public.supplier_products where workspace_id=target_workspace_id and owner_id=uid and id=mapping_payload->>'supplierProductId' for update;
  if not found then raise exception 'SUPPLIER_PRODUCT_UNAVAILABLE'; end if;
  perform 1 from public.ingredients where workspace_id=target_workspace_id and owner_id=uid and id=mapping_payload->>'ingredientId';
  if not found then raise exception 'INGREDIENT_UNAVAILABLE'; end if;
  if sp.ingredient_id is distinct from mapping_payload->>'ingredientId' then raise exception 'CANONICAL_INGREDIENT_MISMATCH'; end if;
  select * into m from public.supplier_product_ingredient_mappings where workspace_id=target_workspace_id and supplier_product_id=sp.id and status='accepted';
  if found and (m.ingredient_id is distinct from sp.ingredient_id or m.owner_id is distinct from uid) then raise exception 'AMBIGUOUS_ACCEPTED_MAPPING'; end if;
  if m.id is null then
    insert into public.supplier_product_ingredient_mappings(workspace_id,owner_id,supplier_product_id,ingredient_id,status,acceptance_method,accepted_by,accepted_at,provenance,notes,compatibility_snapshot)
    values(target_workspace_id,uid,sp.id,sp.ingredient_id,'accepted','owner_direct_identity_review',uid,now(),mapping_payload,
      btrim(mapping_payload->>'acceptanceNote'),jsonb_build_object('inci',sp.declared_inci,'grade',sp.grade,'supplierGrade',sp.supplier_grade,'tradeIdentity',sp.product_name,'packageUnit',sp.package_unit)) returning * into m;
  end if;
  if sp.supplier_id is not null and exists(select 1 from public.suppliers where workspace_id=target_workspace_id and id=sp.supplier_id and owner_id=uid) then
    insert into public.supplier_events(workspace_id,owner_id,supplier_id,event_type,occurred_at,title,description,source_key,metadata)
      values(target_workspace_id,uid,sp.supplier_id,'manual_note',now(),'Owner identity review recorded',mapping_payload->>'acceptanceNote',
        'owner-mapping:'||candidate_idempotency_key,jsonb_build_object('mappingId',m.id,'acceptanceMethod',m.acceptance_method,'evidenceReference',mapping_payload->>'evidenceReference'));
  end if;
  result:=jsonb_build_object('mappingId',m.id,'status',m.status,'acceptanceMethod',m.acceptance_method,'acceptedBy',m.accepted_by,'acceptedAt',m.accepted_at);
  insert into public.historical_purchase_command_receipts(workspace_id,owner_id,command,idempotency_key,payload_fingerprint,result)
    values(target_workspace_id,uid,'owner_mapping',candidate_idempotency_key,fingerprint,result);
  return result;
end $$;

create function public.reconcile_historical_external_purchase(
  target_workspace_id uuid, candidate_idempotency_key uuid, purchase_payload jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); prior public.historical_purchase_command_receipts; sp public.supplier_products;
  supplier uuid; oid uuid; lid uuid; cid uuid; sid uuid; item jsonb; ci jsonb; si jsonb;
  cp jsonb:=purchase_payload->'confirmation'; shp jsonb:=purchase_payload->'shipment';
  confirmation_lines jsonb:='[]'; shipment_lines jsonb:='[]'; line_ids jsonb:='[]';
  line_map jsonb:='{}'; result jsonb; field text; amount numeric; subtotal numeric:=0; rev bigint;
  fingerprint text:=encode(extensions.digest(purchase_payload::text,'sha256'),'hex');
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  -- Serializes retries and duplicate reconstruction within this owner workspace.
  perform 1 from public.workspaces where id=target_workspace_id and owner_id=uid and lifecycle_state='active' for update;
  if not found then raise exception 'WORKSPACE_UNAVAILABLE'; end if;
  if candidate_idempotency_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  select * into prior from public.historical_purchase_command_receipts where workspace_id=target_workspace_id and command='historical_purchase' and idempotency_key=candidate_idempotency_key;
  if found then
    if prior.payload_fingerprint is distinct from fingerprint then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return prior.result;
  end if;
  if jsonb_typeof(purchase_payload) is distinct from 'object' or purchase_payload->>'acknowledgement' is distinct from 'already_completed_external_purchase' then raise exception 'HISTORICAL_ACKNOWLEDGEMENT_REQUIRED'; end if;
  foreach field in array array['supplierId','supplierOrderNumber','externalOrderDate','currency','evidenceType','evidenceReference','evidenceNote'] loop
    if nullif(btrim(purchase_payload->>field),'') is null then raise exception 'HISTORICAL_REQUIRED_FIELD: %',field; end if;
  end loop;
  if purchase_payload->>'currency' !~ '^[A-Z]{3}$' then raise exception 'CURRENCY_INVALID'; end if;
  if not isfinite((purchase_payload->>'externalOrderDate')::timestamptz) then raise exception 'EXTERNAL_ORDER_DATE_INVALID'; end if;
  foreach field in array array['merchandiseSubtotal','grandTotal'] loop
    if jsonb_typeof(purchase_payload->field) is distinct from 'number' or (purchase_payload->>field)::numeric<0 then raise exception 'COMMERCIAL_VALUE_REQUIRED: %',field; end if;
  end loop;
  foreach field in array array['shipping','discount','vat','importVat','duty','customs','handling'] loop
    if purchase_payload->field is not null and purchase_payload->field<>'null'::jsonb and
      (jsonb_typeof(purchase_payload->field)<>'number' or (purchase_payload->>field)::numeric<0) then raise exception 'COMMERCIAL_VALUE_INVALID: %',field; end if;
  end loop;
  supplier:=(purchase_payload->>'supplierId')::uuid;
  perform 1 from public.suppliers where workspace_id=target_workspace_id and id=supplier and owner_id=uid for update;
  if not found then raise exception 'SUPPLIER_UNAVAILABLE'; end if;
  if exists(select 1 from public.purchase_orders where workspace_id=target_workspace_id and supplier_id=supplier and
    (lower(btrim(supplier_order_number))=lower(btrim(purchase_payload->>'supplierOrderNumber')) or
     lower(btrim(order_reference))=lower(btrim(purchase_payload->>'supplierOrderNumber')) or
     lower(btrim(order_reference))=lower(btrim(purchase_payload->>'customerReference')))) then raise exception 'EXTERNAL_ORDER_REFERENCE_CONFLICT'; end if;
  if jsonb_typeof(purchase_payload->'lines') is distinct from 'array' or jsonb_array_length(purchase_payload->'lines')=0 then raise exception 'ORDER_LINES_REQUIRED'; end if;
  if cp='null'::jsonb then cp:=null; end if;
  if shp='null'::jsonb then shp:=null; end if;
  if shp is not null and cp is null then raise exception 'SHIPMENT_REQUIRES_CONFIRMATION'; end if;

  insert into public.purchase_orders(workspace_id,owner_id,supplier_id,record_origin,reconciliation_key,reconciliation_fingerprint,reconstruction_evidence,
    status,order_reference,supplier_order_number,external_order_date,currency,merchandise_subtotal,shipping,discount,total,
    actual_currency,actual_merchandise_subtotal,actual_shipping,actual_discount,actual_vat,actual_import_vat,actual_duty,actual_customs,actual_handling,actual_grand_total,
    created_by,placement_revision,placement_evidence,commercial_snapshot,notes)
  values(target_workspace_id,uid,supplier,'historical_external',candidate_idempotency_key,fingerprint,purchase_payload-'lines'-'confirmation'-'shipment',
    'placed',coalesce(nullif(btrim(purchase_payload->>'customerReference'),''),btrim(purchase_payload->>'supplierOrderNumber')),btrim(purchase_payload->>'supplierOrderNumber'),(purchase_payload->>'externalOrderDate')::timestamptz,
    purchase_payload->>'currency',(purchase_payload->>'merchandiseSubtotal')::numeric,(purchase_payload->>'shipping')::numeric,(purchase_payload->>'discount')::numeric,(purchase_payload->>'grandTotal')::numeric,
    purchase_payload->>'currency',(purchase_payload->>'merchandiseSubtotal')::numeric,(purchase_payload->>'shipping')::numeric,(purchase_payload->>'discount')::numeric,
    (purchase_payload->>'vat')::numeric,(purchase_payload->>'importVat')::numeric,(purchase_payload->>'duty')::numeric,(purchase_payload->>'customs')::numeric,(purchase_payload->>'handling')::numeric,(purchase_payload->>'grandTotal')::numeric,
    uid,1,jsonb_build_object('type',purchase_payload->>'evidenceType','reference',purchase_payload->>'evidenceReference','note',purchase_payload->>'evidenceNote','origin','historical_external'),
    purchase_payload-'lines'-'confirmation'-'shipment','Historical reconstruction, not HQ pre-purchase approval.') returning id into oid;
  for item in select value from jsonb_array_elements(purchase_payload->'lines') loop
    foreach field in array array['lineKey','supplierProductId','productIdentity','packageUnit'] loop
      if nullif(btrim(item->>field),'') is null then raise exception 'LINE_REQUIRED_FIELD: %',field; end if;
    end loop;
    if line_map ? (item->>'lineKey') then raise exception 'DUPLICATE_LINE_KEY'; end if;
    foreach field in array array['packageSize','packageCount','unitPrice','lineTotal'] loop
      if jsonb_typeof(item->field) is distinct from 'number' then raise exception 'LINE_VALUE_REQUIRED: %',field; end if;
      amount:=(item->>field)::numeric;
      if amount<0 or (field in('packageSize','packageCount') and amount=0) then raise exception 'LINE_VALUE_INVALID: %',field; end if;
    end loop;
    if (item->>'lineTotal')::numeric<>round((item->>'unitPrice')::numeric*(item->>'packageCount')::numeric,2) then raise exception 'LINE_TOTAL_MISMATCH'; end if;
    select * into sp from public.supplier_products where workspace_id=target_workspace_id and owner_id=uid and id=item->>'supplierProductId' and supplier_id=supplier for update;
    if not found then raise exception 'SUPPLIER_PRODUCT_UNAVAILABLE'; end if;
    if not exists(select 1 from public.supplier_product_ingredient_mappings where workspace_id=target_workspace_id and owner_id=uid and supplier_product_id=sp.id and ingredient_id=sp.ingredient_id and status='accepted') then raise exception 'ACCEPTED_MAPPING_REQUIRED'; end if;
    insert into public.purchase_order_lines(workspace_id,owner_id,purchase_order_id,record_origin,supplier_product_id,canonical_ingredient_id,product_name_snapshot,supplier_sku_snapshot,variant_snapshot,
      package_size,package_unit,ordered_package_count,ordered_quantity,ordered_unit,unit_price,currency,line_subtotal,
      actual_package_count,actual_unit_price,actual_line_subtotal,product_snapshot,placement_actual_snapshot)
    values(target_workspace_id,uid,oid,'historical_external',sp.id,sp.ingredient_id,item->>'productIdentity',item->>'sku',item->>'variant',
      (item->>'packageSize')::numeric,item->>'packageUnit',(item->>'packageCount')::numeric,(item->>'packageSize')::numeric*(item->>'packageCount')::numeric,item->>'packageUnit',
      (item->>'unitPrice')::numeric,purchase_payload->>'currency',(item->>'lineTotal')::numeric,
      (item->>'packageCount')::numeric,(item->>'unitPrice')::numeric,(item->>'lineTotal')::numeric,item,item) returning id into lid;
    subtotal:=subtotal+(item->>'lineTotal')::numeric;
    line_ids:=line_ids||jsonb_build_array(jsonb_build_object('lineKey',item->>'lineKey','purchaseOrderLineId',lid));
    line_map:=line_map||jsonb_build_object(item->>'lineKey',lid);
  end loop;
  if subtotal<>(purchase_payload->>'merchandiseSubtotal')::numeric then raise exception 'MERCHANDISE_SUBTOTAL_MISMATCH'; end if;

  if cp is not null then
    foreach field in array array['supplierConfirmationReference','supplierConfirmationDate','evidenceType','evidenceReference','evidenceNote'] loop
      if nullif(btrim(cp->>field),'') is null then raise exception 'CONFIRMATION_REQUIRED_FIELD: %',field; end if;
    end loop;
    if not isfinite((cp->>'supplierConfirmationDate')::timestamptz) then raise exception 'CONFIRMATION_DATE_INVALID'; end if;
    if cp->>'confirmedCurrency' is distinct from purchase_payload->>'currency'
      or (cp->>'confirmedMerchandiseSubtotal')::numeric is distinct from subtotal
      or (cp->>'confirmedGrandTotal')::numeric is distinct from (purchase_payload->>'grandTotal')::numeric
      or (cp->>'confirmedShipping')::numeric is distinct from (purchase_payload->>'shipping')::numeric
      or (cp->>'confirmedDiscount')::numeric is distinct from (purchase_payload->>'discount')::numeric
      or (cp->>'confirmedTax')::numeric is distinct from (purchase_payload->>'vat')::numeric then raise exception 'CONFIRMATION_NOT_EXACT'; end if;
    if jsonb_typeof(cp->'lines') is distinct from 'array' or jsonb_array_length(cp->'lines')<>jsonb_array_length(purchase_payload->'lines') then raise exception 'CONFIRMATION_NOT_EXACT'; end if;
    for item in select value from jsonb_array_elements(purchase_payload->'lines') loop
      if (select count(*) from jsonb_array_elements(cp->'lines') x where x->>'lineKey'=item->>'lineKey')<>1 then raise exception 'CONFIRMATION_NOT_EXACT'; end if;
      select value into ci from jsonb_array_elements(cp->'lines') where value->>'lineKey'=item->>'lineKey';
      -- No price tolerance, copied identity, omitted quantity or subset may earn exact acceptance.
      foreach field in array array['supplierProductId','productIdentity','sku','variant','packageUnit'] loop
        if ci->>field is distinct from item->>field then raise exception 'CONFIRMATION_NOT_EXACT: %',field; end if;
      end loop;
      foreach field in array array['packageSize','packageCount','unitPrice','lineTotal'] loop
        if (ci->>field)::numeric is distinct from (item->>field)::numeric then raise exception 'CONFIRMATION_NOT_EXACT: %',field; end if;
      end loop;
      if (ci->>'quantity')::numeric is distinct from (item->>'packageSize')::numeric*(item->>'packageCount')::numeric then raise exception 'CONFIRMATION_NOT_EXACT: quantity'; end if;
      confirmation_lines:=confirmation_lines||jsonb_build_array(jsonb_build_object('purchaseOrderLineId',line_map->>(item->>'lineKey'),
        'confirmedProductIdentity',ci->>'productIdentity','confirmedSku',ci->>'sku','confirmedVariant',ci->>'variant',
        'confirmedPackageSize',ci->'packageSize','confirmedPackageUnit',ci->>'packageUnit','confirmedPackageCount',ci->'packageCount',
        'confirmedQuantity',ci->'quantity','confirmedUnitPrice',ci->'unitPrice','confirmedLineSubtotal',ci->'lineTotal','availabilityState','confirmed','historicalEvidence',ci));
    end loop;
    cid:=public.record_purchase_order_supplier_confirmation(oid,1,candidate_idempotency_key,cp||jsonb_build_object('lines',confirmation_lines,'confirmationType','historical_external_evidence','supplierNotes',cp->>'evidenceNote'));
    perform public.decide_purchase_order_confirmation(cid,1,'accepted_exact',cp->>'evidenceNote','[]');
  end if;
  if shp is not null then
    foreach field in array array['supplierShipmentReference','evidenceType','evidenceReference','evidenceNote','status'] loop
      if nullif(btrim(shp->>field),'') is null then raise exception 'SHIPMENT_REQUIRED_FIELD: %',field; end if;
    end loop;
    if shp->>'status' not in('preparing','dispatched','in_transit','delayed','carrier_exception','delivery_reported') then raise exception 'HISTORICAL_SHIPMENT_STATUS_INVALID'; end if;
    if shp->>'status'='delivery_reported' and (nullif(shp->>'reportedAt','') is null or not isfinite((shp->>'reportedAt')::timestamptz)) then raise exception 'DELIVERY_EVIDENCE_DATE_REQUIRED'; end if;
    if shp->>'status'='preparing' and nullif(shp->>'dispatchDate','') is not null then raise exception 'HISTORICAL_SHIPMENT_STATUS_INVALID'; end if;
    if nullif(shp->>'dispatchDate','') is not null and nullif(shp->>'reportedAt','') is not null and (shp->>'reportedAt')::timestamptz<(shp->>'dispatchDate')::timestamptz then raise exception 'SHIPMENT_DATE_ORDER_INVALID'; end if;
    if shp->>'status'='dispatched' and nullif(shp->>'dispatchDate','') is null then raise exception 'DISPATCH_DATE_REQUIRED'; end if;
    if jsonb_typeof(shp->'lines') is distinct from 'array' or jsonb_array_length(shp->'lines')=0 then raise exception 'SHIPMENT_LINES_REQUIRED'; end if;
    for si in select value from jsonb_array_elements(shp->'lines') loop
      if not (line_map ? (si->>'lineKey')) then raise exception 'SHIPMENT_LINE_INVALID'; end if;
      select value into item from jsonb_array_elements(purchase_payload->'lines') where value->>'lineKey'=si->>'lineKey';
      if coalesce((si->>'packageCount')::numeric,0)<=0 or (si->>'packageCount')::numeric>(item->>'packageCount')::numeric
        or (si->>'quantity')::numeric is distinct from (si->>'packageCount')::numeric*(item->>'packageSize')::numeric then raise exception 'SHIPMENT_QUANTITY_INVALID'; end if;
      select id into lid from public.purchase_order_confirmation_lines where confirmation_id=cid and purchase_order_line_id=(line_map->>(si->>'lineKey'))::uuid;
      shipment_lines:=shipment_lines||jsonb_build_array(jsonb_build_object('confirmationLineId',lid,'shippedPackageCount',si->'packageCount','shippedQuantity',si->'quantity','supplierLineReference',si->>'supplierLineReference'));
    end loop;
    select revision into rev from public.purchase_orders where id=oid;
    sid:=public.create_purchase_order_shipment(oid,cid,rev,candidate_idempotency_key,shp||jsonb_build_object('lines',shipment_lines,'shippingNotes',shp->>'evidenceNote'));
    if nullif(shp->>'dispatchDate','') is not null then
      if not isfinite((shp->>'dispatchDate')::timestamptz) then raise exception 'DISPATCH_DATE_INVALID'; end if;
      perform public.record_purchase_order_shipment_status(sid,1,'dispatched',shp,gen_random_uuid());
    end if;
    if shp->>'status'<>'preparing' and (shp->>'status'<>'dispatched' or nullif(shp->>'dispatchDate','') is null) then
      select revision into rev from public.purchase_order_shipments where id=sid;
      perform public.record_purchase_order_shipment_status(sid,rev,shp->>'status',shp,gen_random_uuid());
    end if;
  end if;
  select jsonb_build_object('purchaseOrderId',oid,'recordOrigin','historical_external','purchaseOrderState',status,'purchaseOrderRevision',revision,
    'lines',line_ids,'confirmationId',cid,'confirmationState',case when cid is not null then 'accepted_exact' end,
    'confirmationLineIds',coalesce((select jsonb_agg(id order by id) from public.purchase_order_confirmation_lines where confirmation_id=cid),'[]'::jsonb),
    'shipmentLineIds',coalesce((select jsonb_agg(id order by id) from public.purchase_order_shipment_lines where shipment_id=sid),'[]'::jsonb),
    'shipmentId',sid,'shipmentState',(select status from public.purchase_order_shipments where id=sid),'receivingCreated',false) into result from public.purchase_orders where id=oid;
  insert into public.historical_purchase_command_receipts(workspace_id,owner_id,command,idempotency_key,payload_fingerprint,result)
    values(target_workspace_id,uid,'historical_purchase',candidate_idempotency_key,fingerprint,result);
  insert into public.supplier_events(workspace_id,owner_id,supplier_id,event_type,occurred_at,title,description,purchase_order_id,source_key,metadata)
    values(target_workspace_id,uid,supplier,'manual_note',now(),'Historical external purchase reconstructed',purchase_payload->>'evidenceNote',oid,'historical-purchase:'||oid,result||jsonb_build_object('evidenceReference',purchase_payload->>'evidenceReference'));
  return result;
end $$;
revoke all on function public.accept_owner_reviewed_supplier_product_mapping(uuid,uuid,jsonb) from public,anon;
revoke all on function public.reconcile_historical_external_purchase(uuid,uuid,jsonb) from public,anon;
grant execute on function public.accept_owner_reviewed_supplier_product_mapping(uuid,uuid,jsonb) to authenticated;
grant execute on function public.reconcile_historical_external_purchase(uuid,uuid,jsonb) to authenticated;

commit;
