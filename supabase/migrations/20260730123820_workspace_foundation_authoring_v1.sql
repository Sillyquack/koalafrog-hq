-- Post-1.0 workspace foundation authoring. Planning records remain distinct
-- from inventory lots and movements; unknown facts are represented by NULL.

alter table public.supplier_products
  alter column package_quantity drop not null,
  alter column package_unit drop not null,
  alter column price drop not null,
  alter column currency drop not null,
  add column package_description text,
  add column lifecycle_status text not null default 'candidate',
  add column price_state text not null default 'unknown',
  add constraint supplier_products_package_pair check (
    (package_quantity is null and package_unit is null)
    or (package_quantity > 0 and nullif(trim(package_unit), '') is not null)
  ),
  add constraint supplier_products_price_pair check (
    (price is null and currency is null)
    or (price > 0 and currency ~ '^[A-Z]{3}$')
  ),
  add constraint supplier_products_lifecycle_status check (
    lifecycle_status in (
      'candidate','evaluated','shortlisted','planned','quote_requested',
      'available','unavailable','discontinued','rejected'
    )
  ),
  add constraint supplier_products_price_state check (
    price_state in ('unknown','quote_required','recorded')
  ),
  add constraint supplier_products_price_state_consistency check (
    (price_state = 'recorded' and price is not null)
    or (price_state <> 'recorded' and price is null)
  );

update public.supplier_products
set lifecycle_status = case
      when discontinued then 'discontinued'
      when availability_status = 'in_stock' then 'available'
      when availability_status = 'out_of_stock' then 'unavailable'
      else 'evaluated'
    end,
    price_state = 'recorded';

alter table public.packaging_supplier_products
  alter column package_quantity drop not null,
  alter column package_unit drop not null,
  alter column price drop not null,
  alter column currency drop not null,
  add column package_description text,
  add column lifecycle_status text not null default 'candidate',
  add column price_state text not null default 'unknown',
  add constraint packaging_supplier_products_package_pair check (
    (package_quantity is null and package_unit is null)
    or (package_quantity > 0 and nullif(trim(package_unit), '') is not null)
  ),
  add constraint packaging_supplier_products_price_pair check (
    (price is null and currency is null)
    or (price > 0 and currency ~ '^[A-Z]{3}$')
  ),
  add constraint packaging_supplier_products_lifecycle_status check (
    lifecycle_status in (
      'candidate','evaluated','shortlisted','planned','quote_requested',
      'available','unavailable','discontinued','rejected'
    )
  ),
  add constraint packaging_supplier_products_price_state check (
    price_state in ('unknown','quote_required','recorded')
  ),
  add constraint packaging_supplier_products_price_state_consistency check (
    (price_state = 'recorded' and price is not null)
    or (price_state <> 'recorded' and price is null)
  );

update public.packaging_supplier_products
set lifecycle_status = case
      when discontinued then 'discontinued'
      when availability_status = 'in_stock' then 'available'
      when availability_status = 'out_of_stock' then 'unavailable'
      else 'evaluated'
    end,
    price_state = 'recorded';

alter table public.packaging_components
  alter column description drop not null,
  alter column colour drop not null,
  alter column material drop not null,
  alter column notes drop not null,
  add column intended_product_use text,
  add column neck_closure_specification text,
  add column closure_type text,
  add column supplier_id uuid,
  add column supplier_product_id text,
  add column specification_notes text,
  add column sourcing_notes text,
  add column operational_notes text,
  add column ownership_state text not null default 'not_owned',
  add column stock_state text not null default 'not_recorded';

update public.packaging_components
set description = nullif(trim(description), ''),
    colour = nullif(trim(colour), ''),
    material = nullif(trim(material), ''),
    notes = nullif(trim(notes), ''),
    status = case status
      when 'Active' then 'active'
      when 'Archived' then 'discontinued'
      else 'planned'
    end,
    ownership_state = 'not_owned',
    stock_state = 'not_recorded';

alter table public.packaging_components
  add constraint packaging_components_status_v1 check (
    status in (
      'planned','to_source','candidate','specification_required','selected',
      'ordered','received','active','rejected','discontinued'
    )
  ),
  add constraint packaging_components_ownership_state check (
    ownership_state in ('not_owned','ordered','owned')
  ),
  add constraint packaging_components_stock_state check (
    stock_state in ('not_recorded','none','available','unavailable')
  ),
  add constraint packaging_components_capacity_pair check (
    (capacity is null and capacity_unit is null)
    or (capacity > 0 and capacity_unit is not null)
  ),
  add constraint packaging_components_supplier_fk
    foreign key (workspace_id,supplier_id)
    references public.suppliers(workspace_id,id),
  add constraint packaging_components_supplier_product_fk
    foreign key (workspace_id,supplier_product_id)
    references public.packaging_supplier_products(workspace_id,id)
    deferrable initially deferred;

alter table public.equipment_items
  add column quantity integer,
  add column category text,
  add column material text,
  add column primary_use text,
  add column calibration_status text not null default 'not_recorded',
  add column calibration_date date,
  add column calibration_due_date date,
  add column calibration_note text,
  add column operational_notes text,
  add column ownership_state text not null default 'owned',
  add column availability_state text not null default 'unknown',
  add constraint equipment_items_quantity_positive check (
    quantity is null or quantity > 0
  ),
  add constraint equipment_items_measurement_range check (
    minimum_value is null or maximum_value is null or minimum_value <= maximum_value
  ),
  add constraint equipment_items_resolution_positive check (
    precision_value is null or precision_value > 0
  ),
  add constraint equipment_items_calibration_status check (
    calibration_status in (
      'not_applicable','not_recorded','to_verify','verified','calibrated',
      'calibration_due','out_of_service'
    )
  ),
  add constraint equipment_items_ownership_state check (
    ownership_state in ('candidate','planned','ordered','owned','not_owned')
  ),
  add constraint equipment_items_availability_state check (
    availability_state in ('unknown','available','in_use','unavailable','out_of_service')
  );

update public.equipment_items
set quantity = 1,
    category = equipment_type,
    operational_notes = nullif(trim(internal_notes), ''),
    ownership_state = case
      when status in ('research','planned_purchase','ordered') then
        case status when 'ordered' then 'ordered' when 'planned_purchase' then 'planned' else 'candidate' end
      else 'owned'
    end,
    availability_state = case
      when status in ('available','in_use') then status
      when status = 'out_of_service' then 'out_of_service'
      else 'unavailable'
    end,
    calibration_status = case
      when status = 'calibration_required' then 'calibration_due'
      when status = 'out_of_service' then 'out_of_service'
      else 'not_recorded'
    end;

alter table public.procurement_requests drop constraint procurement_requests_status_check;
update public.procurement_requests
set status = case status
  when 'needed' then 'identified'
  when 'recommended' then 'planned'
  else status
end;

alter table public.procurement_requests
  alter column status set default 'identified',
  add constraint procurement_requests_status_v1 check (
    status in (
      'identified','researching','specification_required','quote_requested',
      'planned','ready_to_order','ordered','partially_received','received',
      'cancelled','rejected'
    )
  );

alter table public.procurement_requested_items
  alter column requested_quantity drop not null,
  alter column unit drop not null,
  add column requirement_type text not null default 'raw_material',
  add column reason text,
  add column status text not null default 'identified',
  add column package_preference text,
  add column target_supplier_id uuid,
  add column target_supplier_product_domain text,
  add column target_supplier_product_id text,
  add column decision_notes text,
  add column sourcing_notes text,
  add constraint procurement_requested_items_quantity_pair check (
    (requested_quantity is null and unit is null)
    or (requested_quantity > 0 and nullif(trim(unit), '') is not null)
  ),
  add constraint procurement_requested_items_status check (
    status in (
      'identified','researching','specification_required','quote_requested',
      'planned','ready_to_order','ordered','partially_received','received',
      'cancelled','rejected'
    )
  ),
  add constraint procurement_requested_items_order_ready check (
    status not in ('ready_to_order','ordered','partially_received','received')
    or (requested_quantity > 0 and nullif(trim(unit), '') is not null)
  ),
  add constraint procurement_requested_items_supplier_fk
    foreign key (workspace_id,target_supplier_id)
    references public.suppliers(workspace_id,id),
  add constraint procurement_requested_items_product_domain check (
    target_supplier_product_domain is null
    or target_supplier_product_domain in ('raw_material','packaging','equipment')
  );

update public.procurement_requested_items
set requirement_type = category,
    status = 'identified',
    reason = nullif(trim(notes), '');

create table public.workspace_foundation_status_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid not null,
  entity_type text not null check (
    entity_type in ('supplier_product','packaging_supplier_product','packaging_component','equipment_item','procurement_request','procurement_requested_item')
  ),
  entity_id text not null,
  from_status text,
  to_status text not null,
  changed_by uuid not null,
  changed_at timestamptz not null default statement_timestamp()
);

alter table public.workspace_foundation_status_events enable row level security;
create policy workspace_foundation_status_events_owner_read
  on public.workspace_foundation_status_events
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.workspaces
      where id = workspace_id and owner_id = (select auth.uid())
    )
  );
revoke all on public.workspace_foundation_status_events from anon, authenticated;
grant select on public.workspace_foundation_status_events to authenticated;

create function public.capture_workspace_foundation_status_event_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_status text;
  current_status text;
  entity_kind text;
begin
  entity_kind := tg_argv[0];
  previous_status := case when tg_op = 'INSERT' then null else to_jsonb(old)->>tg_argv[1] end;
  current_status := to_jsonb(new)->>tg_argv[1];
  if tg_op = 'INSERT' or previous_status is distinct from current_status then
    insert into public.workspace_foundation_status_events(
      workspace_id,owner_id,entity_type,entity_id,from_status,to_status,changed_by
    ) values (
      new.workspace_id,new.owner_id,entity_kind,new.id::text,
      previous_status,current_status,new.owner_id
    );
  end if;
  return new;
end
$$;

revoke all on function public.capture_workspace_foundation_status_event_v1() from public, anon, authenticated;

create trigger supplier_products_foundation_status_event
after insert or update of lifecycle_status on public.supplier_products
for each row execute function public.capture_workspace_foundation_status_event_v1('supplier_product','lifecycle_status');
create trigger packaging_supplier_products_foundation_status_event
after insert or update of lifecycle_status on public.packaging_supplier_products
for each row execute function public.capture_workspace_foundation_status_event_v1('packaging_supplier_product','lifecycle_status');
create trigger packaging_components_foundation_status_event
after insert or update of status on public.packaging_components
for each row execute function public.capture_workspace_foundation_status_event_v1('packaging_component','status');
create trigger equipment_items_foundation_status_event
after insert or update of status on public.equipment_items
for each row execute function public.capture_workspace_foundation_status_event_v1('equipment_item','status');
create trigger procurement_requests_foundation_status_event
after insert or update of status on public.procurement_requests
for each row execute function public.capture_workspace_foundation_status_event_v1('procurement_request','status');
create trigger procurement_requested_items_foundation_status_event
after insert or update of status on public.procurement_requested_items
for each row execute function public.capture_workspace_foundation_status_event_v1('procurement_requested_item','status');

comment on table public.workspace_foundation_status_events is
  'Append-only audit history for workspace foundation lifecycle changes.';

-- The preserved v9 import RPC supplies explicit NULLs for columns unknown to
-- that historical payload. Normalize only those absent post-1.0 fields so the
-- rollback source remains importable without inventing commercial facts.
create function public.normalize_workspace_foundation_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name in ('supplier_products','packaging_supplier_products') then
    new.lifecycle_status := coalesce(new.lifecycle_status,
      case when new.discontinued then 'discontinued'
           when new.availability_status = 'in_stock' then 'available'
           when new.availability_status = 'out_of_stock' then 'unavailable'
           else 'candidate' end);
    new.price_state := case when new.price is not null then 'recorded'
                            else coalesce(new.price_state,'unknown') end;
  elsif tg_table_name = 'packaging_components' then
    new.status := case new.status
      when 'Active' then 'active'
      when 'Archived' then 'discontinued'
      else coalesce(new.status,'planned') end;
    new.ownership_state := coalesce(new.ownership_state,'not_owned');
    new.stock_state := coalesce(new.stock_state,'not_recorded');
  elsif tg_table_name = 'equipment_items' then
    new.calibration_status := coalesce(new.calibration_status,'not_recorded');
    new.ownership_state := coalesce(new.ownership_state,
      case when new.status = 'ordered' then 'ordered'
           when new.status = 'planned_purchase' then 'planned'
           when new.status = 'research' then 'candidate'
           else 'owned' end);
    new.availability_state := coalesce(new.availability_state,
      case when new.status in ('available','in_use') then new.status
           when new.status = 'out_of_service' then 'out_of_service'
           else 'unknown' end);
  elsif tg_table_name = 'procurement_requests' then
    new.status := case new.status when 'needed' then 'identified'
                                  when 'recommended' then 'planned'
                                  else coalesce(new.status,'identified') end;
  elsif tg_table_name = 'procurement_requested_items' then
    new.requirement_type := coalesce(new.requirement_type,new.category,'raw_material');
    new.status := coalesce(new.status,'identified');
  end if;
  return new;
end
$$;

revoke all on function public.normalize_workspace_foundation_v1() from public, anon, authenticated;

create trigger supplier_products_foundation_normalize
before insert or update on public.supplier_products
for each row execute function public.normalize_workspace_foundation_v1();
create trigger packaging_supplier_products_foundation_normalize
before insert or update on public.packaging_supplier_products
for each row execute function public.normalize_workspace_foundation_v1();
create trigger packaging_components_foundation_normalize
before insert or update on public.packaging_components
for each row execute function public.normalize_workspace_foundation_v1();
create trigger equipment_items_foundation_normalize
before insert or update on public.equipment_items
for each row execute function public.normalize_workspace_foundation_v1();
create trigger procurement_requests_foundation_normalize
before insert or update on public.procurement_requests
for each row execute function public.normalize_workspace_foundation_v1();
create trigger procurement_requested_items_foundation_normalize
before insert or update on public.procurement_requested_items
for each row execute function public.normalize_workspace_foundation_v1();
