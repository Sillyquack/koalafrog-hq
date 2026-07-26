import { useMemo, useState } from 'react'
import { Plus, Search, Truck } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '../../components/ui/PageHeader'
import { procurementActions } from './actions/procurementActions'
import { SupplierIntelligencePanel } from './SupplierIntelligencePanel'
import { useProcurement } from './useProcurement'

export function SuppliersPage() {
  const { workspace, data, error, refresh } = useProcurement()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState('')

  const suppliers = useMemo(
    () => data?.suppliers.filter((supplier) => !supplier.archived_at) ?? [],
    [data],
  )
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    return suppliers.filter((supplier) =>
      !query || `${supplier.legal_name} ${supplier.trading_name ?? ''}`.toLowerCase().includes(query),
    )
  }, [search, suppliers])
  const requestedSupplierId = params.get('supplier')
  const selectedSupplierId = suppliers.some((supplier) => supplier.id === requestedSupplierId)
    ? requestedSupplierId!
    : suppliers[0]?.id

  if (error) {
    return (
      <section className="panel procurement-state" role="alert">
        <h1>Suppliers unavailable</h1>
        <p>{error}</p>
        <button className="button ghost" onClick={refresh}>Retry</button>
      </section>
    )
  }
  if (!data) {
    return <section className="panel procurement-state" aria-busy="true"><p>Loading hosted suppliers…</p></section>
  }

  const createSupplier = async (form: HTMLFormElement) => {
    if (!workspace) return
    const values = new FormData(form)
    try {
      const supplier = await procurementActions.createSupplier(workspace.workspaceId, {
        legal_name: String(values.get('name') ?? '').trim(),
        supplier_type: String(values.get('type') ?? 'raw_material'),
        status: 'research',
        internal_notes: '',
        is_preferred: false,
      })
      await refresh()
      setParams({ supplier: supplier.id })
      setCreating(false)
      setMessage('Supplier created.')
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Could not create supplier.')
    }
  }

  return (
    <div className="suppliers-workspace">
      <PageHeader
        eyebrow="Supplier knowledge / private workshop"
        title="Suppliers"
        description="The canonical home for supplier identity, operating context and internal Supplier Intelligence."
        action={<button className="button primary" onClick={() => setCreating((value) => !value)}><Plus size={14} />New supplier</button>}
      />

      {creating && (
        <form className="panel compact-create supplier-create" onSubmit={(event) => { event.preventDefault(); void createSupplier(event.currentTarget) }}>
          <label>Legal name<input name="name" required /></label>
          <label>Type<select name="type"><option value="raw_material">Raw material</option><option value="packaging">Packaging</option><option value="equipment">Equipment</option><option value="mixed">Mixed</option></select></label>
          <button className="button primary">Create supplier</button>
        </form>
      )}
      {message && <p className="form-message" role="status">{message}</p>}

      {!suppliers.length ? (
        <section className="panel procurement-empty suppliers-empty">
          <Truck aria-hidden="true" />
          <h2>No suppliers yet</h2>
          <p>Add a supplier to start an identity and intelligence profile. Missing supplier facts will remain unknown.</p>
        </section>
      ) : (
        <div className="suppliers-shell">
          <aside className="panel supplier-picker" aria-label="Suppliers">
            <label className="procurement-search">
              <Search size={15} />
              <span className="visually-hidden">Search suppliers</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search suppliers" />
            </label>
            <div className="supplier-picker-list">
              {visible.map((supplier) => (
                <button
                  type="button"
                  key={supplier.id}
                  className={supplier.id === selectedSupplierId ? 'selected' : ''}
                  aria-pressed={supplier.id === selectedSupplierId}
                  onClick={() => setParams({ supplier: supplier.id })}
                >
                  <span>
                    <strong>{supplier.trading_name || supplier.legal_name}</strong>
                    <small>{supplier.country_code || 'Country unknown'} · {supplier.supplier_type.replaceAll('_', ' ')}</small>
                  </span>
                  <small>{supplier.status.replaceAll('_', ' ')}</small>
                </button>
              ))}
              {!visible.length && <p className="supplier-picker-empty">No suppliers match this search.</p>}
            </div>
          </aside>
          <SupplierIntelligencePanel key={selectedSupplierId} data={data} supplierId={selectedSupplierId} refresh={refresh} />
        </div>
      )}
    </div>
  )
}
