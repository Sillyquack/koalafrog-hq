-- Owner-authored Draft Purchase Plans.
-- Draft authoring is distinct from scenario approval and external Purchase Orders.

alter table public.purchase_plans
  add column placement_state text not null default 'unplaced',
  add column order_authorized boolean not null default false,
  add column target_budget numeric,
  add column absolute_stop numeric,
  add column credible_range_minimum numeric,
  add column credible_range_maximum numeric,
  add column worst_credible_range_minimum numeric,
  add column worst_credible_range_maximum numeric,
  add column commercial_checked_at timestamptz,
  add column draft_payload_fingerprint text,
  add column draft_authoring_version text,
  add constraint purchase_plans_placement_state_check check (
    placement_state is null or placement_state in ('unplaced')
  ),
  add constraint purchase_plans_draft_authority_check check (
    status <> 'draft' or (placement_state = 'unplaced' and order_authorized = false)
  ),
  add constraint purchase_plans_budget_gate_check check (
    num_nonnulls(target_budget,absolute_stop) in (0,2)
    and (target_budget is null or (target_budget > 0 and absolute_stop >= target_budget))
  ),
  add constraint purchase_plans_credible_range_check check (
    num_nonnulls(credible_range_minimum,credible_range_maximum) in (0,2)
    and (credible_range_minimum is null or (
      credible_range_minimum >= 0 and credible_range_maximum >= credible_range_minimum
    ))
  ),
  add constraint purchase_plans_worst_credible_range_check check (
    num_nonnulls(worst_credible_range_minimum,worst_credible_range_maximum) in (0,2)
    and (worst_credible_range_minimum is null or (
      worst_credible_range_minimum >= 0 and worst_credible_range_maximum >= worst_credible_range_minimum
    ))
  ),
  add constraint purchase_plans_draft_fingerprint_check check (
    draft_payload_fingerprint is null or draft_payload_fingerprint ~ '^[0-9a-f]{64}$'
  );

create unique index purchase_plans_active_draft_normalized_title_unique
  on public.purchase_plans(
    workspace_id,
    owner_id,
    lower(regexp_replace(title,'^[[:space:]]+|[[:space:]]+$','','g'))
  )
  where status='draft' and source_type='owner_authored_draft_v1';

comment on index public.purchase_plans_active_draft_normalized_title_unique is
  'One active owner-authored Draft title per owner workspace after surrounding-whitespace trimming and case folding.';

alter table public.purchase_plan_baskets
  alter column merchandise_subtotal drop not null,
  alter column eligible_subtotal drop not null,
  alter column confirmed_discount drop not null,
  alter column estimated_discount drop not null,
  alter column post_discount_subtotal drop not null,
  alter column known_minimum drop not null,
  add column vat_adjustment numeric,
  add column dangerous_goods_fee numeric,
  add column payment_fx numeric,
  add column commercial_checked_at timestamptz,
  add constraint purchase_plan_baskets_dangerous_goods_check check (
    dangerous_goods_fee is null or dangerous_goods_fee >= 0
  ),
  add constraint purchase_plan_baskets_payment_fx_check check (
    payment_fx is null or payment_fx >= 0
  );

alter table public.purchase_plan_lines
  add column source_kind text,
  add column source_record_id text,
  add column packaging_component_id text,
  add column supplier_sku_snapshot text,
  add column commercial_checked_at timestamptz,
  add column commercial_evidence_snapshot jsonb not null default '{}'
    check (jsonb_typeof(commercial_evidence_snapshot) = 'object'),
  add constraint purchase_plan_lines_source_kind_check check (
    source_kind is null or source_kind in (
      'supplier_product','packaging_supplier_product','packaging_component','manual','scenario_snapshot','legacy'
    )
  ),
  add constraint purchase_plan_lines_packaging_component_fk
    foreign key (workspace_id,packaging_component_id)
    references public.packaging_components(workspace_id,id);

comment on column public.purchase_plans.placement_state is
  'Owner-authored Draft plans are explicitly unplaced. External placement remains canonical on Purchase Orders.';
comment on column public.purchase_plans.order_authorized is
  'False for owner-authored Draft plans. This field does not replace checkout verification or Purchase Order controls.';
comment on column public.purchase_plan_baskets.dangerous_goods_fee is
  'Nullable planning fact. Null means Unknown and must never be rewritten as zero.';
comment on column public.purchase_plan_baskets.payment_fx is
  'Nullable planning fact. Null means Unknown and must never be rewritten as zero.';
comment on column public.purchase_plan_lines.commercial_evidence_snapshot is
  'Selected commercial evidence only; it has no receipt, ownership, or inventory meaning.';

-- Draft creation is aggregate-only. Remove the legacy header-only browser insert path.
drop policy if exists owner_insert_draft on public.purchase_plans;
revoke all privileges
  on table public.purchase_plans,public.purchase_plan_baskets,public.purchase_plan_lines
  from PUBLIC,anon,authenticated;
grant select
  on table public.purchase_plans,public.purchase_plan_baskets,public.purchase_plan_lines
  to authenticated;

create function public.kf_draft_optional_numeric_v1(candidate jsonb, field_name text)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
begin
  if not (candidate ? field_name) or candidate->field_name = 'null'::jsonb then
    return null;
  end if;
  if jsonb_typeof(candidate->field_name) <> 'number' then
    raise exception 'DRAFT_NUMERIC_INVALID:%', field_name;
  end if;
  return (candidate->>field_name)::numeric;
end
$$;

create function public.kf_draft_plan_receipt_bundle_v1(target_plan_id uuid, candidate_operation text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'schemaVersion', 1,
    'operation', candidate_operation,
    'plan', jsonb_build_object(
      'schemaVersion', 1,
      'entityType', 'purchase_plan',
      'recordId', p.id,
      'workspaceId', p.workspace_id,
      'operation', candidate_operation,
      'persistedAt', p.created_at,
      'naturalIdentity', jsonb_build_object('title', p.title),
      'status', p.status,
      'placementState', p.placement_state,
      'orderAuthorized', p.order_authorized
    ),
    'baskets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'schemaVersion', 1,
        'entityType', 'purchase_plan_basket',
        'recordId', b.id,
        'workspaceId', b.workspace_id,
        'operation', candidate_operation,
        'persistedAt', b.created_at,
        'naturalIdentity', jsonb_build_object(
          'purchase_plan_id', b.purchase_plan_id,
          'supplier_id', b.supplier_id,
          'currency', b.currency
        ),
        'parentPlanId', b.purchase_plan_id,
        'supplierId', b.supplier_id,
        'currency', b.currency
      ) order by b.supplier_name_snapshot,b.currency,b.id)
      from public.purchase_plan_baskets b
      where b.workspace_id=p.workspace_id and b.purchase_plan_id=p.id
    ), '[]'::jsonb),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'recordId', l.id,
        'workspaceId', l.workspace_id,
        'parentPlanId', l.purchase_plan_id,
        'parentBasketId', l.purchase_plan_basket_id,
        'sourceKind', l.source_kind,
        'sourceRecordId', l.source_record_id,
        'sku', l.supplier_sku_snapshot,
        'packageQuantity', l.pack_size,
        'packageUnit', l.unit,
        'purchaseQuantity', l.pack_count,
        'persistedAt', l.created_at
      ) order by b.supplier_name_snapshot,b.currency,l.display_order,l.id)
      from public.purchase_plan_lines l
      join public.purchase_plan_baskets b
        on b.workspace_id=l.workspace_id and b.id=l.purchase_plan_basket_id
      where l.workspace_id=p.workspace_id and l.purchase_plan_id=p.id
    ), '[]'::jsonb)
  )
  from public.purchase_plans p
  where p.id=target_plan_id
$$;

create function public.create_draft_purchase_plan_v1(
  candidate_workspace_id uuid,
  candidate_idempotency_key uuid,
  candidate_plan jsonb,
  candidate_baskets jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  existing_plan public.purchase_plans;
  plan_id uuid;
  payload_fingerprint text;
  plan_title text;
  plan_purpose text;
  plan_currency text;
  plan_checked_at timestamptz;
  plan_target_date date;
  plan_target_budget numeric;
  plan_absolute_stop numeric;
  plan_credible_min numeric;
  plan_credible_max numeric;
  plan_worst_min numeric;
  plan_worst_max numeric;
  plan_merchandise numeric;
  plan_known_minimum numeric;
  plan_landed_total numeric;
  basket jsonb;
  basket_id uuid;
  basket_supplier_id uuid;
  basket_supplier public.suppliers;
  basket_currency text;
  basket_checked_at timestamptz;
  basket_list numeric;
  basket_discount numeric;
  basket_post_discount numeric;
  basket_shipping numeric;
  basket_vat_adjustment numeric;
  basket_import_vat numeric;
  basket_duty numeric;
  basket_dangerous numeric;
  basket_handling numeric;
  basket_payment_fx numeric;
  basket_known_minimum numeric;
  basket_confirmed_total numeric;
  basket_line_sum numeric;
  line jsonb;
  line_id uuid;
  line_source_kind text;
  line_source_record_id text;
  line_domain text;
  line_title text;
  line_sku text;
  line_package_quantity numeric;
  line_purchase_quantity numeric;
  line_unit_price numeric;
  line_total numeric;
  line_currency text;
  line_checked_at timestamptz;
  line_url text;
  line_display_order integer;
  unknown_count integer;
  basket_line_unknown boolean;
  violated_constraint text;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if candidate_workspace_id is null or not exists(
    select 1 from public.workspaces w
    where w.id=candidate_workspace_id and w.owner_id=uid and w.lifecycle_state='active'
  ) then raise exception 'WORKSPACE_UNAVAILABLE'; end if;
  if candidate_idempotency_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  if candidate_plan is null or jsonb_typeof(candidate_plan) is distinct from 'object' then
    raise exception 'DRAFT_PLAN_INVALID';
  end if;
  if candidate_baskets is null or jsonb_typeof(candidate_baskets) is distinct from 'array' then
    raise exception 'DRAFT_BASKETS_REQUIRED';
  end if;
  if jsonb_array_length(candidate_baskets)=0 then
    raise exception 'DRAFT_BASKETS_REQUIRED';
  end if;
  if candidate_plan ?| array['workspaceId','ownerId','status','placementState','orderAuthorized','externalOrderId'] then
    raise exception 'DRAFT_AUTHORITY_FIELDS_FORBIDDEN';
  end if;

  payload_fingerprint := encode(extensions.digest(
    jsonb_build_object('plan',candidate_plan,'baskets',candidate_baskets)::text,
    'sha256'
  ), 'hex');

  -- Serialize retries for one owner-workspace idempotency key so a concurrent
  -- network retry deterministically reaches the reuse/conflict branch.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      candidate_workspace_id::text||':'||candidate_idempotency_key::text,
      0
    )
  );

  select * into existing_plan
  from public.purchase_plans p
  where p.workspace_id=candidate_workspace_id and p.creation_key=candidate_idempotency_key
  for update;
  if found then
    if existing_plan.owner_id<>uid or existing_plan.source_type is distinct from 'owner_authored_draft_v1'
      or existing_plan.draft_payload_fingerprint is distinct from payload_fingerprint then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return public.kf_draft_plan_receipt_bundle_v1(existing_plan.id,'reused');
  end if;

  if (candidate_plan ? 'title' and jsonb_typeof(candidate_plan->'title') is distinct from 'string')
    or (candidate_plan ? 'purpose' and jsonb_typeof(candidate_plan->'purpose') is distinct from 'string')
    or (candidate_plan ? 'baseCurrency' and jsonb_typeof(candidate_plan->'baseCurrency') is distinct from 'string')
    or (candidate_plan ? 'notes' and jsonb_typeof(candidate_plan->'notes') is distinct from 'string')
    or (candidate_plan ? 'checkedAt' and jsonb_typeof(candidate_plan->'checkedAt') is distinct from 'string')
    or (candidate_plan ? 'targetDate' and candidate_plan->'targetDate'<>'null'::jsonb
      and jsonb_typeof(candidate_plan->'targetDate') is distinct from 'string') then
    raise exception 'DRAFT_PLAN_INVALID';
  end if;
  plan_title := nullif(regexp_replace(candidate_plan->>'title','^[[:space:]]+|[[:space:]]+$','','g'),'');
  plan_purpose := nullif(trim(candidate_plan->>'purpose'),'');
  plan_currency := upper(nullif(trim(candidate_plan->>'baseCurrency'),''));
  if plan_title is null then raise exception 'DRAFT_PLAN_TITLE_REQUIRED'; end if;
  if plan_purpose is null then raise exception 'DRAFT_PLAN_PURPOSE_REQUIRED'; end if;
  if plan_currency is null or plan_currency !~ '^[A-Z]{3}$' then raise exception 'DRAFT_PLAN_CURRENCY_INVALID'; end if;
  if exists(
    select 1 from public.purchase_plans p
    where p.workspace_id=candidate_workspace_id
      and p.owner_id=uid
      and p.status='draft'
      and p.source_type='owner_authored_draft_v1'
      and lower(regexp_replace(p.title,'^[[:space:]]+|[[:space:]]+$','','g'))=lower(plan_title)
  ) then raise exception 'DRAFT_PURCHASE_PLAN_IDENTITY_CONFLICT'; end if;
  if candidate_plan ? 'evidence' and jsonb_typeof(candidate_plan->'evidence') is distinct from 'object' then
    raise exception 'DRAFT_PLAN_EVIDENCE_INVALID';
  end if;

  -- Validate aggregate shape before any INSERT so malformed nested input has a
  -- stable application error rather than a generic jsonb iterator failure.
  for basket in select value from jsonb_array_elements(candidate_baskets) loop
    if jsonb_typeof(basket) is distinct from 'object' then
      raise exception 'DRAFT_BASKET_INVALID';
    end if;
    if basket ?| array['id','workspaceId','ownerId','purchasePlanId'] then
      raise exception 'DRAFT_BASKET_INVALID';
    end if;
    if not (basket ? 'lines')
      or jsonb_typeof(basket->'lines') is distinct from 'array' then
      raise exception 'DRAFT_BASKET_LINES_REQUIRED';
    end if;
    if jsonb_array_length(basket->'lines')=0 then
      raise exception 'DRAFT_BASKET_LINES_REQUIRED';
    end if;
    if not (basket ? 'supplierId')
      or jsonb_typeof(basket->'supplierId') is distinct from 'string' then
      raise exception 'DRAFT_BASKET_SUPPLIER_INVALID';
    end if;
    if not (basket ? 'currency')
      or jsonb_typeof(basket->'currency') is distinct from 'string' then
      raise exception 'DRAFT_BASKET_CURRENCY_INVALID';
    end if;
    if not (basket ? 'checkedAt')
      or jsonb_typeof(basket->'checkedAt') is distinct from 'string' then
      raise exception 'DRAFT_BASKET_CHECKED_AT_INVALID';
    end if;
    if basket ? 'evidence' and jsonb_typeof(basket->'evidence') is distinct from 'object' then
      raise exception 'DRAFT_BASKET_EVIDENCE_INVALID';
    end if;
    if basket ? 'warnings' then
      if jsonb_typeof(basket->'warnings') is distinct from 'array' then
        raise exception 'DRAFT_BASKET_WARNINGS_INVALID';
      end if;
      if exists(
        select 1 from jsonb_array_elements(basket->'warnings') as warning(value)
        where jsonb_typeof(warning.value) is distinct from 'string'
      ) then raise exception 'DRAFT_BASKET_WARNINGS_INVALID'; end if;
    end if;

    begin basket_supplier_id := (basket->>'supplierId')::uuid;
    exception when others then raise exception 'DRAFT_BASKET_SUPPLIER_INVALID'; end;
    select * into basket_supplier from public.suppliers s
    where s.workspace_id=candidate_workspace_id and s.id=basket_supplier_id and s.owner_id=uid;
    if not found then raise exception 'DRAFT_BASKET_SUPPLIER_UNAVAILABLE'; end if;
    basket_currency := upper(nullif(trim(basket->>'currency'),''));
    if basket_currency is null or basket_currency!~'^[A-Z]{3}$' then
      raise exception 'DRAFT_BASKET_CURRENCY_INVALID';
    end if;
    begin basket_checked_at := (basket->>'checkedAt')::timestamptz;
    exception when others then raise exception 'DRAFT_BASKET_CHECKED_AT_INVALID'; end;
    if basket_checked_at is null then raise exception 'DRAFT_BASKET_CHECKED_AT_INVALID'; end if;

    basket_list := public.kf_draft_optional_numeric_v1(basket,'listSubtotal');
    basket_discount := public.kf_draft_optional_numeric_v1(basket,'verifiedDiscount');
    basket_post_discount := public.kf_draft_optional_numeric_v1(basket,'postDiscountSubtotal');
    basket_shipping := public.kf_draft_optional_numeric_v1(basket,'shipping');
    basket_vat_adjustment := public.kf_draft_optional_numeric_v1(basket,'vatAdjustment');
    basket_import_vat := public.kf_draft_optional_numeric_v1(basket,'importVat');
    basket_duty := public.kf_draft_optional_numeric_v1(basket,'duty');
    basket_dangerous := public.kf_draft_optional_numeric_v1(basket,'dangerousGoodsFee');
    basket_handling := public.kf_draft_optional_numeric_v1(basket,'brokerageHandling');
    basket_payment_fx := public.kf_draft_optional_numeric_v1(basket,'paymentFx');
    basket_known_minimum := public.kf_draft_optional_numeric_v1(basket,'knownMinimum');
    if basket_list<0 or basket_discount<0 or basket_post_discount<0 or basket_shipping<0 or basket_import_vat<0
      or basket_duty<0 or basket_dangerous<0 or basket_handling<0 or basket_payment_fx<0 or basket_known_minimum<0 then
      raise exception 'DRAFT_BASKET_COST_INVALID';
    end if;
    if basket_list is not null and basket_discount is not null and basket_discount>basket_list then
      raise exception 'DRAFT_BASKET_DISCOUNT_INVALID';
    end if;
    if basket_post_discount is not null and (basket_list is null or basket_discount is null
      or abs(basket_post_discount-(basket_list-basket_discount))>0.01) then
      raise exception 'DRAFT_BASKET_POST_DISCOUNT_INVALID';
    end if;
    basket_confirmed_total := null;
    if basket_post_discount is not null and basket_shipping is not null and basket_vat_adjustment is not null
      and basket_import_vat is not null and basket_duty is not null and basket_dangerous is not null
      and basket_handling is not null and basket_payment_fx is not null then
      basket_confirmed_total := basket_post_discount+basket_shipping+basket_vat_adjustment+basket_import_vat+
        basket_duty+basket_dangerous+basket_handling+basket_payment_fx;
      if basket_confirmed_total<0 then raise exception 'DRAFT_BASKET_TOTAL_INVALID'; end if;
    end if;

    basket_line_sum := 0;
    basket_line_unknown := false;
    for line in select value from jsonb_array_elements(basket->'lines') loop
      if jsonb_typeof(line) is distinct from 'object' then
        raise exception 'DRAFT_LINE_INVALID';
      end if;
      if line ?| array['id','workspaceId','ownerId','purchasePlanId','basketId'] then
        raise exception 'DRAFT_LINE_INVALID';
      end if;
      if line ? 'evidence' and jsonb_typeof(line->'evidence') is distinct from 'object' then
        raise exception 'DRAFT_LINE_EVIDENCE_INVALID';
      end if;
      if not (line ? 'sourceKind')
        or jsonb_typeof(line->'sourceKind') is distinct from 'string' then
        raise exception 'DRAFT_LINE_SOURCE_KIND_INVALID';
      end if;
      if not (line ? 'sourceDomain')
        or jsonb_typeof(line->'sourceDomain') is distinct from 'string' then
        raise exception 'DRAFT_LINE_DOMAIN_INVALID';
      end if;
      if not (line ? 'productTitle')
        or jsonb_typeof(line->'productTitle') is distinct from 'string' then
        raise exception 'DRAFT_LINE_TITLE_REQUIRED';
      end if;
      if not (line ? 'packageUnit')
        or jsonb_typeof(line->'packageUnit') is distinct from 'string' then
        raise exception 'DRAFT_LINE_PACKAGE_INVALID';
      end if;
      if not (line ? 'currency')
        or jsonb_typeof(line->'currency') is distinct from 'string' then
        raise exception 'DRAFT_LINE_CURRENCY_INVALID';
      end if;
      if not (line ? 'checkedAt')
        or jsonb_typeof(line->'checkedAt') is distinct from 'string' then
        raise exception 'DRAFT_LINE_CHECKED_AT_INVALID';
      end if;
      if line ? 'sourceRecordId' and line->'sourceRecordId'<>'null'::jsonb
        and jsonb_typeof(line->'sourceRecordId') is distinct from 'string' then
        raise exception 'DRAFT_LINE_SOURCE_REQUIRED';
      end if;
      if line ? 'sku' and line->'sku'<>'null'::jsonb
        and jsonb_typeof(line->'sku') is distinct from 'string' then
        raise exception 'DRAFT_LINE_INVALID';
      end if;
      if line ? 'sourceUrl' and line->'sourceUrl'<>'null'::jsonb
        and jsonb_typeof(line->'sourceUrl') is distinct from 'string' then
        raise exception 'DRAFT_LINE_SOURCE_URL_INVALID';
      end if;

      line_source_kind := nullif(trim(line->>'sourceKind'),'');
      line_source_record_id := nullif(trim(line->>'sourceRecordId'),'');
      line_domain := nullif(trim(line->>'sourceDomain'),'');
      line_title := nullif(trim(line->>'productTitle'),'');
      line_currency := upper(nullif(trim(line->>'currency'),''));
      line_url := nullif(trim(line->>'sourceUrl'),'');
      if line_source_kind is null or line_source_kind not in ('supplier_product','packaging_supplier_product','packaging_component','manual') then
        raise exception 'DRAFT_LINE_SOURCE_KIND_INVALID';
      end if;
      if line_source_kind<>'manual' and line_source_record_id is null then
        raise exception 'DRAFT_LINE_SOURCE_REQUIRED';
      end if;
      if line_source_kind='manual' and line_source_record_id is not null then
        raise exception 'DRAFT_LINE_MANUAL_SOURCE_ID_FORBIDDEN';
      end if;
      if line_domain not in ('raw_material','packaging','equipment') then
        raise exception 'DRAFT_LINE_DOMAIN_INVALID';
      end if;
      if (line_source_kind='supplier_product' and line_domain<>'raw_material')
        or (line_source_kind in ('packaging_supplier_product','packaging_component') and line_domain<>'packaging') then
        raise exception 'DRAFT_LINE_SOURCE_DOMAIN_MISMATCH';
      end if;
      if line_title is null then raise exception 'DRAFT_LINE_TITLE_REQUIRED'; end if;
      if line_currency is null or line_currency!~'^[A-Z]{3}$' or line_currency<>basket_currency then
        raise exception 'DRAFT_LINE_CURRENCY_INVALID';
      end if;
      if line_url is not null and line_url!~'^https?://' then
        raise exception 'DRAFT_LINE_SOURCE_URL_INVALID';
      end if;

      line_package_quantity := public.kf_draft_optional_numeric_v1(line,'packageQuantity');
      line_purchase_quantity := public.kf_draft_optional_numeric_v1(line,'purchaseQuantity');
      line_unit_price := public.kf_draft_optional_numeric_v1(line,'unitPrice');
      line_total := public.kf_draft_optional_numeric_v1(line,'lineTotal');
      if line_package_quantity is null or line_package_quantity<=0
        or nullif(trim(line->>'packageUnit'),'') is null then
        raise exception 'DRAFT_LINE_PACKAGE_INVALID';
      end if;
      if line_purchase_quantity is null or line_purchase_quantity<=0 then
        raise exception 'DRAFT_LINE_QUANTITY_INVALID';
      end if;
      if line_unit_price<0 or line_total<0 then raise exception 'DRAFT_LINE_PRICE_INVALID'; end if;
      if (line_unit_price is null)<>(line_total is null)
        or (line_total is not null and abs(line_total-(line_unit_price*line_purchase_quantity))>0.01) then
        raise exception 'DRAFT_LINE_TOTAL_INVALID';
      end if;
      begin line_checked_at := (line->>'checkedAt')::timestamptz;
      exception when others then raise exception 'DRAFT_LINE_CHECKED_AT_INVALID'; end;
      if line_checked_at is null then raise exception 'DRAFT_LINE_CHECKED_AT_INVALID'; end if;

      if line_source_kind='supplier_product' and not exists(
        select 1 from public.supplier_products sp
        where sp.workspace_id=candidate_workspace_id and sp.id=line_source_record_id and sp.owner_id=uid
          and sp.supplier_id=basket_supplier_id
      ) then raise exception 'DRAFT_LINE_SOURCE_UNAVAILABLE'; end if;
      if line_source_kind='packaging_supplier_product' and not exists(
        select 1 from public.packaging_supplier_products sp
        where sp.workspace_id=candidate_workspace_id and sp.id=line_source_record_id and sp.owner_id=uid
          and sp.supplier_id=basket_supplier_id
      ) then raise exception 'DRAFT_LINE_SOURCE_UNAVAILABLE'; end if;
      if line_source_kind='packaging_component' and not exists(
        select 1 from public.packaging_components pc
        where pc.workspace_id=candidate_workspace_id and pc.id=line_source_record_id and pc.owner_id=uid
          and (pc.supplier_id is null or pc.supplier_id=basket_supplier_id)
      ) then raise exception 'DRAFT_LINE_SOURCE_UNAVAILABLE'; end if;

      if line_total is null then basket_line_unknown := true; end if;
      basket_line_sum := basket_line_sum+coalesce(line_total,0);
    end loop;
    if basket_list is not null and (basket_line_unknown or abs(basket_list-basket_line_sum)>0.01) then
      raise exception 'DRAFT_BASKET_LINE_TOTAL_MISMATCH';
    end if;
  end loop;
  if exists(
    select 1
    from jsonb_array_elements(candidate_baskets) b
    group by (b->>'supplierId')::uuid,upper(trim(b->>'currency'))
    having count(*)>1
  ) then raise exception 'DRAFT_BASKET_IDENTITY_CONFLICT'; end if;

  plan_target_budget := public.kf_draft_optional_numeric_v1(candidate_plan,'targetBudget');
  plan_absolute_stop := public.kf_draft_optional_numeric_v1(candidate_plan,'absoluteStop');
  plan_credible_min := public.kf_draft_optional_numeric_v1(candidate_plan,'credibleRangeMinimum');
  plan_credible_max := public.kf_draft_optional_numeric_v1(candidate_plan,'credibleRangeMaximum');
  plan_worst_min := public.kf_draft_optional_numeric_v1(candidate_plan,'worstCredibleRangeMinimum');
  plan_worst_max := public.kf_draft_optional_numeric_v1(candidate_plan,'worstCredibleRangeMaximum');
  plan_merchandise := public.kf_draft_optional_numeric_v1(candidate_plan,'knownMerchandiseTotal');
  plan_known_minimum := public.kf_draft_optional_numeric_v1(candidate_plan,'knownMinimum');
  plan_landed_total := public.kf_draft_optional_numeric_v1(candidate_plan,'estimatedLandedTotal');
  if plan_target_budget is null or plan_absolute_stop is null or plan_target_budget<=0 or plan_absolute_stop<plan_target_budget then
    raise exception 'DRAFT_PLAN_BUDGET_GATE_INVALID';
  end if;
  if (plan_credible_min is null)<>(plan_credible_max is null)
    or (plan_credible_min is not null and (plan_credible_min<0 or plan_credible_max<plan_credible_min)) then
    raise exception 'DRAFT_PLAN_CREDIBLE_RANGE_INVALID';
  end if;
  if (plan_worst_min is null)<>(plan_worst_max is null)
    or (plan_worst_min is not null and (plan_worst_min<0 or plan_worst_max<plan_worst_min)) then
    raise exception 'DRAFT_PLAN_WORST_RANGE_INVALID';
  end if;
  if (plan_merchandise is not null and plan_merchandise<0)
    or (plan_known_minimum is not null and plan_known_minimum<0)
    or (plan_landed_total is not null and plan_landed_total<0) then
    raise exception 'DRAFT_PLAN_TOTAL_INVALID';
  end if;
  begin plan_checked_at := (candidate_plan->>'checkedAt')::timestamptz;
  exception when others then raise exception 'DRAFT_PLAN_CHECKED_AT_INVALID'; end;
  if plan_checked_at is null then raise exception 'DRAFT_PLAN_CHECKED_AT_INVALID'; end if;
  if nullif(candidate_plan->>'targetDate','') is not null then
    begin plan_target_date := (candidate_plan->>'targetDate')::date;
    exception when others then raise exception 'DRAFT_PLAN_TARGET_DATE_INVALID'; end;
  end if;

  select count(*)::integer into unknown_count
  from jsonb_array_elements(candidate_baskets) b
  cross join unnest(array[
    'postDiscountSubtotal','shipping','vatAdjustment','importVat','duty',
    'dangerousGoodsFee','brokerageHandling','paymentFx'
  ]) field_name
  where not (b ? field_name) or b->field_name='null'::jsonb;
  unknown_count := unknown_count + (
    select count(*)::integer
    from jsonb_array_elements(candidate_baskets) b
    cross join lateral jsonb_array_elements(b->'lines') l
    where not (l ? 'unitPrice') or l->'unitPrice'='null'::jsonb
      or not (l ? 'lineTotal') or l->'lineTotal'='null'::jsonb
  );
  if unknown_count>0 and plan_landed_total is not null then
    raise exception 'DRAFT_PLAN_LANDED_TOTAL_REQUIRES_COMPLETE_COSTS';
  end if;

  begin
    insert into public.purchase_plans(
      workspace_id,owner_id,title,status,purpose,target_date,supplier_id,currency,source_type,source_id,internal_notes,
      estimated_merchandise_total,estimated_landed_total,revision,creation_key,production_procurement_round_id,source_scenario_id,
      plan_version,strategy,strategy_explanation,base_currency,mixed_currency,supplier_count,line_count,known_minimum,confirmed_total,
      range_minimum,range_maximum,unknown_component_count,warning_count,blocker_count,verification_revision,snapshot_version,source_snapshot,
      placement_state,order_authorized,target_budget,absolute_stop,credible_range_minimum,credible_range_maximum,
      worst_credible_range_minimum,worst_credible_range_maximum,commercial_checked_at,draft_payload_fingerprint,draft_authoring_version
    ) values(
      candidate_workspace_id,uid,plan_title,'draft',plan_purpose,plan_target_date,null,plan_currency,'owner_authored_draft_v1',null,
      coalesce(candidate_plan->>'notes',''),plan_merchandise,plan_landed_total,1,candidate_idempotency_key,null,null,
      1,'owner_authored_draft',array['Internal Draft only; no order is authorised.'],plan_currency,
      (select count(distinct upper(trim(b->>'currency')))>1 from jsonb_array_elements(candidate_baskets)b),
      jsonb_array_length(candidate_baskets),
      (select count(*) from jsonb_array_elements(candidate_baskets)b cross join lateral jsonb_array_elements(b->'lines')),
      plan_known_minimum,null,plan_credible_min,plan_credible_max,unknown_count,0,0,1,'draft-authoring-v1',
      jsonb_build_object('evidence',coalesce(candidate_plan->'evidence','{}'::jsonb),'checkedAt',plan_checked_at),
      'unplaced',false,plan_target_budget,plan_absolute_stop,plan_credible_min,plan_credible_max,
      plan_worst_min,plan_worst_max,plan_checked_at,payload_fingerprint,'1.0.0'
    ) returning id into plan_id;
  exception when unique_violation then
    get stacked diagnostics violated_constraint = CONSTRAINT_NAME;
    if violated_constraint='purchase_plans_active_draft_normalized_title_unique' then
      raise exception 'DRAFT_PURCHASE_PLAN_IDENTITY_CONFLICT';
    end if;
    raise;
  end;

  for basket in select value from jsonb_array_elements(candidate_baskets) loop
    if jsonb_typeof(basket) is distinct from 'object'
      or basket ?| array['id','workspaceId','ownerId','purchasePlanId'] then
      raise exception 'DRAFT_BASKET_INVALID';
    end if;
    begin basket_supplier_id := (basket->>'supplierId')::uuid;
    exception when others then raise exception 'DRAFT_BASKET_SUPPLIER_INVALID'; end;
    select * into basket_supplier from public.suppliers s
    where s.workspace_id=candidate_workspace_id and s.id=basket_supplier_id and s.owner_id=uid;
    if not found then raise exception 'DRAFT_BASKET_SUPPLIER_UNAVAILABLE'; end if;
    basket_currency := upper(nullif(trim(basket->>'currency'),''));
    if basket_currency is null or basket_currency!~'^[A-Z]{3}$' then raise exception 'DRAFT_BASKET_CURRENCY_INVALID'; end if;
    if jsonb_typeof(basket->'lines') is distinct from 'array' then
      raise exception 'DRAFT_BASKET_LINES_REQUIRED';
    end if;
    if jsonb_array_length(basket->'lines')=0 then
      raise exception 'DRAFT_BASKET_LINES_REQUIRED';
    end if;
    begin basket_checked_at := (basket->>'checkedAt')::timestamptz;
    exception when others then raise exception 'DRAFT_BASKET_CHECKED_AT_INVALID'; end;
    if basket_checked_at is null then raise exception 'DRAFT_BASKET_CHECKED_AT_INVALID'; end if;

    basket_list := public.kf_draft_optional_numeric_v1(basket,'listSubtotal');
    basket_discount := public.kf_draft_optional_numeric_v1(basket,'verifiedDiscount');
    basket_post_discount := public.kf_draft_optional_numeric_v1(basket,'postDiscountSubtotal');
    basket_shipping := public.kf_draft_optional_numeric_v1(basket,'shipping');
    basket_vat_adjustment := public.kf_draft_optional_numeric_v1(basket,'vatAdjustment');
    basket_import_vat := public.kf_draft_optional_numeric_v1(basket,'importVat');
    basket_duty := public.kf_draft_optional_numeric_v1(basket,'duty');
    basket_dangerous := public.kf_draft_optional_numeric_v1(basket,'dangerousGoodsFee');
    basket_handling := public.kf_draft_optional_numeric_v1(basket,'brokerageHandling');
    basket_payment_fx := public.kf_draft_optional_numeric_v1(basket,'paymentFx');
    basket_known_minimum := public.kf_draft_optional_numeric_v1(basket,'knownMinimum');
    if basket_list<0 or basket_discount<0 or basket_post_discount<0 or basket_shipping<0 or basket_import_vat<0
      or basket_duty<0 or basket_dangerous<0 or basket_handling<0 or basket_payment_fx<0 or basket_known_minimum<0 then
      raise exception 'DRAFT_BASKET_COST_INVALID';
    end if;
    if basket_list is not null and basket_discount is not null and basket_discount>basket_list then
      raise exception 'DRAFT_BASKET_DISCOUNT_INVALID';
    end if;
    if basket_post_discount is not null and (basket_list is null or basket_discount is null
      or abs(basket_post_discount-(basket_list-basket_discount))>0.01) then
      raise exception 'DRAFT_BASKET_POST_DISCOUNT_INVALID';
    end if;

    basket_confirmed_total := null;
    if basket_post_discount is not null and basket_shipping is not null and basket_vat_adjustment is not null
      and basket_import_vat is not null and basket_duty is not null and basket_dangerous is not null
      and basket_handling is not null and basket_payment_fx is not null then
      basket_confirmed_total := basket_post_discount+basket_shipping+basket_vat_adjustment+basket_import_vat+
        basket_duty+basket_dangerous+basket_handling+basket_payment_fx;
      if basket_confirmed_total<0 then raise exception 'DRAFT_BASKET_TOTAL_INVALID'; end if;
    end if;

    insert into public.purchase_plan_baskets(
      workspace_id,owner_id,purchase_plan_id,source_scenario_basket_id,supplier_id,supplier_name_snapshot,supplier_url_snapshot,currency,
      merchandise_subtotal,eligible_subtotal,confirmed_discount,estimated_discount,post_discount_subtotal,shipping,shipping_state,
      vat,vat_state,import_vat,import_vat_state,customs,customs_state,handling,handling_state,known_minimum,confirmed_total,estimated_total,
      range_minimum,range_maximum,free_shipping_state,first_order_discount_state,commercial_warnings,freshness_states,
      commercial_assumption_snapshot,source_calculation_version,vat_adjustment,dangerous_goods_fee,payment_fx,commercial_checked_at
    ) values(
      candidate_workspace_id,uid,plan_id,null,basket_supplier_id,coalesce(basket_supplier.trading_name,basket_supplier.legal_name),
      basket_supplier.website_url,basket_currency,basket_list,basket_list,basket_discount,null,basket_post_discount,
      basket_shipping,case when basket_shipping is null then 'unknown' else 'confirmed' end,
      null,case when basket_vat_adjustment is null then 'unknown' else 'confirmed' end,
      basket_import_vat,case when basket_import_vat is null then 'unknown' else 'confirmed' end,
      basket_duty,case when basket_duty is null then 'unknown' else 'confirmed' end,
      basket_handling,case when basket_handling is null then 'unknown' else 'confirmed' end,
      basket_known_minimum,basket_confirmed_total,null,null,null,'{}',
      jsonb_build_object('verifiedDiscount',basket_discount,'state',case when basket_discount is null then 'unknown' else 'confirmed' end),
      case when jsonb_typeof(basket->'warnings')='array' then array(select jsonb_array_elements_text(basket->'warnings')) else '{}'::text[] end,
      jsonb_build_object('checkedAt',basket_checked_at),coalesce(basket->'evidence','{}'::jsonb),'draft-authoring-v1',
      basket_vat_adjustment,basket_dangerous,basket_payment_fx,basket_checked_at
    ) returning id into basket_id;

    basket_line_sum := 0;
    basket_line_unknown := false;
    line_display_order := 0;
    for line in select value from jsonb_array_elements(basket->'lines') loop
      if jsonb_typeof(line) is distinct from 'object'
        or line ?| array['id','workspaceId','ownerId','purchasePlanId','basketId'] then
        raise exception 'DRAFT_LINE_INVALID';
      end if;
      line_source_kind := nullif(trim(line->>'sourceKind'),'');
      line_source_record_id := nullif(trim(line->>'sourceRecordId'),'');
      line_domain := nullif(trim(line->>'sourceDomain'),'');
      line_title := nullif(trim(line->>'productTitle'),'');
      line_sku := nullif(trim(line->>'sku'),'');
      line_currency := upper(nullif(trim(line->>'currency'),''));
      line_url := nullif(trim(line->>'sourceUrl'),'');
      if line_source_kind is null or line_source_kind not in ('supplier_product','packaging_supplier_product','packaging_component','manual') then
        raise exception 'DRAFT_LINE_SOURCE_KIND_INVALID';
      end if;
      if line_source_kind<>'manual' and line_source_record_id is null then raise exception 'DRAFT_LINE_SOURCE_REQUIRED'; end if;
      if line_source_kind='manual' and line_source_record_id is not null then raise exception 'DRAFT_LINE_MANUAL_SOURCE_ID_FORBIDDEN'; end if;
      if line_domain not in ('raw_material','packaging','equipment') then raise exception 'DRAFT_LINE_DOMAIN_INVALID'; end if;
      if (line_source_kind='supplier_product' and line_domain<>'raw_material')
        or (line_source_kind in ('packaging_supplier_product','packaging_component') and line_domain<>'packaging') then
        raise exception 'DRAFT_LINE_SOURCE_DOMAIN_MISMATCH';
      end if;
      if line_title is null then raise exception 'DRAFT_LINE_TITLE_REQUIRED'; end if;
      if line_currency is null or line_currency!~'^[A-Z]{3}$' or line_currency<>basket_currency then
        raise exception 'DRAFT_LINE_CURRENCY_INVALID';
      end if;
      if line_url is not null and line_url!~'^https?://' then raise exception 'DRAFT_LINE_SOURCE_URL_INVALID'; end if;
      line_package_quantity := public.kf_draft_optional_numeric_v1(line,'packageQuantity');
      line_purchase_quantity := public.kf_draft_optional_numeric_v1(line,'purchaseQuantity');
      line_unit_price := public.kf_draft_optional_numeric_v1(line,'unitPrice');
      line_total := public.kf_draft_optional_numeric_v1(line,'lineTotal');
      if line_package_quantity is null or line_package_quantity<=0 or nullif(trim(line->>'packageUnit'),'') is null then
        raise exception 'DRAFT_LINE_PACKAGE_INVALID';
      end if;
      if line_purchase_quantity is null or line_purchase_quantity<=0 then raise exception 'DRAFT_LINE_QUANTITY_INVALID'; end if;
      if line_unit_price<0 or line_total<0 then raise exception 'DRAFT_LINE_PRICE_INVALID'; end if;
      if (line_unit_price is null)<>(line_total is null)
        or (line_total is not null and abs(line_total-(line_unit_price*line_purchase_quantity))>0.01) then
        raise exception 'DRAFT_LINE_TOTAL_INVALID';
      end if;
      begin line_checked_at := (line->>'checkedAt')::timestamptz;
      exception when others then raise exception 'DRAFT_LINE_CHECKED_AT_INVALID'; end;
      if line_checked_at is null then raise exception 'DRAFT_LINE_CHECKED_AT_INVALID'; end if;

      if line_source_kind='supplier_product' and not exists(
        select 1 from public.supplier_products sp
        where sp.workspace_id=candidate_workspace_id and sp.id=line_source_record_id and sp.owner_id=uid and sp.supplier_id=basket_supplier_id
      ) then raise exception 'DRAFT_LINE_SOURCE_UNAVAILABLE'; end if;
      if line_source_kind='packaging_supplier_product' and not exists(
        select 1 from public.packaging_supplier_products sp
        where sp.workspace_id=candidate_workspace_id and sp.id=line_source_record_id and sp.owner_id=uid and sp.supplier_id=basket_supplier_id
      ) then raise exception 'DRAFT_LINE_SOURCE_UNAVAILABLE'; end if;
      if line_source_kind='packaging_component' and not exists(
        select 1 from public.packaging_components pc
        where pc.workspace_id=candidate_workspace_id and pc.id=line_source_record_id and pc.owner_id=uid
          and (pc.supplier_id is null or pc.supplier_id=basket_supplier_id)
      ) then raise exception 'DRAFT_LINE_SOURCE_UNAVAILABLE'; end if;

      insert into public.purchase_plan_lines(
        workspace_id,owner_id,purchase_plan_id,inventory_domain,supplier_product_id,description,planned_quantity,unit,pack_count,pack_size,
        estimated_unit_price,estimated_line_total,currency,requirement_reason,requirement_basis,display_order,purchase_plan_basket_id,
        supplier_product_name_snapshot,product_url_snapshot,purchased_quantity,documentation_state,source_snapshot,
        source_kind,source_record_id,packaging_component_id,supplier_sku_snapshot,commercial_checked_at,commercial_evidence_snapshot
      ) values(
        candidate_workspace_id,uid,plan_id,line_domain,
        case when line_source_kind in ('supplier_product','packaging_supplier_product') then line_source_record_id else null end,
        line_title,line_package_quantity*line_purchase_quantity,trim(line->>'packageUnit'),line_purchase_quantity,line_package_quantity,
        line_unit_price,line_total,line_currency,'Owner-authored Draft commercial snapshot',coalesce(line->'evidence','{}'::jsonb),
        line_display_order,basket_id,line_title,line_url,line_package_quantity*line_purchase_quantity,
        case when jsonb_typeof(line->'evidence'->'documentation')='object' then line->'evidence'->'documentation' else '{}'::jsonb end,
        coalesce(line->'evidence','{}'::jsonb),line_source_kind,line_source_record_id,
        case when line_source_kind='packaging_component' then line_source_record_id else null end,
        line_sku,line_checked_at,coalesce(line->'evidence','{}'::jsonb)
      ) returning id into line_id;
      line_display_order := line_display_order+1;
      if line_total is null then basket_line_unknown := true; end if;
      basket_line_sum := basket_line_sum+coalesce(line_total,0);
    end loop;
    if basket_list is not null and (basket_line_unknown or abs(basket_list-basket_line_sum)>0.01) then
      raise exception 'DRAFT_BASKET_LINE_TOTAL_MISMATCH';
    end if;
  end loop;

  return public.kf_draft_plan_receipt_bundle_v1(plan_id,'created');
end
$$;

revoke all on function public.kf_draft_optional_numeric_v1(jsonb,text) from public,anon,authenticated;
revoke all on function public.kf_draft_plan_receipt_bundle_v1(uuid,text) from public,anon,authenticated;
revoke all on function public.create_draft_purchase_plan_v1(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.create_draft_purchase_plan_v1(uuid,uuid,jsonb,jsonb) to authenticated;

comment on function public.create_draft_purchase_plan_v1(uuid,uuid,jsonb,jsonb) is
  'Atomically creates one owner-authored internal Draft Purchase Plan, its Supplier baskets, and line snapshots. It never creates a scenario, verification, Purchase Order, receipt, ownership, or inventory record.';
