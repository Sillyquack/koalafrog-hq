import { useState } from 'react'
import { Download, ShieldCheck, Upload } from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionHeader } from '../components/ui/SectionHeader'
import { useFormulaData } from '../features/formulas/state/FormulaDataContext'
import { createBackup, downloadBackup, validateBackup } from './backup/backup'
import { isSupabaseConfigured, supabase } from './supabase/client'
import { reconciliationSnapshot, validateV9Workspace } from './migration/v9Migration'
import { SupabaseWorkspaceRepository } from './repository/supabaseWorkspaceRepository'

export function PlatformPage() {
  const data = useFormulaData()
  const [report, setReport] = useState<ReturnType<typeof validateV9Workspace>>()
  const [message, setMessage] = useState('')
  const [importMeta, setImportMeta] = useState('')
  const collections = Object.fromEntries(
    Object.entries(data).filter(([, value]) => Array.isArray(value)),
  ) as unknown as Parameters<typeof createBackup>[0]

  const migrate = async () => {
    if (!report || report.blockingErrors) return setMessage('Run a successful dry run first.')
    if (!supabase) return setMessage('Configure Supabase environment variables first.')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return setMessage('Sign in before importing.')
    try {
      const repository = new SupabaseWorkspaceRepository()
      setMessage('Importing…')
      await repository.importV9(user.id, collections, stage => setMessage(`Importing ${stage}…`))
      const remote = await repository.load(user.id)
      const comparison = JSON.stringify(reconciliationSnapshot(collections)) ===
        JSON.stringify(reconciliationSnapshot({ ...collections, ...remote }))
      setMessage(comparison ? 'Migration completed and reconciliation matched.' : 'Imported — reconciliation requires review.')
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
      <section className="panel"><SectionHeader title="Koalafrog Backup" detail="Data export plus explicit Storage manifest" /><button className="button ghost" onClick={() => downloadBackup(createBackup(collections))}><Download size={14} />Export Koalafrog Backup</button><label className="button ghost"><Upload size={14} />Validate Backup<input hidden type="file" accept="application/json" onChange={event => event.target.files?.[0] && inspect(event.target.files[0])} /></label>{importMeta && <p>{importMeta}</p>}<p className="empty-copy">A zero-item Storage manifest means stored files are not included. Use the documented separate authenticated Storage export until archive bundling is implemented.</p></section>
    </div>
  </>
}
