-- Durable purchasing specifications and explicit Supplier Product matching.
-- These planning records never create orders, plans, lots, movements, or consume discounts.

create table public.production_purchasing_specifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  owner_id uuid not null,
  requirement_id uuid not null,
  ingredient_id text not null,
  specification jsonb not null check (jsonb_typeof(specification)='object'),
  provenance jsonb not null default '{}' check (jsonb_typeof(provenance)='object'),
  calculation_version text not null default '1.0.0',
  revision bigint not null default 1 check (revision>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,id),
  unique(workspace_id,requirement_id),
  foreign key(workspace_id,requirement_id) references public.production_procurement_requirements(workspace_id,id) on delete cascade,
  foreign key(workspace_id,ingredient_id) references public.ingredients(workspace_id,id) on delete restrict
);

create table public.supplier_product_ingredient_mappings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  owner_id uuid not null,
  supplier_product_id text not null,
  ingredient_id text not null,
  status text not null check(status in('candidate','accepted','rejected','retired')),
  acceptance_method text,
  accepted_by uuid,
  accepted_at timestamptz,
  provenance jsonb not null default '{}' check(jsonb_typeof(provenance)='object'),
  notes text not null default '',
  compatibility_snapshot jsonb not null default '{}' check(jsonb_typeof(compatibility_snapshot)='object'),
  created_at timestamptz not null default now(),
  retired_at timestamptz,
  unique(workspace_id,id),
  foreign key(workspace_id,supplier_product_id) references public.supplier_products(workspace_id,id) on delete restrict,
  foreign key(workspace_id,ingredient_id) references public.ingredients(workspace_id,id) on delete restrict,
  check((status='accepted' and accepted_by is not null and accepted_at is not null and acceptance_method is not null) or status<>'accepted')
);
create unique index supplier_product_one_accepted_mapping
  on public.supplier_product_ingredient_mappings(workspace_id,supplier_product_id)
  where status='accepted';
create index supplier_product_mapping_ingredient
  on public.supplier_product_ingredient_mappings(workspace_id,ingredient_id,status);

create table public.production_requirement_supplier_candidates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  owner_id uuid not null,
  requirement_id uuid not null,
  supplier_product_id text not null,
  mapping_id uuid,
  source_type text not null default 'supplier_product' check(source_type in('supplier_product','accepted_procurement_offer')),
  status text not null default 'available' check(status in('available','rejected','needs_research')),
  classification text not null check(classification in('exact','preference_deviation','needs_review','incompatible','insufficient_evidence','stale','unavailable','unit_incompatible','package_too_small','package_excessive','missing_mapping')),
  score integer not null check(score between 0 and 100),
  match_reasons text[] not null default '{}',
  mismatch_reasons text[] not null default '{}',
  warnings text[] not null default '{}',
  package_snapshot jsonb not null check(jsonb_typeof(package_snapshot)='object'),
  documentation_snapshot jsonb not null default '{}' check(jsonb_typeof(documentation_snapshot)='object'),
  freshness_snapshot jsonb not null default '{}' check(jsonb_typeof(freshness_snapshot)='object'),
  commercial_snapshot jsonb not null default '{}' check(jsonb_typeof(commercial_snapshot)='object'),
  candidate_version text not null default '1.0.0',
  rejected_by uuid,
  rejected_at timestamptz,
  rejection_reason text,
  owner_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,id),
  unique(workspace_id,requirement_id,supplier_product_id),
  foreign key(workspace_id,requirement_id) references public.production_procurement_requirements(workspace_id,id) on delete cascade,
  foreign key(workspace_id,supplier_product_id) references public.supplier_products(workspace_id,id) on delete restrict,
  foreign key(workspace_id,mapping_id) references public.supplier_product_ingredient_mappings(workspace_id,id)
);
create index production_requirement_candidates_order
  on public.production_requirement_supplier_candidates(workspace_id,requirement_id,status,score desc,supplier_product_id);

create table public.production_requirement_supplier_matches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  owner_id uuid not null,
  requirement_id uuid not null,
  selected_candidate_id uuid,
  selected_supplier_product_id text,
  status text not null default 'unresolved' check(status in('unresolved','candidates_available','selected','blocked','needs_review')),
  match_score integer check(match_score between 0 and 100),
  match_explanation text[] not null default '{}',
  selected_package_size numeric,
  selected_package_unit text,
  estimated_package_count integer check(estimated_package_count is null or estimated_package_count>0),
  expected_purchased_quantity numeric check(expected_purchased_quantity is null or expected_purchased_quantity>0),
  expected_surplus numeric check(expected_surplus is null or expected_surplus>=0),
  warnings text[] not null default '{}',
  unresolved_reason text,
  owner_note text not null default '',
  calculation_version text not null default '1.0.0',
  revision bigint not null default 1 check(revision>0),
  accepted_by uuid,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,id),
  unique(workspace_id,requirement_id),
  foreign key(workspace_id,requirement_id) references public.production_procurement_requirements(workspace_id,id) on delete cascade,
  foreign key(workspace_id,selected_candidate_id) references public.production_requirement_supplier_candidates(workspace_id,id),
  foreign key(workspace_id,selected_supplier_product_id) references public.supplier_products(workspace_id,id),
  check((status='selected' and selected_candidate_id is not null and selected_supplier_product_id is not null and accepted_by is not null and accepted_at is not null) or status<>'selected')
);

do $$ declare table_name text; begin
  foreach table_name in array array[
    'production_purchasing_specifications',
    'supplier_product_ingredient_mappings',
    'production_requirement_supplier_candidates',
    'production_requirement_supplier_matches'
  ] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format(
      'create policy owner_select on public.%I for select to authenticated using(owner_id=(select auth.uid()))',
      table_name
    );
    execute format('revoke all on public.%I from public,anon,authenticated',table_name);
    execute format('grant select on public.%I to authenticated',table_name);
  end loop;
end $$;

create function public.production_unit_factor(candidate_unit text)
returns numeric language sql immutable strict set search_path=public,pg_temp
as $$ select case lower(candidate_unit) when 'mg' then .001 when 'g' then 1 when 'kg' then 1000 when 'ml' then 1 when 'l' then 1000 when 'pcs' then 1 end $$;

create function public.production_unit_family(candidate_unit text)
returns text language sql immutable strict set search_path=public,pg_temp
as $$ select case when lower(candidate_unit) in('mg','g','kg') then 'mass' when lower(candidate_unit) in('ml','l') then 'volume' when lower(candidate_unit)='pcs' then 'count' end $$;

create function public.generate_production_requirement_candidates(
  target_requirement_id uuid,
  expected_round_revision bigint
) returns bigint
language plpgsql security definer set search_path=public,pg_temp
as $$
declare
  uid uuid:=auth.uid(); requirement_row public.production_procurement_requirements;
  gap_row public.production_procurement_inventory_gaps; round_row public.production_procurement_rounds;
  ingredient_row public.ingredients; product_row public.supplier_products; mapping_row public.supplier_product_ingredient_mappings;
  compatible boolean; package_in_requirement numeric; package_count integer; purchased numeric; age_days integer;
  class text; candidate_score integer; reasons text[]; mismatches text[]; candidate_warnings text[];
  spec jsonb; verification jsonb; supplier_active boolean;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select * into requirement_row from public.production_procurement_requirements
    where id=target_requirement_id and owner_id=uid for update;
  if requirement_row.id is null then raise exception 'REQUIREMENT_UNAVAILABLE'; end if;
  select * into round_row from public.production_procurement_rounds
    where id=requirement_row.round_id and workspace_id=requirement_row.workspace_id and owner_id=uid for update;
  if round_row.revision<>expected_round_revision then raise exception 'STALE_ROUND_REVISION'; end if;
  if round_row.status='cancelled' then raise exception 'ROUND_CANCELLED'; end if;
  select * into ingredient_row from public.ingredients where workspace_id=requirement_row.workspace_id and id=requirement_row.ingredient_id and owner_id=uid;
  select * into gap_row from public.production_procurement_inventory_gaps where workspace_id=requirement_row.workspace_id and requirement_id=requirement_row.id;
  spec:=jsonb_build_object(
    'ingredient',jsonb_build_object('value',ingredient_row.common_name,'state','confirmed'),
    'inci',jsonb_build_object('value',nullif(ingredient_row.inci_name,''),'state',case when nullif(ingredient_row.inci_name,'') is null then 'unknown' else 'confirmed' end),
    'grade',jsonb_build_object('value',null,'state','unknown'),
    'organic',jsonb_build_object('value',null,'state','unknown'),
    'physicalForm',jsonb_build_object('value',null,'state','unknown'),
    'purchasingUnit',jsonb_build_object('value',requirement_row.purchasing_unit,'state','confirmed'),
    'minimumGap',jsonb_build_object('value',coalesce(gap_row.purchasing_gap,requirement_row.total_planned_quantity),'state','confirmed'),
    'documentation',jsonb_build_array(
      jsonb_build_object('type','sds','level','required','state','unknown'),
      jsonb_build_object('type','coa','level','preferred','state','unknown')
    ),
    'storage',jsonb_build_object('value',null,'state','unknown'),
    'shelfLife',jsonb_build_object('value',null,'state','unknown'),
    'substitutions',jsonb_build_object('accepted',jsonb_build_array(),'prohibited',jsonb_build_array(),'state','unknown')
  );
  insert into public.production_purchasing_specifications(workspace_id,owner_id,requirement_id,ingredient_id,specification,provenance)
  values(requirement_row.workspace_id,uid,requirement_row.id,requirement_row.ingredient_id,spec,
    jsonb_build_object('ingredient','ingredients:'||ingredient_row.id,'quantity','production_procurement_inventory_gaps:'||gap_row.id,'unit','production_procurement_requirements:'||requirement_row.id))
  on conflict(workspace_id,requirement_id) do update set specification=excluded.specification,provenance=excluded.provenance,
    revision=production_purchasing_specifications.revision+1,updated_at=now();

  for product_row in select sp.* from public.supplier_products sp
    where sp.workspace_id=requirement_row.workspace_id and sp.owner_id=uid
    order by sp.id
  loop
    select * into mapping_row from public.supplier_product_ingredient_mappings m
      where m.workspace_id=requirement_row.workspace_id and m.supplier_product_id=product_row.id and m.status='accepted';
    compatible:=public.production_unit_family(product_row.package_unit)=public.production_unit_family(requirement_row.purchasing_unit);
    package_in_requirement:=case when compatible then product_row.package_quantity*public.production_unit_factor(product_row.package_unit)/public.production_unit_factor(requirement_row.purchasing_unit) end;
    package_count:=case when compatible then greatest(ceil(coalesce(gap_row.purchasing_gap,requirement_row.total_planned_quantity)/package_in_requirement)::integer,ceil(coalesce(product_row.moq,1))::integer,1) end;
    purchased:=case when compatible then package_count*package_in_requirement end;
    age_days:=case when product_row.last_verified_date is null then null else current_date-product_row.last_verified_date end;
    verification:=coalesce(product_row.verification,'{}');
    supplier_active:=product_row.supplier_id is null or exists(select 1 from public.suppliers s where s.workspace_id=requirement_row.workspace_id and s.id=product_row.supplier_id and s.owner_id=uid and s.status in('active','approved_internal','candidate','research'));
    reasons:='{}'; mismatches:='{}'; candidate_warnings:='{}'; candidate_score:=0;
    if mapping_row.id is not null and mapping_row.ingredient_id=requirement_row.ingredient_id then reasons:=array_append(reasons,'Accepted canonical Ingredient mapping');candidate_score:=candidate_score+55;
    elsif product_row.ingredient_id=requirement_row.ingredient_id then reasons:=array_append(reasons,'Legacy canonical Ingredient association requires explicit acceptance');candidate_score:=candidate_score+35;
    else mismatches:=array_append(mismatches,'Supplier Product maps to a different canonical Ingredient'); end if;
    if compatible then reasons:=array_append(reasons,'Package unit is compatible');candidate_score:=candidate_score+20;
    else mismatches:=array_append(mismatches,'Package unit cannot convert safely to the requirement unit'); end if;
    if verification->>'sds'='reviewed' then reasons:=array_append(reasons,'SDS reviewed');candidate_score:=candidate_score+10;
    else candidate_warnings:=array_append(candidate_warnings,'Required SDS is not reviewed'); end if;
    if verification->>'coa'<>'reviewed' then candidate_warnings:=array_append(candidate_warnings,'Preferred COA is not reviewed'); end if;
    if age_days is null then candidate_warnings:=array_append(candidate_warnings,'Price and stock freshness are unknown');
    elsif age_days>90 then candidate_warnings:=array_append(candidate_warnings,'Price and stock information is stale');
    elsif age_days>30 then candidate_warnings:=array_append(candidate_warnings,'Price and stock information is aging');
    else reasons:=array_append(reasons,'Price and stock verified recently');candidate_score:=candidate_score+10; end if;
    if not supplier_active then mismatches:=array_append(mismatches,'Supplier is inactive'); end if;
    if product_row.discontinued or product_row.product_status in('inactive','discontinued') or lower(coalesce(product_row.availability_status,'')) in('out_of_stock','unavailable') then mismatches:=array_append(mismatches,'Supplier Product is unavailable'); end if;
    class:=case
      when not compatible then 'unit_incompatible'
      when not supplier_active or product_row.discontinued or product_row.product_status in('inactive','discontinued') then 'unavailable'
      when mapping_row.id is null and product_row.ingredient_id<>requirement_row.ingredient_id then 'missing_mapping'
      when mapping_row.id is not null and mapping_row.ingredient_id<>requirement_row.ingredient_id then 'incompatible'
      when age_days is null or age_days>90 then 'stale'
      when mapping_row.id is not null and cardinality(candidate_warnings)=0 then 'exact'
      when mapping_row.id is not null then 'preference_deviation'
      else 'needs_review' end;
    if cardinality(mismatches)>0 then candidate_score:=least(candidate_score,25); end if;
    insert into public.production_requirement_supplier_candidates(
      workspace_id,owner_id,requirement_id,supplier_product_id,mapping_id,classification,score,match_reasons,mismatch_reasons,warnings,
      package_snapshot,documentation_snapshot,freshness_snapshot,commercial_snapshot
    ) values(
      requirement_row.workspace_id,uid,requirement_row.id,product_row.id,mapping_row.id,class,greatest(0,least(100,candidate_score)),reasons,mismatches,candidate_warnings,
      jsonb_build_object('size',product_row.package_quantity,'unit',product_row.package_unit,'compatible',compatible,'packageCount',package_count,'purchasedQuantity',purchased,'surplus',case when purchased is null then null else greatest(0,purchased-coalesce(gap_row.purchasing_gap,requirement_row.total_planned_quantity)) end,'moq',product_row.moq),
      jsonb_build_object('sds',coalesce(verification->>'sds','unknown'),'coa',coalesce(verification->>'coa','unknown'),'specification',coalesce(verification->>'supplierSpecification','unknown'),'inci',coalesce(verification->>'inci','unknown'),'allergen',coalesce(verification->>'allergenInformation','unknown'),'origin',coalesce(verification->>'origin','unknown'),'shelfLife',coalesce(verification->>'shelfLife','unknown')),
      jsonb_build_object('ruleVersion','1.0.0','price',case when age_days is null then 'unknown' when age_days<=30 then 'current' when age_days<=90 then 'aging' else 'stale' end,'stock',case when age_days is null then 'unknown' when age_days<=30 then 'current' when age_days<=90 then 'aging' else 'stale' end,'specification','unknown','documentation','unknown','shipping','unknown','commercial','unknown','verifiedAt',product_row.last_verified_date),
      jsonb_build_object('price',product_row.price,'currency',product_row.currency,'availability',coalesce(product_row.availability_status,'unknown'),'supplierId',product_row.supplier_id)
    ) on conflict(workspace_id,requirement_id,supplier_product_id) do update set
      mapping_id=excluded.mapping_id,classification=excluded.classification,score=excluded.score,match_reasons=excluded.match_reasons,mismatch_reasons=excluded.mismatch_reasons,warnings=excluded.warnings,
      package_snapshot=excluded.package_snapshot,documentation_snapshot=excluded.documentation_snapshot,freshness_snapshot=excluded.freshness_snapshot,commercial_snapshot=excluded.commercial_snapshot,
      updated_at=now();
  end loop;
  insert into public.production_requirement_supplier_matches(workspace_id,owner_id,requirement_id,status)
  values(requirement_row.workspace_id,uid,requirement_row.id,
    case when exists(select 1 from public.production_requirement_supplier_candidates c where c.workspace_id=requirement_row.workspace_id and c.requirement_id=requirement_row.id and c.status='available') then 'candidates_available' else 'unresolved' end)
  on conflict(workspace_id,requirement_id) do update set
    status=case when production_requirement_supplier_matches.status='selected' then 'selected'
      when exists(select 1 from public.production_requirement_supplier_candidates c where c.workspace_id=requirement_row.workspace_id and c.requirement_id=requirement_row.id and c.status='available') then 'candidates_available' else production_requirement_supplier_matches.status end,
    revision=production_requirement_supplier_matches.revision+1,updated_at=now();
  update public.production_procurement_rounds set revision=revision+1,updated_at=now() where id=round_row.id;
  return round_row.revision+1;
end $$;

create function public.accept_supplier_product_ingredient_mapping(
  target_requirement_id uuid,target_supplier_product_id text,expected_round_revision bigint,acceptance_note text default ''
) returns uuid language plpgsql security definer set search_path=public,pg_temp
as $$
declare uid uuid:=auth.uid(); r public.production_procurement_requirements; rd public.production_procurement_rounds; sp public.supplier_products; existing uuid; result_id uuid;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select * into r from public.production_procurement_requirements where id=target_requirement_id and owner_id=uid for update;
  if r.id is null then raise exception 'REQUIREMENT_UNAVAILABLE'; end if;
  select * into rd from public.production_procurement_rounds where id=r.round_id and workspace_id=r.workspace_id and owner_id=uid for update;
  if rd.revision<>expected_round_revision then raise exception 'STALE_ROUND_REVISION'; end if;
  select * into sp from public.supplier_products where workspace_id=r.workspace_id and id=target_supplier_product_id and owner_id=uid for update;
  if sp.id is null then raise exception 'SUPPLIER_PRODUCT_UNAVAILABLE'; end if;
  select id into existing from public.supplier_product_ingredient_mappings where workspace_id=r.workspace_id and supplier_product_id=sp.id and status='accepted';
  if existing is not null then
    if exists(select 1 from public.supplier_product_ingredient_mappings where id=existing and ingredient_id=r.ingredient_id) then return existing; end if;
    raise exception 'AMBIGUOUS_ACCEPTED_MAPPING';
  end if;
  if sp.ingredient_id<>r.ingredient_id then raise exception 'CANONICAL_INGREDIENT_MISMATCH'; end if;
  insert into public.supplier_product_ingredient_mappings(workspace_id,owner_id,supplier_product_id,ingredient_id,status,acceptance_method,accepted_by,accepted_at,provenance,notes,compatibility_snapshot)
  values(r.workspace_id,uid,sp.id,r.ingredient_id,'accepted','owner_requirement_review',uid,now(),jsonb_build_object('requirementId',r.id,'legacyIngredientId',sp.ingredient_id),coalesce(acceptance_note,''),jsonb_build_object('inci',sp.declared_inci,'grade',sp.grade,'packageUnit',sp.package_unit))
  returning id into result_id;
  update public.production_procurement_rounds set revision=revision+1,updated_at=now() where id=rd.id;
  return result_id;
end $$;

create function public.select_production_requirement_supplier_product(
  target_requirement_id uuid,target_candidate_id uuid,expected_round_revision bigint,expected_match_revision bigint
) returns bigint language plpgsql security definer set search_path=public,pg_temp
as $$
declare uid uuid:=auth.uid(); r public.production_procurement_requirements; rd public.production_procurement_rounds; c public.production_requirement_supplier_candidates; m public.production_requirement_supplier_matches; p jsonb;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select * into r from public.production_procurement_requirements where id=target_requirement_id and owner_id=uid for update;
  if r.id is null then raise exception 'REQUIREMENT_UNAVAILABLE'; end if;
  select * into rd from public.production_procurement_rounds where id=r.round_id and workspace_id=r.workspace_id and owner_id=uid for update;
  if rd.revision<>expected_round_revision then raise exception 'STALE_ROUND_REVISION'; end if;
  select * into c from public.production_requirement_supplier_candidates where workspace_id=r.workspace_id and id=target_candidate_id and requirement_id=r.id and owner_id=uid for update;
  if c.id is null or c.status<>'available' then raise exception 'CANDIDATE_UNAVAILABLE'; end if;
  if c.classification in('incompatible','unit_incompatible','unavailable','package_too_small','missing_mapping') then raise exception 'CANDIDATE_SELECTION_BLOCKED'; end if;
  if not exists(select 1 from public.supplier_product_ingredient_mappings sm where sm.workspace_id=r.workspace_id and sm.supplier_product_id=c.supplier_product_id and sm.ingredient_id=r.ingredient_id and sm.status='accepted') then raise exception 'ACCEPTED_MAPPING_REQUIRED'; end if;
  select * into m from public.production_requirement_supplier_matches where workspace_id=r.workspace_id and requirement_id=r.id for update;
  if m.id is null then raise exception 'MATCH_UNAVAILABLE'; end if;
  if m.revision<>expected_match_revision then raise exception 'STALE_MATCH_REVISION'; end if;
  if m.status='selected' and m.selected_candidate_id=c.id then return rd.revision; end if;
  p:=c.package_snapshot;
  if coalesce((p->>'compatible')::boolean,false)=false or coalesce((p->>'packageCount')::integer,0)<1 or coalesce((p->>'purchasedQuantity')::numeric,0)<coalesce((p->>'purchasedQuantity')::numeric,0)-(p->>'surplus')::numeric then raise exception 'INVALID_PACKAGE_COVERAGE'; end if;
  update public.production_requirement_supplier_matches set selected_candidate_id=c.id,selected_supplier_product_id=c.supplier_product_id,status=case when cardinality(c.warnings)>0 then 'needs_review' else 'selected' end,
    match_score=c.score,match_explanation=c.match_reasons,selected_package_size=(p->>'size')::numeric,selected_package_unit=p->>'unit',estimated_package_count=(p->>'packageCount')::integer,
    expected_purchased_quantity=(p->>'purchasedQuantity')::numeric,expected_surplus=(p->>'surplus')::numeric,warnings=c.warnings,unresolved_reason=null,accepted_by=uid,accepted_at=now(),revision=revision+1,updated_at=now()
  where id=m.id;
  update public.production_procurement_rounds set revision=revision+1,updated_at=now() where id=rd.id;
  return rd.revision+1;
end $$;

create function public.reject_production_requirement_candidate(
  target_candidate_id uuid,expected_round_revision bigint,rejection_note text
) returns bigint language plpgsql security definer set search_path=public,pg_temp
as $$
declare uid uuid:=auth.uid(); c public.production_requirement_supplier_candidates; r public.production_procurement_requirements; rd public.production_procurement_rounds;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if nullif(trim(rejection_note),'') is null then raise exception 'REJECTION_REASON_REQUIRED'; end if;
  select * into c from public.production_requirement_supplier_candidates where id=target_candidate_id and owner_id=uid for update;
  if c.id is null then raise exception 'CANDIDATE_UNAVAILABLE'; end if;
  select * into r from public.production_procurement_requirements where workspace_id=c.workspace_id and id=c.requirement_id and owner_id=uid;
  select * into rd from public.production_procurement_rounds where workspace_id=c.workspace_id and id=r.round_id and owner_id=uid for update;
  if rd.revision<>expected_round_revision then raise exception 'STALE_ROUND_REVISION'; end if;
  if c.status='rejected' and c.rejection_reason=rejection_note then return rd.revision; end if;
  if exists(select 1 from public.production_requirement_supplier_matches m where m.workspace_id=c.workspace_id and m.requirement_id=c.requirement_id and m.selected_candidate_id=c.id and m.status in('selected','needs_review')) then raise exception 'CLEAR_SELECTION_BEFORE_REJECTION'; end if;
  update public.production_requirement_supplier_candidates set status='rejected',rejected_by=uid,rejected_at=now(),rejection_reason=rejection_note,updated_at=now() where id=c.id;
  update public.production_procurement_rounds set revision=revision+1,updated_at=now() where id=rd.id;
  return rd.revision+1;
end $$;

create function public.clear_production_requirement_match(
  target_requirement_id uuid,expected_round_revision bigint,expected_match_revision bigint,unresolved_note text default null
) returns bigint language plpgsql security definer set search_path=public,pg_temp
as $$
declare uid uuid:=auth.uid(); r public.production_procurement_requirements; rd public.production_procurement_rounds; m public.production_requirement_supplier_matches;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select * into r from public.production_procurement_requirements where id=target_requirement_id and owner_id=uid;
  if r.id is null then raise exception 'REQUIREMENT_UNAVAILABLE'; end if;
  select * into rd from public.production_procurement_rounds where workspace_id=r.workspace_id and id=r.round_id and owner_id=uid for update;
  if rd.revision<>expected_round_revision then raise exception 'STALE_ROUND_REVISION'; end if;
  select * into m from public.production_requirement_supplier_matches where workspace_id=r.workspace_id and requirement_id=r.id and owner_id=uid for update;
  if m.id is null or m.revision<>expected_match_revision then raise exception 'STALE_MATCH_REVISION'; end if;
  update public.production_requirement_supplier_matches set selected_candidate_id=null,selected_supplier_product_id=null,status=case when nullif(trim(unresolved_note),'') is null then 'unresolved' else 'needs_review' end,
    match_score=null,match_explanation='{}',selected_package_size=null,selected_package_unit=null,estimated_package_count=null,expected_purchased_quantity=null,expected_surplus=null,warnings='{}',
    unresolved_reason=nullif(trim(unresolved_note),''),accepted_by=null,accepted_at=null,revision=revision+1,updated_at=now() where id=m.id;
  update public.production_procurement_rounds set revision=revision+1,updated_at=now() where id=rd.id;
  return rd.revision+1;
end $$;

do $$ declare signature text; begin
  foreach signature in array array[
    'public.generate_production_requirement_candidates(uuid,bigint)',
    'public.accept_supplier_product_ingredient_mapping(uuid,text,bigint,text)',
    'public.select_production_requirement_supplier_product(uuid,uuid,bigint,bigint)',
    'public.reject_production_requirement_candidate(uuid,bigint,text)',
    'public.clear_production_requirement_match(uuid,bigint,bigint,text)'
  ] loop
    execute 'revoke all on function '||signature||' from public,anon';
    execute 'grant execute on function '||signature||' to authenticated';
  end loop;
end $$;
