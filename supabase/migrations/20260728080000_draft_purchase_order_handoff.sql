-- Explicit Draft Purchase Order Handoff V1.
-- An internal draft prepares manual checkout. It is not placement, payment,
-- supplier confirmation, incoming stock, receipt, or inventory.

alter table public.purchase_orders
  add column source_purchase_plan_version integer,
  add column source_purchase_plan_basket_id uuid,
  add column source_scenario_id uuid,
  add column source_round_id uuid,
  add column handoff_policy_version text,
  add column draft_version integer not null default 1 check(draft_version>0),
  add column draft_created_at timestamptz,
  add column cancelled_by uuid,
  add column cancelled_at timestamptz,
  add column cancellation_reason text,
  add column supplier_snapshot jsonb not null default '{}' check(jsonb_typeof(supplier_snapshot)='object'),
  add column commercial_snapshot jsonb not null default '{}' check(jsonb_typeof(commercial_snapshot)='object'),
  add column verification_snapshot jsonb not null default '{}' check(jsonb_typeof(verification_snapshot)='object'),
  add column manual_checkout_checklist jsonb not null default '[]' check(jsonb_typeof(manual_checkout_checklist)='array'),
  add constraint purchase_orders_plan_basket_fk foreign key(workspace_id,source_purchase_plan_basket_id)
    references public.purchase_plan_baskets(workspace_id,id),
  add constraint purchase_orders_source_scenario_fk foreign key(workspace_id,source_scenario_id)
    references public.production_procurement_scenarios(workspace_id,id),
  add constraint purchase_orders_source_round_fk foreign key(workspace_id,source_round_id)
    references public.production_procurement_rounds(workspace_id,id),
  add constraint purchase_orders_draft_lifecycle check(
    (status<>'draft' or external_order_date is null) and
    (cancelled_at is null or status='cancelled') and
    (status<>'cancelled' or cancellation_reason is not null)
  );

alter table public.purchase_orders drop constraint purchase_orders_workspace_id_handoff_key_key;
create unique index purchase_orders_basket_handoff
  on public.purchase_orders(workspace_id,source_purchase_plan_id,source_purchase_plan_basket_id,handoff_key)
  where source_purchase_plan_basket_id is not null and handoff_key is not null;
create unique index purchase_orders_active_plan_basket
  on public.purchase_orders(workspace_id,source_purchase_plan_id,source_purchase_plan_basket_id)
  where source_purchase_plan_basket_id is not null and status='draft';

alter table public.purchase_order_lines
  add column source_purchase_plan_basket_id uuid,
  add column source_requirement_id uuid,
  add column source_scenario_line_id uuid,
  add column ingredient_name_snapshot text,
  add column inci_snapshot text,
  add column supplier_sku_snapshot text,
  add column variant_snapshot text,
  add column product_url_snapshot text,
  add column required_quantity numeric check(required_quantity is null or required_quantity>0),
  add column required_unit text,
  add column moq_adjusted_package_count numeric check(moq_adjusted_package_count is null or moq_adjusted_package_count>0),
  add column expected_surplus numeric check(expected_surplus is null or expected_surplus>=0),
  add column expected_unit_price numeric check(expected_unit_price is null or expected_unit_price>=0),
  add column verified_unit_price numeric check(verified_unit_price is null or verified_unit_price>=0),
  add column effective_unit_price numeric check(effective_unit_price is null or effective_unit_price>=0),
  add column effective_value_source text check(effective_value_source is null or effective_value_source in('approved_snapshot','checkout_verification')),
  add column shipping_allocation numeric check(shipping_allocation is null or shipping_allocation>=0),
  add column expected_landed_cost numeric check(expected_landed_cost is null or expected_landed_cost>=0),
  add column effective_cost_per_unit numeric check(effective_cost_per_unit is null or effective_cost_per_unit>=0),
  add column product_snapshot jsonb not null default '{}' check(jsonb_typeof(product_snapshot)='object'),
  add column documentation_snapshot jsonb not null default '{}' check(jsonb_typeof(documentation_snapshot)='object'),
  add column verification_snapshot jsonb not null default '{}' check(jsonb_typeof(verification_snapshot)='object'),
  add constraint purchase_order_lines_plan_basket_fk foreign key(workspace_id,source_purchase_plan_basket_id)
    references public.purchase_plan_baskets(workspace_id,id),
  add constraint purchase_order_lines_requirement_fk foreign key(workspace_id,source_requirement_id)
    references public.production_procurement_requirements(workspace_id,id),
  add constraint purchase_order_lines_scenario_line_fk foreign key(workspace_id,source_scenario_line_id)
    references public.production_procurement_scenario_lines(workspace_id,id);

create table public.purchase_order_audit_events(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  owner_id uuid not null,
  purchase_order_id uuid not null,
  source_purchase_plan_id uuid not null,
  source_purchase_plan_version integer,
  source_purchase_plan_basket_id uuid,
  supplier_id uuid not null,
  event_type text not null check(event_type in('draft_handoff_started','draft_created','draft_lines_created','draft_handoff_retried','draft_cancelled')),
  actor_id uuid not null,
  prior_state text,
  new_state text,
  reason text not null default '',
  handoff_key uuid,
  metadata jsonb not null default '{}' check(jsonb_typeof(metadata)='object'),
  occurred_at timestamptz not null default now(),
  unique(workspace_id,id),
  foreign key(workspace_id,purchase_order_id) references public.purchase_orders(workspace_id,id),
  foreign key(workspace_id,source_purchase_plan_id) references public.purchase_plans(workspace_id,id),
  foreign key(workspace_id,source_purchase_plan_basket_id) references public.purchase_plan_baskets(workspace_id,id),
  foreign key(workspace_id,supplier_id) references public.suppliers(workspace_id,id)
);
create index purchase_order_audit_history on public.purchase_order_audit_events(workspace_id,purchase_order_id,occurred_at desc);
alter table public.purchase_order_audit_events enable row level security;
create policy owner_select on public.purchase_order_audit_events for select to authenticated
  using(owner_id=(select auth.uid()) and exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid()) and w.lifecycle_state='active'));
revoke all on public.purchase_order_audit_events from public,anon,authenticated;
grant select on public.purchase_order_audit_events to authenticated;
grant all on public.purchase_order_audit_events to service_role;

comment on table public.purchase_orders is 'Internal execution drafts and later explicitly recorded external orders. Draft never implies placement, payment, confirmation, receipt, or stock.';
comment on function public.create_purchase_order_from_plan(uuid,uuid) is 'Legacy single-supplier compatibility handoff. Production Readiness uses create_draft_purchase_orders_from_plan.';

create function public.create_draft_purchase_orders_from_plan(
  target_plan_id uuid, expected_plan_revision bigint, candidate_handoff_key uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  uid uuid:=auth.uid(); plan_row public.purchase_plans; basket_row public.purchase_plan_baskets;
  order_id uuid; line_count integer; basket_count integer; existing_count integer;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if candidate_handoff_key is null then raise exception 'HANDOFF_KEY_REQUIRED'; end if;
  select * into plan_row from public.purchase_plans where id=target_plan_id and owner_id=uid for update;
  if plan_row.id is null then raise exception 'PURCHASE_PLAN_UNAVAILABLE'; end if;
  if not exists(select 1 from public.workspaces where id=plan_row.workspace_id and owner_id=uid and lifecycle_state='active') then raise exception 'WORKSPACE_UNAVAILABLE'; end if;
  if plan_row.revision<>expected_plan_revision then raise exception 'STALE_PURCHASE_PLAN_REVISION'; end if;
  if plan_row.status<>'checkout_ready' or plan_row.superseded_at is not null or plan_row.cancelled_at is not null then raise exception 'PURCHASE_PLAN_NOT_HANDOFF_ELIGIBLE'; end if;
  if exists(select 1 from public.purchase_plan_verifications v where v.workspace_id=plan_row.workspace_id and v.purchase_plan_id=plan_row.id and
    (v.resolution_state<>'resolved' or v.verification_state in('pending','changed_requires_new_plan','unavailable'))) then raise exception 'PURCHASE_PLAN_VERIFICATION_BLOCKED'; end if;
  select count(*) into basket_count from public.purchase_plan_baskets where workspace_id=plan_row.workspace_id and purchase_plan_id=plan_row.id;
  if basket_count=0 or basket_count<>plan_row.supplier_count then raise exception 'PURCHASE_PLAN_BASKETS_INCONSISTENT'; end if;
  if exists(select 1 from public.purchase_plan_baskets b where b.workspace_id=plan_row.workspace_id and b.purchase_plan_id=plan_row.id and
    (b.supplier_id is null or b.currency is null or b.currency!~'^[A-Z]{3}$' or not exists(
      select 1 from public.suppliers s where s.workspace_id=b.workspace_id and s.id=b.supplier_id and s.owner_id=uid
    ))) then raise exception 'PURCHASE_PLAN_BASKET_INVALID'; end if;
  if exists(select 1 from public.purchase_plan_lines l where l.workspace_id=plan_row.workspace_id and l.purchase_plan_id=plan_row.id and
    (l.purchase_plan_basket_id is null or l.pack_count<=0 or l.purchased_quantity<=0 or not exists(
      select 1 from public.purchase_plan_baskets b where b.workspace_id=l.workspace_id and b.id=l.purchase_plan_basket_id and b.purchase_plan_id=plan_row.id
    ))) then raise exception 'PURCHASE_PLAN_LINE_INVALID'; end if;
  if (select count(*) from public.purchase_plan_lines where workspace_id=plan_row.workspace_id and purchase_plan_id=plan_row.id)<>plan_row.line_count then raise exception 'PURCHASE_PLAN_LINES_INCONSISTENT'; end if;

  select count(*) into existing_count from public.purchase_orders where workspace_id=plan_row.workspace_id and
    source_purchase_plan_id=plan_row.id and handoff_key=candidate_handoff_key;
  if existing_count>0 then
    if existing_count<>basket_count then raise exception 'PARTIAL_HANDOFF_STATE'; end if;
    insert into public.purchase_order_audit_events(workspace_id,owner_id,purchase_order_id,source_purchase_plan_id,source_purchase_plan_version,source_purchase_plan_basket_id,supplier_id,event_type,actor_id,prior_state,new_state,handoff_key,metadata)
    select workspace_id,uid,id,source_purchase_plan_id,source_purchase_plan_version,source_purchase_plan_basket_id,supplier_id,'draft_handoff_retried',uid,status,status,candidate_handoff_key,jsonb_build_object('idempotent',true)
    from public.purchase_orders where workspace_id=plan_row.workspace_id and source_purchase_plan_id=plan_row.id and handoff_key=candidate_handoff_key;
    return (select jsonb_agg(id order by id) from public.purchase_orders where workspace_id=plan_row.workspace_id and source_purchase_plan_id=plan_row.id and handoff_key=candidate_handoff_key);
  end if;
  if exists(select 1 from public.purchase_orders where workspace_id=plan_row.workspace_id and source_purchase_plan_id=plan_row.id and source_purchase_plan_basket_id is not null and status='draft') then raise exception 'ACTIVE_DRAFT_HANDOFF_EXISTS'; end if;

  for basket_row in select * from public.purchase_plan_baskets where workspace_id=plan_row.workspace_id and purchase_plan_id=plan_row.id order by supplier_name_snapshot,id loop
    insert into public.purchase_orders(
      workspace_id,owner_id,supplier_id,source_purchase_plan_id,source_purchase_plan_revision,source_purchase_plan_version,
      source_purchase_plan_basket_id,source_scenario_id,source_round_id,handoff_key,handoff_policy_version,status,
      currency,merchandise_subtotal,discount,shipping,tax,total,supplier_url_snapshot,notes,created_by,draft_created_at,
      supplier_snapshot,commercial_snapshot,verification_snapshot,manual_checkout_checklist
    )
    select plan_row.workspace_id,uid,basket_row.supplier_id,plan_row.id,plan_row.revision,plan_row.plan_version,
      basket_row.id,plan_row.source_scenario_id,plan_row.production_procurement_round_id,candidate_handoff_key,'1.0.0','draft',
      basket_row.currency,basket_row.merchandise_subtotal,
      case when basket_row.confirmed_discount>0 then basket_row.confirmed_discount else basket_row.estimated_discount end,
      case when sv.verified_value is not null and jsonb_typeof(sv.verified_value)='number' then (sv.verified_value#>>'{}')::numeric else basket_row.shipping end,
      coalesce(basket_row.vat,0)+coalesce(basket_row.import_vat,0)+coalesce(basket_row.customs,0)+coalesce(basket_row.handling,0),
      basket_row.estimated_total,basket_row.supplier_url_snapshot,'Internal draft only; checkout action remains external.',uid,now(),
      jsonb_build_object('supplierId',s.id,'legalName',s.legal_name,'displayName',coalesce(s.trading_name,s.legal_name),'websiteUrl',basket_row.supplier_url_snapshot,'countryCode',s.country_code,'currency',basket_row.currency,'orderingNotes',s.internal_notes,'deliveryToNorway',dv.verification_state),
      to_jsonb(basket_row),
      jsonb_build_object('policyVersion','1.0.0','completedAt',plan_row.updated_at,'checks',coalesce(vs.checks,'[]'::jsonb)),
      jsonb_build_array('Open supplier website','Open each product','Confirm package and variant','Add package count','Confirm stock','Apply discount code','Confirm shipping','Confirm VAT and tax','Confirm checkout total','Record supplier reference only after external placement')
    from public.suppliers s
    left join lateral(select verified_value from public.purchase_plan_verifications where purchase_plan_basket_id=basket_row.id and field='shipping_amount' limit 1)sv on true
    left join lateral(select verification_state from public.purchase_plan_verifications where purchase_plan_basket_id=basket_row.id and field='delivery_to_norway' limit 1)dv on true
    left join lateral(select jsonb_agg(to_jsonb(v) order by v.category,v.field) checks from public.purchase_plan_verifications v where v.purchase_plan_basket_id=basket_row.id)vs on true
    where s.workspace_id=plan_row.workspace_id and s.id=basket_row.supplier_id
    returning id into order_id;
    insert into public.purchase_order_lines(
      workspace_id,owner_id,purchase_order_id,source_purchase_plan_line_id,source_purchase_plan_basket_id,source_requirement_id,source_scenario_line_id,
      supplier_product_id,canonical_ingredient_id,product_name_snapshot,ingredient_name_snapshot,inci_snapshot,product_url_snapshot,
      package_size,package_unit,ordered_package_count,moq_adjusted_package_count,required_quantity,required_unit,ordered_quantity,ordered_unit,expected_surplus,
      expected_unit_price,verified_unit_price,effective_unit_price,effective_value_source,unit_price,currency,line_subtotal,discount_allocation,shipping_allocation,
      expected_landed_cost,effective_cost_per_unit,product_snapshot,documentation_snapshot,verification_snapshot,notes
    )
    select l.workspace_id,uid,order_id,l.id,l.purchase_plan_basket_id,l.source_requirement_id,l.source_scenario_line_id,
      l.supplier_product_id,l.canonical_ingredient_id,l.supplier_product_name_snapshot,l.ingredient_name_snapshot,l.inci_snapshot,l.product_url_snapshot,
      l.pack_size,l.unit,l.pack_count,l.moq_adjusted_pack_count,l.required_quantity,l.unit,l.purchased_quantity,l.unit,l.expected_surplus,
      l.estimated_unit_price,
      case when pv.verified_value is not null and jsonb_typeof(pv.verified_value)='number' then (pv.verified_value#>>'{}')::numeric end,
      case when pv.verified_value is not null and jsonb_typeof(pv.verified_value)='number' then (pv.verified_value#>>'{}')::numeric else l.estimated_unit_price end,
      case when pv.verified_value is not null and jsonb_typeof(pv.verified_value)='number' then 'checkout_verification' else 'approved_snapshot' end,
      case when pv.verified_value is not null and jsonb_typeof(pv.verified_value)='number' then (pv.verified_value#>>'{}')::numeric else l.estimated_unit_price end,
      l.currency,
      l.pack_count*(case when pv.verified_value is not null and jsonb_typeof(pv.verified_value)='number' then (pv.verified_value#>>'{}')::numeric else l.estimated_unit_price end),
      l.allocated_discount,l.allocated_shipping,l.expected_landed_cost,l.effective_cost_per_unit,l.source_snapshot,l.documentation_state,
      jsonb_build_object('checks',coalesce(vs.checks,'[]'::jsonb),'mismatchState',coalesce(vs.mismatch_state,'match'),'waiverState',coalesce(vs.waiver_state,'none')),
      coalesce(l.requirement_reason,'')
    from public.purchase_plan_lines l
    left join lateral(select verified_value from public.purchase_plan_verifications where purchase_plan_line_id=l.id and field='package_price' and verification_state in('confirmed','changed_acceptable') limit 1)pv on true
    left join lateral(select jsonb_agg(to_jsonb(v) order by v.category,v.field) checks,max(v.mismatch_classification) mismatch_state,
      max(case when v.verification_state='waived_with_reason' then 'waived' else 'none' end) waiver_state
      from public.purchase_plan_verifications v where v.purchase_plan_line_id=l.id)vs on true
    where l.workspace_id=plan_row.workspace_id and l.purchase_plan_id=plan_row.id and l.purchase_plan_basket_id=basket_row.id;
    get diagnostics line_count=row_count;
    if line_count=0 then raise exception 'PURCHASE_PLAN_BASKET_LINES_REQUIRED'; end if;
    insert into public.purchase_order_audit_events(workspace_id,owner_id,purchase_order_id,source_purchase_plan_id,source_purchase_plan_version,source_purchase_plan_basket_id,supplier_id,event_type,actor_id,prior_state,new_state,handoff_key,metadata)
    values
      (plan_row.workspace_id,uid,order_id,plan_row.id,plan_row.plan_version,basket_row.id,basket_row.supplier_id,'draft_handoff_started',uid,null,'draft',candidate_handoff_key,jsonb_build_object('policyVersion','1.0.0')),
      (plan_row.workspace_id,uid,order_id,plan_row.id,plan_row.plan_version,basket_row.id,basket_row.supplier_id,'draft_created',uid,null,'draft',candidate_handoff_key,jsonb_build_object('internalDraft',true,'externallyPlaced',false)),
      (plan_row.workspace_id,uid,order_id,plan_row.id,plan_row.plan_version,basket_row.id,basket_row.supplier_id,'draft_lines_created',uid,null,'draft',candidate_handoff_key,jsonb_build_object('lineCount',line_count));
  end loop;
  return (select jsonb_agg(id order by id) from public.purchase_orders
    where workspace_id=plan_row.workspace_id and source_purchase_plan_id=plan_row.id and handoff_key=candidate_handoff_key);
end $$;

create function public.cancel_draft_purchase_order(target_order_id uuid,expected_revision bigint,candidate_reason text)
returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); order_row public.purchase_orders;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if nullif(trim(candidate_reason),'') is null then raise exception 'CANCELLATION_REASON_REQUIRED'; end if;
  select * into order_row from public.purchase_orders where id=target_order_id and owner_id=uid for update;
  if order_row.id is null then raise exception 'PURCHASE_ORDER_UNAVAILABLE'; end if;
  if not exists(select 1 from public.workspaces where id=order_row.workspace_id and owner_id=uid and lifecycle_state='active') then raise exception 'WORKSPACE_UNAVAILABLE'; end if;
  if order_row.revision<>expected_revision then raise exception 'STALE_PURCHASE_ORDER_REVISION'; end if;
  if order_row.status<>'draft' or order_row.external_order_date is not null then raise exception 'PURCHASE_ORDER_NOT_DRAFT_CANCELLABLE'; end if;
  update public.purchase_orders set status='cancelled',cancelled_by=uid,cancelled_at=now(),cancellation_reason=trim(candidate_reason),revision=revision+1,updated_at=now() where id=order_row.id;
  insert into public.purchase_order_audit_events(workspace_id,owner_id,purchase_order_id,source_purchase_plan_id,source_purchase_plan_version,source_purchase_plan_basket_id,supplier_id,event_type,actor_id,prior_state,new_state,reason,handoff_key)
  values(order_row.workspace_id,uid,order_row.id,order_row.source_purchase_plan_id,order_row.source_purchase_plan_version,order_row.source_purchase_plan_basket_id,order_row.supplier_id,'draft_cancelled',uid,'draft','cancelled',trim(candidate_reason),order_row.handoff_key);
  return order_row.revision+1;
end $$;

revoke all on function public.create_draft_purchase_orders_from_plan(uuid,bigint,uuid) from public,anon;
revoke all on function public.cancel_draft_purchase_order(uuid,bigint,text) from public,anon;
grant execute on function public.create_draft_purchase_orders_from_plan(uuid,bigint,uuid) to authenticated;
grant execute on function public.cancel_draft_purchase_order(uuid,bigint,text) to authenticated;
