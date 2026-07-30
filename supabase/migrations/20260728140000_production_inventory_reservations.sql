-- Production Inventory Control V1: durable allocation and reservation.
-- Inventory Movements remain the only physical stock ledger.

alter table public.lab_batches
  add column revision bigint not null default 1 check(revision>0),
  add column material_policy_version text not null default '1.0.0';
alter table public.production_runs
  add column revision bigint not null default 1 check(revision>0),
  add column material_policy_version text not null default '1.0.0';

alter table public.lab_batch_lines
  add column formula_id_snapshot text,
  add column formula_version_id_snapshot text,
  add column inci_snapshot text not null default '',
  add column functions_snapshot text[] not null default '{}',
  add column sort_order_snapshot numeric,
  add column processing_instructions_snapshot text not null default '',
  add column tolerance_quantity numeric not null default 0 check(tolerance_quantity>=0),
  add column required_material_profile jsonb not null default '{}' check(jsonb_typeof(required_material_profile)='object'),
  add column substitution_rule text not null default 'exact_ingredient_only',
  add column revision bigint not null default 1 check(revision>0);
alter table public.production_run_lines
  add column formula_id_snapshot text,
  add column formula_version_id_snapshot text,
  add column inci_snapshot text not null default '',
  add column functions_snapshot text[] not null default '{}',
  add column sort_order_snapshot numeric,
  add column processing_instructions_snapshot text not null default '',
  add column tolerance_quantity numeric not null default 0 check(tolerance_quantity>=0),
  add column required_material_profile jsonb not null default '{}' check(jsonb_typeof(required_material_profile)='object'),
  add column substitution_rule text not null default 'exact_ingredient_only',
  add column revision bigint not null default 1 check(revision>0);

update public.lab_batch_lines line set
  formula_id_snapshot=batch.formula_id,
  formula_version_id_snapshot=batch.formula_version_id,
  inci_snapshot=ingredient.inci_name,
  functions_snapshot=ingredient.functions,
  sort_order_snapshot=formula_line.sort_order,
  processing_instructions_snapshot=formula_line.notes
from public.lab_batches batch,public.ingredients ingredient,public.formula_lines formula_line
where batch.workspace_id=line.workspace_id and batch.id=line.lab_batch_id
  and ingredient.workspace_id=line.workspace_id and ingredient.id=line.ingredient_id
  and formula_line.workspace_id=line.workspace_id and formula_line.id=line.formula_line_id;
update public.production_run_lines line set
  formula_id_snapshot=run.formula_id,
  formula_version_id_snapshot=run.formula_version_id,
  inci_snapshot=ingredient.inci_name,
  functions_snapshot=ingredient.functions,
  sort_order_snapshot=formula_line.sort_order,
  processing_instructions_snapshot=formula_line.notes
from public.production_runs run,public.ingredients ingredient,public.formula_lines formula_line
where run.workspace_id=line.workspace_id and run.id=line.production_run_id
  and ingredient.workspace_id=line.workspace_id and ingredient.id=line.ingredient_id
  and formula_line.workspace_id=line.workspace_id and formula_line.id=line.formula_line_id;

alter table public.lab_batch_lines
  alter column formula_id_snapshot set not null,
  alter column formula_version_id_snapshot set not null;
alter table public.production_run_lines
  alter column formula_id_snapshot set not null,
  alter column formula_version_id_snapshot set not null;

alter table public.inventory_lots
  add column released_at timestamptz,
  add column mandatory_retest_date date,
  add column recalled_at timestamptz,
  add column blocked_at timestamptz,
  add column restriction_snapshot jsonb not null default '{}' check(jsonb_typeof(restriction_snapshot)='object');

-- jsonb_populate_record() supplies absent fields as explicit NULL values, so
-- column defaults alone cannot keep legacy v9 relational imports compatible.
create or replace function public.normalize_production_inventory_legacy_write()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare
  parent_formula_id text;
  parent_formula_version_id text;
  source_inci text;
  source_functions text[];
  source_sort_order numeric;
  source_instructions text;
begin
  if tg_table_name='inventory_lots' then
    new.restriction_snapshot:=coalesce(new.restriction_snapshot,'{}'::jsonb);
    if new.status='Active' and new.released_at is null and (
      current_user in('postgres','service_role')
      or exists(select 1 from public.workspaces workspace where workspace.id=new.workspace_id and workspace.lifecycle_state='importing')
    ) then
      new.released_at:=coalesce(
        (select review.reviewed_at from public.inventory_quality_release_reviews review
         where review.id=new.quality_release_review_id and review.workspace_id=new.workspace_id),
        nullif(new.created_at,'')::timestamptz
      );
    end if;
    return new;
  end if;

  if tg_table_name='lab_batches' or tg_table_name='production_runs' then
    new.revision:=coalesce(new.revision,1);
    new.material_policy_version:=coalesce(nullif(new.material_policy_version,''),'1.0.0');
    return new;
  end if;

  if tg_table_name='lab_batch_lines' then
    select batch.formula_id,batch.formula_version_id
      into parent_formula_id,parent_formula_version_id
    from public.lab_batches batch
    where batch.workspace_id=new.workspace_id and batch.id=new.lab_batch_id;
  else
    select run.formula_id,run.formula_version_id
      into parent_formula_id,parent_formula_version_id
    from public.production_runs run
    where run.workspace_id=new.workspace_id and run.id=new.production_run_id;
  end if;

  select ingredient.inci_name,ingredient.functions
    into source_inci,source_functions
  from public.ingredients ingredient
  where ingredient.workspace_id=new.workspace_id and ingredient.id=new.ingredient_id;

  select formula_line.sort_order,formula_line.notes
    into source_sort_order,source_instructions
  from public.formula_lines formula_line
  where formula_line.workspace_id=new.workspace_id and formula_line.id=new.formula_line_id;

  new.formula_id_snapshot:=coalesce(new.formula_id_snapshot,parent_formula_id);
  new.formula_version_id_snapshot:=coalesce(new.formula_version_id_snapshot,parent_formula_version_id);
  new.inci_snapshot:=coalesce(new.inci_snapshot,source_inci,'');
  new.functions_snapshot:=coalesce(new.functions_snapshot,source_functions,'{}'::text[]);
  new.sort_order_snapshot:=coalesce(new.sort_order_snapshot,source_sort_order);
  new.processing_instructions_snapshot:=coalesce(new.processing_instructions_snapshot,source_instructions,'');
  new.tolerance_quantity:=coalesce(new.tolerance_quantity,0);
  new.required_material_profile:=coalesce(new.required_material_profile,'{}'::jsonb);
  new.substitution_rule:=coalesce(nullif(new.substitution_rule,''),'exact_ingredient_only');
  new.revision:=coalesce(new.revision,1);
  return new;
end $$;

create trigger normalize_lab_batches_legacy_write
before insert or update on public.lab_batches for each row
execute function public.normalize_production_inventory_legacy_write();
create trigger normalize_production_runs_legacy_write
before insert or update on public.production_runs for each row
execute function public.normalize_production_inventory_legacy_write();
create trigger normalize_lab_batch_lines_legacy_write
before insert or update on public.lab_batch_lines for each row
execute function public.normalize_production_inventory_legacy_write();
create trigger normalize_production_run_lines_legacy_write
before insert or update on public.production_run_lines for each row
execute function public.normalize_production_inventory_legacy_write();
create trigger normalize_inventory_lots_legacy_write
before insert or update on public.inventory_lots for each row
execute function public.normalize_production_inventory_legacy_write();

create or replace function public.protect_inventory_lot_eligibility_controls()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if current_user in('postgres','service_role') then return new; end if;
  if exists(select 1 from public.workspaces workspace where workspace.id=new.workspace_id and workspace.lifecycle_state='importing') then
    return new;
  end if;
  if tg_op='INSERT' then
    if new.released_at is not null or new.recalled_at is not null or new.blocked_at is not null
      or new.quarantine_intake_id is not null or new.quality_release_review_id is not null
      or new.restriction_snapshot<>'{}'::jsonb
    then raise exception 'CONTROLLED_INVENTORY_LOT_FIELDS_REQUIRE_RPC'; end if;
  elsif new.released_at is distinct from old.released_at
    or new.recalled_at is distinct from old.recalled_at
    or new.blocked_at is distinct from old.blocked_at
    or new.mandatory_retest_date is distinct from old.mandatory_retest_date
    or new.restriction_snapshot is distinct from old.restriction_snapshot
    or new.quarantine_intake_id is distinct from old.quarantine_intake_id
    or new.quality_release_review_id is distinct from old.quality_release_review_id
  then raise exception 'CONTROLLED_INVENTORY_LOT_FIELDS_REQUIRE_RPC'; end if;
  return new;
end $$;

create trigger protect_inventory_lot_eligibility_controls
before insert or update on public.inventory_lots for each row
execute function public.protect_inventory_lot_eligibility_controls();
grant select,insert,update,delete on public.inventory_lots to service_role;
grant select on public.workspaces to service_role;


update public.inventory_lots lot set released_at=coalesce(
  (select review.reviewed_at from public.inventory_quality_release_reviews review where review.id=lot.quality_release_review_id),
  nullif(lot.created_at,'')::timestamptz
) where lot.status='Active';

create table public.batch_material_lot_allocations(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid not null,
  batch_kind text not null check(batch_kind in('lab','production')),
  lab_batch_id text,
  production_run_id text,
  lab_batch_line_id text,
  production_run_line_id text,
  inventory_lot_id text not null,
  allocated_quantity numeric not null check(allocated_quantity>0),
  unit text not null check(unit in('mg','g','kg','ml','L','pcs')),
  normalized_quantity numeric not null check(normalized_quantity>0),
  allocation_method text not null check(allocation_method in('fefo','fifo','manual')),
  fefo_rank_snapshot integer check(fefo_rank_snapshot is null or fefo_rank_snapshot>0),
  lot_balance_snapshot numeric not null,
  lot_available_snapshot numeric not null,
  lot_expiry_snapshot date,
  lot_status_snapshot text not null,
  supplier_name_snapshot text,
  supplier_product_snapshot text,
  supplier_lot_snapshot text,
  unit_cost_snapshot numeric,
  cost_currency_snapshot text,
  cost_confidence text not null default 'unknown' check(cost_confidence in('final','provisional','unknown')),
  quality_release_review_id uuid,
  selected_by uuid not null,
  selected_at timestamptz not null default now(),
  status text not null default 'allocated' check(status in('proposed','allocated','reserved','partially_consumed','consumed','released','cancelled')),
  revision bigint not null default 1 check(revision>0),
  idempotency_key uuid not null,
  payload_fingerprint text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,id),
  unique(workspace_id,idempotency_key),
  foreign key(workspace_id,lab_batch_id) references public.lab_batches(workspace_id,id),
  foreign key(workspace_id,production_run_id) references public.production_runs(workspace_id,id),
  foreign key(workspace_id,lab_batch_line_id) references public.lab_batch_lines(workspace_id,id),
  foreign key(workspace_id,production_run_line_id) references public.production_run_lines(workspace_id,id),
  foreign key(workspace_id,inventory_lot_id) references public.inventory_lots(workspace_id,id),
  check(
    (batch_kind='lab' and lab_batch_id is not null and lab_batch_line_id is not null and production_run_id is null and production_run_line_id is null)
    or
    (batch_kind='production' and production_run_id is not null and production_run_line_id is not null and lab_batch_id is null and lab_batch_line_id is null)
  )
);

create table public.inventory_reservations(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid not null,
  allocation_id uuid not null,
  inventory_lot_id text not null,
  batch_kind text not null check(batch_kind in('lab','production')),
  batch_id text not null,
  requirement_id text not null,
  reserved_quantity numeric not null check(reserved_quantity>0),
  unit text not null check(unit in('mg','g','kg','ml','L','pcs')),
  normalized_quantity numeric not null check(normalized_quantity>0),
  consumed_quantity numeric not null default 0 check(consumed_quantity>=0),
  wasted_quantity numeric not null default 0 check(wasted_quantity>=0),
  released_quantity numeric not null default 0 check(released_quantity>=0),
  remaining_quantity numeric not null check(remaining_quantity>=0),
  status text not null default 'active' check(status in('active','partially_consumed','consumed','released','cancelled','expired','exception')),
  reserved_by uuid not null,
  reserved_at timestamptz not null default now(),
  released_by uuid,
  released_at timestamptz,
  revision bigint not null default 1 check(revision>0),
  idempotency_key uuid not null,
  payload_fingerprint text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,id),
  unique(workspace_id,idempotency_key),
  foreign key(workspace_id,allocation_id) references public.batch_material_lot_allocations(workspace_id,id),
  foreign key(workspace_id,inventory_lot_id) references public.inventory_lots(workspace_id,id),
  check(consumed_quantity+wasted_quantity+released_quantity+remaining_quantity=reserved_quantity),
  check((status in('active','partially_consumed','exception') and remaining_quantity>0) or (status not in('active','partially_consumed','exception') and remaining_quantity=0))
);

create table public.batch_material_events(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid not null,
  batch_kind text not null check(batch_kind in('lab','production')),
  batch_id text not null,
  formula_version_id text not null,
  requirement_id text,
  inventory_lot_id text,
  reservation_id uuid,
  allocation_id uuid,
  weighing_id uuid,
  consumption_id uuid,
  movement_id text,
  event_type text not null check(event_type in(
    'batch_material_allocated','batch_material_reserved','batch_material_reservation_released',
    'batch_material_weighing_recorded','batch_material_consumed','batch_material_returned',
    'batch_material_waste_recorded','batch_material_variance_recorded',
    'batch_material_reconciled','batch_inventory_commitment_completed',
    'batch_inventory_commitment_failed'
  )),
  quantity numeric,
  unit text,
  actor_id uuid not null,
  occurred_at timestamptz not null default now(),
  policy_version text not null default '1.0.0',
  event_key text not null,
  metadata jsonb not null default '{}' check(jsonb_typeof(metadata)='object'),
  unique(workspace_id,event_key)
);

create index batch_material_allocations_batch on public.batch_material_lot_allocations(workspace_id,batch_kind,coalesce(lab_batch_id,production_run_id),status);
create index batch_material_allocations_requirement on public.batch_material_lot_allocations(workspace_id,coalesce(lab_batch_line_id,production_run_line_id),status);
create index batch_material_allocations_lot on public.batch_material_lot_allocations(workspace_id,inventory_lot_id,status);
create index inventory_reservations_lot_active on public.inventory_reservations(workspace_id,inventory_lot_id,status) where status in('active','partially_consumed','exception');
create index inventory_reservations_batch on public.inventory_reservations(workspace_id,batch_kind,batch_id,status);
create index inventory_reservations_requirement on public.inventory_reservations(workspace_id,requirement_id,status);
create index batch_material_events_history on public.batch_material_events(workspace_id,batch_kind,batch_id,occurred_at,id);

do $$ declare table_name text;begin
  foreach table_name in array array['batch_material_lot_allocations','inventory_reservations','batch_material_events'] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('create policy owner_select on public.%I for select to authenticated using(owner_id=(select auth.uid()))',table_name);
    execute format('revoke all on public.%I from public,anon,authenticated',table_name);
    execute format('grant select on public.%I to authenticated',table_name);
    execute format('grant all on public.%I to service_role',table_name);
  end loop;
end $$;

create function public.kf_active_reserved_balance(target_workspace_id uuid,target_lot_id text)
returns numeric language sql stable security invoker set search_path=public,pg_temp as $$
  select coalesce(sum(public.kf_convert_quantity(r.remaining_quantity,r.unit,l.unit)),0)
  from public.inventory_lots l
  left join public.inventory_reservations r
    on r.workspace_id=l.workspace_id and r.inventory_lot_id=l.id
   and r.status in('active','partially_consumed','exception')
  where l.workspace_id=target_workspace_id and l.id=target_lot_id
  group by l.unit
$$;

create function public.kf_inventory_available_balance(target_workspace_id uuid,target_lot_id text)
returns numeric language sql stable security invoker set search_path=public,pg_temp as $$
  select greatest(0,public.kf_inventory_balance(target_workspace_id,target_lot_id)
    -coalesce(public.kf_active_reserved_balance(target_workspace_id,target_lot_id),0))
$$;

create function public.eligible_batch_material_lots(
  target_batch_kind text,target_batch_id text,target_requirement_id text
) returns table(
  inventory_lot_id text,internal_lot_number text,supplier_lot_number text,
  received_date date,released_at timestamptz,expiry_or_retest_date date,
  location text,unit text,movement_balance numeric,reserved_balance numeric,
  available_balance numeric,unit_cost numeric,cost_currency text,cost_confidence text,
  fefo_rank bigint,eligibility_policy_version text
) language plpgsql security definer set search_path=public,pg_temp as $$
declare
  uid uuid:=auth.uid();wid uuid;ingredient text;requirement_unit text;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED';end if;
  select w.id into wid from public.workspaces w where w.owner_id=uid and w.lifecycle_state='active';
  if wid is null then raise exception 'ACTIVE_WORKSPACE_REQUIRED';end if;
  if target_batch_kind='lab' then
    select line.ingredient_id,line.unit into ingredient,requirement_unit
    from public.lab_batch_lines line join public.lab_batches batch
      on batch.workspace_id=line.workspace_id and batch.id=line.lab_batch_id
    where line.workspace_id=wid and line.id=target_requirement_id and batch.id=target_batch_id;
  elsif target_batch_kind='production' then
    select line.ingredient_id,line.unit into ingredient,requirement_unit
    from public.production_run_lines line join public.production_runs run
      on run.workspace_id=line.workspace_id and run.id=line.production_run_id
    where line.workspace_id=wid and line.id=target_requirement_id and run.id=target_batch_id;
  else raise exception 'BATCH_KIND_INVALID';end if;
  if ingredient is null then raise exception 'REQUIREMENT_UNAVAILABLE';end if;
  return query
  select lot.id,lot.internal_lot_number,lot.supplier_lot_number,lot.received_date::date,
    lot.released_at,least(nullif(lot.expiry_date,'')::date,lot.mandatory_retest_date),
    lot.location,lot.unit,public.kf_inventory_balance(wid,lot.id),
    coalesce(public.kf_active_reserved_balance(wid,lot.id),0),
    public.kf_inventory_available_balance(wid,lot.id),
    case when lot.total_acquisition_cost is not null and lot.opening_quantity>0
      then lot.total_acquisition_cost/lot.opening_quantity end,
    lot.acquisition_cost_currency,
    case when lot.total_acquisition_cost is null then 'unknown'
      when lot.cost_notes ilike '%provisional%' then 'provisional' else 'final' end,
    row_number() over(order by
      coalesce(least(nullif(lot.expiry_date,'')::date,lot.mandatory_retest_date),'infinity'::date),
      lot.released_at nulls last,lot.received_date::date,lot.id),
    '1.0.0'::text
  from public.inventory_lots lot
  where lot.workspace_id=wid and lot.owner_id=uid and lot.ingredient_id=ingredient
    and lot.status='Active' and lot.released_at is not null
    and lot.recalled_at is null and lot.blocked_at is null
    and (nullif(lot.expiry_date,'') is null or lot.expiry_date::date>=current_date)
    and (lot.mandatory_retest_date is null or lot.mandatory_retest_date>=current_date)
    and public.kf_convert_quantity(1,requirement_unit,lot.unit) is not null
    and public.kf_inventory_available_balance(wid,lot.id)>0
  order by fefo_rank;
end $$;

create function public.reserve_batch_material_inventory(
  target_batch_kind text,target_batch_id text,target_requirement_id text,
  target_inventory_lot_id text,reservation_quantity numeric,reservation_unit text,
  allocation_method text,expected_batch_revision bigint,candidate_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  uid uuid:=auth.uid();wid uuid;ingredient text;formula_version text;batch_revision bigint;
  batch_status text;lot public.inventory_lots;normalized numeric;available numeric;rank_snapshot integer;
  fingerprint text;existing public.inventory_reservations;allocation_id uuid;reservation_id uuid;
  supplier_name text;supplier_product text;unit_cost numeric;cost_confidence text;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED';end if;
  if reservation_quantity<=0 or reservation_unit not in('mg','g','kg','ml','L','pcs') then raise exception 'RESERVATION_QUANTITY_INVALID';end if;
  if allocation_method not in('fefo','fifo','manual') then raise exception 'ALLOCATION_METHOD_INVALID';end if;
  select w.id into wid from public.workspaces w where w.owner_id=uid and w.lifecycle_state='active';
  if wid is null then raise exception 'ACTIVE_WORKSPACE_REQUIRED';end if;
  fingerprint:=md5(concat_ws('|',target_batch_kind,target_batch_id,target_requirement_id,target_inventory_lot_id,reservation_quantity,reservation_unit,allocation_method,expected_batch_revision));
  select * into existing from public.inventory_reservations
    where workspace_id=wid and idempotency_key=candidate_idempotency_key;
  if found then
    if existing.payload_fingerprint<>fingerprint then raise exception 'IDEMPOTENCY_CONFLICT';end if;
    return jsonb_build_object('allocationId',existing.allocation_id,'reservationId',existing.id,'reservationRevision',existing.revision,'retry',true);
  end if;
  if target_batch_kind='lab' then
    select line.ingredient_id,batch.formula_version_id,batch.revision,batch.status
      into ingredient,formula_version,batch_revision,batch_status
    from public.lab_batches batch join public.lab_batch_lines line
      on line.workspace_id=batch.workspace_id and line.lab_batch_id=batch.id
    where batch.workspace_id=wid and batch.owner_id=uid and batch.id=target_batch_id
      and line.id=target_requirement_id for update of batch,line;
  elsif target_batch_kind='production' then
    select line.ingredient_id,run.formula_version_id,run.revision,run.status
      into ingredient,formula_version,batch_revision,batch_status
    from public.production_runs run join public.production_run_lines line
      on line.workspace_id=run.workspace_id and line.production_run_id=run.id
    where run.workspace_id=wid and run.owner_id=uid and run.id=target_batch_id
      and line.id=target_requirement_id for update of run,line;
  else raise exception 'BATCH_KIND_INVALID';end if;
  if ingredient is null then raise exception 'REQUIREMENT_UNAVAILABLE';end if;
  if batch_revision<>expected_batch_revision then raise exception 'STALE_BATCH_REVISION';end if;
  if batch_status not in('Planned','In Progress') then raise exception 'BATCH_NOT_RESERVABLE';end if;
  select * into lot from public.inventory_lots where workspace_id=wid and id=target_inventory_lot_id for update;
  if not found or lot.owner_id<>uid then raise exception 'INVENTORY_LOT_UNAVAILABLE';end if;
  if lot.ingredient_id<>ingredient then raise exception 'LOT_MATERIAL_MISMATCH';end if;
  if lot.status<>'Active' or lot.released_at is null or lot.recalled_at is not null or lot.blocked_at is not null
    or (nullif(lot.expiry_date,'') is not null and lot.expiry_date::date<current_date)
    or (lot.mandatory_retest_date is not null and lot.mandatory_retest_date<current_date)
    then raise exception 'LOT_NOT_ELIGIBLE';end if;
  normalized:=public.kf_convert_quantity(reservation_quantity,reservation_unit,lot.unit);
  if normalized is null or normalized<=0 then raise exception 'RESERVATION_UNIT_INCOMPATIBLE';end if;
  available:=public.kf_inventory_available_balance(wid,lot.id);
  if normalized>available then raise exception 'INSUFFICIENT_AVAILABLE_INVENTORY';end if;
  select x.fefo_rank into rank_snapshot from public.eligible_batch_material_lots(target_batch_kind,target_batch_id,target_requirement_id)x where x.inventory_lot_id=lot.id;
  select sp.supplier_name,sp.product_name into supplier_name,supplier_product
    from public.supplier_products sp where sp.workspace_id=wid and sp.id=lot.supplier_product_id;
  unit_cost:=case when lot.total_acquisition_cost is not null and lot.opening_quantity>0
    then (lot.total_acquisition_cost/lot.opening_quantity)*public.kf_convert_quantity(1,reservation_unit,lot.unit) end;
  cost_confidence:=case when unit_cost is null then 'unknown' when lot.cost_notes ilike '%provisional%' then 'provisional' else 'final' end;
  allocation_id:=gen_random_uuid();reservation_id:=gen_random_uuid();
  insert into public.batch_material_lot_allocations(
    id,workspace_id,owner_id,batch_kind,lab_batch_id,production_run_id,lab_batch_line_id,production_run_line_id,
    inventory_lot_id,allocated_quantity,unit,normalized_quantity,allocation_method,fefo_rank_snapshot,
    lot_balance_snapshot,lot_available_snapshot,lot_expiry_snapshot,lot_status_snapshot,
    supplier_name_snapshot,supplier_product_snapshot,supplier_lot_snapshot,unit_cost_snapshot,cost_currency_snapshot,
    cost_confidence,quality_release_review_id,selected_by,status,idempotency_key,payload_fingerprint
  ) values(
    allocation_id,wid,uid,target_batch_kind,
    case when target_batch_kind='lab' then target_batch_id end,
    case when target_batch_kind='production' then target_batch_id end,
    case when target_batch_kind='lab' then target_requirement_id end,
    case when target_batch_kind='production' then target_requirement_id end,
    lot.id,reservation_quantity,reservation_unit,normalized,allocation_method,rank_snapshot,
    public.kf_inventory_balance(wid,lot.id),available,least(nullif(lot.expiry_date,'')::date,lot.mandatory_retest_date),lot.status,
    supplier_name,supplier_product,lot.supplier_lot_number,unit_cost,lot.acquisition_cost_currency,
    cost_confidence,lot.quality_release_review_id,uid,'reserved',candidate_idempotency_key,fingerprint
  );
  insert into public.inventory_reservations(
    id,workspace_id,owner_id,allocation_id,inventory_lot_id,batch_kind,batch_id,requirement_id,
    reserved_quantity,unit,normalized_quantity,remaining_quantity,reserved_by,idempotency_key,payload_fingerprint
  ) values(
    reservation_id,wid,uid,allocation_id,lot.id,target_batch_kind,target_batch_id,target_requirement_id,
    reservation_quantity,reservation_unit,normalized,reservation_quantity,uid,candidate_idempotency_key,fingerprint
  );
  insert into public.batch_material_events(
    workspace_id,owner_id,batch_kind,batch_id,formula_version_id,requirement_id,inventory_lot_id,
    reservation_id,allocation_id,event_type,quantity,unit,actor_id,event_key,metadata
  ) values
    (wid,uid,target_batch_kind,target_batch_id,formula_version,target_requirement_id,lot.id,
      reservation_id,allocation_id,'batch_material_allocated',reservation_quantity,reservation_unit,uid,
      'allocation:'||allocation_id,jsonb_build_object('method',allocation_method,'fefoRank',rank_snapshot)),
    (wid,uid,target_batch_kind,target_batch_id,formula_version,target_requirement_id,lot.id,
      reservation_id,allocation_id,'batch_material_reserved',reservation_quantity,reservation_unit,uid,
      'reservation:'||reservation_id,jsonb_build_object('availableBefore',available,'availableAfter',available-normalized));
  if target_batch_kind='lab' then update public.lab_batches set revision=revision+1,updated_at=now()::text where workspace_id=wid and id=target_batch_id;
  else update public.production_runs set revision=revision+1,updated_at=now()::text where workspace_id=wid and id=target_batch_id;end if;
  return jsonb_build_object('allocationId',allocation_id,'reservationId',reservation_id,'reservationRevision',1,'availableBefore',available,'availableAfter',available-normalized,'retry',false);
end $$;

create function public.release_batch_material_reservation(
  target_reservation_id uuid,expected_reservation_revision bigint,
  release_quantity numeric,release_reason text,candidate_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid();wid uuid;r public.inventory_reservations;a public.batch_material_lot_allocations;formula_version text;fingerprint text;release_event_key text;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED';end if;
  select w.id into wid from public.workspaces w where w.owner_id=uid and w.lifecycle_state='active';
  if wid is null then raise exception 'ACTIVE_WORKSPACE_REQUIRED';end if;
  release_event_key:='reservation-release:'||candidate_idempotency_key;
  if exists(select 1 from public.batch_material_events event where event.workspace_id=wid and event.event_key=release_event_key) then
    select * into r from public.inventory_reservations where workspace_id=wid and id=target_reservation_id;
    return jsonb_build_object('reservationId',r.id,'reservationRevision',r.revision,'remainingQuantity',r.remaining_quantity,'retry',true);
  end if;
  select * into r from public.inventory_reservations where workspace_id=wid and owner_id=uid and id=target_reservation_id for update;
  if not found then raise exception 'RESERVATION_UNAVAILABLE';end if;
  if r.revision<>expected_reservation_revision then raise exception 'STALE_RESERVATION_REVISION';end if;
  if release_quantity<=0 or release_quantity>r.remaining_quantity then raise exception 'RELEASE_QUANTITY_INVALID';end if;
  fingerprint:=md5(concat_ws('|',r.id,release_quantity,release_reason,expected_reservation_revision));
  select * into a from public.batch_material_lot_allocations where workspace_id=wid and id=r.allocation_id for update;
  update public.inventory_reservations set
    released_quantity=released_quantity+release_quantity,remaining_quantity=remaining_quantity-release_quantity,
    status=case when remaining_quantity-release_quantity=0 then 'released' else 'partially_consumed' end,
    released_by=case when remaining_quantity-release_quantity=0 then uid else released_by end,
    released_at=case when remaining_quantity-release_quantity=0 then now() else released_at end,
    revision=revision+1,updated_at=now()
  where workspace_id=wid and id=r.id returning * into r;
  update public.batch_material_lot_allocations set
    status=case when r.remaining_quantity=0 then 'released' else status end,revision=revision+1,updated_at=now()
    where workspace_id=wid and id=a.id;
  if r.batch_kind='lab' then select formula_version_id into formula_version from public.lab_batches where workspace_id=wid and id=r.batch_id;
  else select formula_version_id into formula_version from public.production_runs where workspace_id=wid and id=r.batch_id;end if;
  insert into public.batch_material_events(workspace_id,owner_id,batch_kind,batch_id,formula_version_id,requirement_id,inventory_lot_id,reservation_id,allocation_id,event_type,quantity,unit,actor_id,event_key,metadata)
  values(wid,uid,r.batch_kind,r.batch_id,formula_version,r.requirement_id,r.inventory_lot_id,r.id,r.allocation_id,'batch_material_reservation_released',release_quantity,r.unit,uid,release_event_key,jsonb_build_object('reason',release_reason,'fingerprint',fingerprint));
  return jsonb_build_object('reservationId',r.id,'reservationRevision',r.revision,'remainingQuantity',r.remaining_quantity,'retry',false);
end $$;

create function public.prevent_batch_material_event_mutation()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'BATCH_MATERIAL_EVENT_APPEND_ONLY';end $$;
create trigger batch_material_events_append_only before update or delete on public.batch_material_events
for each row execute function public.prevent_batch_material_event_mutation();

revoke all on function public.kf_active_reserved_balance(uuid,text),public.kf_inventory_available_balance(uuid,text) from public,anon,authenticated;
grant execute on function public.kf_active_reserved_balance(uuid,text),public.kf_inventory_available_balance(uuid,text) to authenticated,service_role;
revoke all on function public.eligible_batch_material_lots(text,text,text),public.reserve_batch_material_inventory(text,text,text,text,numeric,text,text,bigint,uuid),public.release_batch_material_reservation(uuid,bigint,numeric,text,uuid) from public,anon,authenticated;
grant execute on function public.eligible_batch_material_lots(text,text,text),public.reserve_batch_material_inventory(text,text,text,text,numeric,text,text,bigint,uuid),public.release_batch_material_reservation(uuid,bigint,numeric,text,uuid) to authenticated,service_role;
