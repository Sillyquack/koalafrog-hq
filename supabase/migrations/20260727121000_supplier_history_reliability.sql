-- Canonical supplier operational history. Reliability remains derived at read time;
-- no counters, scores, ratings, or inferred legacy events are stored.

create table public.supplier_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid not null,
  supplier_id uuid not null,
  event_type text not null check (event_type in (
    'quote_received','quote_updated','purchase_planned','purchase_placed',
    'order_confirmed','shipment_dispatched','shipment_received','partial_shipment',
    'cancelled_order','refund','replacement_shipment','damaged_shipment','customs_issue',
    'invoice_received','payment_completed','documentation_requested',
    'documentation_received','documentation_rejected','communication','manual_note'
  )),
  occurred_at timestamptz not null,
  expected_at timestamptz,
  title text not null check (length(trim(title)) > 0),
  description text not null default '',
  supplier_quote_id uuid,
  procurement_request_id uuid,
  supplier_offer_id uuid,
  purchase_plan_id uuid,
  supplier_document_record_id uuid,
  source_key text,
  revision bigint not null default 1 check (revision > 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id,id),
  unique (workspace_id,source_key),
  foreign key (workspace_id,supplier_id) references public.suppliers(workspace_id,id) on delete cascade,
  foreign key (workspace_id,supplier_quote_id) references public.supplier_quotes(workspace_id,id),
  foreign key (workspace_id,procurement_request_id) references public.procurement_requests(workspace_id,id),
  foreign key (workspace_id,supplier_offer_id) references public.procurement_supplier_offers(workspace_id,id),
  foreign key (workspace_id,purchase_plan_id) references public.purchase_plans(workspace_id,id),
  foreign key (workspace_id,supplier_document_record_id) references public.supplier_document_records(workspace_id,id)
);

create index supplier_events_timeline
  on public.supplier_events(workspace_id,supplier_id,occurred_at desc)
  where archived_at is null;

alter table public.supplier_events enable row level security;
create policy owner_all on public.supplier_events
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.workspaces
      where id = workspace_id
        and owner_id = (select auth.uid())
        and lifecycle_state = 'active'
    )
  );
revoke all on public.supplier_events from anon;
grant select,insert,update on public.supplier_events to authenticated;
revoke delete on public.supplier_events from authenticated;

create function public.record_supplier_quote_event() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  insert into public.supplier_events(
    workspace_id,owner_id,supplier_id,event_type,occurred_at,title,
    description,supplier_quote_id,source_key
  ) values (
    new.workspace_id,new.owner_id,new.supplier_id,
    case when tg_op='INSERT' then 'quote_received' else 'quote_updated' end,
    coalesce(new.updated_at,new.created_at,now()),
    case when tg_op='INSERT' then 'Quote received' else 'Quote updated' end,
    coalesce(new.quote_reference,''),
    new.id,
    'supplier_quote:'||new.id::text||':'||case when tg_op='INSERT' then 'received' else 'revision:'||new.revision::text end
  ) on conflict (workspace_id,source_key) do nothing;
  return new;
end $$;
create trigger supplier_quote_history
  after insert or update on public.supplier_quotes
  for each row execute function public.record_supplier_quote_event();

create function public.record_supplier_purchase_event() returns trigger
language plpgsql set search_path=public,pg_temp as $$
declare event_name text; event_title text;
begin
  if new.supplier_id is null then return new; end if;
  if tg_op='INSERT' then
    event_name:='purchase_planned'; event_title:='Purchase planned';
  elsif new.status is not distinct from old.status then
    return new;
  elsif new.status='ordered_external' then
    event_name:='purchase_placed'; event_title:='Purchase placed';
  elsif new.status='partially_received' then
    event_name:='partial_shipment'; event_title:='Partial shipment';
  elsif new.status='received' then
    event_name:='shipment_received'; event_title:='Shipment received';
  elsif new.status='cancelled' then
    event_name:='cancelled_order'; event_title:='Order cancelled';
  else
    return new;
  end if;
  insert into public.supplier_events(
    workspace_id,owner_id,supplier_id,event_type,occurred_at,expected_at,
    title,description,purchase_plan_id,source_key
  ) values (
    new.workspace_id,new.owner_id,new.supplier_id,event_name,
    case when event_name='purchase_placed' then coalesce(new.ordered_at,new.updated_at,now()) else coalesce(new.updated_at,new.created_at,now()) end,
    case when event_name='purchase_placed' then new.target_date::timestamptz else null end,
    event_title,new.title,new.id,
    'purchase_plan:'||new.id::text||':'||event_name
  ) on conflict (workspace_id,source_key) do nothing;
  return new;
end $$;
create trigger supplier_purchase_history
  after insert or update on public.purchase_plans
  for each row execute function public.record_supplier_purchase_event();
