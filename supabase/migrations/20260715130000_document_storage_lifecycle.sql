alter table public.document_objects
  add column compliance_dossier_id text,
  add column file_version integer not null default 1 check (file_version > 0),
  add column state text not null default 'Current' check (state in ('Current','Superseded','Removed')),
  add column removed_at timestamptz,
  add column uploader_id uuid references auth.users(id);

create unique index document_objects_record_version
  on public.document_objects(workspace_id, document_record_id, file_version);
create unique index document_objects_one_current
  on public.document_objects(workspace_id, document_record_id)
  where state = 'Current';

create or replace function public.register_document_object(
  document_id text,
  dossier_id text,
  object_bucket text,
  path text,
  file_name text,
  content_type text,
  byte_size bigint,
  content_checksum text default null
) returns public.document_objects
language plpgsql security invoker set search_path = public
as $$
declare
  owner uuid := auth.uid();
  workspace uuid;
  next_version integer;
  result public.document_objects;
begin
  if owner is null then raise exception 'Authentication required'; end if;
  select id into workspace from public.workspaces where owner_id=owner;
  if workspace is null then raise exception 'Owner workspace not found'; end if;
  if object_bucket <> 'compliance-documents' or split_part(path,'/',1) <> owner::text then
    raise exception 'Invalid owner-isolated document path';
  end if;
  if not exists(select 1 from public.compliance_documents where workspace_id=workspace and owner_id=owner and id=document_id) then
    raise exception 'Compliance Document not found';
  end if;
  if not exists(select 1 from public.compliance_dossiers where workspace_id=workspace and owner_id=owner and id=dossier_id) then
    raise exception 'Compliance Dossier not found';
  end if;
  select coalesce(max(file_version),0)+1 into next_version from public.document_objects where workspace_id=workspace and document_record_id=document_id;
  update public.document_objects set state='Superseded' where workspace_id=workspace and document_record_id=document_id and state='Current';
  insert into public.document_objects(workspace_id,owner_id,document_record_id,compliance_dossier_id,bucket,object_path,original_file_name,mime_type,size,checksum,file_version,state,uploader_id)
  values(workspace,owner,document_id,dossier_id,object_bucket,path,file_name,content_type,byte_size,content_checksum,next_version,'Current',owner)
  returning * into result;
  return result;
end $$;

create or replace function public.remove_current_document_object(document_id text)
returns public.document_objects
language plpgsql security invoker set search_path = public
as $$
declare
  owner uuid := auth.uid();
  result public.document_objects;
begin
  update public.document_objects set state='Removed',removed_at=now()
  where owner_id=owner and document_record_id=document_id and state='Current'
  returning * into result;
  if result.id is null then raise exception 'Current document file not found'; end if;
  return result;
end $$;

grant execute on function public.register_document_object(text,text,text,text,text,text,bigint,text) to authenticated;
grant execute on function public.remove_current_document_object(text) to authenticated;
revoke all on function public.register_document_object(text,text,text,text,text,text,bigint,text) from anon;
revoke all on function public.remove_current_document_object(text) from anon;

create or replace function public.complete_v9_reconciliation(run_id uuid,report jsonb) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
declare target_workspace uuid;
begin
  if auth.uid() is null or coalesce((report->>'complete')::boolean,false)=false then raise exception 'A complete authenticated reconciliation report is required'; end if;
  update public.migration_runs set state='Completed',stage='reconciliation',reconciliation=report,completed_at=now()
  where id=run_id and owner_id=auth.uid() returning workspace_id into target_workspace;
  if target_workspace is null then raise exception 'Migration run not found'; end if;
  update public.workspaces set lifecycle_state='active',updated_at=now() where id=target_workspace and owner_id=auth.uid();
end $$;
