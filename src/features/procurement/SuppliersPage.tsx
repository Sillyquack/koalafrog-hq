import { useMemo, useState } from 'react'
import { Plus, Search, Truck } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '../../components/ui/PageHeader'
import { OperationReceiptPanel } from '../../components/ui/OperationReceiptPanel'
import type { OwnerOperationReceipt } from '../../platform/operations/ownerOperationReceipt'
import { SupplierCreateForm } from './components/SupplierCreateForm'
import { SupplierIntelligencePanel } from './SupplierIntelligencePanel'
import { PurchasingIntelligencePanel } from './PurchasingIntelligencePanel'
import { SupplierDocumentationPanel } from './SupplierDocumentationPanel'
import { SupplierHistoryPanel } from './SupplierHistoryPanel'
import { useProcurement } from './useProcurement'

export function SuppliersPage() {
  const { workspace, data, error, refresh } = useProcurement()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [receipt, setReceipt] = useState<OwnerOperationReceipt>()

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

  return (
    <div className="suppliers-workspace">
      <PageHeader
        eyebrow="Supplier knowledge / private workshop"
        title="Suppliers"
        description="The canonical home for supplier identity, operating context and internal Supplier Intelligence."
        action={<button className="button primary" aria-expanded={creating} aria-controls="supplier-create-form" onClick={() => { setReceipt(undefined); setCreating((value) => !value) }}><Plus size={14} />New supplier</button>}
      />

      {creating && workspace ? <SupplierCreateForm workspaceId={workspace.workspaceId} onCancel={() => setCreating(false)} onConfirmed={async ({ supplier, receipt: confirmedReceipt }) => { await refresh(); setParams({ supplier: supplier.id }); setReceipt(confirmedReceipt); setCreating(false) }} /> : null}
      {receipt ? <OperationReceiptPanel result={{ state: 'confirmed', receipt }} onDismiss={() => setReceipt(undefined)} /> : null}

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
          <div className="supplier-workspace-detail">
            <SupplierIntelligencePanel key={selectedSupplierId} data={data} supplierId={selectedSupplierId} refresh={refresh} />
            {workspace&&<SupplierDocumentationPanel key={`documentation-${selectedSupplierId}`} workspaceId={workspace.workspaceId} data={data} supplierId={selectedSupplierId} refresh={refresh}/>}
            {workspace&&<SupplierHistoryPanel key={`history-${selectedSupplierId}`} workspaceId={workspace.workspaceId} data={data} supplierId={selectedSupplierId} refresh={refresh}/>}
            {workspace && (
              <PurchasingIntelligencePanel
                key={`commercial-${selectedSupplierId}`}
                workspaceId={workspace.workspaceId}
                data={data}
                refresh={refresh}
                selectedSupplierId={selectedSupplierId}
                view="supplier"
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
