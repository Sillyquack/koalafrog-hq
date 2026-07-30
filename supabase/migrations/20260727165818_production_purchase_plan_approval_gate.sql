-- Immutable multi-supplier internal Purchase Plans and checkout verification.
-- Approval and checkout readiness never create Purchase Orders, Receipts, or inventory.

alter table public.purchase_plans
  add column production_procurement_round_id uuid,
  add column source_scenario_id uuid,
  add column source_scenario_revision bigint,
  add column source_calculation_version text,
  add column plan_version integer,
  add column strategy text,
  add column strategy_explanation text[] not null default '{}',
  add column base_currency text,
  add column mixed_currency boolean not null default false,
  add column supplier_count integer,
  add column line_count integer,
  add column known_minimum numeric,
  add column confirmed_total numeric,
  add column range_minimum numeric,
  add column range_maximum numeric,
  add column unknown_component_count integer,
  add column warning_count integer,
  add column blocker_count integer,
  add column approved_by uuid,
  add column superseded_by uuid,
  add column superseded_at timestamptz,
  add column cancelled_by uuid,
  add column cancellation_reason text,
  add column verification_revision bigint not null default 1 check(verification_revision>0),
  add column snapshot_version text,
  add column approval_key uuid,
  add column source_snapshot jsonb not null default '{}' check(jsonb_typeof(source_snapshot)='object'),
  add constraint purchase_plans_round_fk foreign key(workspace_id,production_procurement_round_id) references public.production_procurement_rounds(workspace_id,id),
  add constraint purchase_plans_scenario_fk foreign key(workspace_id,source_scenario_id) references public.production_procurement_scenarios(workspace_id,id),
  add constraint purchase_plans_base_currency check(base_currency is null or base_currency~'^[A-Z]{3}$'),
  add constraint purchase_plans_version_check check(plan_version is null or plan_version>0),
  add constraint purchase_plans_snapshot_counts check(
    (supplier_count is null or supplier_count>=0) and (line_count is null or line_count>=0) and
    (unknown_component_count is null or unknown_component_count>=0) and
    (warning_count is null or warning_count>=0) and (blocker_count is null or blocker_count>=0)
  );
create unique index purchase_plans_scenario_approval on public.purchase_plans(workspace_id,source_scenario_id) where source_scenario_id is not null;
create unique index purchase_plans_round_version on public.purchase_plans(workspace_id,production_procurement_round_id,plan_version) where production_procurement_round_id is not null;
create unique index purchase_plans_approval_key on public.purchase_plans(workspace_id,approval_key) where approval_key is not null;
create index purchase_plans_round_status on public.purchase_plans(workspace_id,production_procurement_round_id,status,plan_version desc);

create table public.purchase_plan_baskets(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  owner_id uuid not null,
  purchase_plan_id uuid not null,
  source_scenario_basket_id uuid,
  supplier_id uuid not null,
  supplier_name_snapshot text not null,
  supplier_url_snapshot text,
  currency text not null check(currency~'^[A-Z]{3}$'),
  merchandise_subtotal numeric not null check(merchandise_subtotal>=0),
  eligible_subtotal numeric not null check(eligible_subtotal>=0),
  confirmed_discount numeric not null check(confirmed_discount>=0),
  estimated_discount numeric not null check(estimated_discount>=0),
  post_discount_subtotal numeric not null check(post_discount_subtotal>=0),
  shipping numeric,
  shipping_state text not null,
  vat numeric,
  vat_state text not null,
  import_vat numeric,
  import_vat_state text not null,
  customs numeric,
  customs_state text not null,
  handling numeric,
  handling_state text not null,
  known_minimum numeric not null check(known_minimum>=0),
  confirmed_total numeric,
  estimated_total numeric,
  range_minimum numeric,
  range_maximum numeric,
  free_shipping_state jsonb not null default '{}' check(jsonb_typeof(free_shipping_state)='object'),
  first_order_discount_state jsonb not null default '{}' check(jsonb_typeof(first_order_discount_state)='object'),
  commercial_warnings text[] not null default '{}',
  freshness_states jsonb not null default '{}' check(jsonb_typeof(freshness_states)='object'),
  commercial_assumption_snapshot jsonb not null default '{}' check(jsonb_typeof(commercial_assumption_snapshot)='object'),
  verification_required_count integer not null default 0 check(verification_required_count>=0),
  verification_completed_count integer not null default 0 check(verification_completed_count>=0),
  source_calculation_version text not null,
  created_at timestamptz not null default now(),
  unique(workspace_id,id),
  unique(workspace_id,purchase_plan_id,supplier_id,currency),
  foreign key(workspace_id,purchase_plan_id) references public.purchase_plans(workspace_id,id),
  foreign key(workspace_id,source_scenario_basket_id) references public.production_procurement_scenario_baskets(workspace_id,id),
  foreign key(workspace_id,supplier_id) references public.suppliers(workspace_id,id)
);
create index purchase_plan_baskets_plan on public.purchase_plan_baskets(workspace_id,purchase_plan_id);

alter table public.purchase_plan_lines
  add column purchase_plan_basket_id uuid,
  add column source_scenario_line_id uuid,
  add column source_requirement_id uuid,
  add column canonical_ingredient_id text,
  add column ingredient_name_snapshot text,
  add column inci_snapshot text,
  add column supplier_product_name_snapshot text,
  add column product_url_snapshot text,
  add column moq_adjusted_pack_count integer,
  add column required_quantity numeric,
  add column purchased_quantity numeric,
  add column expected_surplus numeric,
  add column allocated_discount numeric,
  add column allocated_shipping numeric,
  add column expected_landed_cost numeric,
  add column effective_cost_per_unit numeric,
  add column documentation_state jsonb not null default '{}' check(jsonb_typeof(documentation_state)='object'),
  add column price_freshness text,
  add column stock_freshness text,
  add column snapshot_warnings text[] not null default '{}',
  add column source_selection_revision bigint,
  add column source_snapshot jsonb not null default '{}' check(jsonb_typeof(source_snapshot)='object'),
  add constraint purchase_plan_lines_basket_fk foreign key(workspace_id,purchase_plan_basket_id) references public.purchase_plan_baskets(workspace_id,id),
  add constraint purchase_plan_lines_scenario_line_fk foreign key(workspace_id,source_scenario_line_id) references public.production_procurement_scenario_lines(workspace_id,id),
  add constraint purchase_plan_lines_requirement_fk foreign key(workspace_id,source_requirement_id) references public.production_procurement_requirements(workspace_id,id);
create index purchase_plan_lines_basket on public.purchase_plan_lines(workspace_id,purchase_plan_basket_id);

create table public.purchase_plan_verifications(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  owner_id uuid not null,
  purchase_plan_id uuid not null,
  plan_version integer not null check(plan_version>0),
  purchase_plan_basket_id uuid,
  purchase_plan_line_id uuid,
  supplier_id uuid,
  category text not null check(category in('supplier_product','supplier','discount','shipping','tax_import','documentation')),
  field text not null,
  expected_value jsonb not null default 'null',
  expected_unit_or_currency text,
  severity text not null check(severity in('required','advisory')),
  requirement_reason text not null,
  source_freshness text,
  verification_state text not null default 'pending' check(verification_state in('pending','confirmed','changed_acceptable','changed_requires_new_plan','unavailable','not_applicable','waived_with_reason')),
  verification_method text,
  verified_value jsonb,
  verified_unit_or_currency text,
  evidence_reference text,
  note text not null default '',
  verified_by uuid,
  verified_at timestamptz,
  mismatch_classification text not null default 'not_checked' check(mismatch_classification in('not_checked','match','acceptable','requires_new_plan','unavailable','not_applicable','waived')),
  resolution_state text not null default 'unresolved' check(resolution_state in('unresolved','resolved','blocking')),
  policy_version text not null default '1.0.0',
  revision bigint not null default 1 check(revision>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,id),
  unique(workspace_id,purchase_plan_id,purchase_plan_basket_id,purchase_plan_line_id,category,field),
  foreign key(workspace_id,purchase_plan_id) references public.purchase_plans(workspace_id,id),
  foreign key(workspace_id,purchase_plan_basket_id) references public.purchase_plan_baskets(workspace_id,id),
  foreign key(workspace_id,purchase_plan_line_id) references public.purchase_plan_lines(workspace_id,id),
  foreign key(workspace_id,supplier_id) references public.suppliers(workspace_id,id),
  check(purchase_plan_basket_id is not null or purchase_plan_line_id is not null)
);
create index purchase_plan_verifications_gate on public.purchase_plan_verifications(workspace_id,purchase_plan_id,severity,resolution_state,verification_state);
create index purchase_plan_verifications_basket on public.purchase_plan_verifications(workspace_id,purchase_plan_basket_id,category);

create table public.purchase_plan_audit_events(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  owner_id uuid not null,
  purchase_plan_id uuid not null,
  plan_version integer not null,
  event_type text not null check(event_type in('scenario_approved','plan_version_created','verification_generated','verification_recorded','verification_changed','verification_waived','plan_blocked','checkout_ready','plan_superseded','plan_cancelled')),
  actor_id uuid not null,
  occurred_at timestamptz not null default now(),
  prior_state text,
  new_state text,
  reason text not null default '',
  metadata jsonb not null default '{}' check(jsonb_typeof(metadata)='object'),
  source_scenario_id uuid,
  created_at timestamptz not null default now(),
  unique(workspace_id,id),
  foreign key(workspace_id,purchase_plan_id) references public.purchase_plans(workspace_id,id),
  foreign key(workspace_id,source_scenario_id) references public.production_procurement_scenarios(workspace_id,id)
);
create index purchase_plan_audit_history on public.purchase_plan_audit_events(workspace_id,purchase_plan_id,occurred_at desc);

do $$ declare table_name text; begin
  foreach table_name in array array['purchase_plan_baskets','purchase_plan_verifications','purchase_plan_audit_events'] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('create policy owner_select on public.%I for select to authenticated using(owner_id=(select auth.uid()))',table_name);
    execute format('revoke all on public.%I from public,anon,authenticated',table_name);
    execute format('grant select on public.%I to authenticated',table_name);
    execute format('grant all on public.%I to service_role',table_name);
  end loop;
end $$;

create function public.approve_production_procurement_scenario(
  target_scenario_id uuid,expected_scenario_revision bigint,candidate_approval_key uuid,
  candidate_title text default null,candidate_notes text default null,target_replaces_plan_id uuid default null
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); scenario_row public.production_procurement_scenarios; round_row public.production_procurement_rounds;
  existing_id uuid; plan_id uuid; next_version integer; old_plan public.purchase_plans; basket_row record; plan_basket_id uuid;
  generated_count integer;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if candidate_approval_key is null then raise exception 'APPROVAL_KEY_REQUIRED'; end if;
  select * into scenario_row from public.production_procurement_scenarios where id=target_scenario_id and owner_id=uid for update;
  if scenario_row.id is null then raise exception 'SCENARIO_UNAVAILABLE'; end if;
  select * into round_row from public.production_procurement_rounds where workspace_id=scenario_row.workspace_id and id=scenario_row.round_id and owner_id=uid for update;
  if round_row.id is null or round_row.status='cancelled' then raise exception 'ROUND_UNAVAILABLE'; end if;
  if not exists(select 1 from public.workspaces where id=scenario_row.workspace_id and owner_id=uid and lifecycle_state='active') then raise exception 'WORKSPACE_UNAVAILABLE'; end if;
  select id into existing_id from public.purchase_plans where workspace_id=scenario_row.workspace_id and (source_scenario_id=scenario_row.id or approval_key=candidate_approval_key);
  if existing_id is not null then return existing_id; end if;
  if scenario_row.revision<>expected_scenario_revision then raise exception 'STALE_SCENARIO_REVISION'; end if;
  if scenario_row.status<>'published' then raise exception 'SCENARIO_NOT_PUBLISHED'; end if;
  if scenario_row.feasibility not in('complete','complete_with_warnings') or scenario_row.blocker_count>0 then raise exception 'SCENARIO_NOT_FEASIBLE'; end if;
  if scenario_row.supplier_count=0 or scenario_row.line_count=0 then raise exception 'SCENARIO_SNAPSHOT_EMPTY'; end if;
  if scenario_row.supplier_count<>(select count(*) from public.production_procurement_scenario_baskets where workspace_id=scenario_row.workspace_id and scenario_id=scenario_row.id) or
     scenario_row.line_count<>(select count(*) from public.production_procurement_scenario_lines where workspace_id=scenario_row.workspace_id and scenario_id=scenario_row.id) then raise exception 'SCENARIO_SNAPSHOT_INCONSISTENT'; end if;
  if exists(select 1 from public.production_procurement_scenario_baskets where workspace_id=scenario_row.workspace_id and scenario_id=scenario_row.id and currency is null) then raise exception 'SCENARIO_CURRENCY_REQUIRED'; end if;
  if exists(select 1 from public.production_procurement_scenario_lines l where l.workspace_id=scenario_row.workspace_id and l.scenario_id=scenario_row.id and
    (l.package_count<=0 or l.purchased_quantity<l.required_quantity or not exists(
      select 1 from public.supplier_product_ingredient_mappings m where m.workspace_id=l.workspace_id and m.supplier_product_id=l.supplier_product_id and m.ingredient_id=l.ingredient_id and m.status='accepted'
    ))) then raise exception 'SCENARIO_LINE_NOT_ELIGIBLE'; end if;
  if target_replaces_plan_id is null and exists(select 1 from public.purchase_plans where workspace_id=scenario_row.workspace_id and production_procurement_round_id=scenario_row.round_id and status in('verification_required','checkout_ready')) then raise exception 'ACTIVE_PLAN_REQUIRES_EXPLICIT_SUPERSESSION'; end if;
  if target_replaces_plan_id is not null then
    select * into old_plan from public.purchase_plans where workspace_id=scenario_row.workspace_id and id=target_replaces_plan_id and owner_id=uid for update;
    if old_plan.id is null or old_plan.production_procurement_round_id<>scenario_row.round_id or old_plan.status not in('verification_required','checkout_ready') then raise exception 'PLAN_NOT_SUPERSEDEABLE'; end if;
  end if;
  select coalesce(max(plan_version),0)+1 into next_version from public.purchase_plans where workspace_id=scenario_row.workspace_id and production_procurement_round_id=scenario_row.round_id;
  insert into public.purchase_plans(
    workspace_id,owner_id,title,status,purpose,supplier_id,currency,source_type,source_id,internal_notes,
    estimated_merchandise_total,estimated_landed_total,approved_at,revision,creation_key,
    production_procurement_round_id,source_scenario_id,source_scenario_revision,source_calculation_version,plan_version,
    strategy,strategy_explanation,base_currency,mixed_currency,supplier_count,line_count,known_minimum,confirmed_total,
    range_minimum,range_maximum,unknown_component_count,warning_count,blocker_count,approved_by,verification_revision,snapshot_version,approval_key,source_snapshot
  ) values(
    scenario_row.workspace_id,uid,coalesce(nullif(trim(candidate_title),''),'Production procurement plan v'||next_version),'verification_required',
    'Approved internal purchasing basis; not an order',null,scenario_row.base_currency,'production_procurement_scenario',scenario_row.id::text,coalesce(candidate_notes,''),
    scenario_row.total_known_minimum,scenario_row.total_estimated,now(),1,gen_random_uuid(),
    scenario_row.round_id,scenario_row.id,scenario_row.revision,scenario_row.calculation_version,next_version,
    scenario_row.strategy,scenario_row.ranking_explanation,scenario_row.base_currency,scenario_row.mixed_currency,scenario_row.supplier_count,scenario_row.line_count,
    scenario_row.total_known_minimum,scenario_row.total_confirmed,scenario_row.total_range_minimum,scenario_row.total_range_maximum,
    cardinality(scenario_row.unknown_commercial_components),scenario_row.warning_count,scenario_row.blocker_count,uid,1,'1.0.0',candidate_approval_key,
    to_jsonb(scenario_row)
  ) returning id into plan_id;
  for basket_row in select * from public.production_procurement_scenario_baskets where workspace_id=scenario_row.workspace_id and scenario_id=scenario_row.id order by supplier_name_snapshot,currency loop
    insert into public.purchase_plan_baskets(
      workspace_id,owner_id,purchase_plan_id,source_scenario_basket_id,supplier_id,supplier_name_snapshot,supplier_url_snapshot,currency,
      merchandise_subtotal,eligible_subtotal,confirmed_discount,estimated_discount,post_discount_subtotal,shipping,shipping_state,vat,vat_state,
      import_vat,import_vat_state,customs,customs_state,handling,handling_state,known_minimum,confirmed_total,estimated_total,range_minimum,range_maximum,
      free_shipping_state,first_order_discount_state,commercial_warnings,freshness_states,commercial_assumption_snapshot,source_calculation_version
    ) values(
      basket_row.workspace_id,uid,plan_id,basket_row.id,basket_row.supplier_id,basket_row.supplier_name_snapshot,basket_row.supplier_url_snapshot,basket_row.currency,
      basket_row.merchandise_subtotal,basket_row.eligible_subtotal,basket_row.confirmed_discount,basket_row.estimated_discount,basket_row.post_discount_subtotal,
      basket_row.shipping,basket_row.shipping_state,basket_row.vat,basket_row.vat_state,basket_row.import_vat,basket_row.import_vat_state,basket_row.customs,
      basket_row.customs_state,basket_row.handling,basket_row.handling_state,basket_row.known_minimum,basket_row.confirmed_total,basket_row.estimated_total,
      basket_row.range_minimum,basket_row.range_maximum,basket_row.free_shipping_progress,
      jsonb_build_object('confirmedDiscount',basket_row.confirmed_discount,'estimatedDiscount',basket_row.estimated_discount),
      basket_row.warnings,basket_row.freshness_states,basket_row.assumption_snapshot,scenario_row.calculation_version
    ) returning id into plan_basket_id;
    insert into public.purchase_plan_lines(
      workspace_id,owner_id,purchase_plan_id,inventory_domain,supplier_product_id,description,planned_quantity,unit,pack_count,pack_size,
      estimated_unit_price,estimated_line_total,currency,requirement_reason,requirement_basis,display_order,purchase_plan_basket_id,source_scenario_line_id,
      source_requirement_id,canonical_ingredient_id,ingredient_name_snapshot,inci_snapshot,supplier_product_name_snapshot,product_url_snapshot,
      moq_adjusted_pack_count,required_quantity,purchased_quantity,expected_surplus,allocated_discount,allocated_shipping,expected_landed_cost,
      effective_cost_per_unit,documentation_state,price_freshness,stock_freshness,snapshot_warnings,source_selection_revision,source_snapshot
    )
    select l.workspace_id,uid,plan_id,'raw_material',l.supplier_product_id,l.supplier_product_name_snapshot,l.purchased_quantity,l.package_unit,
      l.package_count,l.package_size,l.unit_price,l.merchandise_line_total,l.currency,'Production procurement requirement',jsonb_build_object('requirementId',l.requirement_id),0,
      plan_basket_id,l.id,l.requirement_id,l.ingredient_id,l.ingredient_name_snapshot,i.inci_name,l.supplier_product_name_snapshot,l.product_url_snapshot,
      l.moq_adjusted_count,l.required_quantity,l.purchased_quantity,l.surplus,l.allocated_discount,l.allocated_shipping,l.effective_landed_cost,
      l.effective_cost_per_required_unit,coalesce(l.assumption_snapshot->'documentation','{}'),l.assumption_snapshot->>'priceFreshness',
      l.assumption_snapshot->>'stockFreshness',l.warnings,l.source_selection_revision,to_jsonb(l)
    from public.production_procurement_scenario_lines l join public.ingredients i on i.workspace_id=l.workspace_id and i.id=l.ingredient_id
    where l.workspace_id=scenario_row.workspace_id and l.scenario_id=scenario_row.id and l.basket_id=basket_row.id;
  end loop;
  insert into public.purchase_plan_verifications(workspace_id,owner_id,purchase_plan_id,plan_version,purchase_plan_basket_id,supplier_id,category,field,expected_value,expected_unit_or_currency,severity,requirement_reason,source_freshness)
  select b.workspace_id,uid,plan_id,next_version,b.id,b.supplier_id,v.category,v.field,v.expected_value,b.currency,'required',v.reason,v.freshness
  from public.purchase_plan_baskets b cross join lateral(values
    ('supplier','delivery_to_norway',to_jsonb('expected'::text),'Confirm supplier delivery to Norway','checkout'),
    ('shipping','shipping_amount',coalesce(to_jsonb(b.shipping),'null'::jsonb),'Confirm checkout shipping amount',b.shipping_state),
    ('tax_import','tax_import',jsonb_build_object('vat',b.vat_state,'importVat',b.import_vat_state,'customs',b.customs_state,'handling',b.handling_state),'Confirm VAT, import, customs, and handling',null)
  )v(category,field,expected_value,reason,freshness) where b.purchase_plan_id=plan_id;
  insert into public.purchase_plan_verifications(workspace_id,owner_id,purchase_plan_id,plan_version,purchase_plan_basket_id,supplier_id,category,field,expected_value,expected_unit_or_currency,severity,requirement_reason,source_freshness)
  select b.workspace_id,uid,plan_id,next_version,b.id,b.supplier_id,'discount','first_order_discount',b.first_order_discount_state,b.currency,'required','Confirm discount eligibility and actual checkout discount',null
  from public.purchase_plan_baskets b where b.purchase_plan_id=plan_id and (b.confirmed_discount>0 or b.estimated_discount>0);
  insert into public.purchase_plan_verifications(workspace_id,owner_id,purchase_plan_id,plan_version,purchase_plan_basket_id,purchase_plan_line_id,supplier_id,category,field,expected_value,expected_unit_or_currency,severity,requirement_reason,source_freshness)
  select l.workspace_id,uid,plan_id,next_version,l.purchase_plan_basket_id,l.id,b.supplier_id,v.category,v.field,v.expected_value,v.unit,'required',v.reason,v.freshness
  from public.purchase_plan_lines l join public.purchase_plan_baskets b on b.workspace_id=l.workspace_id and b.id=l.purchase_plan_basket_id
  cross join lateral(values
    ('supplier_product','package_price',to_jsonb(l.estimated_unit_price),l.currency,'Confirm current package price','Price tolerance: 5% increase','price','1'),
    ('supplier_product','stock_availability','null'::jsonb,null,'Confirm stock and quantity limits','Availability changes require a new plan','stock','2'),
    ('supplier_product','package_identity',jsonb_build_object('size',l.pack_size,'unit',l.unit,'count',l.pack_count),l.unit,'Confirm product, package size, unit, MOQ, and quantity','Package changes require a new plan',null,'3'),
    ('documentation','required_documents',l.documentation_state,null,'Confirm required SDS, specification, INCI, and cosmetic-grade evidence','Required evidence cannot be waived',null,'4')
  )v(category,field,expected_value,unit,reason,policy_note,freshness,sort_key)
  where l.purchase_plan_id=plan_id;
  select count(*) into generated_count from public.purchase_plan_verifications where purchase_plan_id=plan_id;
  update public.purchase_plan_baskets b set verification_required_count=(select count(*) from public.purchase_plan_verifications v where v.purchase_plan_basket_id=b.id) where b.purchase_plan_id=plan_id;
  insert into public.purchase_plan_audit_events(workspace_id,owner_id,purchase_plan_id,plan_version,event_type,actor_id,prior_state,new_state,reason,metadata,source_scenario_id)
  values
    (scenario_row.workspace_id,uid,plan_id,next_version,'scenario_approved',uid,null,'verification_required','Published scenario approved as internal basis',jsonb_build_object('scenarioRevision',scenario_row.revision),scenario_row.id),
    (scenario_row.workspace_id,uid,plan_id,next_version,'plan_version_created',uid,null,'verification_required','Immutable multi-supplier snapshot created',jsonb_build_object('supplierCount',scenario_row.supplier_count,'lineCount',scenario_row.line_count),scenario_row.id),
    (scenario_row.workspace_id,uid,plan_id,next_version,'verification_generated',uid,null,'verification_required','Checkout verification gate generated',jsonb_build_object('count',generated_count),scenario_row.id);
  if old_plan.id is not null then
    update public.purchase_plans set status='superseded',superseded_by=plan_id,superseded_at=now(),revision=revision+1,updated_at=now() where id=old_plan.id;
    insert into public.purchase_plan_audit_events(workspace_id,owner_id,purchase_plan_id,plan_version,event_type,actor_id,prior_state,new_state,reason,metadata,source_scenario_id)
    values(old_plan.workspace_id,uid,old_plan.id,old_plan.plan_version,'plan_superseded',uid,old_plan.status,'superseded','Explicitly superseded by newer published scenario',jsonb_build_object('supersededBy',plan_id),old_plan.source_scenario_id);
  end if;
  return plan_id;
end $$;

create function public.record_purchase_plan_verification(
  target_verification_id uuid,expected_revision bigint,candidate_state text,candidate_verified_value jsonb,
  candidate_unit_or_currency text,candidate_method text,candidate_evidence text,candidate_note text
) returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); item public.purchase_plan_verifications; plan_row public.purchase_plans; next_state text; mismatch text; resolution text;
  expected_number numeric; actual_number numeric; tolerance numeric;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select * into item from public.purchase_plan_verifications where id=target_verification_id and owner_id=uid for update;
  if item.id is null then raise exception 'VERIFICATION_UNAVAILABLE'; end if;
  select * into plan_row from public.purchase_plans where workspace_id=item.workspace_id and id=item.purchase_plan_id and owner_id=uid for update;
  if plan_row.status in('superseded','cancelled') then raise exception 'PLAN_NOT_MUTABLE'; end if;
  if item.revision<>expected_revision then raise exception 'STALE_VERIFICATION_REVISION'; end if;
  if candidate_state not in('confirmed','changed','unavailable','not_applicable') then raise exception 'VERIFICATION_STATE_INVALID'; end if;
  if candidate_state='confirmed' then next_state:='confirmed';mismatch:='match';resolution:='resolved';
  elsif candidate_state='unavailable' then next_state:='unavailable';mismatch:='unavailable';resolution:='blocking';
  elsif candidate_state='not_applicable' then
    if item.field in('package_price','stock_availability','package_identity','delivery_to_norway','required_documents') then raise exception 'REQUIRED_VERIFICATION_NOT_APPLICABLE'; end if;
    next_state:='not_applicable';mismatch:='not_applicable';resolution:='resolved';
  else
    if item.field in('package_price','shipping_amount') and jsonb_typeof(item.expected_value)='number' and jsonb_typeof(candidate_verified_value)='number' then
      expected_number:=(item.expected_value#>>'{}')::numeric;actual_number:=(candidate_verified_value#>>'{}')::numeric;
      tolerance:=case item.field when 'package_price' then .05 else .10 end;
      if actual_number<=expected_number*(1+tolerance) then next_state:='changed_acceptable';mismatch:='acceptable';resolution:='resolved';
      else next_state:='changed_requires_new_plan';mismatch:='requires_new_plan';resolution:='blocking'; end if;
    elsif item.field='stock_availability' and candidate_verified_value#>>'{}' in('in_stock','available','confirmed') then next_state:='changed_acceptable';mismatch:='acceptable';resolution:='resolved';
    else next_state:='changed_requires_new_plan';mismatch:='requires_new_plan';resolution:='blocking'; end if;
  end if;
  update public.purchase_plan_verifications set verification_state=next_state,verification_method=nullif(trim(candidate_method),''),
    verified_value=candidate_verified_value,verified_unit_or_currency=nullif(trim(candidate_unit_or_currency),''),
    evidence_reference=nullif(trim(candidate_evidence),''),note=coalesce(candidate_note,''),verified_by=uid,verified_at=now(),
    mismatch_classification=mismatch,resolution_state=resolution,revision=revision+1,updated_at=now() where id=item.id;
  update public.purchase_plans set status=case when resolution='blocking' then 'verification_required' else status end,
    verification_revision=verification_revision+1,revision=revision+1,updated_at=now() where id=plan_row.id;
  update public.purchase_plan_baskets b set verification_completed_count=(select count(*) from public.purchase_plan_verifications v where v.purchase_plan_basket_id=b.id and v.resolution_state='resolved') where b.id=item.purchase_plan_basket_id;
  insert into public.purchase_plan_audit_events(workspace_id,owner_id,purchase_plan_id,plan_version,event_type,actor_id,prior_state,new_state,reason,metadata,source_scenario_id)
  values(item.workspace_id,uid,item.purchase_plan_id,item.plan_version,case when next_state='confirmed' then 'verification_recorded' else 'verification_changed' end,uid,item.verification_state,next_state,coalesce(candidate_note,''),jsonb_build_object('verificationId',item.id,'field',item.field,'mismatch',mismatch),plan_row.source_scenario_id);
  return item.revision+1;
end $$;

create function public.waive_purchase_plan_verification(target_verification_id uuid,expected_revision bigint,waiver_reason text)
returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); item public.purchase_plan_verifications; plan_row public.purchase_plans;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if length(trim(coalesce(waiver_reason,'')))<5 then raise exception 'WAIVER_REASON_REQUIRED'; end if;
  select * into item from public.purchase_plan_verifications where id=target_verification_id and owner_id=uid for update;
  if item.id is null then raise exception 'VERIFICATION_UNAVAILABLE'; end if;
  select * into plan_row from public.purchase_plans where workspace_id=item.workspace_id and id=item.purchase_plan_id and owner_id=uid for update;
  if plan_row.status in('superseded','cancelled') then raise exception 'PLAN_NOT_MUTABLE'; end if;
  if item.revision<>expected_revision then raise exception 'STALE_VERIFICATION_REVISION'; end if;
  if item.severity<>'advisory' then raise exception 'HARD_BLOCKER_NOT_WAIVABLE'; end if;
  update public.purchase_plan_verifications set verification_state='waived_with_reason',verification_method='owner_waiver',note=waiver_reason,
    verified_by=uid,verified_at=now(),mismatch_classification='waived',resolution_state='resolved',revision=revision+1,updated_at=now() where id=item.id;
  update public.purchase_plans set verification_revision=verification_revision+1,revision=revision+1,updated_at=now() where id=plan_row.id;
  insert into public.purchase_plan_audit_events(workspace_id,owner_id,purchase_plan_id,plan_version,event_type,actor_id,prior_state,new_state,reason,metadata,source_scenario_id)
  values(item.workspace_id,uid,item.purchase_plan_id,item.plan_version,'verification_waived',uid,item.verification_state,'waived_with_reason',waiver_reason,jsonb_build_object('verificationId',item.id),plan_row.source_scenario_id);
  return item.revision+1;
end $$;

create function public.mark_purchase_plan_checkout_ready(target_plan_id uuid,expected_verification_revision bigint)
returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); plan_row public.purchase_plans;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select * into plan_row from public.purchase_plans where id=target_plan_id and owner_id=uid for update;
  if plan_row.id is null then raise exception 'PURCHASE_PLAN_UNAVAILABLE'; end if;
  if plan_row.status='checkout_ready' then return plan_row.verification_revision; end if;
  if plan_row.status<>'verification_required' then raise exception 'PLAN_NOT_READY_ELIGIBLE'; end if;
  if plan_row.verification_revision<>expected_verification_revision then raise exception 'STALE_PLAN_VERIFICATION_REVISION'; end if;
  if exists(select 1 from public.purchase_plan_verifications where workspace_id=plan_row.workspace_id and purchase_plan_id=plan_row.id and severity='required' and (resolution_state<>'resolved' or verification_state not in('confirmed','changed_acceptable','not_applicable'))) then raise exception 'VERIFICATION_GATE_UNRESOLVED'; end if;
  if not exists(select 1 from public.purchase_plan_baskets b where b.workspace_id=plan_row.workspace_id and b.purchase_plan_id=plan_row.id) then raise exception 'PLAN_BASKETS_UNAVAILABLE'; end if;
  update public.purchase_plans set status='checkout_ready',verification_revision=verification_revision+1,revision=revision+1,updated_at=now() where id=plan_row.id;
  insert into public.purchase_plan_audit_events(workspace_id,owner_id,purchase_plan_id,plan_version,event_type,actor_id,prior_state,new_state,reason,metadata,source_scenario_id)
  values(plan_row.workspace_id,uid,plan_row.id,plan_row.plan_version,'checkout_ready',uid,plan_row.status,'checkout_ready','All required verification resolved',jsonb_build_object('verificationRevision',plan_row.verification_revision+1),plan_row.source_scenario_id);
  return plan_row.verification_revision+1;
end $$;

create function public.cancel_internal_purchase_plan(target_plan_id uuid,expected_revision bigint,candidate_cancellation_reason text)
returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); plan_row public.purchase_plans;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if length(trim(coalesce(candidate_cancellation_reason,'')))<5 then raise exception 'CANCELLATION_REASON_REQUIRED'; end if;
  select * into plan_row from public.purchase_plans where id=target_plan_id and owner_id=uid for update;
  if plan_row.id is null then raise exception 'PURCHASE_PLAN_UNAVAILABLE'; end if;
  if plan_row.revision<>expected_revision then raise exception 'STALE_PURCHASE_PLAN_REVISION'; end if;
  if plan_row.status in('superseded','cancelled') then raise exception 'PLAN_NOT_CANCELLABLE'; end if;
  if exists(select 1 from public.purchase_orders where workspace_id=plan_row.workspace_id and source_purchase_plan_id=plan_row.id) then raise exception 'PLAN_HAS_PURCHASE_ORDER'; end if;
  update public.purchase_plans set status='cancelled',cancelled_by=uid,cancelled_at=now(),cancellation_reason=candidate_cancellation_reason,revision=revision+1,updated_at=now() where id=plan_row.id;
  insert into public.purchase_plan_audit_events(workspace_id,owner_id,purchase_plan_id,plan_version,event_type,actor_id,prior_state,new_state,reason,metadata,source_scenario_id)
  values(plan_row.workspace_id,uid,plan_row.id,plan_row.plan_version,'plan_cancelled',uid,plan_row.status,'cancelled',candidate_cancellation_reason,'{}',plan_row.source_scenario_id);
  return plan_row.revision+1;
end $$;

revoke all on function public.approve_production_procurement_scenario(uuid,bigint,uuid,text,text,uuid) from public,anon;
revoke all on function public.record_purchase_plan_verification(uuid,bigint,text,jsonb,text,text,text,text) from public,anon;
revoke all on function public.waive_purchase_plan_verification(uuid,bigint,text) from public,anon;
revoke all on function public.mark_purchase_plan_checkout_ready(uuid,bigint) from public,anon;
revoke all on function public.cancel_internal_purchase_plan(uuid,bigint,text) from public,anon;
grant execute on function public.approve_production_procurement_scenario(uuid,bigint,uuid,text,text,uuid) to authenticated;
grant execute on function public.record_purchase_plan_verification(uuid,bigint,text,jsonb,text,text,text,text) to authenticated;
grant execute on function public.waive_purchase_plan_verification(uuid,bigint,text) to authenticated;
grant execute on function public.mark_purchase_plan_checkout_ready(uuid,bigint) to authenticated;
grant execute on function public.cancel_internal_purchase_plan(uuid,bigint,text) to authenticated;
