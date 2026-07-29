-- Platform Hardening & Legacy Authority Classification V1
-- Authority metadata version: 1.0.0

-- Legacy compatibility data remains readable for migration evidence, but it is no
-- longer an authenticated write authority.
revoke insert, update, delete, truncate on table public.finished_goods_batches from authenticated;
revoke insert, update, delete, truncate on table public.finished_goods_movements from authenticated;
revoke insert, update, delete, truncate on table public.packaging_allocations from authenticated;
revoke insert, update, delete, truncate on table public.workspace_records from authenticated;
revoke references, trigger on table public.finished_goods_batches from authenticated;
revoke references, trigger on table public.finished_goods_movements from authenticated;
revoke references, trigger on table public.packaging_allocations from authenticated;
revoke references, trigger on table public.workspace_records from authenticated;
grant select on table public.workspace_records to authenticated;

drop policy if exists owner_all on public.finished_goods_batches;
drop policy if exists owner_all on public.finished_goods_movements;
drop policy if exists owner_all on public.packaging_allocations;
drop policy if exists records_owner_insert on public.workspace_records;
drop policy if exists records_owner_update on public.workspace_records;

create policy owner_read_legacy on public.finished_goods_batches
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy owner_read_legacy on public.finished_goods_movements
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy owner_read_legacy on public.packaging_allocations
  for select to authenticated using ((select auth.uid()) = owner_id);

revoke execute on function public.register_finished_goods_output(jsonb,jsonb) from public, anon, authenticated;
revoke execute on function public.commit_packaging_consumption(text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.register_finished_goods_output(jsonb,jsonb) to service_role;
grant execute on function public.commit_packaging_consumption(text,jsonb,jsonb) to service_role;

comment on table public.finished_goods_batches is
  'kf.authority.v1 classification=legacy_frozen canonical=finished_goods_lots removal=after_reconciled_cutover';
comment on table public.finished_goods_movements is
  'kf.authority.v1 classification=legacy_frozen canonical=finished_goods_inventory_movements removal=after_reconciled_cutover';
comment on table public.packaging_allocations is
  'kf.authority.v1 classification=legacy_frozen canonical=packaging_run_inventory_reservations removal=after_reconciled_cutover';
comment on table public.workspace_records is
  'kf.authority.v1 classification=compatibility_read_only canonical=relational_domain_tables removal=after_v9_rollback_window';
comment on function public.register_finished_goods_output(jsonb,jsonb) is
  'kf.authority.v1 classification=deprecated_pending_removal canonical=register_finished_goods_lot_v1';
comment on function public.commit_packaging_consumption(text,jsonb,jsonb) is
  'kf.authority.v1 classification=deprecated_pending_removal canonical=commit_packaging_run_inventory_v1';

-- Immutable raw-material and packaging ledgers are RPC-only for authenticated
-- clients. Existing controlled manufacturing RPCs continue to insert as definer
-- or invoker according to their own policy contracts.
revoke insert, update, delete, truncate on table public.inventory_movements from authenticated;
revoke insert, update, delete, truncate on table public.packaging_inventory_movements from authenticated;
revoke references, trigger on table public.inventory_movements from authenticated;
revoke references, trigger on table public.packaging_inventory_movements from authenticated;
grant select, insert on table public.inventory_movements to service_role;
grant select, insert on table public.packaging_inventory_movements to service_role;

-- These established commit functions already derive owner/workspace identity and
-- lock eligible lots. Definer execution preserves them after raw table writes are
-- revoked; the fixed search path is part of their existing contract.
alter function public.commit_lab_consumption(text,jsonb) security definer;
alter function public.commit_production_consumption(text,jsonb) security definer;
alter function public.import_v9_relational(jsonb) security definer;

comment on function public.import_v9_relational(jsonb) is
  'kf.authority.v1 owner_derived one_time_compatibility_import; no steady-state writes';

drop policy if exists owner_all on public.inventory_movements;
drop policy if exists owner_all on public.packaging_inventory_movements;
create policy owner_read on public.inventory_movements
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy owner_read on public.packaging_inventory_movements
  for select to authenticated using ((select auth.uid()) = owner_id);

comment on table public.inventory_movements is
  'kf.authority.v1 classification=canonical_append_only write=controlled_rpc';
comment on table public.packaging_inventory_movements is
  'kf.authority.v1 classification=canonical_append_only write=controlled_rpc ledger=packaging';

create or replace function public.record_inventory_lot_receipt_v1(
  candidate_lot jsonb,
  candidate_movement jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  wid uuid;
  lot_id text := nullif(candidate_lot->>'id','');
  movement_id text := nullif(candidate_movement->>'id','');
  quantity numeric;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select w.id into wid from public.workspaces w where w.owner_id = uid;
  if wid is null then raise exception 'Workspace not found'; end if;
  if lot_id is null or movement_id is null then raise exception 'Lot and movement identifiers are required'; end if;
  if candidate_movement->>'inventory_lot_id' <> lot_id or candidate_movement->>'type' <> 'Receipt' then
    raise exception 'Receipt movement must identify the new lot';
  end if;
  quantity := (candidate_movement->>'quantity')::numeric;
  if quantity <= 0 or quantity <> (candidate_lot->>'opening_quantity')::numeric then
    raise exception 'Receipt quantity must equal positive opening quantity';
  end if;
  if candidate_movement->>'unit' <> candidate_lot->>'unit' then
    raise exception 'Receipt unit must equal lot unit';
  end if;

  insert into public.inventory_lots(
    workspace_id,owner_id,id,ingredient_id,supplier_product_id,internal_lot_number,
    supplier_lot_number,received_date,opening_quantity,unit,expiry_date,best_before_date,
    location,status,notes,total_acquisition_cost,acquisition_cost_currency,cost_notes,
    created_at,updated_at
  ) values (
    wid,uid,lot_id,candidate_lot->>'ingredient_id',nullif(candidate_lot->>'supplier_product_id',''),
    candidate_lot->>'internal_lot_number',nullif(candidate_lot->>'supplier_lot_number',''),
    candidate_lot->>'received_date',(candidate_lot->>'opening_quantity')::numeric,
    candidate_lot->>'unit',nullif(candidate_lot->>'expiry_date',''),
    nullif(candidate_lot->>'best_before_date',''),candidate_lot->>'location',
    candidate_lot->>'status',coalesce(candidate_lot->>'notes',''),
    nullif(candidate_lot->>'total_acquisition_cost','')::numeric,
    nullif(candidate_lot->>'acquisition_cost_currency',''),nullif(candidate_lot->>'cost_notes',''),
    candidate_lot->>'created_at',candidate_lot->>'updated_at'
  );
  insert into public.inventory_movements(
    workspace_id,owner_id,id,inventory_lot_id,type,quantity,unit,reason,
    reference_type,reference_id,notes,occurred_at,created_at
  ) values (
    wid,uid,movement_id,lot_id,'Receipt',quantity,candidate_movement->>'unit',
    candidate_movement->>'reason',nullif(candidate_movement->>'reference_type',''),
    nullif(candidate_movement->>'reference_id',''),coalesce(candidate_movement->>'notes',''),
    candidate_movement->>'occurred_at',candidate_movement->>'created_at'
  );
  return jsonb_build_object('lotId',lot_id,'movementId',movement_id);
end $$;

create or replace function public.append_inventory_movement_v1(candidate_movement jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  wid uuid;
  lot public.inventory_lots%rowtype;
  movement_type text := candidate_movement->>'type';
  movement_id text := nullif(candidate_movement->>'id','');
  quantity numeric := (candidate_movement->>'quantity')::numeric;
  converted numeric;
  resulting_balance numeric;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select w.id into wid from public.workspaces w where w.owner_id = uid;
  if wid is null then raise exception 'Workspace not found'; end if;
  if movement_id is null or movement_type not in ('Consumption','Waste','Sample','Adjustment') then
    raise exception 'Unsupported inventory movement';
  end if;
  if quantity = 0 or (movement_type <> 'Adjustment' and quantity < 0) then
    raise exception 'Movement quantity is invalid';
  end if;
  select l.* into lot from public.inventory_lots l
    where l.workspace_id = wid and l.id = candidate_movement->>'inventory_lot_id' for update;
  if not found then raise exception 'Inventory Lot not found'; end if;
  converted := public.kf_convert_quantity(quantity,candidate_movement->>'unit',lot.unit);
  if converted is null then raise exception 'Incompatible inventory units'; end if;
  resulting_balance := public.kf_inventory_balance(wid,lot.id)
    + case when movement_type = 'Adjustment' then converted else -abs(converted) end;
  if resulting_balance < 0 then raise exception 'Insufficient inventory balance'; end if;

  insert into public.inventory_movements(
    workspace_id,owner_id,id,inventory_lot_id,type,quantity,unit,reason,
    reference_type,reference_id,notes,occurred_at,created_at
  ) values (
    wid,uid,movement_id,lot.id,movement_type,quantity,candidate_movement->>'unit',
    candidate_movement->>'reason',nullif(candidate_movement->>'reference_type',''),
    nullif(candidate_movement->>'reference_id',''),coalesce(candidate_movement->>'notes',''),
    candidate_movement->>'occurred_at',candidate_movement->>'created_at'
  );
  return jsonb_build_object('movementId',movement_id,'resultingBalance',resulting_balance);
end $$;

create or replace function public.record_packaging_lot_receipt_v1(
  candidate_lot jsonb,
  candidate_movement jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  wid uuid;
  lot_id text := nullif(candidate_lot->>'id','');
  movement_id text := nullif(candidate_movement->>'id','');
  quantity numeric;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select w.id into wid from public.workspaces w where w.owner_id = uid;
  if wid is null then raise exception 'Workspace not found'; end if;
  if lot_id is null or movement_id is null then raise exception 'Lot and movement identifiers are required'; end if;
  if candidate_movement->>'packaging_inventory_lot_id' <> lot_id or candidate_movement->>'type' <> 'Receipt' then
    raise exception 'Receipt movement must identify the new packaging lot';
  end if;
  quantity := (candidate_movement->>'quantity')::numeric;
  if quantity <= 0 or quantity <> (candidate_lot->>'opening_quantity')::numeric then
    raise exception 'Receipt quantity must equal positive opening quantity';
  end if;
  if candidate_movement->>'unit' <> candidate_lot->>'unit' then
    raise exception 'Receipt unit must equal packaging lot unit';
  end if;

  insert into public.packaging_inventory_lots(
    workspace_id,owner_id,id,packaging_component_id,packaging_supplier_product_id,
    internal_lot_number,supplier_lot_number,received_date,opening_quantity,unit,
    location,status,notes,total_acquisition_cost,acquisition_cost_currency,cost_notes,
    created_at,updated_at
  ) values (
    wid,uid,lot_id,candidate_lot->>'packaging_component_id',
    nullif(candidate_lot->>'packaging_supplier_product_id',''),
    candidate_lot->>'internal_lot_number',nullif(candidate_lot->>'supplier_lot_number',''),
    candidate_lot->>'received_date',(candidate_lot->>'opening_quantity')::numeric,
    candidate_lot->>'unit',candidate_lot->>'location',candidate_lot->>'status',
    coalesce(candidate_lot->>'notes',''),nullif(candidate_lot->>'total_acquisition_cost','')::numeric,
    nullif(candidate_lot->>'acquisition_cost_currency',''),nullif(candidate_lot->>'cost_notes',''),
    candidate_lot->>'created_at',candidate_lot->>'updated_at'
  );
  insert into public.packaging_inventory_movements(
    workspace_id,owner_id,id,packaging_inventory_lot_id,type,quantity,unit,reason,
    reference_type,reference_id,notes,occurred_at,created_at
  ) values (
    wid,uid,movement_id,lot_id,'Receipt',quantity,candidate_movement->>'unit',
    candidate_movement->>'reason',nullif(candidate_movement->>'reference_type',''),
    nullif(candidate_movement->>'reference_id',''),coalesce(candidate_movement->>'notes',''),
    candidate_movement->>'occurred_at',candidate_movement->>'created_at'
  );
  return jsonb_build_object('lotId',lot_id,'movementId',movement_id);
end $$;

create or replace function public.append_packaging_inventory_movement_v1(candidate_movement jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  wid uuid;
  lot public.packaging_inventory_lots%rowtype;
  movement_type text := candidate_movement->>'type';
  movement_id text := nullif(candidate_movement->>'id','');
  quantity numeric := (candidate_movement->>'quantity')::numeric;
  converted numeric;
  resulting_balance numeric;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select w.id into wid from public.workspaces w where w.owner_id = uid;
  if wid is null then raise exception 'Workspace not found'; end if;
  if movement_id is null or movement_type not in ('Consumption','Waste','Sample','Adjustment') then
    raise exception 'Unsupported packaging inventory movement';
  end if;
  if quantity = 0 or (movement_type <> 'Adjustment' and quantity < 0) then
    raise exception 'Movement quantity is invalid';
  end if;
  select l.* into lot from public.packaging_inventory_lots l
    where l.workspace_id = wid and l.id = candidate_movement->>'packaging_inventory_lot_id' for update;
  if not found then raise exception 'Packaging Inventory Lot not found'; end if;
  converted := public.kf_convert_quantity(quantity,candidate_movement->>'unit',lot.unit);
  if converted is null then raise exception 'Incompatible packaging units'; end if;
  resulting_balance := public.kf_packaging_balance(wid,lot.id)
    + case when movement_type = 'Adjustment' then converted else -abs(converted) end;
  if resulting_balance < 0 then raise exception 'Insufficient packaging balance'; end if;

  insert into public.packaging_inventory_movements(
    workspace_id,owner_id,id,packaging_inventory_lot_id,type,quantity,unit,reason,
    reference_type,reference_id,notes,occurred_at,created_at
  ) values (
    wid,uid,movement_id,lot.id,movement_type,quantity,candidate_movement->>'unit',
    candidate_movement->>'reason',nullif(candidate_movement->>'reference_type',''),
    nullif(candidate_movement->>'reference_id',''),coalesce(candidate_movement->>'notes',''),
    candidate_movement->>'occurred_at',candidate_movement->>'created_at'
  );
  return jsonb_build_object('movementId',movement_id,'resultingBalance',resulting_balance);
end $$;

revoke all on function public.record_inventory_lot_receipt_v1(jsonb,jsonb) from public, anon;
revoke all on function public.append_inventory_movement_v1(jsonb) from public, anon;
revoke all on function public.record_packaging_lot_receipt_v1(jsonb,jsonb) from public, anon;
revoke all on function public.append_packaging_inventory_movement_v1(jsonb) from public, anon;
grant execute on function public.record_inventory_lot_receipt_v1(jsonb,jsonb) to authenticated, service_role;
grant execute on function public.append_inventory_movement_v1(jsonb) to authenticated, service_role;
grant execute on function public.record_packaging_lot_receipt_v1(jsonb,jsonb) to authenticated, service_role;
grant execute on function public.append_packaging_inventory_movement_v1(jsonb) to authenticated, service_role;

comment on function public.record_inventory_lot_receipt_v1(jsonb,jsonb) is
  'kf.authority.v1 owner_derived atomic raw_material receipt';
comment on function public.append_inventory_movement_v1(jsonb) is
  'kf.authority.v1 owner_derived append_only raw_material movement';
comment on function public.record_packaging_lot_receipt_v1(jsonb,jsonb) is
  'kf.authority.v1 owner_derived atomic packaging receipt';
comment on function public.append_packaging_inventory_movement_v1(jsonb) is
  'kf.authority.v1 owner_derived append_only packaging movement';

-- These document lifecycle functions are authenticated workflows, not public RPCs.
revoke execute on function public.register_document_object(text,text,text,text,text,text,bigint,text) from public, anon;
revoke execute on function public.remove_current_document_object(text) from public, anon;
grant execute on function public.register_document_object(text,text,text,text,text,text,bigint,text) to authenticated, service_role;
grant execute on function public.remove_current_document_object(text) to authenticated, service_role;
