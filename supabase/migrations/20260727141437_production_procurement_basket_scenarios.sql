-- Durable cross-supplier basket snapshots. Publication freezes comparison history;
-- it is not purchase approval, ordering, receiving, or inventory creation.

alter table public.procurement_supplier_discounts
  add column included_supplier_product_ids text[] not null default '{}',
  add column excluded_supplier_product_ids text[] not null default '{}',
  add column eligibility_state text not null default 'unknown' check(eligibility_state in('confirmed','unconfirmed','unknown')),
  add column stacking_allowed boolean,
  add column single_use boolean not null default false,
  add column threshold_basis text check(threshold_basis is null or threshold_basis in('eligible_subtotal','merchandise_subtotal'));

alter table public.procurement_supplier_shipping_rules
  add column threshold_basis text check(threshold_basis is null or threshold_basis in('pre_discount','post_discount')),
  add column checkout_only boolean not null default false,
  add column weight_tiers jsonb not null default '[]' check(jsonb_typeof(weight_tiers)='array'),
  add column order_value_tiers jsonb not null default '[]' check(jsonb_typeof(order_value_tiers)='array'),
  add column excluded_regions text[] not null default '{}',
  add column remote_area_fee numeric check(remote_area_fee is null or remote_area_fee>=0),
  add column dangerous_goods_fee numeric check(dangerous_goods_fee is null or dangerous_goods_fee>=0),
  add column vat_included boolean,
  add column estimate_min numeric check(estimate_min is null or estimate_min>=0),
  add column estimate_max numeric check(estimate_max is null or estimate_max>=0),
  add constraint procurement_shipping_estimate_order check(estimate_min is null or estimate_max is null or estimate_min<=estimate_max);

create table public.production_procurement_scenarios(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  owner_id uuid not null,
  round_id uuid not null,
  strategy text not null check(strategy in('minimum_cash','best_value','discount_utilization','fewest_suppliers','lowest_risk','balanced')),
  status text not null default 'draft' check(status in('draft','published','incomplete','blocked')),
  feasibility text not null check(feasibility in('complete','complete_with_warnings','incomplete','blocked')),
  calculation_version text not null default '1.0.0',
  source_round_revision bigint not null,
  source_fingerprint text not null,
  generated_at timestamptz not null default now(),
  stale_at timestamptz,
  base_currency text not null check(base_currency~'^[A-Z]{3}$'),
  mixed_currency boolean not null default false,
  total_known_minimum numeric,
  total_confirmed numeric,
  total_estimated numeric,
  total_range_minimum numeric,
  total_range_maximum numeric,
  original_currency_totals jsonb not null default '{}' check(jsonb_typeof(original_currency_totals)='object'),
  unknown_commercial_components text[] not null default '{}',
  supplier_count integer not null default 0 check(supplier_count>=0),
  line_count integer not null default 0 check(line_count>=0),
  warning_count integer not null default 0 check(warning_count>=0),
  blocker_count integer not null default 0 check(blocker_count>=0),
  stale_data_count integer not null default 0 check(stale_data_count>=0),
  ranking_score numeric,
  ranking_explanation text[] not null default '{}',
  strategy_weights jsonb not null default '{}' check(jsonb_typeof(strategy_weights)='object'),
  revision bigint not null default 1 check(revision>0),
  published_at timestamptz,
  published_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,id),
  foreign key(workspace_id,round_id) references public.production_procurement_rounds(workspace_id,id) on delete cascade,
  check((status='published' and published_at is not null and published_by is not null) or status<>'published')
);
create unique index production_scenario_one_draft_strategy
  on public.production_procurement_scenarios(workspace_id,round_id,strategy) where status in('draft','incomplete','blocked');
create index production_scenarios_round_history on public.production_procurement_scenarios(workspace_id,round_id,generated_at desc);

create table public.production_procurement_scenario_baskets(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  owner_id uuid not null,
  scenario_id uuid not null,
  supplier_id uuid not null,
  supplier_name_snapshot text not null,
  supplier_url_snapshot text,
  currency text not null check(currency~'^[A-Z]{3}$'),
  merchandise_subtotal numeric not null check(merchandise_subtotal>=0),
  eligible_subtotal numeric not null check(eligible_subtotal>=0),
  confirmed_discount numeric not null default 0 check(confirmed_discount>=0),
  estimated_discount numeric not null default 0 check(estimated_discount>=0),
  post_discount_subtotal numeric not null check(post_discount_subtotal>=0),
  shipping numeric,
  shipping_state text not null check(shipping_state in('confirmed','estimated','unknown','checkout_verification_required','not_applicable')),
  vat numeric,
  vat_state text not null check(vat_state in('confirmed','estimated','unknown','checkout_verification_required','import_verification_required','not_applicable')),
  import_vat numeric,
  import_vat_state text not null check(import_vat_state in('confirmed','estimated','unknown','import_verification_required','not_applicable')),
  customs numeric,
  customs_state text not null check(customs_state in('confirmed','estimated','unknown','import_verification_required','not_applicable')),
  handling numeric,
  handling_state text not null check(handling_state in('confirmed','estimated','unknown','checkout_verification_required','import_verification_required','not_applicable')),
  known_minimum numeric not null check(known_minimum>=0),
  confirmed_total numeric,
  estimated_total numeric,
  range_minimum numeric,
  range_maximum numeric,
  free_shipping_progress jsonb not null default '{}' check(jsonb_typeof(free_shipping_progress)='object'),
  warnings text[] not null default '{}',
  freshness_states jsonb not null default '{}' check(jsonb_typeof(freshness_states)='object'),
  assumption_snapshot jsonb not null default '{}' check(jsonb_typeof(assumption_snapshot)='object'),
  created_at timestamptz not null default now(),
  unique(workspace_id,id),
  unique(workspace_id,scenario_id,supplier_id,currency),
  foreign key(workspace_id,scenario_id) references public.production_procurement_scenarios(workspace_id,id) on delete cascade,
  foreign key(workspace_id,supplier_id) references public.suppliers(workspace_id,id)
);

create table public.production_procurement_scenario_lines(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  owner_id uuid not null,
  scenario_id uuid not null,
  basket_id uuid not null,
  requirement_id uuid not null,
  supplier_product_id text not null,
  supplier_product_name_snapshot text not null,
  product_url_snapshot text,
  ingredient_id text not null,
  ingredient_name_snapshot text not null,
  required_quantity numeric not null check(required_quantity>0),
  required_unit text not null,
  package_size numeric not null check(package_size>0),
  package_unit text not null,
  package_count integer not null check(package_count>0),
  moq_adjusted_count integer not null check(moq_adjusted_count>0),
  purchased_quantity numeric not null check(purchased_quantity>0),
  surplus numeric not null check(surplus>=0),
  unit_price numeric not null check(unit_price>=0),
  currency text not null check(currency~'^[A-Z]{3}$'),
  merchandise_line_total numeric not null check(merchandise_line_total>=0),
  discount_eligibility text not null,
  allocated_discount numeric not null default 0 check(allocated_discount>=0),
  allocated_shipping numeric,
  effective_landed_cost numeric,
  effective_cost_per_required_unit numeric,
  uncertainty text[] not null default '{}',
  warnings text[] not null default '{}',
  source_selection_revision bigint not null,
  assumption_snapshot jsonb not null default '{}' check(jsonb_typeof(assumption_snapshot)='object'),
  created_at timestamptz not null default now(),
  unique(workspace_id,id),
  unique(workspace_id,scenario_id,requirement_id),
  foreign key(workspace_id,scenario_id) references public.production_procurement_scenarios(workspace_id,id) on delete cascade,
  foreign key(workspace_id,basket_id) references public.production_procurement_scenario_baskets(workspace_id,id) on delete cascade,
  foreign key(workspace_id,requirement_id) references public.production_procurement_requirements(workspace_id,id),
  foreign key(workspace_id,supplier_product_id) references public.supplier_products(workspace_id,id),
  foreign key(workspace_id,ingredient_id) references public.ingredients(workspace_id,id)
);
create index production_scenario_lines_basket on public.production_procurement_scenario_lines(workspace_id,basket_id);

do $$ declare table_name text; begin
  foreach table_name in array array['production_procurement_scenarios','production_procurement_scenario_baskets','production_procurement_scenario_lines'] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('create policy owner_select on public.%I for select to authenticated using(owner_id=(select auth.uid()))',table_name);
    execute format('revoke all on public.%I from public,anon,authenticated',table_name);
    execute format('grant select on public.%I to authenticated',table_name);
  end loop;
end $$;

create function public.generate_production_procurement_scenarios(target_round_id uuid,expected_round_revision bigint)
returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare
  uid uuid:=auth.uid(); rd public.production_procurement_rounds; strategy_name text; v_scenario_id uuid; basket_record record; line_record record;
  scenario_feasibility text; missing_requirements integer; missing_count integer; warning_total integer; stale_total integer;
  v_basket_id uuid; discount_row public.procurement_supplier_discounts; shipping_row public.procurement_supplier_shipping_rules;
  merchandise numeric; eligible numeric; confirmed_discount numeric; estimated_discount numeric; post_discount numeric;
  shipping_amount numeric; shipping_semantic text; tax_semantic text; duty_semantic text; known numeric; confirmed numeric; estimated numeric;
  unknowns text[]; basket_warnings text[]; age_days integer; fingerprint text; currency_count integer; original_totals jsonb;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select * into rd from public.production_procurement_rounds where id=target_round_id and owner_id=uid for update;
  if rd.id is null then raise exception 'ROUND_UNAVAILABLE'; end if;
  if rd.revision<>expected_round_revision then raise exception 'STALE_ROUND_REVISION'; end if;
  if rd.status='cancelled' then raise exception 'ROUND_CANCELLED'; end if;
  select count(*) into missing_requirements from public.production_procurement_requirements r
    left join public.production_requirement_supplier_matches m on m.workspace_id=r.workspace_id and m.requirement_id=r.id and m.selected_supplier_product_id is not null and m.status in('selected','needs_review')
    where r.workspace_id=rd.workspace_id and r.round_id=rd.id and m.id is null;
  if not exists(select 1 from public.production_procurement_requirements where workspace_id=rd.workspace_id and round_id=rd.id) then raise exception 'REQUIREMENTS_UNAVAILABLE'; end if;
  select md5(string_agg(concat_ws(':',r.id,m.selected_supplier_product_id,m.revision,sp.updated_at,coalesce(d.updated_at::text,''),coalesce(sr.updated_at::text,'')),',' order by r.id))
  into fingerprint
  from public.production_procurement_requirements r
  left join public.production_requirement_supplier_matches m on m.workspace_id=r.workspace_id and m.requirement_id=r.id
  left join public.supplier_products sp on sp.workspace_id=r.workspace_id and sp.id=m.selected_supplier_product_id
  left join lateral(select max(updated_at) updated_at from public.procurement_supplier_discounts x where x.workspace_id=rd.workspace_id and x.supplier_id=sp.supplier_id) d on true
  left join lateral(select max(updated_at) updated_at from public.procurement_supplier_shipping_rules x where x.workspace_id=rd.workspace_id and x.supplier_id=sp.supplier_id) sr on true
  where r.workspace_id=rd.workspace_id and r.round_id=rd.id;

  if (select count(*) from public.production_procurement_scenarios s where s.workspace_id=rd.workspace_id and s.round_id=rd.id and s.status in('draft','incomplete','blocked') and s.source_fingerprint=fingerprint and s.stale_at is null)=6 then
    return rd.revision;
  end if;

  update public.production_procurement_scenarios set stale_at=coalesce(stale_at,now()),updated_at=now()
    where workspace_id=rd.workspace_id and round_id=rd.id and status in('draft','incomplete','blocked') and source_fingerprint<>fingerprint;
  delete from public.production_procurement_scenarios where workspace_id=rd.workspace_id and round_id=rd.id and status in('draft','incomplete','blocked');

  foreach strategy_name in array array['minimum_cash','best_value','discount_utilization','fewest_suppliers','lowest_risk','balanced'] loop
    scenario_feasibility:=case when missing_requirements>0 then 'incomplete' else 'complete' end;
    insert into public.production_procurement_scenarios(workspace_id,owner_id,round_id,strategy,status,feasibility,source_round_revision,source_fingerprint,base_currency,strategy_weights,ranking_explanation)
    values(rd.workspace_id,uid,rd.id,strategy_name,case when missing_requirements>0 then 'incomplete' else 'draft' end,scenario_feasibility,rd.revision,fingerprint,rd.base_currency,
      case strategy_name
        when 'minimum_cash' then '{"cash":1,"surplus":0.1,"uncertainty":10000}'
        when 'best_value' then '{"cash":1,"surplus":0.35,"uncertainty":5000}'
        when 'discount_utilization' then '{"cash":1,"discount":-2,"uncertainty":5000}'
        when 'fewest_suppliers' then '{"supplierCount":1000000000,"cash":1}'
        when 'lowest_risk' then '{"uncertainty":1000000000,"stale":100000000,"documentation":10000000,"stock":1000000}'
        else '{"cash":1,"supplierCount":250,"surplus":0.25,"uncertainty":5000,"stale":1000,"discount":-1}' end::jsonb,
      case when missing_requirements>0 then array[missing_requirements||' requirements have no selected Supplier Product'] else array['Uses the exact persisted requirement selections; strategy score is deterministic and transparent'] end)
    returning id into v_scenario_id;

    if missing_requirements=0 then
      for basket_record in
        select sp.supplier_id,s.legal_name,s.website_url,sp.currency
        from public.production_procurement_requirements r
        join public.production_requirement_supplier_matches m on m.workspace_id=r.workspace_id and m.requirement_id=r.id and m.selected_supplier_product_id is not null
        join public.supplier_products sp on sp.workspace_id=r.workspace_id and sp.id=m.selected_supplier_product_id
        join public.suppliers s on s.workspace_id=sp.workspace_id and s.id=sp.supplier_id
        where r.workspace_id=rd.workspace_id and r.round_id=rd.id and r.owner_id=uid
        group by sp.supplier_id,s.legal_name,s.website_url,sp.currency order by s.legal_name,sp.currency
      loop
        select coalesce(sum(m.estimated_package_count*sp.price),0) into merchandise
        from public.production_procurement_requirements r join public.production_requirement_supplier_matches m on m.workspace_id=r.workspace_id and m.requirement_id=r.id
        join public.supplier_products sp on sp.workspace_id=r.workspace_id and sp.id=m.selected_supplier_product_id
        where r.workspace_id=rd.workspace_id and r.round_id=rd.id and sp.supplier_id=basket_record.supplier_id and sp.currency=basket_record.currency;
        select * into discount_row from public.procurement_supplier_discounts d where d.workspace_id=rd.workspace_id and d.owner_id=uid and d.supplier_id=basket_record.supplier_id and d.status in('available','planned','unknown') order by (d.status='available') desc,d.verified_at desc nulls last,d.id limit 1;
        eligible:=merchandise;confirmed_discount:=0;estimated_discount:=0;
        if discount_row.id is not null and (discount_row.expires_at is null or discount_row.expires_at>now()) and discount_row.used_at is null and (discount_row.minimum_order_value is null or eligible>=discount_row.minimum_order_value) and (discount_row.currency is null or discount_row.currency=basket_record.currency) then
          estimated_discount:=least(eligible,coalesce(discount_row.maximum_discount,eligible),case when discount_row.discount_type='percentage' then eligible*discount_row.percentage/100 when discount_row.discount_type='fixed_amount' then discount_row.fixed_amount else 0 end);
          if discount_row.status='available' and discount_row.eligibility_state='confirmed' and discount_row.verified_at is not null then confirmed_discount:=estimated_discount;estimated_discount:=0; end if;
        end if;
        post_discount:=greatest(0,merchandise-confirmed_discount);
        select * into shipping_row from public.procurement_supplier_shipping_rules sr where sr.workspace_id=rd.workspace_id and sr.owner_id=uid and sr.supplier_id=basket_record.supplier_id and (sr.destination_country_code is null or sr.destination_country_code='NO') and sr.status in('active','needs_verification') order by (sr.status='active') desc,sr.verified_at desc nulls last,sr.id limit 1;
        unknowns:='{}';basket_warnings:='{}';shipping_amount:=null;shipping_semantic:='unknown';
        if shipping_row.id is null then unknowns:=array_append(unknowns,'shipping');basket_warnings:=array_append(basket_warnings,'No stored shipping rule');
        elsif shipping_row.checkout_only then shipping_semantic:='checkout_verification_required';unknowns:=array_append(unknowns,'shipping');basket_warnings:=array_append(basket_warnings,'Shipping requires checkout verification');
        elsif shipping_row.free_shipping_threshold is not null and shipping_row.threshold_basis is null then unknowns:=array_append(unknowns,'shipping');basket_warnings:=array_append(basket_warnings,'Free-shipping threshold basis is unknown');
        elsif shipping_row.free_shipping_threshold is not null and (case shipping_row.threshold_basis when 'pre_discount' then merchandise else post_discount end)>=shipping_row.free_shipping_threshold then shipping_amount:=0;shipping_semantic:=case when shipping_row.status='active' and shipping_row.verified_at>=now()-interval '30 days' then 'confirmed' else 'estimated' end;
        elsif shipping_row.flat_rate is not null then shipping_amount:=shipping_row.flat_rate+coalesce(shipping_row.remote_area_fee,0)+coalesce(shipping_row.dangerous_goods_fee,0);shipping_semantic:=case when shipping_row.status='active' and shipping_row.verified_at>=now()-interval '30 days' then 'confirmed' else 'estimated' end;
        else unknowns:=array_append(unknowns,'shipping');basket_warnings:=array_append(basket_warnings,'Shipping amount is unknown'); end if;
        tax_semantic:=case when shipping_row.tax_handling='included' then 'not_applicable' when shipping_row.tax_handling='destination_checkout' then 'checkout_verification_required' when shipping_row.tax_handling='import_due' then 'import_verification_required' else 'unknown' end;
        duty_semantic:=case when shipping_row.duty_handling='excluded' then 'not_applicable' when shipping_row.duty_handling='import_due' then 'import_verification_required' else 'unknown' end;
        if tax_semantic in('unknown','checkout_verification_required','import_verification_required') then unknowns:=array_append(unknowns,'vat'); end if;
        if duty_semantic in('unknown','import_verification_required') then unknowns:=array_append(unknowns,'customs'); end if;
        unknowns:=array_append(unknowns,'handling');
        known:=post_discount+coalesce(shipping_amount,0);confirmed:=case when cardinality(unknowns)=0 and shipping_semantic in('confirmed','not_applicable') then known end;
        estimated:=case when shipping_amount is not null and tax_semantic='not_applicable' and duty_semantic='not_applicable' then known end;
        age_days:=case when shipping_row.verified_at is null then null else current_date-shipping_row.verified_at::date end;
        insert into public.production_procurement_scenario_baskets(workspace_id,owner_id,scenario_id,supplier_id,supplier_name_snapshot,supplier_url_snapshot,currency,merchandise_subtotal,eligible_subtotal,confirmed_discount,estimated_discount,post_discount_subtotal,shipping,shipping_state,vat,vat_state,import_vat,import_vat_state,customs,customs_state,handling,handling_state,known_minimum,confirmed_total,estimated_total,range_minimum,range_maximum,free_shipping_progress,warnings,freshness_states,assumption_snapshot)
        values(rd.workspace_id,uid,v_scenario_id,basket_record.supplier_id,basket_record.legal_name,basket_record.website_url,basket_record.currency,merchandise,eligible,confirmed_discount,estimated_discount,post_discount,shipping_amount,shipping_semantic,null,tax_semantic,null,case when tax_semantic='import_verification_required' then 'import_verification_required' else 'not_applicable' end,null,duty_semantic,null,'unknown',known,confirmed,estimated,coalesce(shipping_row.estimate_min,known),case when shipping_row.estimate_max is null then null else post_discount+shipping_row.estimate_max end,jsonb_build_object('threshold',shipping_row.free_shipping_threshold,'basis',shipping_row.threshold_basis,'subtotal',case shipping_row.threshold_basis when 'pre_discount' then merchandise else post_discount end),basket_warnings,jsonb_build_object('shipping',case when age_days is null then 'unknown' when age_days<=30 then 'current' when age_days<=90 then 'aging' else 'stale' end,'discount',case when discount_row.verified_at is null then 'unknown' when discount_row.verified_at>=now()-interval '30 days' then 'current' when discount_row.verified_at>=now()-interval '90 days' then 'aging' else 'stale' end),jsonb_build_object('discount',to_jsonb(discount_row),'shipping',to_jsonb(shipping_row),'tax',jsonb_build_object('state',tax_semantic),'import',jsonb_build_object('state',duty_semantic),'unknownComponents',unknowns))
        returning id into v_basket_id;
        for line_record in
          select r.*,m.revision selection_revision,m.estimated_package_count,m.expected_purchased_quantity,m.expected_surplus,m.warnings selection_warnings,sp.id supplier_product_id,sp.product_name,sp.product_url,sp.package_quantity,sp.package_unit,sp.moq,sp.price,sp.currency
          from public.production_procurement_requirements r join public.production_requirement_supplier_matches m on m.workspace_id=r.workspace_id and m.requirement_id=r.id
          join public.supplier_products sp on sp.workspace_id=r.workspace_id and sp.id=m.selected_supplier_product_id
          where r.workspace_id=rd.workspace_id and r.round_id=rd.id and sp.supplier_id=basket_record.supplier_id and sp.currency=basket_record.currency order by r.ingredient_name_snapshot,r.id
        loop
          insert into public.production_procurement_scenario_lines(workspace_id,owner_id,scenario_id,basket_id,requirement_id,supplier_product_id,supplier_product_name_snapshot,product_url_snapshot,ingredient_id,ingredient_name_snapshot,required_quantity,required_unit,package_size,package_unit,package_count,moq_adjusted_count,purchased_quantity,surplus,unit_price,currency,merchandise_line_total,discount_eligibility,allocated_discount,allocated_shipping,effective_landed_cost,effective_cost_per_required_unit,uncertainty,warnings,source_selection_revision,assumption_snapshot)
          values(rd.workspace_id,uid,v_scenario_id,v_basket_id,line_record.id,line_record.supplier_product_id,line_record.product_name,line_record.product_url,line_record.ingredient_id,line_record.ingredient_name_snapshot,(select purchasing_gap from public.production_procurement_inventory_gaps where workspace_id=rd.workspace_id and requirement_id=line_record.id),line_record.purchasing_unit,line_record.package_quantity,line_record.package_unit,line_record.estimated_package_count,greatest(line_record.estimated_package_count,ceil(coalesce(line_record.moq,1))::integer),line_record.expected_purchased_quantity,line_record.expected_surplus,line_record.price,line_record.currency,line_record.estimated_package_count*line_record.price,case when discount_row.id is null then 'none' when confirmed_discount>0 then 'confirmed' when estimated_discount>0 then 'potential' else 'ineligible' end,case when merchandise>0 then confirmed_discount*(line_record.estimated_package_count*line_record.price/merchandise) else 0 end,case when shipping_amount is not null and merchandise>0 then shipping_amount*(line_record.estimated_package_count*line_record.price/merchandise) end,case when shipping_amount is not null then line_record.estimated_package_count*line_record.price+shipping_amount*(line_record.estimated_package_count*line_record.price/merchandise)-confirmed_discount*(line_record.estimated_package_count*line_record.price/merchandise) end,case when shipping_amount is not null then (line_record.estimated_package_count*line_record.price+shipping_amount*(line_record.estimated_package_count*line_record.price/merchandise)-confirmed_discount*(line_record.estimated_package_count*line_record.price/merchandise))/(select purchasing_gap from public.production_procurement_inventory_gaps where workspace_id=rd.workspace_id and requirement_id=line_record.id) end,unknowns,line_record.selection_warnings,line_record.selection_revision,jsonb_build_object('supplierProductUpdatedAt',(select updated_at from public.supplier_products where workspace_id=rd.workspace_id and id=line_record.supplier_product_id),'selectionRevision',line_record.selection_revision));
        end loop;
      end loop;
    end if;
    select count(*),coalesce(sum(cardinality(warnings)),0),coalesce(sum(cardinality(uncertainty)),0),coalesce(sum(surplus*unit_price/nullif(purchased_quantity,0)),0) into warning_total,stale_total,missing_count,known
      from public.production_procurement_scenario_lines where workspace_id=rd.workspace_id and scenario_id=v_scenario_id;
    select count(distinct currency),coalesce(jsonb_object_agg(currency,total), '{}') into currency_count,original_totals from(select currency,sum(known_minimum) total from public.production_procurement_scenario_baskets where workspace_id=rd.workspace_id and scenario_id=v_scenario_id group by currency)x;
    update public.production_procurement_scenarios s set supplier_count=(select count(*) from public.production_procurement_scenario_baskets b where b.workspace_id=rd.workspace_id and b.scenario_id=s.id),line_count=(select count(*) from public.production_procurement_scenario_lines l where l.workspace_id=rd.workspace_id and l.scenario_id=s.id),warning_count=coalesce(warning_total,0),blocker_count=case when s.feasibility='incomplete' then missing_requirements else 0 end,stale_data_count=coalesce(stale_total,0),mixed_currency=coalesce(currency_count,0)>1,original_currency_totals=coalesce(original_totals,'{}'),total_known_minimum=case when coalesce(currency_count,0)=1 then(select sum(known_minimum) from public.production_procurement_scenario_baskets b where b.workspace_id=rd.workspace_id and b.scenario_id=s.id) end,total_confirmed=case when coalesce(currency_count,0)=1 and not exists(select 1 from public.production_procurement_scenario_baskets b where b.workspace_id=rd.workspace_id and b.scenario_id=s.id and b.confirmed_total is null) then(select sum(confirmed_total) from public.production_procurement_scenario_baskets b where b.workspace_id=rd.workspace_id and b.scenario_id=s.id) end,total_estimated=case when coalesce(currency_count,0)=1 and not exists(select 1 from public.production_procurement_scenario_baskets b where b.workspace_id=rd.workspace_id and b.scenario_id=s.id and b.estimated_total is null) then(select sum(estimated_total) from public.production_procurement_scenario_baskets b where b.workspace_id=rd.workspace_id and b.scenario_id=s.id) end,unknown_commercial_components=(select coalesce(array_agg(distinct u),'{}') from public.production_procurement_scenario_lines l cross join unnest(l.uncertainty)u where l.workspace_id=rd.workspace_id and l.scenario_id=s.id),ranking_score=case strategy_name when 'fewest_suppliers' then supplier_count*1000000000+coalesce(total_known_minimum,100000000) when 'lowest_risk' then missing_count*1000000000+stale_data_count*100000000+coalesce(total_known_minimum,100000000) else coalesce(total_known_minimum,100000000)+missing_count*5000 end where s.id=v_scenario_id;
  end loop;
  update public.production_procurement_rounds set revision=revision+1,updated_at=now() where id=rd.id;
  return rd.revision+1;
end $$;

create function public.publish_production_procurement_scenario(target_scenario_id uuid,expected_scenario_revision bigint,expected_round_revision bigint)
returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); s public.production_procurement_scenarios; rd public.production_procurement_rounds;
begin
 if uid is null then raise exception 'AUTHENTICATION_REQUIRED';end if;
 select * into s from public.production_procurement_scenarios where id=target_scenario_id and owner_id=uid for update;
 if s.id is null then raise exception 'SCENARIO_UNAVAILABLE';end if;
 select * into rd from public.production_procurement_rounds where workspace_id=s.workspace_id and id=s.round_id and owner_id=uid for update;
 if rd.revision<>expected_round_revision then raise exception 'STALE_ROUND_REVISION';end if;
 if s.revision<>expected_scenario_revision then raise exception 'STALE_SCENARIO_REVISION';end if;
 if s.status='published' then return rd.revision;end if;
 if s.feasibility not in('complete','complete_with_warnings') then raise exception 'INCOMPLETE_SCENARIO';end if;
 update public.production_procurement_scenarios set status='published',published_at=now(),published_by=uid,revision=revision+1,updated_at=now() where id=s.id;
 update public.production_procurement_rounds set revision=revision+1,updated_at=now() where id=rd.id;
 return rd.revision+1;
end $$;

create function public.delete_draft_production_procurement_scenario(target_scenario_id uuid,expected_scenario_revision bigint,expected_round_revision bigint)
returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); s public.production_procurement_scenarios; rd public.production_procurement_rounds;
begin
 if uid is null then raise exception 'AUTHENTICATION_REQUIRED';end if;
 select * into s from public.production_procurement_scenarios where id=target_scenario_id and owner_id=uid for update;
 if s.id is null then raise exception 'SCENARIO_UNAVAILABLE';end if;
 select * into rd from public.production_procurement_rounds where workspace_id=s.workspace_id and id=s.round_id and owner_id=uid for update;
 if rd.revision<>expected_round_revision then raise exception 'STALE_ROUND_REVISION';end if;
 if s.revision<>expected_scenario_revision then raise exception 'STALE_SCENARIO_REVISION';end if;
 if s.status='published' then raise exception 'PUBLISHED_SCENARIO_IMMUTABLE';end if;
 delete from public.production_procurement_scenarios where id=s.id;
 update public.production_procurement_rounds set revision=revision+1,updated_at=now() where id=rd.id;
 return rd.revision+1;
end $$;

revoke all on function public.generate_production_procurement_scenarios(uuid,bigint) from public,anon;
revoke all on function public.publish_production_procurement_scenario(uuid,bigint,bigint) from public,anon;
revoke all on function public.delete_draft_production_procurement_scenario(uuid,bigint,bigint) from public,anon;
grant execute on function public.generate_production_procurement_scenarios(uuid,bigint) to authenticated;
grant execute on function public.publish_production_procurement_scenario(uuid,bigint,bigint) to authenticated;
grant execute on function public.delete_draft_production_procurement_scenario(uuid,bigint,bigint) to authenticated;
