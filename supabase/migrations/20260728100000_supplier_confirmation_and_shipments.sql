-- Supplier Order Confirmation and Shipment Preparation V1.
-- Confirmations describe supplier responses. Shipments describe reported logistics.
-- Neither aggregate is physical receipt, inspection, inventory, or stock truth.

alter table public.purchase_orders drop constraint purchase_orders_status_check;
alter table public.purchase_orders add constraint purchase_orders_status_check check(status in(
  'draft','placed','supplier_confirmed','partially_confirmed','confirmation_exception',
  'partially_shipped','shipped','cancelled',
  'confirmed','partially_fulfilled','fulfilled'
));

create table public.purchase_order_confirmations(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  owner_id uuid not null,
  purchase_order_id uuid not null,
  supplier_id uuid not null,
  confirmation_version integer not null check(confirmation_version>0),
  source_placement_revision bigint not null check(source_placement_revision>0),
  revision bigint not null default 1 check(revision>0),
  lifecycle_status text not null default 'recorded' check(lifecycle_status in('draft','recorded','superseded','cancelled')),
  acceptance_status text not null default 'pending_decision' check(acceptance_status in('pending_decision','accepted_exact','accepted_commercial_difference','accepted_partial','rejected','replanning_required')),
  supplier_confirmation_reference text not null check(length(trim(supplier_confirmation_reference))>0),
  supplier_confirmation_date timestamptz not null,
  response_channel text not null default '',
  supplier_representative text not null default '',
  confirmation_type text not null default 'manual_supplier_response',
  supplier_message_summary text not null default '',
  supplier_notes text not null default '',
  estimated_dispatch_date date,
  estimated_delivery_date date,
  confirmed_currency text not null check(confirmed_currency~'^[A-Z]{3}$'),
  confirmed_merchandise_subtotal numeric check(confirmed_merchandise_subtotal is null or confirmed_merchandise_subtotal>=0),
  confirmed_discount numeric check(confirmed_discount is null or confirmed_discount>=0),
  confirmed_shipping numeric check(confirmed_shipping is null or confirmed_shipping>=0),
  confirmed_tax numeric check(confirmed_tax is null or confirmed_tax>=0),
  confirmed_grand_total numeric not null check(confirmed_grand_total>=0),
  unresolved_post_shipment_costs boolean not null default false,
  payment_acknowledgement_state text not null default 'not_reported' check(payment_acknowledgement_state in('not_reported','acknowledged','pending','declined')),
  evidence_type text not null,
  evidence_reference text not null,
  source_url text,
  policy_version text not null default '1.0.0',
  classification text not null check(classification in('exact','acceptable_difference','owner_decision_required','partial','blocked')),
  decision_reason text not null default '',
  decided_by uuid,
  decided_at timestamptz,
  supersedes_confirmation_id uuid,
  superseded_at timestamptz,
  idempotency_key uuid not null,
  payload_fingerprint text not null,
  recorded_by uuid not null,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,id),
  unique(workspace_id,purchase_order_id,confirmation_version),
  unique(workspace_id,purchase_order_id,idempotency_key),
  foreign key(workspace_id,purchase_order_id) references public.purchase_orders(workspace_id,id),
  foreign key(workspace_id,supplier_id) references public.suppliers(workspace_id,id),
  foreign key(supersedes_confirmation_id) references public.purchase_order_confirmations(id)
);
create unique index purchase_order_confirmation_reference on public.purchase_order_confirmations(workspace_id,supplier_id,lower(supplier_confirmation_reference));
create index purchase_order_confirmation_history on public.purchase_order_confirmations(workspace_id,purchase_order_id,confirmation_version desc);
create index purchase_order_confirmation_status on public.purchase_order_confirmations(workspace_id,acceptance_status,estimated_dispatch_date);

create table public.purchase_order_confirmation_lines(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  owner_id uuid not null,
  confirmation_id uuid not null,
  purchase_order_id uuid not null,
  purchase_order_line_id uuid not null,
  supplier_product_id text,
  ordered_product_snapshot jsonb not null check(jsonb_typeof(ordered_product_snapshot)='object'),
  ordered_package_count numeric not null check(ordered_package_count>0),
  ordered_quantity numeric not null check(ordered_quantity>0),
  ordered_package_size numeric not null check(ordered_package_size>0),
  ordered_unit text not null,
  placement_unit_price numeric check(placement_unit_price is null or placement_unit_price>=0),
  placement_line_subtotal numeric check(placement_line_subtotal is null or placement_line_subtotal>=0),
  confirmed_product_identity text not null,
  confirmed_sku text not null default '',
  confirmed_variant text not null default '',
  confirmed_package_size numeric not null check(confirmed_package_size>0),
  confirmed_package_unit text not null,
  confirmed_package_count numeric not null check(confirmed_package_count>=0),
  confirmed_quantity numeric not null check(confirmed_quantity>=0),
  confirmed_unit_price numeric not null check(confirmed_unit_price>=0),
  confirmed_line_subtotal numeric not null check(confirmed_line_subtotal>=0),
  availability_state text not null check(availability_state in('confirmed','partially_confirmed','backordered','unavailable','supplier_cancelled','substitution_proposed','pending_supplier_response')),
  mismatch_classification text not null check(mismatch_classification in('exact','quantity_reduced','quantity_increased','price_changed','package_changed','product_changed','unavailable','backordered','substitution_requires_review')),
  expected_dispatch_date date,
  expected_restock_date date,
  supplier_line_note text not null default '',
  owner_decision text not null default 'pending' check(owner_decision in('pending','accepted','rejected','replanning_required','remaining_cancelled')),
  owner_decision_reason text not null default '',
  compatibility_evidence jsonb not null default '{}' check(jsonb_typeof(compatibility_evidence)='object'),
  confirmed_snapshot jsonb not null check(jsonb_typeof(confirmed_snapshot)='object'),
  created_at timestamptz not null default now(),
  unique(workspace_id,id),
  unique(workspace_id,confirmation_id,purchase_order_line_id),
  foreign key(workspace_id,confirmation_id) references public.purchase_order_confirmations(workspace_id,id),
  foreign key(workspace_id,purchase_order_id) references public.purchase_orders(workspace_id,id),
  foreign key(workspace_id,purchase_order_line_id) references public.purchase_order_lines(workspace_id,id)
);
create index purchase_order_confirmation_lines_order on public.purchase_order_confirmation_lines(workspace_id,purchase_order_id,purchase_order_line_id);
create index purchase_order_confirmation_lines_state on public.purchase_order_confirmation_lines(workspace_id,availability_state,mismatch_classification);

create table public.purchase_order_shipments(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  owner_id uuid not null,
  purchase_order_id uuid not null,
  supplier_id uuid not null,
  confirmation_id uuid not null,
  shipment_sequence integer not null check(shipment_sequence>0),
  status text not null default 'preparing' check(status in('preparing','dispatched','in_transit','delayed','carrier_exception','delivery_reported','cancelled')),
  revision bigint not null default 1 check(revision>0),
  carrier text not null default '',
  service_level text not null default '',
  tracking_number text not null default '',
  tracking_url text,
  supplier_shipment_reference text not null,
  dispatch_date timestamptz,
  estimated_delivery_date date,
  delivery_reported_at timestamptz,
  origin_country text check(origin_country is null or origin_country~'^[A-Z]{2}$'),
  destination_country text check(destination_country is null or destination_country~'^[A-Z]{2}$'),
  shipping_notes text not null default '',
  shipment_cost numeric check(shipment_cost is null or shipment_cost>=0),
  shipment_currency text check(shipment_currency is null or shipment_currency~'^[A-Z]{3}$'),
  package_count numeric check(package_count is null or package_count>0),
  gross_weight numeric check(gross_weight is null or gross_weight>0),
  weight_unit text,
  dangerous_goods_state text not null default 'unknown' check(dangerous_goods_state in('unknown','not_dangerous','declared')),
  customs_documentation_state text not null default 'unknown' check(customs_documentation_state in('unknown','not_required','pending','provided')),
  customs_reference text not null default '',
  import_tracking_state text not null default 'unknown',
  evidence_type text not null,
  evidence_reference text not null,
  source_url text,
  idempotency_key uuid not null,
  payload_fingerprint text not null,
  recorded_by uuid not null,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,id),
  unique(workspace_id,purchase_order_id,shipment_sequence),
  unique(workspace_id,purchase_order_id,idempotency_key),
  foreign key(workspace_id,purchase_order_id) references public.purchase_orders(workspace_id,id),
  foreign key(workspace_id,supplier_id) references public.suppliers(workspace_id,id),
  foreign key(workspace_id,confirmation_id) references public.purchase_order_confirmations(workspace_id,id)
);
create unique index purchase_order_shipment_reference on public.purchase_order_shipments(workspace_id,supplier_id,lower(supplier_shipment_reference));
create index purchase_order_shipment_tracking on public.purchase_order_shipments(workspace_id,carrier,tracking_number) where tracking_number<>'';
create index purchase_order_shipment_status on public.purchase_order_shipments(workspace_id,purchase_order_id,status,estimated_delivery_date);

create table public.purchase_order_shipment_lines(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  owner_id uuid not null,
  shipment_id uuid not null,
  purchase_order_id uuid not null,
  purchase_order_line_id uuid not null,
  confirmation_line_id uuid not null,
  shipped_package_count numeric not null check(shipped_package_count>0),
  shipped_quantity numeric not null check(shipped_quantity>0),
  package_unit text not null,
  backordered_remainder numeric not null default 0 check(backordered_remainder>=0),
  supplier_line_reference text not null default '',
  note text not null default '',
  created_at timestamptz not null default now(),
  unique(workspace_id,id),
  unique(workspace_id,shipment_id,purchase_order_line_id),
  foreign key(workspace_id,shipment_id) references public.purchase_order_shipments(workspace_id,id),
  foreign key(workspace_id,purchase_order_id) references public.purchase_orders(workspace_id,id),
  foreign key(workspace_id,purchase_order_line_id) references public.purchase_order_lines(workspace_id,id),
  foreign key(workspace_id,confirmation_line_id) references public.purchase_order_confirmation_lines(workspace_id,id)
);
create index purchase_order_shipment_lines_order on public.purchase_order_shipment_lines(workspace_id,purchase_order_id,purchase_order_line_id);

create table public.purchase_order_shipment_events(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  owner_id uuid not null,
  shipment_id uuid not null,
  purchase_order_id uuid not null,
  event_type text not null check(event_type in('created','tracking_updated','dispatched','in_transit','delayed','carrier_exception','delivery_reported','cancelled')),
  prior_state text,
  new_state text not null,
  evidence jsonb not null default '{}' check(jsonb_typeof(evidence)='object'),
  metadata jsonb not null default '{}' check(jsonb_typeof(metadata)='object'),
  actor_id uuid not null,
  occurred_at timestamptz not null default now(),
  source_key text not null,
  unique(workspace_id,id),
  unique(workspace_id,source_key),
  foreign key(workspace_id,shipment_id) references public.purchase_order_shipments(workspace_id,id),
  foreign key(workspace_id,purchase_order_id) references public.purchase_orders(workspace_id,id)
);
create index purchase_order_shipment_event_history on public.purchase_order_shipment_events(workspace_id,shipment_id,occurred_at);

do $$ begin
  alter table public.supplier_events drop constraint supplier_events_event_type_check;
exception when undefined_object then null; end $$;
alter table public.supplier_events add column metadata jsonb not null default '{}' check(jsonb_typeof(metadata)='object');
alter table public.supplier_events add constraint supplier_events_event_type_check check(event_type in(
  'quote_received','quote_updated','purchase_planned','purchase_placed','order_confirmed','shipment_dispatched','shipment_received','partial_shipment',
  'cancelled_order','refund','replacement_shipment','damaged_shipment','customs_issue','invoice_received','payment_completed',
  'documentation_requested','documentation_received','documentation_rejected','communication','manual_note',
  'supplier_confirmation_received','supplier_confirmation_changed','supplier_line_backordered','supplier_line_unavailable',
  'supplier_substitution_proposed','shipment_preparing','shipment_delayed','shipment_delivery_reported'
));
alter table public.purchase_order_audit_events drop constraint purchase_order_audit_events_event_type_check;
alter table public.purchase_order_audit_events add constraint purchase_order_audit_events_event_type_check check(event_type in(
  'draft_handoff_started','draft_created','draft_lines_created','draft_handoff_retried','draft_cancelled','placement_recorded','placement_retried',
  'supplier_confirmation_recorded','supplier_confirmation_decided','shipment_created','shipment_status_recorded'
));

alter table public.purchase_order_confirmations enable row level security;
alter table public.purchase_order_confirmation_lines enable row level security;
alter table public.purchase_order_shipments enable row level security;
alter table public.purchase_order_shipment_lines enable row level security;
alter table public.purchase_order_shipment_events enable row level security;
create policy owner_select on public.purchase_order_confirmations for select to authenticated using(owner_id=(select auth.uid()) and exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid()) and w.lifecycle_state='active'));
create policy owner_select on public.purchase_order_confirmation_lines for select to authenticated using(owner_id=(select auth.uid()) and exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid()) and w.lifecycle_state='active'));
create policy owner_select on public.purchase_order_shipments for select to authenticated using(owner_id=(select auth.uid()) and exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid()) and w.lifecycle_state='active'));
create policy owner_select on public.purchase_order_shipment_lines for select to authenticated using(owner_id=(select auth.uid()) and exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid()) and w.lifecycle_state='active'));
create policy owner_select on public.purchase_order_shipment_events for select to authenticated using(owner_id=(select auth.uid()) and exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid()) and w.lifecycle_state='active'));
revoke all on public.purchase_order_confirmations,public.purchase_order_confirmation_lines,public.purchase_order_shipments,public.purchase_order_shipment_lines,public.purchase_order_shipment_events from public,anon,authenticated;
grant select on public.purchase_order_confirmations,public.purchase_order_confirmation_lines,public.purchase_order_shipments,public.purchase_order_shipment_lines,public.purchase_order_shipment_events to authenticated;
grant all on public.purchase_order_confirmations,public.purchase_order_confirmation_lines,public.purchase_order_shipments,public.purchase_order_shipment_lines,public.purchase_order_shipment_events to service_role;

comment on table public.purchase_order_confirmations is 'Immutable versioned supplier responses to a placed Purchase Order. Confirmation is not shipment, receipt, inspection, inventory, or stock.';
comment on table public.purchase_order_shipments is 'Supplier/carrier-reported logistics. delivery_reported is not physical receipt, acceptance, inspection, inventory, or stock.';

create function public.record_purchase_order_supplier_confirmation(
  target_order_id uuid, expected_order_revision bigint, candidate_idempotency_key uuid, confirmation_payload jsonb
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  uid uuid:=auth.uid(); o public.purchase_orders; prior public.purchase_order_confirmations;
  cid uuid; version_no integer; fingerprint text:=encode(extensions.digest(jsonb_strip_nulls(confirmation_payload)::text,'sha256'),'hex');
  item jsonb; ol public.purchase_order_lines; availability text; mismatch text; classification text:='exact';
  confirmed_count numeric; confirmed_qty numeric; confirmed_price numeric; confirmed_size numeric; confirmed_unit text; confirmed_identity text;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if candidate_idempotency_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  select * into o from public.purchase_orders where id=target_order_id and owner_id=uid for update;
  if o.id is null then raise exception 'PURCHASE_ORDER_UNAVAILABLE'; end if;
  if not exists(select 1 from public.workspaces where id=o.workspace_id and owner_id=uid and lifecycle_state='active') then raise exception 'WORKSPACE_UNAVAILABLE'; end if;
  select * into prior from public.purchase_order_confirmations where workspace_id=o.workspace_id and purchase_order_id=o.id and idempotency_key=candidate_idempotency_key;
  if prior.id is not null then
    if prior.payload_fingerprint<>fingerprint then raise exception 'CONFIRMATION_RETRY_CONFLICT'; end if;
    return prior.id;
  end if;
  if o.revision<>expected_order_revision then raise exception 'STALE_PURCHASE_ORDER_REVISION'; end if;
  if o.status not in('placed','supplier_confirmed','partially_confirmed','confirmation_exception','partially_shipped','shipped') then raise exception 'PURCHASE_ORDER_NOT_CONFIRMABLE'; end if;
  if coalesce(jsonb_array_length(confirmation_payload->'lines'),0)=0 then raise exception 'CONFIRMATION_LINES_REQUIRED'; end if;
  if nullif(trim(confirmation_payload->>'supplierConfirmationReference'),'') is null then raise exception 'CONFIRMATION_REFERENCE_REQUIRED'; end if;
  if nullif(trim(confirmation_payload->>'evidenceReference'),'') is null then raise exception 'CONFIRMATION_EVIDENCE_REQUIRED'; end if;
  if coalesce((confirmation_payload->>'confirmedGrandTotal')::numeric,-1)<0 then raise exception 'CONFIRMED_TOTAL_REQUIRED'; end if;
  if coalesce(confirmation_payload->>'confirmedCurrency','')!~'^[A-Z]{3}$' then raise exception 'CONFIRMED_CURRENCY_INVALID'; end if;
  version_no:=coalesce((select max(confirmation_version)+1 from public.purchase_order_confirmations where workspace_id=o.workspace_id and purchase_order_id=o.id),1);
  select * into prior from public.purchase_order_confirmations where workspace_id=o.workspace_id and purchase_order_id=o.id and lifecycle_status='recorded' order by confirmation_version desc limit 1 for update;

  for item in select value from jsonb_array_elements(confirmation_payload->'lines') loop
    select * into ol from public.purchase_order_lines where workspace_id=o.workspace_id and purchase_order_id=o.id and id=(item->>'purchaseOrderLineId')::uuid;
    if ol.id is null then raise exception 'CONFIRMATION_LINE_INVALID'; end if;
    confirmed_count:=coalesce((item->>'confirmedPackageCount')::numeric,-1);
    confirmed_qty:=coalesce((item->>'confirmedQuantity')::numeric,-1);
    confirmed_price:=coalesce((item->>'confirmedUnitPrice')::numeric,-1);
    confirmed_size:=coalesce((item->>'confirmedPackageSize')::numeric,-1);
    confirmed_unit:=coalesce(item->>'confirmedPackageUnit','');
    confirmed_identity:=coalesce(item->>'confirmedProductIdentity','');
    availability:=coalesce(item->>'availabilityState','');
    if confirmed_count<0 or confirmed_qty<0 or confirmed_price<0 or confirmed_size<=0 then raise exception 'CONFIRMATION_LINE_VALUES_INVALID'; end if;
    if availability not in('confirmed','partially_confirmed','backordered','unavailable','supplier_cancelled','substitution_proposed','pending_supplier_response') then raise exception 'CONFIRMATION_AVAILABILITY_INVALID'; end if;
    mismatch:=case
      when availability='unavailable' then 'unavailable'
      when availability='backordered' then 'backordered'
      when availability='substitution_proposed' then 'substitution_requires_review'
      when confirmed_identity<>coalesce(ol.product_name_snapshot,'') then 'product_changed'
      when confirmed_unit<>ol.package_unit or confirmed_size<>ol.package_size then 'package_changed'
      when confirmed_count<ol.actual_package_count then 'quantity_reduced'
      when confirmed_count>ol.actual_package_count then 'quantity_increased'
      when ol.actual_unit_price is not null and abs(confirmed_price-ol.actual_unit_price)>greatest(0.01,ol.actual_unit_price*.05) then 'price_changed'
      else 'exact' end;
    if mismatch in('product_changed','package_changed','substitution_requires_review','unavailable') then classification:='blocked';
    elsif mismatch in('quantity_reduced','quantity_increased','backordered') and classification<>'blocked' then classification:='partial';
    elsif mismatch='price_changed' and classification='exact' then classification:='owner_decision_required'; end if;
  end loop;

  insert into public.purchase_order_confirmations(
    workspace_id,owner_id,purchase_order_id,supplier_id,confirmation_version,source_placement_revision,
    supplier_confirmation_reference,supplier_confirmation_date,response_channel,supplier_representative,confirmation_type,
    supplier_message_summary,supplier_notes,estimated_dispatch_date,estimated_delivery_date,confirmed_currency,
    confirmed_merchandise_subtotal,confirmed_discount,confirmed_shipping,confirmed_tax,confirmed_grand_total,
    unresolved_post_shipment_costs,payment_acknowledgement_state,evidence_type,evidence_reference,source_url,
    classification,supersedes_confirmation_id,idempotency_key,payload_fingerprint,recorded_by
  ) values(
    o.workspace_id,uid,o.id,o.supplier_id,version_no,o.placement_revision,
    trim(confirmation_payload->>'supplierConfirmationReference'),(confirmation_payload->>'supplierConfirmationDate')::timestamptz,
    coalesce(confirmation_payload->>'responseChannel',''),coalesce(confirmation_payload->>'supplierRepresentative',''),
    coalesce(confirmation_payload->>'confirmationType','manual_supplier_response'),coalesce(confirmation_payload->>'supplierMessageSummary',''),
    coalesce(confirmation_payload->>'supplierNotes',''),nullif(confirmation_payload->>'estimatedDispatchDate','')::date,
    nullif(confirmation_payload->>'estimatedDeliveryDate','')::date,confirmation_payload->>'confirmedCurrency',
    nullif(confirmation_payload->>'confirmedMerchandiseSubtotal','')::numeric,nullif(confirmation_payload->>'confirmedDiscount','')::numeric,
    nullif(confirmation_payload->>'confirmedShipping','')::numeric,nullif(confirmation_payload->>'confirmedTax','')::numeric,
    (confirmation_payload->>'confirmedGrandTotal')::numeric,coalesce((confirmation_payload->>'unresolvedPostShipmentCosts')::boolean,false),
    coalesce(confirmation_payload->>'paymentAcknowledgementState','not_reported'),coalesce(confirmation_payload->>'evidenceType','manual_reference'),
    trim(confirmation_payload->>'evidenceReference'),nullif(confirmation_payload->>'sourceUrl',''),classification,prior.id,
    candidate_idempotency_key,fingerprint,uid
  ) returning id into cid;

  for item in select value from jsonb_array_elements(confirmation_payload->'lines') loop
    select * into ol from public.purchase_order_lines where workspace_id=o.workspace_id and id=(item->>'purchaseOrderLineId')::uuid;
    confirmed_count:=(item->>'confirmedPackageCount')::numeric; confirmed_qty:=(item->>'confirmedQuantity')::numeric;
    confirmed_price:=(item->>'confirmedUnitPrice')::numeric; confirmed_size:=(item->>'confirmedPackageSize')::numeric;
    confirmed_unit:=item->>'confirmedPackageUnit'; confirmed_identity:=item->>'confirmedProductIdentity'; availability:=item->>'availabilityState';
    mismatch:=case when availability='unavailable' then 'unavailable' when availability='backordered' then 'backordered'
      when availability='substitution_proposed' then 'substitution_requires_review'
      when confirmed_identity<>coalesce(ol.product_name_snapshot,'') then 'product_changed'
      when confirmed_unit<>ol.package_unit or confirmed_size<>ol.package_size then 'package_changed'
      when confirmed_count<ol.actual_package_count then 'quantity_reduced' when confirmed_count>ol.actual_package_count then 'quantity_increased'
      when ol.actual_unit_price is not null and abs(confirmed_price-ol.actual_unit_price)>greatest(0.01,ol.actual_unit_price*.05) then 'price_changed' else 'exact' end;
    insert into public.purchase_order_confirmation_lines(
      workspace_id,owner_id,confirmation_id,purchase_order_id,purchase_order_line_id,supplier_product_id,
      ordered_product_snapshot,ordered_package_count,ordered_quantity,ordered_package_size,ordered_unit,placement_unit_price,placement_line_subtotal,
      confirmed_product_identity,confirmed_sku,confirmed_variant,confirmed_package_size,confirmed_package_unit,confirmed_package_count,
      confirmed_quantity,confirmed_unit_price,confirmed_line_subtotal,availability_state,mismatch_classification,
      expected_dispatch_date,expected_restock_date,supplier_line_note,confirmed_snapshot
    ) values(
      o.workspace_id,uid,cid,o.id,ol.id,ol.supplier_product_id,
      jsonb_build_object('productName',ol.product_name_snapshot,'sku',ol.supplier_sku_snapshot,'variant',ol.variant_snapshot),
      ol.actual_package_count,ol.actual_package_count*ol.package_size,ol.package_size,ol.package_unit,ol.actual_unit_price,ol.actual_line_subtotal,
      confirmed_identity,coalesce(item->>'confirmedSku',''),coalesce(item->>'confirmedVariant',''),confirmed_size,confirmed_unit,
      confirmed_count,confirmed_qty,confirmed_price,(item->>'confirmedLineSubtotal')::numeric,availability,mismatch,
      nullif(item->>'expectedDispatchDate','')::date,nullif(item->>'expectedRestockDate','')::date,coalesce(item->>'supplierLineNote',''),item
    );
  end loop;
  if prior.id is not null then update public.purchase_order_confirmations set lifecycle_status='superseded',superseded_at=now(),updated_at=now() where id=prior.id; end if;
  update public.purchase_orders set status=case when classification='exact' then 'supplier_confirmed' when classification='partial' then 'partially_confirmed' else 'confirmation_exception' end,revision=revision+1,updated_at=now() where id=o.id;
  insert into public.purchase_order_audit_events(workspace_id,owner_id,purchase_order_id,source_purchase_plan_id,source_purchase_plan_version,source_purchase_plan_basket_id,supplier_id,event_type,actor_id,prior_state,new_state,metadata)
  values(o.workspace_id,uid,o.id,o.source_purchase_plan_id,o.source_purchase_plan_version,o.source_purchase_plan_basket_id,o.supplier_id,'supplier_confirmation_recorded',uid,o.status,case when classification='exact' then 'supplier_confirmed' when classification='partial' then 'partially_confirmed' else 'confirmation_exception' end,jsonb_build_object('confirmationId',cid,'version',version_no,'classification',classification));
  insert into public.supplier_events(workspace_id,owner_id,supplier_id,event_type,occurred_at,title,description,purchase_plan_id,purchase_order_id,source_key,metadata)
  values(o.workspace_id,uid,o.supplier_id,case when version_no=1 then 'supplier_confirmation_received' else 'supplier_confirmation_changed' end,now(),'Supplier confirmation recorded','Supplier response recorded; no receipt or inventory created.',o.source_purchase_plan_id,o.id,'confirmation:'||cid,jsonb_build_object('confirmationId',cid,'version',version_no,'evidenceReference',confirmation_payload->>'evidenceReference'))
  on conflict do nothing;
  return cid;
end $$;

create function public.decide_purchase_order_confirmation(
  target_confirmation_id uuid, expected_revision bigint, candidate_decision text, candidate_reason text, line_decisions jsonb default '[]'
) returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); c public.purchase_order_confirmations; item jsonb; cl public.purchase_order_confirmation_lines;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select * into c from public.purchase_order_confirmations where id=target_confirmation_id and owner_id=uid for update;
  if c.id is null or not exists(select 1 from public.workspaces where id=c.workspace_id and owner_id=uid and lifecycle_state='active') then raise exception 'CONFIRMATION_UNAVAILABLE'; end if;
  if c.revision<>expected_revision then raise exception 'STALE_CONFIRMATION_REVISION'; end if;
  if c.lifecycle_status<>'recorded' then raise exception 'CONFIRMATION_NOT_DECIDABLE'; end if;
  if candidate_decision not in('accepted_exact','accepted_commercial_difference','accepted_partial','rejected','replanning_required') then raise exception 'CONFIRMATION_DECISION_INVALID'; end if;
  if candidate_decision<>'accepted_exact' and nullif(trim(candidate_reason),'') is null then raise exception 'DECISION_REASON_REQUIRED'; end if;
  for item in select value from jsonb_array_elements(coalesce(line_decisions,'[]')) loop
    select * into cl from public.purchase_order_confirmation_lines where workspace_id=c.workspace_id and confirmation_id=c.id and id=(item->>'confirmationLineId')::uuid;
    if cl.id is null then raise exception 'CONFIRMATION_LINE_INVALID'; end if;
    if cl.mismatch_classification in('substitution_requires_review','product_changed','package_changed') and item->>'decision'='accepted'
      and coalesce(item->'compatibilityEvidence','{}'::jsonb)='{}'::jsonb then raise exception 'SUBSTITUTION_COMPATIBILITY_EVIDENCE_REQUIRED'; end if;
    update public.purchase_order_confirmation_lines set owner_decision=item->>'decision',owner_decision_reason=coalesce(item->>'reason',''),
      compatibility_evidence=coalesce(item->'compatibilityEvidence','{}') where id=cl.id;
  end loop;
  if candidate_decision like 'accepted_%' and exists(select 1 from public.purchase_order_confirmation_lines where confirmation_id=c.id and owner_decision='pending' and mismatch_classification<>'exact') then raise exception 'LINE_DECISIONS_REQUIRED'; end if;
  update public.purchase_order_confirmations set acceptance_status=candidate_decision,decision_reason=trim(coalesce(candidate_reason,'')),decided_by=uid,decided_at=now(),revision=revision+1,updated_at=now() where id=c.id;
  insert into public.purchase_order_audit_events(workspace_id,owner_id,purchase_order_id,source_purchase_plan_id,source_purchase_plan_version,source_purchase_plan_basket_id,supplier_id,event_type,actor_id,prior_state,new_state,reason,metadata)
  select c.workspace_id,uid,c.purchase_order_id,o.source_purchase_plan_id,o.source_purchase_plan_version,o.source_purchase_plan_basket_id,c.supplier_id,'supplier_confirmation_decided',uid,c.acceptance_status,candidate_decision,trim(coalesce(candidate_reason,'')),jsonb_build_object('confirmationId',c.id)
  from public.purchase_orders o where o.id=c.purchase_order_id;
  return c.revision+1;
end $$;

create function public.create_purchase_order_shipment(
  target_order_id uuid, target_confirmation_id uuid, expected_order_revision bigint, candidate_idempotency_key uuid, shipment_payload jsonb
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); o public.purchase_orders; c public.purchase_order_confirmations; existing public.purchase_order_shipments;
  sid uuid; sequence_no integer; fingerprint text:=encode(extensions.digest(jsonb_strip_nulls(shipment_payload)::text,'sha256'),'hex'); item jsonb; cl public.purchase_order_confirmation_lines; allocated numeric;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select * into o from public.purchase_orders where id=target_order_id and owner_id=uid for update;
  if o.id is null or not exists(select 1 from public.workspaces where id=o.workspace_id and owner_id=uid and lifecycle_state='active') then raise exception 'PURCHASE_ORDER_UNAVAILABLE'; end if;
  select * into existing from public.purchase_order_shipments where workspace_id=o.workspace_id and purchase_order_id=o.id and idempotency_key=candidate_idempotency_key;
  if existing.id is not null then if existing.payload_fingerprint<>fingerprint then raise exception 'SHIPMENT_RETRY_CONFLICT'; end if; return existing.id; end if;
  if o.revision<>expected_order_revision then raise exception 'STALE_PURCHASE_ORDER_REVISION'; end if;
  select * into c from public.purchase_order_confirmations where workspace_id=o.workspace_id and id=target_confirmation_id and purchase_order_id=o.id and lifecycle_status='recorded' for update;
  if c.id is null or c.acceptance_status not in('accepted_exact','accepted_commercial_difference','accepted_partial') then raise exception 'CONFIRMATION_NOT_SHIPMENT_ELIGIBLE'; end if;
  if coalesce(jsonb_array_length(shipment_payload->'lines'),0)=0 then raise exception 'SHIPMENT_LINES_REQUIRED'; end if;
  if nullif(trim(shipment_payload->>'supplierShipmentReference'),'') is null or nullif(trim(shipment_payload->>'evidenceReference'),'') is null then raise exception 'SHIPMENT_REFERENCE_AND_EVIDENCE_REQUIRED'; end if;
  sequence_no:=coalesce((select max(shipment_sequence)+1 from public.purchase_order_shipments where workspace_id=o.workspace_id and purchase_order_id=o.id),1);
  insert into public.purchase_order_shipments(
    workspace_id,owner_id,purchase_order_id,supplier_id,confirmation_id,shipment_sequence,status,carrier,service_level,tracking_number,tracking_url,
    supplier_shipment_reference,estimated_delivery_date,origin_country,destination_country,shipping_notes,shipment_cost,shipment_currency,
    package_count,gross_weight,weight_unit,dangerous_goods_state,customs_documentation_state,customs_reference,import_tracking_state,
    evidence_type,evidence_reference,source_url,idempotency_key,payload_fingerprint,recorded_by
  ) values(
    o.workspace_id,uid,o.id,o.supplier_id,c.id,sequence_no,'preparing',coalesce(shipment_payload->>'carrier',''),coalesce(shipment_payload->>'serviceLevel',''),
    coalesce(shipment_payload->>'trackingNumber',''),nullif(shipment_payload->>'trackingUrl',''),trim(shipment_payload->>'supplierShipmentReference'),
    nullif(shipment_payload->>'estimatedDeliveryDate','')::date,nullif(shipment_payload->>'originCountry',''),nullif(shipment_payload->>'destinationCountry',''),
    coalesce(shipment_payload->>'shippingNotes',''),nullif(shipment_payload->>'shipmentCost','')::numeric,nullif(shipment_payload->>'shipmentCurrency',''),
    nullif(shipment_payload->>'packageCount','')::numeric,nullif(shipment_payload->>'grossWeight','')::numeric,nullif(shipment_payload->>'weightUnit',''),
    coalesce(shipment_payload->>'dangerousGoodsState','unknown'),coalesce(shipment_payload->>'customsDocumentationState','unknown'),
    coalesce(shipment_payload->>'customsReference',''),coalesce(shipment_payload->>'importTrackingState','unknown'),
    coalesce(shipment_payload->>'evidenceType','manual_reference'),trim(shipment_payload->>'evidenceReference'),nullif(shipment_payload->>'sourceUrl',''),
    candidate_idempotency_key,fingerprint,uid
  ) returning id into sid;
  for item in select value from jsonb_array_elements(shipment_payload->'lines') loop
    select * into cl from public.purchase_order_confirmation_lines where workspace_id=o.workspace_id and confirmation_id=c.id and id=(item->>'confirmationLineId')::uuid;
    if cl.id is null then raise exception 'SHIPMENT_CONFIRMATION_LINE_INVALID'; end if;
    if cl.availability_state in('unavailable','supplier_cancelled','substitution_proposed','pending_supplier_response') or cl.owner_decision in('rejected','replanning_required') then raise exception 'SHIPMENT_LINE_NOT_ELIGIBLE'; end if;
    select coalesce(sum(sl.shipped_quantity),0) into allocated from public.purchase_order_shipment_lines sl join public.purchase_order_shipments s on s.workspace_id=sl.workspace_id and s.id=sl.shipment_id where sl.workspace_id=o.workspace_id and sl.purchase_order_line_id=cl.purchase_order_line_id and s.status<>'cancelled';
    if (item->>'shippedQuantity')::numeric<=0 or allocated+(item->>'shippedQuantity')::numeric>cl.confirmed_quantity then raise exception 'SHIPMENT_QUANTITY_EXCEEDS_CONFIRMED'; end if;
    insert into public.purchase_order_shipment_lines(workspace_id,owner_id,shipment_id,purchase_order_id,purchase_order_line_id,confirmation_line_id,shipped_package_count,shipped_quantity,package_unit,backordered_remainder,supplier_line_reference,note)
    values(o.workspace_id,uid,sid,o.id,cl.purchase_order_line_id,cl.id,(item->>'shippedPackageCount')::numeric,(item->>'shippedQuantity')::numeric,cl.confirmed_package_unit,greatest(cl.confirmed_quantity-allocated-(item->>'shippedQuantity')::numeric,0),coalesce(item->>'supplierLineReference',''),coalesce(item->>'note',''));
  end loop;
  update public.purchase_orders set status=case when exists(
    select 1 from public.purchase_order_confirmation_lines x where x.confirmation_id=c.id and
    (select coalesce(sum(sl.shipped_quantity),0) from public.purchase_order_shipment_lines sl join public.purchase_order_shipments s on s.id=sl.shipment_id where sl.confirmation_line_id=x.id and s.status<>'cancelled')<x.confirmed_quantity
  ) then 'partially_shipped' else 'shipped' end,revision=revision+1,updated_at=now() where id=o.id;
  insert into public.purchase_order_shipment_events(workspace_id,owner_id,shipment_id,purchase_order_id,event_type,new_state,evidence,actor_id,source_key)
  values(o.workspace_id,uid,sid,o.id,'created','preparing',jsonb_build_object('type',shipment_payload->>'evidenceType','reference',shipment_payload->>'evidenceReference'),uid,'shipment-created:'||sid);
  insert into public.supplier_events(workspace_id,owner_id,supplier_id,event_type,occurred_at,title,description,purchase_plan_id,purchase_order_id,source_key,metadata)
  values(o.workspace_id,uid,o.supplier_id,'shipment_preparing',now(),'Shipment preparing','Supplier shipment preparation recorded; no goods received.',o.source_purchase_plan_id,o.id,'shipment-preparing:'||sid,jsonb_build_object('shipmentId',sid,'sequence',sequence_no)) on conflict do nothing;
  return sid;
end $$;

create function public.record_purchase_order_shipment_status(
  target_shipment_id uuid, expected_revision bigint, candidate_status text, status_payload jsonb, candidate_idempotency_key uuid
) returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); s public.purchase_order_shipments; o public.purchase_orders; event_name text;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select * into s from public.purchase_order_shipments where id=target_shipment_id and owner_id=uid for update;
  if s.id is null or not exists(select 1 from public.workspaces where id=s.workspace_id and owner_id=uid and lifecycle_state='active') then raise exception 'SHIPMENT_UNAVAILABLE'; end if;
  if exists(select 1 from public.purchase_order_shipment_events where workspace_id=s.workspace_id and source_key='shipment-status:'||candidate_idempotency_key) then return s.revision; end if;
  if s.revision<>expected_revision then raise exception 'STALE_SHIPMENT_REVISION'; end if;
  if candidate_status not in('preparing','dispatched','in_transit','delayed','carrier_exception','delivery_reported','cancelled') then raise exception 'SHIPMENT_STATUS_INVALID'; end if;
  if s.status in('delivery_reported','cancelled') then raise exception 'SHIPMENT_TERMINAL'; end if;
  if candidate_status='dispatched' and nullif(status_payload->>'dispatchDate','') is null then raise exception 'DISPATCH_DATE_REQUIRED'; end if;
  update public.purchase_order_shipments set status=candidate_status,carrier=coalesce(nullif(status_payload->>'carrier',''),carrier),
    service_level=coalesce(nullif(status_payload->>'serviceLevel',''),service_level),tracking_number=coalesce(nullif(status_payload->>'trackingNumber',''),tracking_number),
    tracking_url=coalesce(nullif(status_payload->>'trackingUrl',''),tracking_url),dispatch_date=case when candidate_status='dispatched' then (status_payload->>'dispatchDate')::timestamptz else dispatch_date end,
    estimated_delivery_date=coalesce(nullif(status_payload->>'estimatedDeliveryDate','')::date,estimated_delivery_date),
    delivery_reported_at=case when candidate_status='delivery_reported' then coalesce(nullif(status_payload->>'reportedAt','')::timestamptz,now()) else delivery_reported_at end,
    revision=revision+1,updated_at=now() where id=s.id;
  insert into public.purchase_order_shipment_events(workspace_id,owner_id,shipment_id,purchase_order_id,event_type,prior_state,new_state,evidence,metadata,actor_id,source_key)
  values(s.workspace_id,uid,s.id,s.purchase_order_id,case when candidate_status='preparing' then 'tracking_updated' else candidate_status end,s.status,candidate_status,
    jsonb_build_object('type',status_payload->>'evidenceType','reference',status_payload->>'evidenceReference'),status_payload,uid,'shipment-status:'||candidate_idempotency_key);
  select * into o from public.purchase_orders where id=s.purchase_order_id;
  event_name:=case candidate_status when 'dispatched' then 'shipment_dispatched' when 'delayed' then 'shipment_delayed' when 'delivery_reported' then 'shipment_delivery_reported' else null end;
  if event_name is not null then
    insert into public.supplier_events(workspace_id,owner_id,supplier_id,event_type,occurred_at,title,description,purchase_plan_id,purchase_order_id,source_key,metadata)
    values(s.workspace_id,uid,s.supplier_id,event_name,now(),replace(initcap(event_name),'_',' '),case when candidate_status='delivery_reported' then 'Carrier or supplier reports delivery. Physical receipt and inspection are not recorded.' else 'Shipment logistics status recorded.' end,o.source_purchase_plan_id,o.id,'shipment-event:'||candidate_idempotency_key,jsonb_build_object('shipmentId',s.id,'status',candidate_status,'evidenceReference',status_payload->>'evidenceReference')) on conflict do nothing;
  end if;
  insert into public.purchase_order_audit_events(workspace_id,owner_id,purchase_order_id,source_purchase_plan_id,source_purchase_plan_version,source_purchase_plan_basket_id,supplier_id,event_type,actor_id,prior_state,new_state,metadata)
  values(o.workspace_id,uid,o.id,o.source_purchase_plan_id,o.source_purchase_plan_version,o.source_purchase_plan_basket_id,o.supplier_id,'shipment_status_recorded',uid,s.status,candidate_status,jsonb_build_object('shipmentId',s.id));
  return s.revision+1;
end $$;

revoke execute on function public.record_purchase_order_supplier_confirmation(uuid,bigint,uuid,jsonb) from public,anon;
revoke execute on function public.decide_purchase_order_confirmation(uuid,bigint,text,text,jsonb) from public,anon;
revoke execute on function public.create_purchase_order_shipment(uuid,uuid,bigint,uuid,jsonb) from public,anon;
revoke execute on function public.record_purchase_order_shipment_status(uuid,bigint,text,jsonb,uuid) from public,anon;
grant execute on function public.record_purchase_order_supplier_confirmation(uuid,bigint,uuid,jsonb) to authenticated;
grant execute on function public.decide_purchase_order_confirmation(uuid,bigint,text,text,jsonb) to authenticated;
grant execute on function public.create_purchase_order_shipment(uuid,uuid,bigint,uuid,jsonb) to authenticated;
grant execute on function public.record_purchase_order_shipment_status(uuid,bigint,text,jsonb,uuid) to authenticated;
