-- Durable, owner-controlled production procurement planning.
-- Planning records never create purchase plans, supplier matches, inventory lots, or movements.

create table public.production_procurement_rounds (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid not null,
  title text not null check (length(trim(title)) > 0),
  status text not null default 'draft' check (status in ('draft','requirements_ready','blocked','cancelled')),
  base_currency text not null default 'NOK' check (base_currency ~ '^[A-Z]{3}$'),
  notes text not null default '',
  calculation_versions jsonb not null default '{"requirementEngine":"1.0.0","inventoryGap":"1.0.0","readinessRules":"1.0.0"}'::jsonb
    check (jsonb_typeof(calculation_versions) = 'object'),
  revision bigint not null default 1 check (revision > 0),
  last_calculated_at timestamptz,
  locked_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id,id)
);

create table public.production_procurement_round_products (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  owner_id uuid not null,
  round_id uuid not null,
  category text not null check (category in ('beard_oil','beard_butter','beard_balm','deodorant')),
  product_id text,
  product_name_snapshot text,
  product_category_snapshot text,
  formula_id text,
  formula_version_id text,
  formula_version_label_snapshot text,
  formula_version_status_snapshot text,
  formula_version_snapshot jsonb,
  planned_batch_count integer not null default 1 check (planned_batch_count > 0),
  batch_size numeric not null default 100 check (batch_size > 0 and batch_size <> 'NaN'::numeric),
  batch_unit text not null default 'g' check (batch_unit in ('mg','g','kg','ml','L','pcs')),
  overage_percentage numeric not null default 5 check (overage_percentage >= 0 and overage_percentage <= 100 and overage_percentage <> 'NaN'::numeric),
  expected_yield numeric check (expected_yield is null or expected_yield >= 0),
  inclusion_status text not null default 'required' check (inclusion_status = 'required'),
  deodorant_structure text check (deodorant_structure is null or deodorant_structure in ('anhydrous','emulsion','suspension','other')),
  formula_readiness_status text not null default 'blocked' check (formula_readiness_status in ('ready','needs_review','blocked')),
  formula_readiness_codes text[] not null default '{}',
  formula_readiness_reasons text[] not null default '{}',
  readiness_rule_version text not null default '1.0.0',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id,id),
  unique (workspace_id,round_id,category),
  foreign key (workspace_id,round_id) references public.production_procurement_rounds(workspace_id,id) on delete cascade,
  foreign key (workspace_id,product_id) references public.products(workspace_id,id) on delete restrict,
  foreign key (workspace_id,formula_id) references public.formulas(workspace_id,id) on delete restrict,
  foreign key (workspace_id,formula_version_id) references public.formula_versions(workspace_id,id) on delete restrict
);

create table public.production_procurement_requirements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  owner_id uuid not null,
  round_id uuid not null,
  ingredient_id text not null,
  ingredient_name_snapshot text not null,
  reference_entry_id text,
  purchasing_unit text not null check (purchasing_unit in ('mg','g','kg','ml','L','pcs')),
  required_quantity numeric not null check (required_quantity > 0),
  overage_quantity numeric not null check (overage_quantity >= 0),
  total_planned_quantity numeric not null check (total_planned_quantity > 0),
  calculation_version text not null,
  calculated_at timestamptz not null,
  state text not null default 'ready' check (state in ('ready','warning','blocked')),
  warnings text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (workspace_id,id),
  unique (workspace_id,round_id,ingredient_id,purchasing_unit),
  foreign key (workspace_id,round_id) references public.production_procurement_rounds(workspace_id,id) on delete cascade,
  foreign key (workspace_id,ingredient_id) references public.ingredients(workspace_id,id) on delete restrict
);

create table public.production_procurement_requirement_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  owner_id uuid not null,
  requirement_id uuid not null,
  round_product_id uuid not null,
  product_id text not null,
  formula_id text not null,
  formula_version_id text not null,
  formula_line_id text not null,
  phase text not null,
  percentage numeric not null check (percentage > 0),
  quantity_before_overage numeric not null check (quantity_before_overage > 0),
  overage_quantity numeric not null check (overage_quantity >= 0),
  contribution_quantity numeric not null check (contribution_quantity > 0),
  contribution_unit text not null check (contribution_unit in ('mg','g','kg','ml','L','pcs')),
  calculation_path text not null,
  created_at timestamptz not null default now(),
  unique (workspace_id,id),
  unique (workspace_id,requirement_id,formula_line_id,round_product_id),
  foreign key (workspace_id,requirement_id) references public.production_procurement_requirements(workspace_id,id) on delete cascade,
  foreign key (workspace_id,round_product_id) references public.production_procurement_round_products(workspace_id,id) on delete cascade,
  foreign key (workspace_id,product_id) references public.products(workspace_id,id) on delete restrict,
  foreign key (workspace_id,formula_id) references public.formulas(workspace_id,id) on delete restrict,
  foreign key (workspace_id,formula_version_id) references public.formula_versions(workspace_id,id) on delete restrict,
  foreign key (workspace_id,formula_line_id) references public.formula_lines(workspace_id,id) on delete restrict
);

create table public.production_procurement_inventory_gaps (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  owner_id uuid not null,
  requirement_id uuid not null,
  on_hand_quantity numeric not null default 0,
  quarantined_quantity numeric not null default 0,
  expired_quantity numeric not null default 0,
  unavailable_quantity numeric not null default 0,
  reserved_quantity numeric not null default 0,
  allocated_quantity numeric not null default 0,
  usable_quantity numeric not null default 0,
  incoming_unreceived_quantity numeric,
  net_usable_quantity numeric not null default 0,
  purchasing_gap numeric not null default 0,
  unit text not null check (unit in ('mg','g','kg','ml','L','pcs')),
  snapshot_at timestamptz not null,
  calculation_version text not null,
  warnings text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (workspace_id,id),
  unique (workspace_id,requirement_id),
  foreign key (workspace_id,requirement_id) references public.production_procurement_requirements(workspace_id,id) on delete cascade
);

create index production_procurement_rounds_owner_status_idx on public.production_procurement_rounds(workspace_id,owner_id,status,updated_at desc);
create index production_procurement_round_products_round_idx on public.production_procurement_round_products(workspace_id,round_id,category);
create index production_procurement_round_products_formula_idx on public.production_procurement_round_products(workspace_id,formula_version_id);
create index production_procurement_requirements_round_idx on public.production_procurement_requirements(workspace_id,round_id,ingredient_id);
create index production_procurement_sources_requirement_idx on public.production_procurement_requirement_sources(workspace_id,requirement_id);
create index production_procurement_sources_line_idx on public.production_procurement_requirement_sources(workspace_id,formula_line_id);
create index production_procurement_gaps_requirement_idx on public.production_procurement_inventory_gaps(workspace_id,requirement_id);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'production_procurement_rounds','production_procurement_round_products',
    'production_procurement_requirements','production_procurement_requirement_sources',
    'production_procurement_inventory_gaps'
  ] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format(
      'create policy owner_select on public.%I for select to authenticated using (owner_id=(select auth.uid()) and exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid())))',
      table_name
    );
    execute format('revoke all on public.%I from public,anon,authenticated',table_name);
    execute format('grant select on public.%I to authenticated',table_name);
  end loop;
end $$;

create or replace function public.create_production_procurement_round(
  candidate_workspace_id uuid,
  candidate_title text,
  candidate_notes text default '',
  candidate_base_currency text default 'NOK',
  idempotency_key uuid default null
) returns uuid
language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
  uid uuid := auth.uid();
  created_round_id uuid;
  category_name text;
begin
  if uid is null then raise exception using errcode='42501',message='AUTHENTICATION_REQUIRED'; end if;
  if not exists(select 1 from public.workspaces w where w.id=candidate_workspace_id and w.owner_id=uid and w.lifecycle_state='active')
    then raise exception using errcode='42501',message='WORKSPACE_UNAVAILABLE'; end if;
  if length(trim(coalesce(candidate_title,'')))=0 or candidate_base_currency !~ '^[A-Z]{3}$'
    then raise exception using errcode='22023',message='INVALID_ROUND'; end if;

  if idempotency_key is not null then
    select id into created_round_id from public.production_procurement_rounds
    where workspace_id=candidate_workspace_id and owner_id=uid
      and calculation_versions->>'creationKey'=idempotency_key::text;
    if created_round_id is not null then return created_round_id; end if;
  end if;

  insert into public.production_procurement_rounds(workspace_id,owner_id,title,notes,base_currency,calculation_versions)
  values(candidate_workspace_id,uid,trim(candidate_title),coalesce(candidate_notes,''),upper(candidate_base_currency),
    jsonb_build_object('requirementEngine','1.0.0','inventoryGap','1.0.0','readinessRules','1.0.0','creationKey',idempotency_key))
  returning id into created_round_id;

  foreach category_name in array array['beard_oil','beard_butter','beard_balm','deodorant'] loop
    insert into public.production_procurement_round_products(workspace_id,owner_id,round_id,category,formula_readiness_codes,formula_readiness_reasons)
    values(candidate_workspace_id,uid,created_round_id,category_name,array['missing_product'],array['Select the required product and a concrete formula version.']);
  end loop;
  return created_round_id;
end $$;

create or replace function public.update_production_procurement_round_products(
  target_round_id uuid,
  expected_revision bigint,
  round_title text,
  round_notes text,
  product_selections jsonb
) returns bigint
language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
  uid uuid := auth.uid();
  target_round public.production_procurement_rounds;
  selection jsonb;
  selected_category text;
  selected_product public.products;
  selected_formula public.formulas;
  selected_version public.formula_versions;
  reason_codes text[];
  reasons text[];
  readiness text;
  line_total numeric;
  line_count integer;
  bad_lines integer;
begin
  if uid is null then raise exception using errcode='42501',message='AUTHENTICATION_REQUIRED'; end if;
  select * into target_round from public.production_procurement_rounds
  where id=target_round_id and owner_id=uid for update;
  if target_round.id is null then raise exception using errcode='42501',message='ROUND_UNAVAILABLE'; end if;
  if target_round.status='cancelled' then raise exception using errcode='55000',message='ROUND_CANCELLED'; end if;
  if target_round.revision<>expected_revision then raise exception using errcode='P0001',message='STALE_ROUND_REVISION'; end if;
  if jsonb_typeof(product_selections)<>'array' or jsonb_array_length(product_selections)<>4
    then raise exception using errcode='22023',message='FOUR_PRODUCT_SCOPE_REQUIRED'; end if;
  if (select count(distinct value->>'category') from jsonb_array_elements(product_selections))<>4
    or exists(select 1 from unnest(array['beard_oil','beard_butter','beard_balm','deodorant']) required(category)
      where not exists(select 1 from jsonb_array_elements(product_selections) item where item->>'category'=required.category))
    then raise exception using errcode='22023',message='FOUR_PRODUCT_SCOPE_REQUIRED'; end if;

  for selection in select value from jsonb_array_elements(product_selections) loop
    selected_category := selection->>'category';
    reason_codes := '{}'; reasons := '{}'; readiness := 'ready';
    selected_product := null; selected_formula := null; selected_version := null;
    if nullif(selection->>'productId','') is null then
      reason_codes := array_append(reason_codes,'missing_product'); reasons := array_append(reasons,'Select the required product.');
    else
      select * into selected_product from public.products
      where workspace_id=target_round.workspace_id and owner_id=uid and id=selection->>'productId';
      if selected_product.id is null then raise exception using errcode='23503',message='CROSS_WORKSPACE_PRODUCT'; end if;
    end if;
    if nullif(selection->>'formulaVersionId','') is null then
      reason_codes := array_append(reason_codes,'missing_formula_version'); reasons := array_append(reasons,'Select a concrete formula version.');
    else
      select fv.* into selected_version from public.formula_versions fv
      where fv.workspace_id=target_round.workspace_id and fv.owner_id=uid and fv.id=selection->>'formulaVersionId';
      if selected_version.id is null then raise exception using errcode='23503',message='CROSS_WORKSPACE_FORMULA_VERSION'; end if;
      select f.* into selected_formula from public.formulas f
      where f.workspace_id=target_round.workspace_id and f.owner_id=uid and f.id=selected_version.formula_id
        and (selected_product.id is null or f.product_id=selected_product.id);
      if selected_formula.id is null then raise exception using errcode='23503',message='FORMULA_PRODUCT_MISMATCH'; end if;
      select count(*),coalesce(sum(fl.percentage),0),count(*) filter(where fl.percentage<=0 or fl.ingredient_id is null or i.id is null)
      into line_count,line_total,bad_lines
      from public.formula_lines fl
      left join public.ingredients i on i.workspace_id=fl.workspace_id and i.id=fl.ingredient_id and i.owner_id=uid
      where fl.workspace_id=target_round.workspace_id and fl.owner_id=uid and fl.formula_version_id=selected_version.id;
      if line_count=0 then reason_codes:=array_append(reason_codes,'missing_formula_lines'); reasons:=array_append(reasons,'The formula has no ingredient lines.'); end if;
      if bad_lines>0 then reason_codes:=array_append(reason_codes,'unresolved_ingredient_identity'); reasons:=array_append(reasons,'One or more formula lines have invalid quantity or unresolved ingredient identity.'); end if;
      if abs(line_total-100)>.0001 then reason_codes:=array_append(reason_codes,'invalid_percentage_total'); reasons:=array_append(reasons,format('Formula percentages total %s%%, not 100%%.',line_total)); end if;
      if selected_version.status='Draft' then reason_codes:=array_append(reason_codes,'draft_formula'); reasons:=array_append(reasons,'The selected Formula Version is Draft and mutable; derive or select an immutable version.'); end if;
    end if;
    if coalesce((selection->>'batchCount')::integer,0)<=0 or coalesce((selection->>'batchSize')::numeric,0)<=0 then
      reason_codes:=array_append(reason_codes,'invalid_batch'); reasons:=array_append(reasons,'Batch count and batch size must be greater than zero.');
    end if;
    if coalesce(selection->>'batchUnit','') not in ('mg','g','kg') then
      reason_codes:=array_append(reason_codes,'unsupported_unit'); reasons:=array_append(reasons,'Percentage formulas require a mass batch unit; density conversion is not permitted.');
    end if;
    if selected_category='deodorant' then
      if nullif(selection->>'deodorantStructure','') is null then reason_codes:=array_append(reason_codes,'missing_deodorant_structure'); reasons:=array_append(reasons,'Record the deodorant formulation structure.'); end if;
      if selected_version.id is not null and (
        exists(select 1 from public.formula_lines fl where fl.workspace_id=target_round.workspace_id and fl.formula_version_id=selected_version.id and trim(coalesce(fl.phase,''))='')
        or not exists(select 1 from public.formula_lines fl where fl.workspace_id=target_round.workspace_id and fl.formula_version_id=selected_version.id and fl.formulation_role ~* '(deodor|absorb|active)')
      ) then reason_codes:=array_append(reason_codes,'deodorant_metadata_incomplete'); reasons:=array_append(reasons,'Deodorant phase and functional-role metadata are incomplete.'); end if;
    end if;
    if exists(select 1 from unnest(reason_codes) code where code<>'deodorant_metadata_incomplete') then
      readiness:='blocked';
    elsif cardinality(reason_codes)>0 then readiness:='needs_review';
    end if;

    update public.production_procurement_round_products set
      product_id=selected_product.id,product_name_snapshot=selected_product.name,product_category_snapshot=selected_product.category,
      formula_id=selected_formula.id,formula_version_id=selected_version.id,formula_version_label_snapshot=selected_version.version,
      formula_version_status_snapshot=selected_version.status,
      formula_version_snapshot=case when selected_version.id is null then null else jsonb_build_object(
        'id',selected_version.id,'formulaId',selected_version.formula_id,'version',selected_version.version,'status',selected_version.status,
        'description',selected_version.description,'targetCharacteristics',selected_version.target_characteristics,
        'phaseDefinitions',selected_version.phase_definitions,'manufacturingProcess',selected_version.manufacturing_process,
        'updatedAt',selected_version.updated_at) end,
      planned_batch_count=(selection->>'batchCount')::integer,batch_size=(selection->>'batchSize')::numeric,
      batch_unit=selection->>'batchUnit',overage_percentage=coalesce((selection->>'overagePercent')::numeric,0),
      expected_yield=(selection->>'expectedYield')::numeric,deodorant_structure=nullif(selection->>'deodorantStructure',''),
      formula_readiness_status=readiness,formula_readiness_codes=reason_codes,formula_readiness_reasons=reasons,updated_at=now()
    where workspace_id=target_round.workspace_id and round_id=target_round.id and category=selected_category;
  end loop;

  update public.production_procurement_rounds set title=trim(round_title),notes=coalesce(round_notes,''),status='draft',
    revision=revision+1,last_calculated_at=null,updated_at=now()
  where id=target_round.id returning revision into expected_revision;
  return expected_revision;
end $$;

create or replace function public.regenerate_production_procurement_requirements(
  target_round_id uuid,
  expected_revision bigint
) returns bigint
language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
  uid uuid := auth.uid();
  target_round public.production_procurement_rounds;
  calculated_time timestamptz := clock_timestamp();
  product_basis public.production_procurement_round_products;
  formula_line record;
  requirement_id uuid;
  batch_grams numeric;
  quantity_before numeric;
  overage_amount numeric;
  contribution numeric;
  lot_record record;
  lot_balance_amount numeric;
  converted_balance numeric;
  on_hand numeric;
  quarantine numeric;
  expired numeric;
  unavailable numeric;
  allocated numeric;
  usable numeric;
  requirement_record public.production_procurement_requirements;
begin
  if uid is null then raise exception using errcode='42501',message='AUTHENTICATION_REQUIRED'; end if;
  select * into target_round from public.production_procurement_rounds where id=target_round_id and owner_id=uid for update;
  if target_round.id is null then raise exception using errcode='42501',message='ROUND_UNAVAILABLE'; end if;
  if target_round.status='cancelled' then raise exception using errcode='55000',message='ROUND_CANCELLED'; end if;
  if target_round.revision<>expected_revision then raise exception using errcode='P0001',message='STALE_ROUND_REVISION'; end if;
  if (select count(*) from public.production_procurement_round_products where workspace_id=target_round.workspace_id and round_id=target_round.id)<>4
    then raise exception using errcode='22023',message='FOUR_PRODUCT_SCOPE_REQUIRED'; end if;
  if exists(select 1 from public.production_procurement_round_products where workspace_id=target_round.workspace_id and round_id=target_round.id and formula_readiness_status='blocked')
    then update public.production_procurement_rounds set status='blocked',revision=revision+1,updated_at=now() where id=target_round.id returning revision into expected_revision; return expected_revision; end if;

  delete from public.production_procurement_requirements where workspace_id=target_round.workspace_id and round_id=target_round.id;

  for product_basis in select * from public.production_procurement_round_products
    where workspace_id=target_round.workspace_id and round_id=target_round.id order by category
  loop
    batch_grams := product_basis.batch_size * product_basis.planned_batch_count *
      case product_basis.batch_unit when 'mg' then .001 when 'g' then 1 when 'kg' then 1000 else null end;
    if batch_grams is null then raise exception using errcode='22023',message='UNSUPPORTED_UNIT'; end if;
    for formula_line in
      select fl.*,i.common_name,i.reference_entry_id from public.formula_lines fl
      join public.ingredients i on i.workspace_id=fl.workspace_id and i.id=fl.ingredient_id and i.owner_id=uid
      where fl.workspace_id=target_round.workspace_id and fl.owner_id=uid and fl.formula_version_id=product_basis.formula_version_id
      order by fl.sort_order,fl.id
    loop
      quantity_before:=round(batch_grams*formula_line.percentage/100,6);
      overage_amount:=round(quantity_before*product_basis.overage_percentage/100,6);
      contribution:=quantity_before+overage_amount;
      insert into public.production_procurement_requirements(
        workspace_id,owner_id,round_id,ingredient_id,ingredient_name_snapshot,reference_entry_id,purchasing_unit,
        required_quantity,overage_quantity,total_planned_quantity,calculation_version,calculated_at
      ) values(target_round.workspace_id,uid,target_round.id,formula_line.ingredient_id,formula_line.common_name,formula_line.reference_entry_id,'g',
        quantity_before,overage_amount,contribution,'1.0.0',calculated_time)
      on conflict(workspace_id,round_id,ingredient_id,purchasing_unit) do update set
        required_quantity=production_procurement_requirements.required_quantity+excluded.required_quantity,
        overage_quantity=production_procurement_requirements.overage_quantity+excluded.overage_quantity,
        total_planned_quantity=production_procurement_requirements.total_planned_quantity+excluded.total_planned_quantity
      returning id into requirement_id;
      insert into public.production_procurement_requirement_sources(
        workspace_id,owner_id,requirement_id,round_product_id,product_id,formula_id,formula_version_id,formula_line_id,
        phase,percentage,quantity_before_overage,overage_quantity,contribution_quantity,contribution_unit,calculation_path
      ) values(target_round.workspace_id,uid,requirement_id,product_basis.id,product_basis.product_id,product_basis.formula_id,
        product_basis.formula_version_id,formula_line.id,formula_line.phase,formula_line.percentage,quantity_before,overage_amount,
        contribution,'g','batch grams × batch count × percentage ÷ 100 × (1 + overage percentage ÷ 100); requirementEngine 1.0.0');
    end loop;
  end loop;

  for requirement_record in select * from public.production_procurement_requirements
    where workspace_id=target_round.workspace_id and round_id=target_round.id
  loop
    on_hand:=0;quarantine:=0;expired:=0;unavailable:=0;allocated:=0;
    for lot_record in
      select l.*,coalesce(sum(case when m.type in('Receipt','Adjustment') then m.quantity else -abs(m.quantity) end),0) balance
      from public.inventory_lots l left join public.inventory_movements m
        on m.workspace_id=l.workspace_id and m.inventory_lot_id=l.id
      where l.workspace_id=target_round.workspace_id and l.owner_id=uid and l.ingredient_id=requirement_record.ingredient_id
        and l.unit in ('mg','g','kg')
      group by l.workspace_id,l.owner_id,l.id
    loop
      lot_balance_amount:=greatest(0,lot_record.balance);
      converted_balance:=lot_balance_amount*case lot_record.unit when 'mg' then .001 when 'g' then 1 when 'kg' then 1000 end;
      on_hand:=on_hand+converted_balance;
      if lot_record.status='Quarantined' then quarantine:=quarantine+converted_balance;
      elsif lot_record.status='Expired' or coalesce(nullif(lot_record.expiry_date,''),nullif(lot_record.best_before_date,''))::date<current_date then expired:=expired+converted_balance;
      elsif lot_record.status<>'Active' then unavailable:=unavailable+converted_balance;
      end if;
      allocated:=allocated+coalesce((
        select sum(a.quantity*case a.unit when 'mg' then .001 when 'g' then 1 when 'kg' then 1000 else 0 end)
        from public.lab_lot_allocations a where a.workspace_id=target_round.workspace_id and a.inventory_lot_id=lot_record.id and a.inventory_movement_id is null
      ),0)+coalesce((
        select sum(a.quantity*case a.unit when 'mg' then .001 when 'g' then 1 when 'kg' then 1000 else 0 end)
        from public.production_lot_allocations a where a.workspace_id=target_round.workspace_id and a.inventory_lot_id=lot_record.id and a.inventory_movement_id is null
      ),0);
    end loop;
    usable:=greatest(0,on_hand-quarantine-expired-unavailable-allocated);
    insert into public.production_procurement_inventory_gaps(
      workspace_id,owner_id,requirement_id,on_hand_quantity,quarantined_quantity,expired_quantity,
      unavailable_quantity,reserved_quantity,allocated_quantity,usable_quantity,incoming_unreceived_quantity,
      net_usable_quantity,purchasing_gap,unit,snapshot_at,calculation_version,warnings
    ) values(target_round.workspace_id,uid,requirement_record.id,on_hand,quarantine,expired,unavailable,0,allocated,usable,
      null,usable,greatest(0,requirement_record.total_planned_quantity-usable),'g',calculated_time,'1.0.0',
      array['Incoming but unreceived quantity is unknown; it is not counted as usable stock.']);
  end loop;
  update public.production_procurement_rounds set status='requirements_ready',last_calculated_at=calculated_time,
    revision=revision+1,updated_at=now() where id=target_round.id returning revision into expected_revision;
  return expected_revision;
end $$;

create or replace function public.cancel_production_procurement_round(
  target_round_id uuid,
  expected_revision bigint
) returns bigint
language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare uid uuid:=auth.uid();target_round public.production_procurement_rounds;
begin
  if uid is null then raise exception using errcode='42501',message='AUTHENTICATION_REQUIRED'; end if;
  select * into target_round from public.production_procurement_rounds where id=target_round_id and owner_id=uid for update;
  if target_round.id is null then raise exception using errcode='42501',message='ROUND_UNAVAILABLE'; end if;
  if target_round.revision<>expected_revision then raise exception using errcode='P0001',message='STALE_ROUND_REVISION'; end if;
  if target_round.status='cancelled' then return target_round.revision; end if;
  update public.production_procurement_rounds set status='cancelled',cancelled_at=now(),locked_at=now(),
    revision=revision+1,updated_at=now() where id=target_round.id returning revision into expected_revision;
  return expected_revision;
end $$;

revoke all on function public.create_production_procurement_round(uuid,text,text,text,uuid) from public,anon;
revoke all on function public.update_production_procurement_round_products(uuid,bigint,text,text,jsonb) from public,anon;
revoke all on function public.regenerate_production_procurement_requirements(uuid,bigint) from public,anon;
revoke all on function public.cancel_production_procurement_round(uuid,bigint) from public,anon;
grant execute on function public.create_production_procurement_round(uuid,text,text,text,uuid) to authenticated;
grant execute on function public.update_production_procurement_round_products(uuid,bigint,text,text,jsonb) to authenticated;
grant execute on function public.regenerate_production_procurement_requirements(uuid,bigint) to authenticated;
grant execute on function public.cancel_production_procurement_round(uuid,bigint) to authenticated;
