-- Structured supplier-owned document capability and current evidence metadata.
-- This deliberately uses one mutable current supplier-wide record per type/subtype.
-- Archiving retains audit metadata and frees the active key for a renewal/replacement.
-- Entity-specific scopes are deferred until enforceable domain foreign keys can be used.

create table public.supplier_document_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid not null,
  supplier_id uuid not null,
  document_type text not null check (document_type in ('coa','sds','ifra','allergen_declaration','certificate','batch_traceability')),
  document_subtype text,
  capability_state text not null default 'unknown' check (capability_state in ('unknown','available','unavailable','available_on_request','not_applicable')),
  verification_state text not null default 'unverified' check (verification_state in ('unverified','pending_review','verified','rejected','expired')),
  evidence_url text,
  document_title text,
  issuer text,
  issue_date date,
  expiry_date date,
  checked_date date,
  source_reference text,
  notes text not null default '',
  scope_type text not null default 'supplier_wide' check (scope_type='supplier_wide'),
  revision bigint not null default 1 check (revision > 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id,id),
  foreign key (workspace_id,supplier_id) references public.suppliers(workspace_id,id) on delete cascade,
  check (document_type <> 'certificate' or length(trim(coalesce(document_subtype,''))) > 0),
  check (issue_date is null or expiry_date is null or expiry_date >= issue_date)
);

create index supplier_document_records_supplier
  on public.supplier_document_records(workspace_id,supplier_id,document_type)
  where archived_at is null;
create unique index supplier_document_records_active_identity
  on public.supplier_document_records(
    workspace_id,
    supplier_id,
    document_type,
    coalesce(lower(trim(document_subtype)),'')
  ) where archived_at is null;

alter table public.supplier_document_records enable row level security;
create policy owner_all on public.supplier_document_records
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
revoke all on public.supplier_document_records from anon;
grant select,insert,update,delete on public.supplier_document_records to authenticated;
