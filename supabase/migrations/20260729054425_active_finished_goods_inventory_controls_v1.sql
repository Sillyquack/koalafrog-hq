-- Finished Goods & Batch Genealogy V1, Slice 5.
-- Active quantity remains an append-only movement sum; operational restrictions
-- are a second append-only overlay and never mutate physical stock.

alter table public.finished_goods_inventory_movements
  drop constraint finished_goods_inventory_movements_movement_type_check,
  add constraint finished_goods_inventory_movements_movement_type_check check(movement_type in(
    'release_receipt','internal_transfer_out','internal_transfer_in',
    'damage_writeoff','loss_writeoff','destruction_writeoff',
    'controlled_negative_adjustment','controlled_positive_correction'
  )),
  add column operation_id uuid,
  add column related_movement_id uuid references public.finished_goods_inventory_movements(id),
  add column from_location text,
  add column to_location text,
  add column reason text,
  add column evidence jsonb not null default '[]'::jsonb,
  add column cost_confidence text check(cost_confidence in('complete','provisional','unknown'));

create table public.finished_goods_inventory_operations(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  owner_id uuid not null,
  released_inventory_lot_id uuid not null,
  operation_type text not null check(operation_type in(
    'internal_transfer','hold','release_hold','block','unblock','damage_pending',
    'damage_writeoff','loss_writeoff','destruction_writeoff',
    'controlled_negative_adjustment','controlled_positive_correction'
  )),
  quantity numeric not null check(quantity>0),
  unit text not null,
  from_location text,
  to_location text,
  reason text not null check(length(trim(reason))>=4),
  evidence jsonb not null check(jsonb_typeof(evidence)='array' and jsonb_array_length(evidence)>0),
  related_record_id uuid,
  movement_ids uuid[] not null default '{}',
  actor_id uuid not null,
  occurred_at timestamptz not null,
  expected_revision bigint not null check(expected_revision>0),
  policy_version text not null default '1.0.0',
  idempotency_key uuid not null,
  request_fingerprint text not null,
  created_at timestamptz not null default now(),
  unique(workspace_id,id),
  unique(workspace_id,idempotency_key),
  foreign key(workspace_id,released_inventory_lot_id)
    references public.released_finished_goods_inventory_lots(workspace_id,id)
);

create table public.finished_goods_inventory_state_history(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  owner_id uuid not null,
  released_inventory_lot_id uuid not null,
  operation_id uuid not null,
  state_type text not null check(state_type in('held','blocked','damaged')),
  quantity_delta numeric not null check(quantity_delta<>0),
  unit text not null,
  reason text not null,
  evidence jsonb not null,
  related_state_id uuid references public.finished_goods_inventory_state_history(id),
  actor_id uuid not null,
  occurred_at timestamptz not null,
  policy_version text not null default '1.0.0',
  event_key text not null,
  created_at timestamptz not null default now(),
  unique(workspace_id,id),
  unique(workspace_id,event_key),
  foreign key(workspace_id,released_inventory_lot_id)
    references public.released_finished_goods_inventory_lots(workspace_id,id),
  foreign key(operation_id) references public.finished_goods_inventory_operations(id)
);

create table public.finished_goods_inventory_events(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  owner_id uuid not null,
  released_inventory_lot_id uuid not null,
  finished_goods_lot_id uuid not null,
  operation_id uuid not null,
  movement_id uuid,
  state_record_id uuid,
  event_type text not null,
  quantity numeric not null,
  unit text not null,
  actor_id uuid not null,
  occurred_at timestamptz not null,
  policy_version text not null default '1.0.0',
  event_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(workspace_id,id),
  unique(workspace_id,event_key),
  foreign key(workspace_id,released_inventory_lot_id)
    references public.released_finished_goods_inventory_lots(workspace_id,id),
  foreign key(operation_id) references public.finished_goods_inventory_operations(id),
  foreign key(movement_id) references public.finished_goods_inventory_movements(id),
  foreign key(state_record_id) references public.finished_goods_inventory_state_history(id)
);

alter table public.finished_goods_inventory_movements
  add foreign key(operation_id) references public.finished_goods_inventory_operations(id);

create index finished_goods_inventory_operations_lot_idx
  on public.finished_goods_inventory_operations(workspace_id,released_inventory_lot_id,occurred_at,id);
create index finished_goods_inventory_state_active_idx
  on public.finished_goods_inventory_state_history(workspace_id,released_inventory_lot_id,state_type,occurred_at,id);
create index finished_goods_inventory_events_lot_idx
  on public.finished_goods_inventory_events(workspace_id,released_inventory_lot_id,occurred_at,id);
create index released_finished_goods_fefo_idx
  on public.released_finished_goods_inventory_lots(workspace_id,product_id,expiry_date,released_at,manufacturing_date,id);
create index finished_goods_inventory_related_movement_idx
  on public.finished_goods_inventory_movements(workspace_id,related_movement_id)
  where related_movement_id is not null;

do $$ declare t text; begin
  foreach t in array array['finished_goods_inventory_operations','finished_goods_inventory_state_history','finished_goods_inventory_events']
  loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy owner_read on public.%I for select to authenticated using(owner_id=(select auth.uid()))',t);
    execute format('revoke all on public.%I from anon,authenticated',t);
    execute format('grant select on public.%I to authenticated,service_role',t);
    execute format('grant select,insert,update,delete on public.%I to service_role',t);
    execute format('create trigger %I before update or delete on public.%I for each row execute function public.kf_finished_goods_append_only()',t||'_append_only',t);
  end loop;
end $$;

create function public.kf_finished_goods_inventory_snapshot_v1(target_workspace_id uuid,target_lot_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare lot public.released_finished_goods_inventory_lots; on_hand numeric; held numeric; blocked numeric; damaged numeric;
  revision bigint; expired boolean; locations jsonb; blockers jsonb:='[]'::jsonb; available numeric; valuation numeric;
begin
  select * into lot from public.released_finished_goods_inventory_lots
    where workspace_id=target_workspace_id and id=target_lot_id;
  if not found then raise exception 'RELEASED_FINISHED_GOODS_LOT_NOT_FOUND'; end if;
  select coalesce(sum(normalized_quantity),0) into on_hand from public.finished_goods_inventory_movements
    where workspace_id=target_workspace_id and released_inventory_lot_id=target_lot_id;
  select coalesce(sum(quantity_delta) filter(where state_type='held'),0),
    coalesce(sum(quantity_delta) filter(where state_type='blocked'),0),
    coalesce(sum(quantity_delta) filter(where state_type='damaged'),0)
    into held,blocked,damaged from public.finished_goods_inventory_state_history
    where workspace_id=target_workspace_id and released_inventory_lot_id=target_lot_id;
  select 1+count(*) into revision from public.finished_goods_inventory_operations
    where workspace_id=target_workspace_id and released_inventory_lot_id=target_lot_id;
  expired:=lot.expiry_date<current_date;
  if expired then blockers:=blockers||jsonb_build_array(jsonb_build_object('code','expired','message','Expired stock is unavailable.')); end if;
  if held>0 then blockers:=blockers||jsonb_build_array(jsonb_build_object('code','held','message','Stock is on operational hold.')); end if;
  if blocked>0 then blockers:=blockers||jsonb_build_array(jsonb_build_object('code','blocked','message','Stock is operationally blocked.')); end if;
  if damaged>0 then blockers:=blockers||jsonb_build_array(jsonb_build_object('code','damage_pending','message','Damaged stock awaits write-off.')); end if;
  available:=case when expired then 0 else greatest(on_hand-held-blocked-damaged,0) end;
  valuation:=case when lot.unit_cost is null then null else on_hand*lot.unit_cost end;
  with location_entries as (
    select case
      when m.movement_type='release_receipt' then coalesce(m.to_location,lot.location)
      when m.movement_type='internal_transfer_in' then m.to_location
      else coalesce(m.from_location,lot.location) end as location,
      sum(m.normalized_quantity) quantity
    from public.finished_goods_inventory_movements m
    where m.workspace_id=target_workspace_id and m.released_inventory_lot_id=target_lot_id
    group by 1
  ) select coalesce(jsonb_agg(jsonb_build_object('location',location,'quantity',quantity) order by location),'[]'::jsonb)
    into locations from location_entries where quantity<>0;
  return jsonb_build_object(
    'policyVersion','1.0.0','revision',revision,'lot',to_jsonb(lot),
    'onHandQuantity',on_hand,'availableQuantity',available,'reservedQuantity',0,
    'heldQuantity',held,'blockedQuantity',blocked,'damagedQuantity',damaged,
    'lostQuantity',coalesce((select -sum(normalized_quantity) from public.finished_goods_inventory_movements where workspace_id=target_workspace_id and released_inventory_lot_id=target_lot_id and movement_type='loss_writeoff'),0),
    'destroyedQuantity',coalesce((select -sum(normalized_quantity) from public.finished_goods_inventory_movements where workspace_id=target_workspace_id and released_inventory_lot_id=target_lot_id and movement_type='destruction_writeoff'),0),
    'expiryState',case when expired then 'expired' when lot.expiry_date<=current_date+30 then 'expiring_soon' else 'eligible' end,
    'eligible',not expired and available>0,'blockers',blockers,'locations',locations,
    'valuation',jsonb_build_object('quantity',on_hand,'unitCost',lot.unit_cost,'totalCost',valuation,'currency',lot.currency,'confidence',lot.cost_confidence,'state',case when lot.unit_cost is null then 'unknown' when lot.cost_confidence='complete' then 'final' else 'provisional' end),
    'reservationBoundary',jsonb_build_object('implemented',false,'reservedQuantity',0,'downstreamReady',not expired and available>0)
  );
end $$;

create function public.get_finished_goods_inventory_workspace_v1(target_released_inventory_lot_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); wid uuid; lot public.released_finished_goods_inventory_lots;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select id into wid from public.workspaces where owner_id=uid;
  select * into lot from public.released_finished_goods_inventory_lots where workspace_id=wid and id=target_released_inventory_lot_id;
  if not found then raise exception 'RELEASED_FINISHED_GOODS_LOT_NOT_FOUND'; end if;
  return jsonb_build_object('snapshot',public.kf_finished_goods_inventory_snapshot_v1(wid,lot.id),
    'movements',coalesce((select jsonb_agg(to_jsonb(m) order by m.occurred_at,m.id) from public.finished_goods_inventory_movements m where m.workspace_id=wid and m.released_inventory_lot_id=lot.id),'[]'::jsonb),
    'stateHistory',coalesce((select jsonb_agg(to_jsonb(s) order by s.occurred_at,s.id) from public.finished_goods_inventory_state_history s where s.workspace_id=wid and s.released_inventory_lot_id=lot.id),'[]'::jsonb),
    'operations',coalesce((select jsonb_agg(to_jsonb(o) order by o.occurred_at,o.id) from public.finished_goods_inventory_operations o where o.workspace_id=wid and o.released_inventory_lot_id=lot.id),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.occurred_at,e.id) from public.finished_goods_inventory_events e where e.workspace_id=wid and e.released_inventory_lot_id=lot.id),'[]'::jsonb),
    'genealogy',public.get_released_finished_goods_genealogy_v1(lot.id));
end $$;

create function public.list_finished_goods_inventory_fefo_v1(target_product_id text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=auth.uid(); wid uuid;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select id into wid from public.workspaces where owner_id=uid;
  return coalesce((select jsonb_agg(public.kf_finished_goods_inventory_snapshot_v1(wid,l.id)
    order by l.expiry_date,l.released_at,l.manufacturing_date,l.id)
    from public.released_finished_goods_inventory_lots l
    where l.workspace_id=wid and (target_product_id is null or l.product_id=target_product_id)),'[]'::jsonb);
end $$;

create function public.record_finished_goods_inventory_operation_v1(
  target_released_inventory_lot_id uuid,expected_inventory_revision bigint,candidate_operation_type text,
  candidate_quantity numeric,candidate_unit text,candidate_from_location text,candidate_to_location text,
  candidate_reason text,candidate_evidence jsonb,candidate_related_record_id uuid,
  candidate_occurred_at timestamptz,candidate_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); wid uuid; lot public.released_finished_goods_inventory_lots;
  existing public.finished_goods_inventory_operations; snap jsonb; fp text; op_id uuid:=gen_random_uuid();
  state_id uuid; move1 uuid; move2 uuid; current_revision bigint; available numeric; on_hand numeric;
  active_state numeric; source_balance numeric; prior public.finished_goods_inventory_movements; corrected numeric;
  movement_type text; event_type text;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if candidate_quantity<=0 then raise exception 'QUANTITY_MUST_BE_POSITIVE'; end if;
  if candidate_operation_type not in('internal_transfer','hold','release_hold','block','unblock','damage_pending',
    'damage_writeoff','loss_writeoff','destruction_writeoff','controlled_negative_adjustment','controlled_positive_correction')
    then raise exception 'INVALID_OPERATION_TYPE'; end if;
  if candidate_reason is null or length(trim(candidate_reason))<4 then raise exception 'REASON_REQUIRED'; end if;
  if candidate_evidence is null or jsonb_typeof(candidate_evidence)<>'array' or jsonb_array_length(candidate_evidence)=0 then raise exception 'EVIDENCE_REQUIRED'; end if;
  select id into wid from public.workspaces where owner_id=uid;
  fp:=md5(jsonb_build_object('lot',target_released_inventory_lot_id,'revision',expected_inventory_revision,
    'type',candidate_operation_type,'quantity',candidate_quantity,'unit',candidate_unit,'from',candidate_from_location,
    'to',candidate_to_location,'reason',candidate_reason,'evidence',candidate_evidence,'related',candidate_related_record_id)::text);
  select * into existing from public.finished_goods_inventory_operations where workspace_id=wid and idempotency_key=candidate_idempotency_key;
  if found then
    if existing.request_fingerprint<>fp then raise exception 'IDEMPOTENCY_KEY_REUSED'; end if;
    return jsonb_build_object('operation',to_jsonb(existing),'retry',true,'workspace',public.get_finished_goods_inventory_workspace_v1(target_released_inventory_lot_id));
  end if;
  select * into lot from public.released_finished_goods_inventory_lots where workspace_id=wid and id=target_released_inventory_lot_id for update;
  if not found then raise exception 'RELEASED_FINISHED_GOODS_LOT_NOT_FOUND'; end if;
  snap:=public.kf_finished_goods_inventory_snapshot_v1(wid,lot.id);
  current_revision:=(snap->>'revision')::bigint; available:=(snap->>'availableQuantity')::numeric; on_hand:=(snap->>'onHandQuantity')::numeric;
  if expected_inventory_revision<>current_revision then raise exception 'STALE_INVENTORY_REVISION'; end if;
  if candidate_unit<>lot.unit then raise exception 'UNIT_MISMATCH'; end if;

  if candidate_operation_type='internal_transfer' then
    if coalesce(trim(candidate_from_location),'')='' or coalesce(trim(candidate_to_location),'')='' or candidate_from_location=candidate_to_location then raise exception 'TRANSFER_LOCATIONS_INVALID'; end if;
    select coalesce(sum((x->>'quantity')::numeric),0) into source_balance from jsonb_array_elements(snap->'locations') x where x->>'location'=candidate_from_location;
    if candidate_quantity>source_balance or candidate_quantity>available then raise exception 'INSUFFICIENT_TRANSFERABLE_QUANTITY'; end if;
  elsif candidate_operation_type in('hold','block','damage_pending') and candidate_quantity>available then
    raise exception 'INSUFFICIENT_AVAILABLE_QUANTITY';
  elsif candidate_operation_type in('release_hold','unblock','damage_writeoff') then
    select coalesce(sum(quantity_delta),0) into active_state from public.finished_goods_inventory_state_history
      where workspace_id=wid and released_inventory_lot_id=lot.id and state_type=
        case candidate_operation_type when 'release_hold' then 'held' when 'unblock' then 'blocked' else 'damaged' end;
    if candidate_quantity>active_state then raise exception 'INSUFFICIENT_ACTIVE_STATE_QUANTITY'; end if;
  elsif candidate_operation_type in('loss_writeoff','destruction_writeoff','controlled_negative_adjustment') and candidate_quantity>on_hand then
    raise exception 'INSUFFICIENT_ON_HAND_QUANTITY';
  elsif candidate_operation_type='controlled_positive_correction' then
    select * into prior from public.finished_goods_inventory_movements m where m.workspace_id=wid and m.id=candidate_related_record_id
      and m.released_inventory_lot_id=lot.id and m.movement_type in('damage_writeoff','loss_writeoff','destruction_writeoff','controlled_negative_adjustment');
    if not found then raise exception 'VALID_PRIOR_NEGATIVE_MOVEMENT_REQUIRED'; end if;
    select coalesce(sum(m.normalized_quantity),0) into corrected from public.finished_goods_inventory_movements m
      where m.workspace_id=wid and m.related_movement_id=prior.id and m.movement_type='controlled_positive_correction';
    if candidate_quantity+corrected>abs(prior.normalized_quantity) then raise exception 'CORRECTION_EXCEEDS_NEGATIVE_BASIS'; end if;
  end if;
  if candidate_operation_type in('damage_writeoff','loss_writeoff','destruction_writeoff','controlled_negative_adjustment') then
    if coalesce(trim(candidate_from_location),'')='' then raise exception 'SOURCE_LOCATION_REQUIRED'; end if;
    select coalesce(sum((x->>'quantity')::numeric),0) into source_balance from jsonb_array_elements(snap->'locations') x
      where x->>'location'=candidate_from_location;
    if candidate_quantity>source_balance then raise exception 'INSUFFICIENT_LOCATION_BALANCE'; end if;
  elsif candidate_operation_type='controlled_positive_correction' and coalesce(trim(candidate_to_location),'')='' then
    raise exception 'DESTINATION_LOCATION_REQUIRED';
  end if;

  if candidate_operation_type='internal_transfer' then move1:=gen_random_uuid(); move2:=gen_random_uuid();
  elsif candidate_operation_type in('damage_writeoff','loss_writeoff','destruction_writeoff','controlled_negative_adjustment','controlled_positive_correction')
    then move1:=gen_random_uuid();
  end if;

  insert into public.finished_goods_inventory_operations(id,workspace_id,owner_id,released_inventory_lot_id,operation_type,quantity,unit,
    from_location,to_location,reason,evidence,related_record_id,movement_ids,actor_id,occurred_at,expected_revision,idempotency_key,request_fingerprint)
  values(op_id,wid,uid,lot.id,candidate_operation_type,candidate_quantity,candidate_unit,candidate_from_location,candidate_to_location,
    candidate_reason,candidate_evidence,candidate_related_record_id,case when move2 is not null then array[move1,move2] when move1 is not null then array[move1] else '{}'::uuid[] end,
    uid,candidate_occurred_at,expected_inventory_revision,candidate_idempotency_key,fp);

  if candidate_operation_type in('hold','release_hold','block','unblock','damage_pending','damage_writeoff') then
    state_id:=gen_random_uuid();
    insert into public.finished_goods_inventory_state_history(id,workspace_id,owner_id,released_inventory_lot_id,operation_id,state_type,
      quantity_delta,unit,reason,evidence,related_state_id,actor_id,occurred_at,event_key)
    values(state_id,wid,uid,lot.id,op_id,case candidate_operation_type when 'hold' then 'held' when 'release_hold' then 'held'
      when 'block' then 'blocked' when 'unblock' then 'blocked' else 'damaged' end,
      case when candidate_operation_type in('release_hold','unblock','damage_writeoff') then -candidate_quantity else candidate_quantity end,
      candidate_unit,candidate_reason,candidate_evidence,candidate_related_record_id,uid,candidate_occurred_at,'state:'||candidate_idempotency_key);
  end if;

  if candidate_operation_type='internal_transfer' then
    insert into public.finished_goods_inventory_movements(id,workspace_id,owner_id,released_inventory_lot_id,finished_goods_lot_id,release_review_id,
      movement_type,quantity,unit,normalized_quantity,unit_cost,total_cost,currency,actor_id,occurred_at,idempotency_key,event_key,provenance,
      operation_id,from_location,to_location,reason,evidence,cost_confidence)
    values
      (move1,wid,uid,lot.id,lot.finished_goods_lot_id,lot.release_review_id,'internal_transfer_out',-candidate_quantity,candidate_unit,-candidate_quantity,
       lot.unit_cost,case when lot.unit_cost is null then null else -candidate_quantity*lot.unit_cost end,lot.currency,uid,candidate_occurred_at,
       gen_random_uuid(),'transfer-out:'||candidate_idempotency_key,lot.provenance,op_id,candidate_from_location,candidate_to_location,candidate_reason,candidate_evidence,lot.cost_confidence),
      (move2,wid,uid,lot.id,lot.finished_goods_lot_id,lot.release_review_id,'internal_transfer_in',candidate_quantity,candidate_unit,candidate_quantity,
       lot.unit_cost,case when lot.unit_cost is null then null else candidate_quantity*lot.unit_cost end,lot.currency,uid,candidate_occurred_at,
       gen_random_uuid(),'transfer-in:'||candidate_idempotency_key,lot.provenance,op_id,candidate_from_location,candidate_to_location,candidate_reason,candidate_evidence,lot.cost_confidence);
  elsif candidate_operation_type in('damage_writeoff','loss_writeoff','destruction_writeoff','controlled_negative_adjustment','controlled_positive_correction') then
    movement_type:=candidate_operation_type;
    insert into public.finished_goods_inventory_movements(id,workspace_id,owner_id,released_inventory_lot_id,finished_goods_lot_id,release_review_id,
      movement_type,quantity,unit,normalized_quantity,unit_cost,total_cost,currency,actor_id,occurred_at,idempotency_key,event_key,provenance,
      operation_id,related_movement_id,from_location,to_location,reason,evidence,cost_confidence)
    values(move1,wid,uid,lot.id,lot.finished_goods_lot_id,lot.release_review_id,movement_type,
      case when candidate_operation_type='controlled_positive_correction' then candidate_quantity else -candidate_quantity end,candidate_unit,
      case when candidate_operation_type='controlled_positive_correction' then candidate_quantity else -candidate_quantity end,
      lot.unit_cost,case when lot.unit_cost is null then null when candidate_operation_type='controlled_positive_correction' then candidate_quantity*lot.unit_cost else -candidate_quantity*lot.unit_cost end,
      lot.currency,uid,candidate_occurred_at,gen_random_uuid(),'movement:'||candidate_idempotency_key,lot.provenance,op_id,
      case when candidate_operation_type='controlled_positive_correction' then candidate_related_record_id end,
      candidate_from_location,candidate_to_location,candidate_reason,candidate_evidence,lot.cost_confidence);
  end if;
  event_type:='finished_goods_inventory_'||candidate_operation_type;
  insert into public.finished_goods_inventory_events(workspace_id,owner_id,released_inventory_lot_id,finished_goods_lot_id,operation_id,movement_id,state_record_id,
    event_type,quantity,unit,actor_id,occurred_at,event_key,metadata)
  values(wid,uid,lot.id,lot.finished_goods_lot_id,op_id,move1,state_id,event_type,candidate_quantity,candidate_unit,uid,candidate_occurred_at,
    'inventory-event:'||candidate_idempotency_key,jsonb_build_object('fromLocation',candidate_from_location,'toLocation',candidate_to_location,'reason',candidate_reason));
  select * into existing from public.finished_goods_inventory_operations where id=op_id;
  return jsonb_build_object('operation',to_jsonb(existing),'retry',false,'workspace',public.get_finished_goods_inventory_workspace_v1(lot.id));
end $$;

do $$ declare signature text; begin
  foreach signature in array array[
    'public.get_finished_goods_inventory_workspace_v1(uuid)',
    'public.list_finished_goods_inventory_fefo_v1(text)',
    'public.record_finished_goods_inventory_operation_v1(uuid,bigint,text,numeric,text,text,text,text,jsonb,uuid,timestamp with time zone,uuid)'
  ] loop
    execute 'revoke all on function '||signature||' from public,anon,authenticated';
    execute 'grant execute on function '||signature||' to authenticated,service_role';
  end loop;
end $$;
