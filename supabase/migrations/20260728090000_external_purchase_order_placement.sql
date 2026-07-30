-- Explicit External Purchase Order Placement V1.
-- Placement records an external action already completed by the owner. It does
-- not imply payment settlement, supplier confirmation, shipment, receipt, or stock.

alter table public.purchase_orders
  add column placed_by uuid,
  add column placed_at timestamptz,
  add column placement_revision bigint,
  add column placement_policy_version text,
  add column placement_key uuid,
  add column placement_fingerprint text,
  add column actual_currency text check(actual_currency is null or actual_currency~'^[A-Z]{3}$'),
  add column actual_merchandise_subtotal numeric check(actual_merchandise_subtotal is null or actual_merchandise_subtotal>=0),
  add column actual_discount numeric check(actual_discount is null or actual_discount>=0),
  add column actual_shipping numeric check(actual_shipping is null or actual_shipping>=0),
  add column actual_vat numeric check(actual_vat is null or actual_vat>=0),
  add column actual_import_vat numeric check(actual_import_vat is null or actual_import_vat>=0),
  add column actual_duty numeric check(actual_duty is null or actual_duty>=0),
  add column actual_customs numeric check(actual_customs is null or actual_customs>=0),
  add column actual_handling numeric check(actual_handling is null or actual_handling>=0),
  add column actual_grand_total numeric check(actual_grand_total is null or actual_grand_total>=0),
  add column actual_exchange_rate numeric check(actual_exchange_rate is null or actual_exchange_rate>0),
  add column actual_base_currency_estimate numeric check(actual_base_currency_estimate is null or actual_base_currency_estimate>=0),
  add column unresolved_post_checkout_costs text[] not null default '{}',
  add column first_order_discount_applied boolean,
  add column discount_code_used text,
  add column free_shipping_achieved boolean,
  add column checkout_tax_state text,
  add column import_cost_state text,
  add column payment_method_category text,
  add column payment_state_recorded text check(payment_state_recorded is null or payment_state_recorded in('unknown','initiated','captured_as_reported')),
  add column payment_reference text,
  add column placement_evidence jsonb not null default '{}' check(jsonb_typeof(placement_evidence)='object'),
  add column placement_comparison jsonb not null default '{}' check(jsonb_typeof(placement_comparison)='object'),
  add column placement_classification text check(placement_classification is null or placement_classification in('acceptable','acknowledgement_required')),
  add column placement_warnings text[] not null default '{}',
  add column placement_notes text not null default '',
  add constraint purchase_orders_placed_snapshot_required check(status<>'placed' or source_purchase_plan_basket_id is null or (
    placed_by is not null and placed_at is not null and placement_policy_version is not null and
    order_reference is not null and actual_currency is not null and actual_grand_total is not null and
    placement_evidence<>'{}'::jsonb
  ));

create unique index purchase_orders_placement_key on public.purchase_orders(workspace_id,placement_key) where placement_key is not null;
create unique index purchase_orders_supplier_reference on public.purchase_orders(workspace_id,supplier_id,lower(order_reference))
  where status in('placed','confirmed','partially_fulfilled','fulfilled') and order_reference is not null;

alter table public.purchase_order_lines
  add column actual_package_count numeric check(actual_package_count is null or actual_package_count>0),
  add column actual_unit_price numeric check(actual_unit_price is null or actual_unit_price>=0),
  add column actual_line_subtotal numeric check(actual_line_subtotal is null or actual_line_subtotal>=0),
  add column actual_discount_allocation numeric check(actual_discount_allocation is null or actual_discount_allocation>=0),
  add column actual_tax_allocation numeric check(actual_tax_allocation is null or actual_tax_allocation>=0),
  add column actual_stock_state text check(actual_stock_state is null or actual_stock_state in('confirmed','backordered','unavailable')),
  add column placement_mismatch_state text check(placement_mismatch_state is null or placement_mismatch_state in('match','acceptable','acknowledged')),
  add column placement_actual_snapshot jsonb not null default '{}' check(jsonb_typeof(placement_actual_snapshot)='object');

alter table public.purchase_order_audit_events drop constraint purchase_order_audit_events_event_type_check;
alter table public.purchase_order_audit_events add constraint purchase_order_audit_events_event_type_check
  check(event_type in('draft_handoff_started','draft_created','draft_lines_created','draft_handoff_retried','draft_cancelled','placement_recorded','placement_retried'));

comment on column public.purchase_orders.actual_grand_total is 'Actual external checkout total recorded after owner placement; never overwrites expected or verified draft values.';
comment on column public.purchase_orders.payment_state_recorded is 'Optional owner-reported checkout payment observation; placement never implies payment settlement.';

create or replace function public.record_purchase_order_placement(target_order_id uuid,expected_revision bigint,external_reference text,placed_at timestamptz default now())
returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); order_row public.purchase_orders;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select * into order_row from public.purchase_orders where id=target_order_id and owner_id=uid for update;
  if order_row.id is null then raise exception 'PURCHASE_ORDER_UNAVAILABLE'; end if;
  if order_row.source_purchase_plan_basket_id is not null then raise exception 'PLACEMENT_REQUIRES_EVIDENCE_RPC'; end if;
  if order_row.revision<>expected_revision then raise exception 'STALE_PURCHASE_ORDER_REVISION'; end if;
  if order_row.status='placed' then return order_row.revision; end if;
  if order_row.status<>'draft' then raise exception 'PURCHASE_ORDER_NOT_PLACEABLE'; end if;
  update public.purchase_orders set status='placed',order_reference=nullif(trim(external_reference),''),external_order_date=$4,revision=revision+1,updated_at=now() where id=order_row.id;
  insert into public.supplier_events(workspace_id,owner_id,supplier_id,event_type,occurred_at,title,description,purchase_plan_id,purchase_order_id,source_key)
  values(order_row.workspace_id,uid,order_row.supplier_id,'purchase_placed',$4,'Purchase order placed',coalesce(external_reference,''),order_row.source_purchase_plan_id,order_row.id,'purchase_order:'||order_row.id::text||':purchase_placed')
  on conflict (workspace_id,source_key) do nothing;
  return order_row.revision+1;
end $$;

create function public.record_verified_purchase_order_placement(
  target_order_id uuid, expected_revision bigint, candidate_placement_key uuid, placement_payload jsonb
) returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare
  uid uuid:=auth.uid(); order_row public.purchase_orders; line_row public.purchase_order_lines; actual_line jsonb;
  reference text:=nullif(trim(placement_payload->>'supplierOrderReference'),'');
  evidence_ref text:=nullif(trim(placement_payload->>'evidenceReference'),'');
  evidence_note text:=nullif(trim(placement_payload->>'evidenceNote'),'');
  actual_currency_value text:=upper(nullif(trim(placement_payload->>'actualCurrency'),''));
  actual_total numeric; actual_merchandise numeric; actual_discount_value numeric; actual_shipping_value numeric; actual_tax numeric;
  fingerprint text; classification text:='acceptable'; warnings text[]:=array[]::text[]; acknowledged boolean:=coalesce((placement_payload->>'acknowledgeMaterialDifferences')::boolean,false);
  event_time timestamptz:=coalesce((placement_payload->>'placedAt')::timestamptz,now()); line_count integer;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if candidate_placement_key is null then raise exception 'PLACEMENT_KEY_REQUIRED'; end if;
  if jsonb_typeof(placement_payload)<>'object' then raise exception 'PLACEMENT_PAYLOAD_REQUIRED'; end if;
  select * into order_row from public.purchase_orders where id=target_order_id and owner_id=uid for update;
  if order_row.id is null then raise exception 'PURCHASE_ORDER_UNAVAILABLE'; end if;
  if not exists(select 1 from public.workspaces where id=order_row.workspace_id and owner_id=uid and lifecycle_state='active') then raise exception 'WORKSPACE_UNAVAILABLE'; end if;
  if not exists(select 1 from public.suppliers where workspace_id=order_row.workspace_id and id=order_row.supplier_id and owner_id=uid) then raise exception 'SUPPLIER_UNAVAILABLE'; end if;
  if reference is null then raise exception 'SUPPLIER_REFERENCE_REQUIRED'; end if;
  if actual_currency_value is null or actual_currency_value!~'^[A-Z]{3}$' then raise exception 'ACTUAL_CURRENCY_REQUIRED'; end if;
  if placement_payload->'actualGrandTotal' is null or jsonb_typeof(placement_payload->'actualGrandTotal')<>'number' then raise exception 'ACTUAL_TOTAL_REQUIRED'; end if;
  actual_total:=(placement_payload->>'actualGrandTotal')::numeric;
  if actual_total<0 or scale(actual_total)>2 then raise exception 'ACTUAL_TOTAL_INVALID'; end if;
  if evidence_ref is null and evidence_note is null then raise exception 'PLACEMENT_EVIDENCE_REQUIRED'; end if;
  if event_time>now()+interval '5 minutes' then raise exception 'PLACEMENT_TIME_INVALID'; end if;
  if not coalesce((placement_payload->>'confirmExternallyPlaced')::boolean,false) then raise exception 'EXTERNAL_PLACEMENT_ACKNOWLEDGEMENT_REQUIRED'; end if;
  if not exists(select 1 from public.purchase_order_lines where workspace_id=order_row.workspace_id and purchase_order_id=order_row.id) then raise exception 'PURCHASE_ORDER_LINES_REQUIRED'; end if;
  fingerprint:=encode(extensions.digest(jsonb_strip_nulls(placement_payload)::text,'sha256'),'hex');
  if order_row.status='placed' then
    if order_row.placement_key=candidate_placement_key and order_row.placement_fingerprint=fingerprint then
      insert into public.purchase_order_audit_events(workspace_id,owner_id,purchase_order_id,source_purchase_plan_id,source_purchase_plan_version,source_purchase_plan_basket_id,supplier_id,event_type,actor_id,prior_state,new_state,handoff_key,metadata)
      values(order_row.workspace_id,uid,order_row.id,order_row.source_purchase_plan_id,order_row.source_purchase_plan_version,order_row.source_purchase_plan_basket_id,order_row.supplier_id,'placement_retried',uid,'placed','placed',order_row.handoff_key,jsonb_build_object('placementKey',candidate_placement_key))
      on conflict do nothing;
      return order_row.revision;
    end if;
    raise exception 'PLACEMENT_RETRY_CONFLICT';
  end if;
  if order_row.revision<>expected_revision then raise exception 'STALE_PURCHASE_ORDER_REVISION'; end if;
  if order_row.status<>'draft' or order_row.cancelled_at is not null then raise exception 'PURCHASE_ORDER_NOT_PLACEABLE'; end if;
  if order_row.source_purchase_plan_basket_id is null then raise exception 'VERIFIED_DRAFT_REQUIRED'; end if;
  if exists(select 1 from public.purchase_orders where workspace_id=order_row.workspace_id and supplier_id=order_row.supplier_id and lower(order_reference)=lower(reference) and status in('placed','confirmed','partially_fulfilled','fulfilled')) then raise exception 'SUPPLIER_REFERENCE_CONFLICT'; end if;
  if actual_currency_value<>order_row.currency and placement_payload->'actualExchangeRate' is null then raise exception 'CURRENCY_CHANGE_REQUIRES_EXCHANGE_RATE'; end if;

  actual_merchandise:=case when jsonb_typeof(placement_payload->'actualMerchandiseSubtotal')='number' then (placement_payload->>'actualMerchandiseSubtotal')::numeric end;
  actual_discount_value:=case when jsonb_typeof(placement_payload->'actualDiscount')='number' then (placement_payload->>'actualDiscount')::numeric end;
  actual_shipping_value:=case when jsonb_typeof(placement_payload->'actualShipping')='number' then (placement_payload->>'actualShipping')::numeric end;
  actual_tax:=coalesce(case when jsonb_typeof(placement_payload->'actualVat')='number' then (placement_payload->>'actualVat')::numeric end,0)
    +coalesce(case when jsonb_typeof(placement_payload->'actualImportVat')='number' then (placement_payload->>'actualImportVat')::numeric end,0)
    +coalesce(case when jsonb_typeof(placement_payload->'actualDuty')='number' then (placement_payload->>'actualDuty')::numeric end,0)
    +coalesce(case when jsonb_typeof(placement_payload->'actualCustoms')='number' then (placement_payload->>'actualCustoms')::numeric end,0)
    +coalesce(case when jsonb_typeof(placement_payload->'actualHandling')='number' then (placement_payload->>'actualHandling')::numeric end,0);
  if actual_currency_value=order_row.currency then
    if order_row.total is not null and actual_total>order_row.total*1.05 then classification:='acknowledgement_required';warnings:=array_append(warnings,'Actual grand total exceeds the draft total by more than 5%.');end if;
    if order_row.shipping is not null and actual_shipping_value is not null and actual_shipping_value>order_row.shipping*1.10 then classification:='acknowledgement_required';warnings:=array_append(warnings,'Actual shipping exceeds the verified draft shipping by more than 10%.');end if;
    if order_row.discount is not null and order_row.discount>0 and coalesce(actual_discount_value,0)<order_row.discount then classification:='acknowledgement_required';warnings:=array_append(warnings,'Expected discount was not fully applied.');end if;
  end if;
  if classification='acknowledgement_required' and not acknowledged then raise exception 'PLACEMENT_DIFFERENCE_ACKNOWLEDGEMENT_REQUIRED'; end if;

  for line_row in select * from public.purchase_order_lines where workspace_id=order_row.workspace_id and purchase_order_id=order_row.id order by id loop
    select value into actual_line from jsonb_array_elements(coalesce(placement_payload->'lines','[]'::jsonb)) where value->>'purchaseOrderLineId'=line_row.id::text;
    if actual_line is null then raise exception 'ACTUAL_LINE_REQUIRED'; end if;
    if coalesce(actual_line->>'productIdentity','')<>'matches' or coalesce(actual_line->>'packageIdentity','')<>'matches' then raise exception 'PLACEMENT_LINE_IDENTITY_MISMATCH'; end if;
    if coalesce((actual_line->>'actualPackageCount')::numeric,0)<line_row.ordered_package_count then raise exception 'PLACEMENT_LINE_QUANTITY_INSUFFICIENT'; end if;
    if coalesce(actual_line->>'stockState','') in('unavailable','backordered') then raise exception 'PLACEMENT_LINE_UNAVAILABLE'; end if;
    update public.purchase_order_lines set
      actual_package_count=(actual_line->>'actualPackageCount')::numeric,
      actual_unit_price=case when jsonb_typeof(actual_line->'actualUnitPrice')='number' then (actual_line->>'actualUnitPrice')::numeric end,
      actual_line_subtotal=case when jsonb_typeof(actual_line->'actualLineSubtotal')='number' then (actual_line->>'actualLineSubtotal')::numeric end,
      actual_discount_allocation=case when jsonb_typeof(actual_line->'actualDiscountAllocation')='number' then (actual_line->>'actualDiscountAllocation')::numeric end,
      actual_tax_allocation=case when jsonb_typeof(actual_line->'actualTaxAllocation')='number' then (actual_line->>'actualTaxAllocation')::numeric end,
      actual_stock_state=actual_line->>'stockState',
      placement_mismatch_state=case when actual_line->>'actualUnitPrice' is distinct from line_row.effective_unit_price::text then 'acceptable' else 'match' end,
      placement_actual_snapshot=actual_line
    where id=line_row.id;
  end loop;
  get diagnostics line_count=row_count;

  update public.purchase_orders set
    status='placed',order_reference=reference,supplier_order_number=nullif(trim(placement_payload->>'supplierOrderNumber'),''),
    external_order_date=event_time,placed_by=uid,placed_at=event_time,placement_revision=revision+1,placement_policy_version='1.0.0',
    placement_key=candidate_placement_key,placement_fingerprint=fingerprint,actual_currency=actual_currency_value,
    actual_merchandise_subtotal=actual_merchandise,actual_discount=actual_discount_value,actual_shipping=actual_shipping_value,
    actual_vat=case when jsonb_typeof(placement_payload->'actualVat')='number' then (placement_payload->>'actualVat')::numeric end,
    actual_import_vat=case when jsonb_typeof(placement_payload->'actualImportVat')='number' then (placement_payload->>'actualImportVat')::numeric end,
    actual_duty=case when jsonb_typeof(placement_payload->'actualDuty')='number' then (placement_payload->>'actualDuty')::numeric end,
    actual_customs=case when jsonb_typeof(placement_payload->'actualCustoms')='number' then (placement_payload->>'actualCustoms')::numeric end,
    actual_handling=case when jsonb_typeof(placement_payload->'actualHandling')='number' then (placement_payload->>'actualHandling')::numeric end,
    actual_grand_total=actual_total,actual_exchange_rate=case when jsonb_typeof(placement_payload->'actualExchangeRate')='number' then (placement_payload->>'actualExchangeRate')::numeric end,
    actual_base_currency_estimate=case when jsonb_typeof(placement_payload->'actualBaseCurrencyEstimate')='number' then (placement_payload->>'actualBaseCurrencyEstimate')::numeric end,
    unresolved_post_checkout_costs=coalesce(array(select jsonb_array_elements_text(placement_payload->'unresolvedPostCheckoutCosts')),'{}'),
    first_order_discount_applied=case when placement_payload?'firstOrderDiscountApplied' then (placement_payload->>'firstOrderDiscountApplied')::boolean end,
    discount_code_used=nullif(trim(placement_payload->>'discountCodeUsed'),''),
    free_shipping_achieved=case when placement_payload?'freeShippingAchieved' then (placement_payload->>'freeShippingAchieved')::boolean end,
    checkout_tax_state=nullif(trim(placement_payload->>'checkoutTaxState'),''),
    import_cost_state=nullif(trim(placement_payload->>'importCostState'),''),
    payment_method_category=nullif(trim(placement_payload->>'paymentMethodCategory'),''),
    payment_state_recorded=nullif(trim(placement_payload->>'paymentState'),''),
    payment_reference=nullif(trim(placement_payload->>'paymentReference'),''),
    placement_evidence=jsonb_build_object('type',placement_payload->>'evidenceType','reference',evidence_ref,'note',evidence_note,'sourceUrl',placement_payload->>'sourceUrl','recordedAt',now(),'recordedBy',uid),
    placement_comparison=jsonb_build_object('expectedTotal',commercial_snapshot->'estimated_total','verifiedTotal',total,'actualTotal',actual_total,'expectedShipping',commercial_snapshot->'shipping','verifiedShipping',shipping,'actualShipping',actual_shipping_value,'actualTaxTotal',actual_tax,'currency',actual_currency_value),
    placement_classification=classification,placement_warnings=warnings,placement_notes=coalesce(placement_payload->>'note',''),
    revision=revision+1,updated_at=now()
  where id=order_row.id;

  insert into public.purchase_order_audit_events(workspace_id,owner_id,purchase_order_id,source_purchase_plan_id,source_purchase_plan_version,source_purchase_plan_basket_id,supplier_id,event_type,actor_id,prior_state,new_state,reason,handoff_key,metadata)
  values(order_row.workspace_id,uid,order_row.id,order_row.source_purchase_plan_id,order_row.source_purchase_plan_version,order_row.source_purchase_plan_basket_id,order_row.supplier_id,'placement_recorded',uid,'draft','placed',coalesce(placement_payload->>'note',''),order_row.handoff_key,
    jsonb_build_object('supplierReference',reference,'actualTotal',actual_total,'currency',actual_currency_value,'evidenceReference',coalesce(evidence_ref,evidence_note),'classification',classification,'placementKey',candidate_placement_key,'lineCount',line_count,'firstOrderDiscountApplied',placement_payload->'firstOrderDiscountApplied','discountReconciliationRequired',coalesce((placement_payload->>'firstOrderDiscountApplied')::boolean,false)));
  insert into public.supplier_events(workspace_id,owner_id,supplier_id,event_type,occurred_at,title,description,purchase_plan_id,purchase_order_id,source_key)
  values(order_row.workspace_id,uid,order_row.supplier_id,'purchase_placed',event_time,'Purchase order placed externally',
    jsonb_build_object('supplierReference',reference,'actualTotal',actual_total,'currency',actual_currency_value,'evidenceReference',coalesce(evidence_ref,evidence_note),'actor',uid)::text,
    order_row.source_purchase_plan_id,order_row.id,'purchase_order:'||order_row.id::text||':purchase_placed')
  on conflict (workspace_id,source_key) do nothing;
  return order_row.revision+1;
end $$;

revoke all on function public.record_verified_purchase_order_placement(uuid,bigint,uuid,jsonb) from public,anon;
grant execute on function public.record_verified_purchase_order_placement(uuid,bigint,uuid,jsonb) to authenticated;
