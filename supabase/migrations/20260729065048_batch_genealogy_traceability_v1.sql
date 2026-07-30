-- Finished Goods & Batch Genealogy V1, Slice 6.
-- A bounded, read-only DAG reconstructed from existing immutable lifecycle links.

create index batch_material_consumptions_lot_trace_idx
  on public.batch_material_consumptions(workspace_id,inventory_lot_id,batch_kind,batch_id,consumed_at,id);
create index finished_goods_lots_production_trace_idx
  on public.finished_goods_lots(workspace_id,production_run_id,packaging_run_id,id);
create index finished_goods_lots_output_trace_idx
  on public.finished_goods_lots(workspace_id,production_output_id,id);

create function public.kf_traceability_inventory_impact_v1(target_workspace_id uuid,target_finished_goods_lot_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  return coalesce((select jsonb_agg(public.kf_finished_goods_inventory_snapshot_v1(target_workspace_id,r.id)
    order by r.released_at,r.id)
    from public.released_finished_goods_inventory_lots r
    where r.workspace_id=target_workspace_id and r.finished_goods_lot_id=target_finished_goods_lot_id),'[]'::jsonb);
end $$;

create function public.kf_finished_goods_backward_trace_v1(target_workspace_id uuid,target_finished_goods_lot_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare lot public.finished_goods_lots; pr public.packaging_runs; output public.production_outputs;
  raw_lots jsonb; packaging_lots jsonb; released jsonb; gaps jsonb:='[]'::jsonb; nodes jsonb; edges jsonb;
  confidence text:='complete'; evaluated timestamptz:=statement_timestamp();
begin
  select * into lot from public.finished_goods_lots where workspace_id=target_workspace_id and id=target_finished_goods_lot_id;
  if not found then raise exception 'TRACEABILITY_ROOT_NOT_FOUND'; end if;
  select * into pr from public.packaging_runs where workspace_id=target_workspace_id and id=lot.packaging_run_id;
  select * into output from public.production_outputs where workspace_id=target_workspace_id and id=lot.production_output_id;
  if pr.id is null then gaps:=gaps||jsonb_build_array(jsonb_build_object('expectedNodeType','packaging_run','parentId',lot.id,'state','missing_expected_link','severity','blocked','reason','Finished Goods Lot requires its Packaging Run.','policyVersion','1.0.0')); end if;
  if output.id is null then gaps:=gaps||jsonb_build_array(jsonb_build_object('expectedNodeType','production_output','parentId',lot.id,'state','missing_expected_link','severity','blocked','reason','Finished Goods Lot requires its Production Output.','policyVersion','1.0.0')); end if;
  if not exists(select 1 from public.batch_material_consumptions c where c.workspace_id=target_workspace_id and c.batch_kind='production' and c.batch_id=lot.production_run_id) then
    gaps:=gaps||jsonb_build_array(jsonb_build_object('expectedNodeType','raw_material_consumption','parentId',lot.production_run_id,'state','missing_expected_link','severity','blocked','reason','Completed production requires productive material consumption identity.','policyVersion','1.0.0'));
  end if;
  if not exists(select 1 from public.packaging_run_inventory_uses u where u.workspace_id=target_workspace_id and u.packaging_run_id=lot.packaging_run_id and u.use_type='consumption') then
    gaps:=gaps||jsonb_build_array(jsonb_build_object('expectedNodeType','packaging_consumption','parentId',lot.packaging_run_id,'state','missing_expected_link','severity','blocked','reason','Completed packaging requires packaging-lot consumption identity.','policyVersion','1.0.0'));
  end if;
  select coalesce(jsonb_agg(item order by consumed_at,lot_id),'[]'::jsonb) into raw_lots from (
    select l.id lot_id,min(c.consumed_at) consumed_at,jsonb_build_object(
      'nodeType','raw_material_inventory_lot','immutableId',l.id,'historicalLabel',l.internal_lot_number,
      'currentLabel',l.internal_lot_number,'lifecycleStatus',l.status,'quantity',sum(c.consumed_quantity),'unit',min(c.unit),
      'actor',min(c.actor_id::text),'timestamp',min(c.consumed_at),'snapshot',jsonb_build_object(
        'ingredientId',min(c.ingredient_id_snapshot),'ingredientName',min(c.ingredient_name_snapshot),
        'supplierLotNumber',l.supplier_lot_number,'qualityReleaseReviewId',l.quality_release_review_id,
        'location',l.location,'expiryDate',l.expiry_date,'receivedDate',l.received_date),
      'currentMasterDiffers',false,'relationshipState','present','metadata',jsonb_build_object('attribution','direct_quantity')) item
    from public.batch_material_consumptions c join public.inventory_lots l
      on l.workspace_id=c.workspace_id and l.id=c.inventory_lot_id
    where c.workspace_id=target_workspace_id and c.batch_kind='production' and c.batch_id=lot.production_run_id
    group by l.id,l.internal_lot_number,l.status,l.supplier_lot_number,l.quality_release_review_id,l.location,l.expiry_date,l.received_date
  ) raw;
  select coalesce(jsonb_agg(item order by occurred_at,lot_id),'[]'::jsonb) into packaging_lots from (
    select l.id lot_id,min(u.occurred_at) occurred_at,jsonb_build_object(
      'nodeType','packaging_inventory_lot','immutableId',l.id,'historicalLabel',l.internal_lot_number,
      'currentLabel',l.internal_lot_number,'lifecycleStatus',l.status,'quantity',sum(u.quantity_in_lot_unit),'unit',min(l.unit),
      'actor',min(u.actor_id::text),'timestamp',min(u.occurred_at),'snapshot',jsonb_build_object(
        'componentId',l.packaging_component_id,'componentRole',min(req.component_role_snapshot),'supplierLotNumber',l.supplier_lot_number,
        'qualityReleaseReviewId',l.quality_release_review_id,'location',l.location,'receivedDate',l.received_date),
      'currentMasterDiffers',false,'relationshipState','present','metadata',jsonb_build_object('attribution','direct_quantity')) item
    from public.packaging_run_inventory_uses u join public.packaging_inventory_lots l
      on l.workspace_id=u.workspace_id and l.id=u.packaging_inventory_lot_id
      join public.packaging_run_requirements req on req.workspace_id=u.workspace_id and req.id=u.packaging_requirement_id
    where u.workspace_id=target_workspace_id and u.packaging_run_id=lot.packaging_run_id and u.use_type='consumption'
    group by l.id,l.internal_lot_number,l.status,l.packaging_component_id,l.supplier_lot_number,l.quality_release_review_id,l.location,l.received_date
  ) packaging;
  released:=public.kf_traceability_inventory_impact_v1(target_workspace_id,lot.id);
  if jsonb_array_length(gaps)>0 then confidence:='blocked'; end if;
  nodes:=jsonb_build_array(
    jsonb_build_object('nodeType','finished_goods_lot','immutableId',lot.id,'historicalLabel',lot.consumer_batch_code,'currentLabel',lot.consumer_batch_code,
      'lifecycleStatus',lot.lifecycle_status,'quantity',lot.quantity,'unit',lot.unit,'actor',lot.created_by,'timestamp',lot.created_at,
      'snapshot',jsonb_build_object('product',lot.product_snapshot,'formula',lot.formula_snapshot,'packaging',lot.packaging_snapshot,'label',lot.label_snapshot,'cost',lot.cost_snapshot),
      'currentMasterDiffers',coalesce((select p.name<>lot.product_snapshot->>'name' from public.products p where p.workspace_id=target_workspace_id and p.id=lot.product_id),false),
      'relationshipState','present','metadata',jsonb_build_object('internalLotCode',lot.internal_lot_code)),
    jsonb_build_object('nodeType','packaging_run','immutableId',lot.packaging_run_id,'historicalLabel',coalesce(pr.internal_run_code,lot.genealogy_snapshot->>'packagingRunCode'),
      'lifecycleStatus',pr.status,'quantity',pr.planned_unit_count,'unit','pcs','timestamp',pr.created_at,'relationshipState',case when pr.id is null then 'missing_expected_link' else 'present' end,'snapshot',coalesce(pr.packaging_specification_snapshot,'{}'::jsonb),'metadata','{}'::jsonb),
    jsonb_build_object('nodeType','production_output','immutableId',lot.production_output_id,'historicalLabel',coalesce(output.internal_output_code,pr.production_output_code_snapshot),
      'lifecycleStatus',output.status,'quantity',output.theoretical_quantity,'unit',output.theoretical_unit,'timestamp',output.created_at,'relationshipState',case when output.id is null then 'missing_expected_link' else 'present' end,'snapshot',jsonb_build_object('materialCost',output.material_cost_snapshot,'currency',output.material_cost_currency),'metadata','{}'::jsonb),
    jsonb_build_object('nodeType','production_batch','immutableId',lot.production_run_id,'historicalLabel',coalesce((select production_run_number from public.production_runs where workspace_id=target_workspace_id and id=lot.production_run_id),lot.production_run_id),
      'lifecycleStatus',coalesce((select status from public.production_runs where workspace_id=target_workspace_id and id=lot.production_run_id),'missing'),'timestamp',coalesce((select created_at::timestamptz from public.production_runs where workspace_id=target_workspace_id and id=lot.production_run_id),lot.created_at),
      'relationshipState',case when exists(select 1 from public.production_runs where workspace_id=target_workspace_id and id=lot.production_run_id) then 'present' else 'missing_expected_link' end,
      'snapshot',jsonb_build_object('formulaVersionId',lot.formula_version_id,'formula',lot.formula_snapshot),'metadata','{}'::jsonb),
    jsonb_build_object('nodeType','formula_version','immutableId',lot.formula_version_id,
      'historicalLabel',coalesce((select version from public.formula_versions where workspace_id=target_workspace_id and id=lot.formula_version_id),lot.formula_snapshot->>'version',lot.formula_version_id),
      'lifecycleStatus',coalesce((select status from public.formula_versions where workspace_id=target_workspace_id and id=lot.formula_version_id),'historical_snapshot'),
      'relationshipState','present','snapshot',lot.formula_snapshot,'metadata',jsonb_build_object('attribution','immutable_execution_reference'))
  )||raw_lots||packaging_lots;
  edges:=jsonb_build_array(
    jsonb_build_object('edgeType','created_as_finished_goods','fromId',lot.packaging_run_id,'toId',lot.id,'state','present'),
    jsonb_build_object('edgeType','packaged_by','fromId',lot.production_output_id,'toId',lot.packaging_run_id,'state',case when pr.id is null then 'missing_expected_link' else 'present' end),
    jsonb_build_object('edgeType','output_of','fromId',lot.production_run_id,'toId',lot.production_output_id,'state',case when output.id is null then 'missing_expected_link' else 'present' end),
    jsonb_build_object('edgeType','formula_version_defines_batch','fromId',lot.formula_version_id,'toId',lot.production_run_id,'state','present')
  )||coalesce((select jsonb_agg(jsonb_build_object('edgeType','consumed_by','fromId',x->>'immutableId','toId',lot.production_run_id,'state','present') order by x->>'immutableId') from jsonb_array_elements(raw_lots)x),'[]'::jsonb)
    ||coalesce((select jsonb_agg(jsonb_build_object('edgeType','uses_packaging_lot','fromId',x->>'immutableId','toId',lot.packaging_run_id,'state','present') order by x->>'immutableId') from jsonb_array_elements(packaging_lots)x),'[]'::jsonb);
  return jsonb_build_object('contractVersion','1.0.0','policyVersion','1.0.0','direction','backward',
    'root',jsonb_build_object('nodeType','finished_goods_lot','immutableId',lot.id,'code',lot.consumer_batch_code),
    'nodes',nodes,'edges',edges,'rawMaterialLots',raw_lots,'packagingLots',packaging_lots,
    'quality',jsonb_build_object('quarantine',(select to_jsonb(q) from public.finished_goods_quarantines q where q.workspace_id=target_workspace_id and q.finished_goods_lot_id=lot.id),
      'inspections',coalesce((select jsonb_agg(to_jsonb(i) order by i.inspected_at,i.id) from public.finished_goods_inspections i where i.workspace_id=target_workspace_id and i.finished_goods_lot_id=lot.id),'[]'::jsonb),
      'releaseReviews',coalesce((select jsonb_agg(to_jsonb(r) order by r.review_sequence,r.id) from public.finished_goods_disposition_reviews r where r.workspace_id=target_workspace_id and r.finished_goods_lot_id=lot.id),'[]'::jsonb)),
    'releasedInventory',released,'procurementProvenance',coalesce((select jsonb_agg(jsonb_build_object(
      'inventoryLotId',l.id,'quarantineIntake',to_jsonb(q),'qualityRelease',to_jsonb(rel)) order by l.id)
      from public.inventory_lots l left join public.inventory_quarantine_intakes q on q.workspace_id=l.workspace_id and q.id=l.quarantine_intake_id
      left join public.inventory_quality_release_reviews rel on rel.workspace_id=l.workspace_id and rel.id=l.quality_release_review_id
      where l.workspace_id=target_workspace_id and l.id in(select x->>'immutableId' from jsonb_array_elements(raw_lots)x)),'[]'::jsonb),
    'missingLinks',gaps,'confidence',jsonb_build_object('state',confidence,'policyVersion','1.0.0','missingRequiredLinks',gaps,'optionalGaps','[]'::jsonb,'legacyGaps','[]'::jsonb,'evaluatedAt',evaluated),
    'quantityAttribution',jsonb_build_object('rawMaterial','direct_quantity','packaging','direct_quantity','finishedGoods','exact_quantity','crossLevel','unknown_attribution'),
    'evaluatedAt',evaluated,'fingerprint',md5(jsonb_build_object('root',lot.id,'nodes',nodes,'edges',edges,'gaps',gaps)::text));
end $$;

create function public.get_finished_goods_backward_genealogy_v1(target_finished_goods_lot_id uuid default null,target_released_inventory_lot_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); wid uuid; lot_id uuid; result jsonb; released_lot public.released_finished_goods_inventory_lots;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select id into wid from public.workspaces where owner_id=uid and lifecycle_state='active';
  if target_finished_goods_lot_id is not null and target_released_inventory_lot_id is not null then raise exception 'AMBIGUOUS_TRACEABILITY_ROOT'; end if;
  lot_id:=target_finished_goods_lot_id;
  if target_released_inventory_lot_id is not null then
    select * into released_lot from public.released_finished_goods_inventory_lots where workspace_id=wid and id=target_released_inventory_lot_id;
    lot_id:=released_lot.finished_goods_lot_id;
  end if;
  if lot_id is null then raise exception 'TRACEABILITY_ROOT_NOT_FOUND'; end if;
  result:=public.kf_finished_goods_backward_trace_v1(wid,lot_id);
  if released_lot.id is not null then
    result:=jsonb_set(result,'{root}',jsonb_build_object('nodeType','released_finished_goods_inventory_lot','immutableId',released_lot.id,'code',released_lot.internal_lot_code));
    result:=jsonb_set(result,'{nodes}',(result->'nodes')||jsonb_build_array(jsonb_build_object(
      'nodeType','released_finished_goods_inventory_lot','immutableId',released_lot.id,'historicalLabel',released_lot.internal_lot_code,
      'currentLabel',released_lot.internal_lot_code,'lifecycleStatus',released_lot.status,'quantity',released_lot.quantity_released,'unit',released_lot.unit,
      'actor',released_lot.released_by,'timestamp',released_lot.released_at,'snapshot',jsonb_build_object('product',released_lot.product_snapshot,'cost',released_lot.cost_snapshot),
      'currentMasterDiffers',false,'relationshipState','present','metadata',jsonb_build_object('finishedGoodsLotId',released_lot.finished_goods_lot_id))));
    result:=jsonb_set(result,'{edges}',(result->'edges')||jsonb_build_array(jsonb_build_object(
      'edgeType','released_as_inventory','fromId',released_lot.finished_goods_lot_id,'toId',released_lot.id,'state','present')));
  end if;
  return result;
end $$;

create function public.kf_forward_trace_result_v1(target_workspace_id uuid,target_source_type text,target_lot_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare source jsonb; affected jsonb; evaluated timestamptz:=statement_timestamp(); gaps jsonb:='[]'::jsonb;
begin
  if target_source_type='raw_material_inventory_lot' then
    select jsonb_build_object('nodeType',target_source_type,'immutableId',l.id,'code',l.internal_lot_number,'supplierLotNumber',l.supplier_lot_number,
      'status',l.status,'location',l.location) into source from public.inventory_lots l where l.workspace_id=target_workspace_id and l.id=target_lot_id;
    select coalesce(jsonb_agg(item order by item->>'consumerBatchCode',item->>'finishedGoodsLotId'),'[]'::jsonb) into affected from (
      select jsonb_build_object('finishedGoodsLotId',fg.id,'consumerBatchCode',fg.consumer_batch_code,'product',fg.product_snapshot,
        'exactFinishedGoodsLotQuantity',fg.quantity,'unit',fg.unit,'productionBatchId',fg.production_run_id,'productionOutputId',fg.production_output_id,
        'packagingRunId',fg.packaging_run_id,'exactConsumedQuantity',sum(c.consumed_quantity),'consumedUnit',min(c.unit),
        'quantityAttribution','direct_consumption_then_unknown_cross_level','currentInventoryImpact',public.kf_traceability_inventory_impact_v1(target_workspace_id,fg.id),
        'tracePath',jsonb_build_array(target_lot_id,fg.production_run_id,fg.production_output_id,fg.packaging_run_id,fg.id)) item
      from public.batch_material_consumptions c join public.finished_goods_lots fg
        on fg.workspace_id=c.workspace_id and fg.production_run_id=c.batch_id
      where c.workspace_id=target_workspace_id and c.batch_kind='production' and c.inventory_lot_id=target_lot_id
      group by fg.id,fg.consumer_batch_code,fg.product_snapshot,fg.quantity,fg.unit,fg.production_run_id,fg.production_output_id,fg.packaging_run_id
    )q;
  elsif target_source_type='packaging_inventory_lot' then
    select jsonb_build_object('nodeType',target_source_type,'immutableId',l.id,'code',l.internal_lot_number,'supplierLotNumber',l.supplier_lot_number,
      'status',l.status,'location',l.location,'componentId',l.packaging_component_id) into source
      from public.packaging_inventory_lots l where l.workspace_id=target_workspace_id and l.id=target_lot_id;
    select coalesce(jsonb_agg(item order by item->>'consumerBatchCode',item->>'finishedGoodsLotId'),'[]'::jsonb) into affected from (
      select jsonb_build_object('finishedGoodsLotId',fg.id,'consumerBatchCode',fg.consumer_batch_code,'product',fg.product_snapshot,
        'exactFinishedGoodsLotQuantity',fg.quantity,'unit',fg.unit,'productionBatchId',fg.production_run_id,'productionOutputId',fg.production_output_id,
        'packagingRunId',fg.packaging_run_id,'exactConsumedQuantity',sum(u.quantity_in_lot_unit),'consumedUnit',min(pl.unit),
        'componentRole',min(req.component_role_snapshot),'quantityAttribution','direct_packaging_consumption_then_exact_finished_goods_identity',
        'currentInventoryImpact',public.kf_traceability_inventory_impact_v1(target_workspace_id,fg.id),
        'tracePath',jsonb_build_array(target_lot_id,fg.packaging_run_id,fg.id)) item
      from public.packaging_run_inventory_uses u join public.packaging_inventory_lots pl on pl.workspace_id=u.workspace_id and pl.id=u.packaging_inventory_lot_id
      join public.packaging_run_requirements req on req.workspace_id=u.workspace_id and req.id=u.packaging_requirement_id
      join public.finished_goods_lots fg on fg.workspace_id=u.workspace_id and fg.packaging_run_id=u.packaging_run_id
      where u.workspace_id=target_workspace_id and u.use_type='consumption' and u.packaging_inventory_lot_id=target_lot_id
      group by fg.id,fg.consumer_batch_code,fg.product_snapshot,fg.quantity,fg.unit,fg.production_run_id,fg.production_output_id,fg.packaging_run_id
    )q;
  else raise exception 'UNSUPPORTED_TRACEABILITY_ROOT';
  end if;
  if source is null then raise exception 'TRACEABILITY_ROOT_NOT_FOUND'; end if;
  if jsonb_array_length(affected)=0 then gaps:=jsonb_build_array(jsonb_build_object('expectedNodeType','finished_goods_lot','parentId',target_lot_id,
    'state','not_yet_applicable','severity','warning','reason','No productive downstream Finished Goods identity exists yet.','policyVersion','1.0.0')); end if;
  return jsonb_build_object('contractVersion','1.0.0','policyVersion','1.0.0','direction','forward','source',source,
    'affectedFinishedGoods',affected,'distinctAffectedFinishedGoodsCount',jsonb_array_length(affected),
    'missingLinks',gaps,'confidence',jsonb_build_object('state',case when jsonb_array_length(gaps)=0 then 'complete' else 'complete_with_optional_gaps' end,
      'policyVersion','1.0.0','missingRequiredLinks','[]'::jsonb,'optionalGaps',gaps,'legacyGaps','[]'::jsonb,'evaluatedAt',evaluated),
    'evaluatedAt',evaluated,'fingerprint',md5(jsonb_build_object('source',source,'affected',affected,'gaps',gaps)::text));
end $$;

create function public.get_raw_material_lot_forward_trace_v1(target_inventory_lot_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); wid uuid;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if; select id into wid from public.workspaces where owner_id=uid and lifecycle_state='active';
  return public.kf_forward_trace_result_v1(wid,'raw_material_inventory_lot',target_inventory_lot_id);
end $$;

create function public.get_packaging_lot_forward_trace_v1(target_packaging_inventory_lot_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); wid uuid;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if; select id into wid from public.workspaces where owner_id=uid and lifecycle_state='active';
  return public.kf_forward_trace_result_v1(wid,'packaging_inventory_lot',target_packaging_inventory_lot_id);
end $$;

create function public.search_finished_goods_traceability_v1(candidate_query text,candidate_limit integer default 25)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); wid uuid; q text:=lower(trim(candidate_query)); lim integer:=least(greatest(candidate_limit,1),50);
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if; select id into wid from public.workspaces where owner_id=uid and lifecycle_state='active';
  if length(q)<2 then raise exception 'TRACEABILITY_QUERY_TOO_SHORT'; end if;
  return coalesce((with matches as (
    select 'finished_goods_lot' identity_type,fg.id::text immutable_id,fg.consumer_batch_code code,
      fg.product_snapshot->>'name' product,fg.lifecycle_status status,fg.quantity,fg.unit,fg.location,fg.expiry_date::text,
      case when lower(fg.consumer_batch_code)=q then 0 when lower(fg.internal_lot_code)=q then 1 else 10 end rank
    from public.finished_goods_lots fg where fg.workspace_id=wid and (lower(fg.consumer_batch_code)=q or lower(fg.internal_lot_code)=q or lower(fg.consumer_batch_code) like q||'%' or lower(fg.internal_lot_code) like q||'%')
    union all select 'released_finished_goods_inventory_lot',r.id::text,r.internal_lot_code,r.product_snapshot->>'name',r.status,r.quantity_released,r.unit,r.location,r.expiry_date::text,
      case when lower(r.internal_lot_code)=q or lower(r.consumer_batch_code)=q then 0 else 10 end
      from public.released_finished_goods_inventory_lots r where r.workspace_id=wid and (lower(r.internal_lot_code)=q or lower(r.consumer_batch_code)=q or lower(r.internal_lot_code) like q||'%')
    union all select 'packaging_run',p.id::text,p.internal_run_code,p.product_name_snapshot,p.status,p.planned_unit_count,'pcs',p.location,null::text,case when lower(p.internal_run_code)=q then 0 else 10 end
      from public.packaging_runs p where p.workspace_id=wid and lower(p.internal_run_code) like q||'%'
    union all select 'production_output',o.id::text,o.internal_output_code,o.product_name_snapshot,o.status,o.theoretical_quantity,o.theoretical_unit,o.location,null::text,case when lower(o.internal_output_code)=q then 0 else 10 end
      from public.production_outputs o where o.workspace_id=wid and lower(o.internal_output_code) like q||'%'
    union all select 'production_batch',p.id,p.production_run_number,coalesce(pr.name,p.product_id),p.status,p.actual_yield,p.actual_yield_unit,null,null::text,case when lower(p.production_run_number)=q or lower(p.id)=q then 0 else 10 end
      from public.production_runs p left join public.products pr on pr.workspace_id=p.workspace_id and pr.id=p.product_id where p.workspace_id=wid and (lower(p.production_run_number) like q||'%' or lower(p.id)=q)
    union all select 'raw_material_inventory_lot',l.id,l.internal_lot_number,coalesce(i.common_name,l.ingredient_id),l.status,l.opening_quantity,l.unit,l.location,l.expiry_date,
      case when lower(l.internal_lot_number)=q then 0 when lower(coalesce(l.supplier_lot_number,''))=q then 1 else 10 end
      from public.inventory_lots l left join public.ingredients i on i.workspace_id=l.workspace_id and i.id=l.ingredient_id where l.workspace_id=wid and (lower(l.internal_lot_number) like q||'%' or lower(coalesce(l.supplier_lot_number,''))=q)
    union all select 'packaging_inventory_lot',l.id,l.internal_lot_number,coalesce(c.name,l.packaging_component_id),l.status,l.opening_quantity,l.unit,l.location,null::text,
      case when lower(l.internal_lot_number)=q then 0 when lower(coalesce(l.supplier_lot_number,''))=q then 1 else 10 end
      from public.packaging_inventory_lots l left join public.packaging_components c on c.workspace_id=l.workspace_id and c.id=l.packaging_component_id where l.workspace_id=wid and (lower(l.internal_lot_number) like q||'%' or lower(coalesce(l.supplier_lot_number,''))=q)
  ) select jsonb_agg(jsonb_build_object('identityType',identity_type,'immutableId',immutable_id,'code',code,'product',product,'status',status,
    'quantity',quantity,'unit',unit,'location',location,'expiryDate',expiry_date,'matchRank',rank,'availableActions',
    case when identity_type in('finished_goods_lot','released_finished_goods_inventory_lot') then jsonb_build_array('backward_genealogy')
      when identity_type='raw_material_inventory_lot' then jsonb_build_array('forward_trace') when identity_type='packaging_inventory_lot' then jsonb_build_array('forward_trace')
      when identity_type='production_batch' then jsonb_build_array('production_batch_trace') when identity_type='packaging_run' then jsonb_build_array('packaging_run_trace') else '[]'::jsonb end)
    order by rank,identity_type,code,immutable_id) from (select * from matches order by rank,identity_type,code,immutable_id limit lim)m),'[]'::jsonb);
end $$;

create function public.get_production_batch_trace_v1(target_production_batch_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); wid uuid; batch public.production_runs;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if; select id into wid from public.workspaces where owner_id=uid and lifecycle_state='active';
  select * into batch from public.production_runs where workspace_id=wid and id=target_production_batch_id;
  if not found then raise exception 'TRACEABILITY_ROOT_NOT_FOUND'; end if;
  return jsonb_build_object('contractVersion','1.0.0','root',to_jsonb(batch),
    'requirements',coalesce((select jsonb_agg(to_jsonb(l) order by l.sort_order_snapshot,l.id) from public.production_run_lines l where l.workspace_id=wid and l.production_run_id=batch.id),'[]'::jsonb),
    'consumptions',coalesce((select jsonb_agg(to_jsonb(c) order by c.consumed_at,c.id) from public.batch_material_consumptions c where c.workspace_id=wid and c.batch_kind='production' and c.batch_id=batch.id),'[]'::jsonb),
    'outputs',coalesce((select jsonb_agg(jsonb_build_object('output',to_jsonb(o),'packagingRuns',(select coalesce(jsonb_agg(to_jsonb(p) order by p.run_sequence,p.id),'[]'::jsonb) from public.packaging_runs p where p.workspace_id=wid and p.production_output_id=o.id)) order by o.output_sequence,o.id) from public.production_outputs o where o.workspace_id=wid and o.production_run_id=batch.id),'[]'::jsonb),
    'finishedGoodsLots',coalesce((select jsonb_agg(jsonb_build_object('lot',to_jsonb(f),'currentInventoryImpact',public.kf_traceability_inventory_impact_v1(wid,f.id)) order by f.lot_sequence,f.id) from public.finished_goods_lots f where f.workspace_id=wid and f.production_run_id=batch.id),'[]'::jsonb));
end $$;

create function public.get_packaging_run_trace_v1(target_packaging_run_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); wid uuid; pr public.packaging_runs;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if; select id into wid from public.workspaces where owner_id=uid and lifecycle_state='active';
  select * into pr from public.packaging_runs where workspace_id=wid and id=target_packaging_run_id;
  if not found then raise exception 'TRACEABILITY_ROOT_NOT_FOUND'; end if;
  return jsonb_build_object('contractVersion','1.0.0','root',to_jsonb(pr),'productionOutput',(select to_jsonb(o) from public.production_outputs o where o.workspace_id=wid and o.id=pr.production_output_id),
    'requirements',coalesce((select jsonb_agg(to_jsonb(r) order by r.sequence,r.id) from public.packaging_run_requirements r where r.workspace_id=wid and r.packaging_run_id=pr.id),'[]'::jsonb),
    'reservations',coalesce((select jsonb_agg(to_jsonb(r) order by r.reserved_at,r.id) from public.packaging_run_reservations r where r.workspace_id=wid and r.packaging_run_id=pr.id),'[]'::jsonb),
    'inventoryUses',coalesce((select jsonb_agg(to_jsonb(u) order by u.occurred_at,u.id) from public.packaging_run_inventory_uses u where u.workspace_id=wid and u.packaging_run_id=pr.id),'[]'::jsonb),
    'reconciliation',(select to_jsonb(r) from public.packaging_run_reconciliations r where r.workspace_id=wid and r.packaging_run_id=pr.id order by r.reconciliation_version desc limit 1),
    'finishedGoodsLots',coalesce((select jsonb_agg(jsonb_build_object('lot',to_jsonb(f),'currentInventoryImpact',public.kf_traceability_inventory_impact_v1(wid,f.id)) order by f.lot_sequence,f.id) from public.finished_goods_lots f where f.workspace_id=wid and f.packaging_run_id=pr.id),'[]'::jsonb));
end $$;

create function public.get_traceability_readiness_v1(target_finished_goods_lot_id uuid default null,target_released_inventory_lot_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; trace jsonb;
begin
  trace:=public.get_finished_goods_backward_genealogy_v1(target_finished_goods_lot_id,target_released_inventory_lot_id);
  result:=jsonb_build_object('rootId',trace->'root'->>'immutableId','policyVersion','1.0.0',
    'backwardTraceReady',trace->'confidence'->>'state' in('complete','complete_with_optional_gaps'),
    'forwardTraceReady',trace->'confidence'->>'state'<>'blocked','recallScopeInputReady',trace->'confidence'->>'state'='complete',
    'confidence',trace->'confidence','missingLinks',trace->'missingLinks',
    'blockers',coalesce((select jsonb_agg(x) from jsonb_array_elements(trace->'missingLinks')x where x->>'severity'='blocked'),'[]'::jsonb),
    'warnings',coalesce((select jsonb_agg(x) from jsonb_array_elements(trace->'missingLinks')x where x->>'severity'<>'blocked'),'[]'::jsonb),
    'evaluatedAt',trace->'evaluatedAt');
  return result;
end $$;

create function public.get_traceability_integrity_v1(target_finished_goods_lot_id uuid default null,target_released_inventory_lot_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare trace jsonb;
begin
  trace:=public.get_finished_goods_backward_genealogy_v1(target_finished_goods_lot_id,target_released_inventory_lot_id);
  return jsonb_build_object('policyVersion','1.0.0','rootId',trace->'root'->>'immutableId',
    'findings',trace->'missingLinks','findingCount',jsonb_array_length(trace->'missingLinks'),'evaluatedAt',trace->'evaluatedAt');
end $$;

do $$ declare signature text; begin
  foreach signature in array array[
    'public.kf_traceability_inventory_impact_v1(uuid,uuid)',
    'public.kf_finished_goods_backward_trace_v1(uuid,uuid)',
    'public.kf_forward_trace_result_v1(uuid,text,text)'
  ] loop
    execute 'revoke all on function '||signature||' from public,anon,authenticated';
    execute 'grant execute on function '||signature||' to service_role';
  end loop;
  foreach signature in array array[
    'public.search_finished_goods_traceability_v1(text,integer)',
    'public.get_finished_goods_backward_genealogy_v1(uuid,uuid)',
    'public.get_raw_material_lot_forward_trace_v1(text)',
    'public.get_packaging_lot_forward_trace_v1(text)',
    'public.get_production_batch_trace_v1(text)',
    'public.get_packaging_run_trace_v1(uuid)',
    'public.get_traceability_readiness_v1(uuid,uuid)',
    'public.get_traceability_integrity_v1(uuid,uuid)'
  ] loop
    execute 'revoke all on function '||signature||' from public,anon,authenticated';
    execute 'grant execute on function '||signature||' to authenticated,service_role';
  end loop;
end $$;
