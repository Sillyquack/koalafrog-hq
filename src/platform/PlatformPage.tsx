import { useState } from 'react'
import { Download, ShieldCheck, Upload } from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionHeader } from '../components/ui/SectionHeader'
import { useFormulaData } from '../features/formulas/state/FormulaDataContext'
import { createBackup, downloadBackup, validateBackup } from './backup/backup'
import { isSupabaseConfigured, supabase } from './supabase/client'
import { compareReconciliation, migrationCollectionOrder, reconciliationSnapshot, validateV9Workspace } from './migration/v9Migration'
import { SupabaseWorkspaceRepository } from './repository/supabaseWorkspaceRepository'

export function PlatformPage() {
  const data = useFormulaData()
  const [report, setReport] = useState<ReturnType<typeof validateV9Workspace>>()
  const [message, setMessage] = useState('')
  const [importMeta, setImportMeta] = useState('')
  const collections = Object.fromEntries(
    migrationCollectionOrder.map(collection => [collection, data[collection]]),
  ) as unknown as Parameters<typeof createBackup>[0]

  const exportBackup = async () => {
    try {
      let ownerId: string | undefined
      let manifest: Parameters<typeof createBackup>[1] = []
      let intelligenceHistory: Parameters<typeof createBackup>[3] = {threads:[],runs:[],knowledgeReferences:[],scentMemorySessions:[],scentMemoryCheckpoints:[]}
      if (supabase) {
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError) throw authError
        ownerId = user?.id
        if (ownerId) {
          const result = await supabase.from('document_objects').select('document_record_id,bucket,object_path,original_file_name,mime_type,size,file_version,state,checksum,uploaded_at').eq('owner_id', ownerId).order('uploaded_at')
          if (result.error) throw result.error
          manifest = result.data.map(row => ({documentId: row.document_record_id,bucket: row.bucket,objectPath: row.object_path,fileName: row.original_file_name,size: row.size,mimeType: row.mime_type,fileVersion: row.file_version,state: row.state as 'Current'|'Superseded'|'Removed',...(row.checksum ? {checksum: row.checksum} : {}),uploadedAt: row.uploaded_at}))
          const [threads,runs,references,scentSessions,scentCheckpoints]=await Promise.all([supabase.from('intelligence_threads').select('*').eq('owner_user_id',ownerId).order('created_at'),supabase.from('intelligence_runs').select('*').eq('owner_user_id',ownerId).order('created_at'),supabase.from('knowledge_references').select('*').eq('owner_user_id',ownerId).order('created_at'),supabase.from('scent_memory_sessions').select('*').eq('owner_user_id',ownerId).order('created_at'),supabase.from('scent_memory_checkpoints').select('*').eq('owner_user_id',ownerId).order('created_at')])
          const historyError=threads.error??runs.error??references.error??scentSessions.error??scentCheckpoints.error
          if(historyError)throw historyError
          intelligenceHistory={threads:threads.data??[],runs:runs.data??[],knowledgeReferences:references.data??[],scentMemorySessions:scentSessions.data??[],scentMemoryCheckpoints:scentCheckpoints.data??[]}
        }
      }
      downloadBackup(createBackup(collections, manifest, ownerId, intelligenceHistory))
      setMessage(`Backup exported with ${manifest.length} private Storage metadata record${manifest.length === 1 ? '' : 's'}; file binaries are not included.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Backup export failed.')
    }
  }

  const migrate = async () => {
    if (!report || report.blockingErrors) return setMessage('Run a successful dry run first.')
    if (!supabase) return setMessage('Configure Supabase environment variables first.')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return setMessage('Sign in before importing.')
    try {
      const repository = new SupabaseWorkspaceRepository()
      setMessage('Importing…')
      const imported=await repository.importV9(user.id, collections, stage => setMessage(`Importing ${stage}…`))
      const remote = await repository.load(user.id)
      const localSnapshot=reconciliationSnapshot(collections),remoteSnapshot=reconciliationSnapshot(remote)
      const comparison=compareReconciliation(localSnapshot,remoteSnapshot)
      if(comparison.complete){await repository.completeReconciliation(imported.migrationRunId,comparison);setMessage('Migration completed, reconciled, and remote workspace activated.')}else {const countDifferences=Object.keys(localSnapshot.counts).filter(key=>localSnapshot.counts[key]!==remoteSnapshot.counts[key]);setMessage(`Imported — reconciliation requires review (${comparison.results.filter(result=>!result.matched).map(result=>result.section).join(', ')}${countDifferences.length?`; collections: ${countDifferences.join(', ')}`:''}). Remote workspace was not activated.`)}
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Migration failed.')
    }
  }

  const inspect = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const result = validateBackup(JSON.parse(String(reader.result)))
        const metadata = result.metadata
        setImportMeta(result.valid && metadata
          ? `Valid ${metadata.format} · ${Object.keys(metadata.entityCounts ?? {}).length} collections · ${metadata.storageObjectCount} storage objects`
          : `Rejected: ${result.errors.join(' ')}`)
      } catch {
        setImportMeta('Rejected: malformed JSON.')
      }
    }
    reader.readAsText(file)
  }

  return <>
    <PageHeader eyebrow="Durability, migration, and recovery" title="Platform Foundation" description="Supabase becomes authoritative only after authenticated import and successful reconciliation. Local v9 remains an untouched rollback source." />
    <div className="compliance-notice"><ShieldCheck /><div><strong>{isSupabaseConfigured ? 'Supabase client configured' : 'Supabase setup required'}</strong><p>Browser-safe anon credentials only. Service-role secrets never belong in the frontend.</p></div></div>
    <div className="compliance-grid">
      <section className="panel"><SectionHeader title="Local v9 migration" detail="Explicit dry run before any remote write" /><button className="button ghost" onClick={() => setReport(validateV9Workspace(collections))}>Validate local workspace</button>{report && <><h3>{report.state}</h3><p>{report.recordsReady} records ready · {report.blockingErrors} blocking errors · {report.warnings} warnings</p><button className="button primary" disabled={!!report.blockingErrors || !isSupabaseConfigured} onClick={migrate}>Import to Supabase</button></>}{message && <p className="form-error">{message}</p>}</section>
      <section className="panel"><SectionHeader title="Koalafrog Backup" detail="Data export plus explicit Storage manifest" /><button className="button ghost" onClick={exportBackup}><Download size={14} />Export Koalafrog Backup</button><label className="button ghost"><Upload size={14} />Validate Backup<input hidden type="file" accept="application/json" onChange={event => event.target.files?.[0] && inspect(event.target.files[0])} /></label>{importMeta && <p>{importMeta}</p>}<p className="empty-copy">The manifest lists private document versions and lifecycle state, but file binaries are not included. Use the documented separate authenticated Storage export.</p></section>
    </div>
  </>
}
