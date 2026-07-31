import { useEffect, useRef, useState } from 'react'
import { Copy, Download, Eye, RefreshCw, ShieldCheck, Upload } from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionHeader } from '../components/ui/SectionHeader'
import { useFormulaData } from '../features/formulas/state/FormulaDataContext'
import { createBackup, downloadBackup, validateBackup } from './backup/backup'
import { isSupabaseConfigured, supabase } from './supabase/client'
import { compareReconciliation, migrationCollectionOrder, reconciliationSnapshot, validateV9Workspace } from './migration/v9Migration'
import { SupabaseWorkspaceRepository } from './repository/supabaseWorkspaceRepository'
import { loadDevelopmentBackup } from '../features/development/data/developmentExperimentRepository'
import { loadProcurementBackup } from '../features/procurement/data/procurementRepository'
import { platformVersionInfo } from './version'
import {useActiveWorkspace} from './startup/ActiveWorkspaceContext'
import {loadOwnerOperationEvidence} from './operations/ownerOperationEvidenceRepository'
import {comparePlatformMigrationStatus,loadPlatformMigrationStatus,type PlatformMigrationStatus} from './operations/platformMigrationStatus'

export function PlatformPage() {
  const data = useFormulaData()
  const activeWorkspace = useActiveWorkspace()
  const [report, setReport] = useState<ReturnType<typeof validateV9Workspace>>()
  const [message, setMessage] = useState('')
  const [importMeta, setImportMeta] = useState('')
  const [evidenceJson,setEvidenceJson]=useState('')
  const [previewOpen,setPreviewOpen]=useState(false)
  const [migrationStatus,setMigrationStatus]=useState<PlatformMigrationStatus|null>(null)
  const [migrationError,setMigrationError]=useState('')
  const previewCloseRef=useRef<HTMLButtonElement>(null)
  const activeWorkspaceId=activeWorkspace?.workspaceId
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
          intelligenceHistory={threads:threads.data??[],runs:runs.data??[],knowledgeReferences:references.data??[],scentMemorySessions:scentSessions.data??[],scentMemoryCheckpoints:scentCheckpoints.data??[],...await loadDevelopmentBackup(ownerId),procurement:await loadProcurementBackup(ownerId)}
        }
      }
      downloadBackup(createBackup(collections, manifest, ownerId, intelligenceHistory))
      setMessage(`Backup exported with ${manifest.length} private Storage metadata record${manifest.length === 1 ? '' : 's'}; file binaries are not included.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Backup export failed.')
    }
  }

  const operationEvidenceJson = async () => {
    if(evidenceJson)return evidenceJson
    if(!activeWorkspaceId)throw new Error('An active owner workspace is required.')
    const json=JSON.stringify(await loadOwnerOperationEvidence(activeWorkspaceId),null,2)
    setEvidenceJson(json)
    return json
  }

  const previewOperationEvidence = async () => {
    try {
      await operationEvidenceJson();setPreviewOpen(true);setMessage('Owner-scoped evidence is ready to inspect.')
    }catch(error){setMessage(error instanceof Error?error.message:'Operation evidence preview failed.')}
  }
  const copyOperationEvidence=async()=>{
    try{const json=await operationEvidenceJson();await navigator.clipboard.writeText(json);setMessage('Owner-scoped operation evidence JSON copied.')}
    catch(error){setMessage(error instanceof Error?error.message:'Could not copy operation evidence JSON.')}
  }
  const downloadOperationEvidence=async()=>{
    try{const json=await operationEvidenceJson(),url=URL.createObjectURL(new Blob([json],{type:'application/json'})),anchor=document.createElement('a');anchor.href=url;anchor.download='koalafrog-owner-operation-evidence.json';anchor.click();URL.revokeObjectURL(url);setMessage('Owner-scoped operation evidence JSON downloaded.')}
    catch(error){setMessage(error instanceof Error?error.message:'Operation evidence download failed.')}
  }

  const refreshMigrationStatus=async()=>{setMigrationError('');try{setMigrationStatus(await loadPlatformMigrationStatus())}catch(error){setMigrationStatus(null);setMigrationError(error instanceof Error?error.message:'Migration status unavailable.')}}
  useEffect(()=>{if(!activeWorkspaceId)return;let current=true;void loadPlatformMigrationStatus().then(status=>{if(current)setMigrationStatus(status)}).catch(error=>{if(current)setMigrationError(error instanceof Error?error.message:'Migration status unavailable.')});return()=>{current=false}},[activeWorkspaceId])
  useEffect(()=>{if(previewOpen)previewCloseRef.current?.focus()},[previewOpen])
  const compatibility=comparePlatformMigrationStatus(migrationStatus)
  const evidence=evidenceJson?JSON.parse(evidenceJson) as {generatedAt:string;records:Record<string,unknown[]>}:null

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
    <section className="platform-version-info" aria-label="Application information">
      {platformVersionInfo.map(item=><span key={item.label}><strong>{item.label}:</strong> {item.value}</span>)}
    </section>
    <div className="compliance-notice"><ShieldCheck /><div><strong>{isSupabaseConfigured ? 'Supabase client configured' : 'Supabase setup required'}</strong><p>Browser-safe anon credentials only. Service-role secrets never belong in the frontend.</p></div></div>
    <div className="compliance-grid">
      <section className="panel"><SectionHeader title="Local v9 migration" detail="Explicit dry run before any remote write" /><button className="button ghost" onClick={() => setReport(validateV9Workspace(collections))}>Validate local workspace</button>{report && <><h3>{report.state}</h3><p>{report.recordsReady} records ready · {report.blockingErrors} blocking errors · {report.warnings} warnings</p><button className="button primary" disabled={!!report.blockingErrors || !isSupabaseConfigured} onClick={migrate}>Import to Supabase</button></>}{message && <p className="form-error" role="status" aria-live="polite">{message}</p>}</section>
      <section className="panel"><SectionHeader title="Koalafrog Backup" detail="Data export plus explicit Storage manifest" /><button className="button ghost" onClick={exportBackup}><Download size={14} />Export Koalafrog Backup</button><label className="button ghost"><Upload size={14} />Validate Backup<input hidden type="file" accept="application/json" onChange={event => event.target.files?.[0] && inspect(event.target.files[0])} /></label>{importMeta && <p>{importMeta}</p>}<div className="evidence-export-actions" aria-label="Owner operation evidence export"><button className="button ghost" onClick={()=>void previewOperationEvidence()}><Eye size={14}/>Preview JSON</button><button className="button ghost" onClick={()=>void copyOperationEvidence()}><Copy size={14}/>Copy JSON</button><button className="button ghost" onClick={()=>void downloadOperationEvidence()}><Download size={14}/>Download JSON</button></div><p className="empty-copy">Operation evidence contains stable internal IDs for eight explicitly supported domains, including Draft Purchase Plan aggregates. It is owner-authenticated, workspace-scoped, and excludes arbitrary database payloads. The backup manifest lists private document versions and lifecycle state, but file binaries are not included.</p></section>
      <section className={`panel migration-status-card ${compatibility.state}`} aria-labelledby="migration-status-title"><SectionHeader title="Database migration compatibility" detail="Narrow authenticated server-authoritative diagnostic"/><h3 id="migration-status-title">{compatibility.state==='match'?'Match':compatibility.state==='mismatch'?'Mismatch — production operations blocked':'Unknown — production operations blocked'}</h3><dl><div><dt>Actual migration count</dt><dd>{migrationStatus?.migrationCount??'Unknown'}</dd></div><div><dt>Actual migration head</dt><dd className="receipt-id">{migrationStatus?.currentMigrationVersion??'Unknown'}</dd></div><div><dt>Expected application count</dt><dd>{compatibility.expected.migrationCount}</dd></div><div><dt>Expected application head</dt><dd className="receipt-id">{compatibility.expected.currentMigrationVersion}</dd></div><div><dt>Evaluated</dt><dd>{migrationStatus?.evaluatedAt??'Not evaluated'}</dd></div></dl>{migrationError&&<p role="alert" className="form-error">{migrationError}</p>}<p><strong>A mismatch or unknown result blocks production data operations.</strong> No migration SQL, credentials, hostnames, or generic query access are exposed.</p><button className="button ghost" onClick={()=>void refreshMigrationStatus()}><RefreshCw size={14}/>Refresh status</button></section>
    </div>
    {previewOpen&&evidence&&<div className="modal-backdrop" role="presentation"><section className="workspace-modal evidence-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="evidence-preview-title" aria-describedby="evidence-preview-warning" onKeyDown={event=>{if(event.key==='Escape')setPreviewOpen(false)}}><button ref={previewCloseRef} className="text-button modal-close" onClick={()=>setPreviewOpen(false)} aria-label="Close operation evidence preview">Close</button><span className="eyebrow">Owner-scoped allowlisted JSON</span><h2 id="evidence-preview-title">Operation evidence preview</h2><p id="evidence-preview-warning"><strong>Stable internal record IDs are included.</strong> No credentials, Auth internals, or arbitrary table payloads are included.</p><dl className="evidence-preview-summary"><div><dt>Generated</dt><dd>{evidence.generatedAt}</dd></div><div><dt>Categories</dt><dd>{Object.keys(evidence.records).join(', ')}</dd></div><div><dt>Records</dt><dd>{Object.values(evidence.records).reduce((total,records)=>total+records.length,0)}</dd></div></dl><pre tabIndex={0}>{evidenceJson}</pre><footer><button className="button ghost" onClick={()=>void copyOperationEvidence()}><Copy size={14}/>Copy exact JSON</button><button className="button ghost" onClick={()=>void downloadOperationEvidence()}><Download size={14}/>Download exact JSON</button><button className="button primary" onClick={()=>setPreviewOpen(false)}>Done</button></footer></section></div>}
  </>
}
