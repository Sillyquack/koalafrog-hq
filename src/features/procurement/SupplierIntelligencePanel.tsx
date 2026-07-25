import { useMemo, useState } from 'react'
import { procurementActions } from './actions/procurementActions'
import type { ProcurementData } from './domain/procurement'

const numberOrNull = (value: FormDataEntryValue | null) =>
  value == null || value === '' ? null : Number(value)
const textOrNull = (value: FormDataEntryValue | null) =>
  value == null || value === '' ? null : String(value).trim()

const cardStyle = {
  display: 'grid',
  gap: '14px',
  padding: '16px',
  border: '1px solid var(--line)',
  borderRadius: '8px',
  background: '#eceee7',
} as const

const metricStyle = {
  display: 'grid',
  gap: '3px',
  minWidth: 0,
} as const

const groupStyle = {
  display: 'grid',
  gap: '10px',
  paddingTop: '14px',
  borderTop: '1px solid var(--line)',
} as const

export function SupplierIntelligencePanel({
  data,
  refresh,
}: {
  data: ProcurementData
  refresh: () => Promise<void>
}) {
  const [supplierId, setSupplierId] = useState(data.suppliers[0]?.id ?? '')
  const [editing, setEditing] = useState(false)
  const [message, setMessage] = useState('')
  const supplier = data.suppliers.find((item) => item.id === supplierId)

  const completeness = useMemo(() => {
    if (!supplier) return { completed: 0, total: 10, percent: 0 }
    const fields = [
      supplier.country_code,
      supplier.default_currency,
      supplier.supplier_type,
      supplier.default_lead_time_days,
      supplier.default_payment_terms,
      supplier.default_incoterm,
      supplier.minimum_order_value,
      supplier.internal_rating,
      supplier.website_url,
      supplier.internal_notes,
    ]
    const completed = fields.filter((value) => value != null && value !== '').length
    return { completed, total: fields.length, percent: Math.round((completed / fields.length) * 100) }
  }, [supplier])

  if (!data.suppliers.length || !supplier) return null

  const discounts = data.supplierDiscounts.filter((item) => item.supplier_id === supplier.id)
  const currentDiscounts = discounts.filter((item) => ['available', 'planned', 'unknown'].includes(item.status))
  const shippingRules = data.supplierShippingRules.filter((item) => item.supplier_id === supplier.id)
  const currentShippingRules = shippingRules.filter((item) => ['active', 'needs_verification'].includes(item.status))
  const offers = data.offers.filter((item) => item.supplier_id === supplier.id)

  const save = async (form: HTMLFormElement) => {
    const value = new FormData(form)
    try {
      await procurementActions.update('suppliers', supplier.id, supplier.revision, {
        legal_name: String(value.get('legal_name') ?? supplier.legal_name).trim(),
        trading_name: textOrNull(value.get('trading_name')),
        supplier_type: String(value.get('supplier_type') ?? supplier.supplier_type),
        status: String(value.get('status') ?? supplier.status),
        website_url: textOrNull(value.get('website_url')),
        country_code: textOrNull(value.get('country_code'))?.toUpperCase() ?? null,
        default_currency: textOrNull(value.get('default_currency'))?.toUpperCase() ?? null,
        default_lead_time_days: numberOrNull(value.get('default_lead_time_days')),
        default_payment_terms: textOrNull(value.get('default_payment_terms')),
        default_incoterm: textOrNull(value.get('default_incoterm'))?.toUpperCase() ?? null,
        minimum_order_value: numberOrNull(value.get('minimum_order_value')),
        internal_rating: numberOrNull(value.get('internal_rating')),
        internal_notes: String(value.get('internal_notes') ?? ''),
        is_preferred: value.get('is_preferred') === 'on',
        verification_state: String(value.get('verification_state') ?? supplier.verification_state),
      })
      setEditing(false)
      setMessage('Supplier profile saved.')
      await refresh()
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Could not save supplier profile.')
    }
  }

  const name = supplier.trading_name || supplier.legal_name
  const currency = supplier.default_currency ?? 'Unknown'

  return (
    <section className="panel" style={{ margin: '22px 0' }} aria-labelledby="supplier-intelligence-title">
      <div className="section-header">
        <div>
          <span className="eyebrow">Supplier knowledge</span>
          <h2 id="supplier-intelligence-title" style={{ margin: '5px 0' }}>Supplier intelligence</h2>
          <p>Identity, operating terms, commercial context and decision evidence in one supplier profile.</p>
        </div>
        <label style={{ minWidth: '220px' }}>
          Supplier
          <select
            value={supplierId}
            onChange={(event) => {
              setSupplierId(event.target.value)
              setEditing(false)
              setMessage('')
            }}
          >
            {data.suppliers.map((item) => (
              <option key={item.id} value={item.id}>{item.trading_name || item.legal_name}</option>
            ))}
          </select>
        </label>
      </div>

      {message && <p className="form-message" role="status">{message}</p>}

      {!editing && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div>
              <strong style={{ fontSize: '18px' }}>{name}</strong>
              <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: '11px' }}>
                {supplier.country_code || 'Country unknown'} · {supplier.supplier_type || 'Type unknown'} · {currency}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <span className="status-pill">{supplier.status}</span>
              <span className="status-pill">{supplier.verification_state}</span>
              {supplier.is_preferred && <span className="status-pill green">preferred</span>}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: '12px' }}>
            <div style={metricStyle}><small>Profile completeness</small><strong>{completeness.percent}%</strong></div>
            <div style={metricStyle}><small>Lead time</small><strong>{supplier.default_lead_time_days == null ? 'Unknown' : `${supplier.default_lead_time_days} days`}</strong></div>
            <div style={metricStyle}><small>Minimum order</small><strong>{supplier.minimum_order_value == null ? 'Unknown' : `${supplier.minimum_order_value} ${currency}`}</strong></div>
            <div style={metricStyle}><small>Incoterm</small><strong>{supplier.default_incoterm || 'Unknown'}</strong></div>
            <div style={metricStyle}><small>Payment terms</small><strong>{supplier.default_payment_terms || 'Unknown'}</strong></div>
            <div style={metricStyle}><small>Internal rating</small><strong>{supplier.internal_rating == null ? 'Not rated' : `${supplier.internal_rating}/5`}</strong></div>
          </div>

          <div style={groupStyle}>
            <div>
              <span className="eyebrow">Commercial</span>
              <h3 style={{ margin: '4px 0' }}>Purchasing context</h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '12px' }}>
              <div style={metricStyle}><small>Current discounts</small><strong>{currentDiscounts.length}</strong><span>{discounts.length - currentDiscounts.length} historical</span></div>
              <div style={metricStyle}><small>Current shipping rules</small><strong>{currentShippingRules.length}</strong><span>{shippingRules.length - currentShippingRules.length} historical</span></div>
              <div style={metricStyle}><small>Recorded offers</small><strong>{offers.length}</strong><span>Accepted supplier research offers</span></div>
            </div>
          </div>

          <div style={groupStyle}>
            <div>
              <span className="eyebrow">Documentation</span>
              <h3 style={{ margin: '4px 0' }}>Evidence readiness</h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: '12px' }}>
              {['COA', 'SDS', 'IFRA', 'Allergen sheet', 'Certificates', 'Batch traceability'].map((label) => (
                <div key={label} style={metricStyle}><small>{label}</small><strong>Not recorded</strong></div>
              ))}
            </div>
            <small style={{ color: 'var(--muted)' }}>Structured documentation fields will be added in the next database slice. Nothing is inferred from supplier notes.</small>
          </div>

          <div style={groupStyle}>
            <div>
              <span className="eyebrow">Decision record</span>
              <h3 style={{ margin: '4px 0' }}>Internal notes</h3>
            </div>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap', color: 'var(--muted)', lineHeight: 1.6 }}>
              {supplier.internal_notes || 'No supplier decision notes recorded.'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" className="button primary" onClick={() => setEditing(true)}>Edit supplier profile</button>
            {supplier.website_url && <a className="button ghost" href={supplier.website_url} target="_blank" rel="noreferrer">Open supplier website</a>}
          </div>
        </div>
      )}

      {editing && (
        <form
          className="purchasing-form"
          key={supplier.id}
          onSubmit={(event) => {
            event.preventDefault()
            void save(event.currentTarget)
          }}
        >
          <h3 style={{ gridColumn: '1 / -1' }}>Edit supplier profile</h3>
          <label>Legal name<input name="legal_name" required defaultValue={supplier.legal_name} /></label>
          <label>Trading name<input name="trading_name" defaultValue={supplier.trading_name ?? ''} /></label>
          <label>Supplier type<input name="supplier_type" defaultValue={supplier.supplier_type} placeholder="manufacturer, distributor…" /></label>
          <label>Status<select name="status" defaultValue={supplier.status}>{['research','candidate','approved_internal','active','paused','rejected','archived'].map((status) => <option key={status}>{status}</option>)}</select></label>
          <label>Verification<select name="verification_state" defaultValue={supplier.verification_state}>{['unknown','needs_review','reviewed','rejected'].map((status) => <option key={status}>{status}</option>)}</select></label>
          <label>Country<input name="country_code" maxLength={2} defaultValue={supplier.country_code ?? ''} placeholder="GB" /></label>
          <label>Currency<input name="default_currency" maxLength={3} defaultValue={supplier.default_currency ?? ''} placeholder="GBP" /></label>
          <label>Lead time, days<input name="default_lead_time_days" type="number" min="0" step="1" defaultValue={supplier.default_lead_time_days ?? ''} /></label>
          <label>Minimum order<input name="minimum_order_value" type="number" min="0" step="any" defaultValue={supplier.minimum_order_value ?? ''} /></label>
          <label>Payment terms<input name="default_payment_terms" defaultValue={supplier.default_payment_terms ?? ''} placeholder="Prepaid, Net 30…" /></label>
          <label>Incoterm<input name="default_incoterm" defaultValue={supplier.default_incoterm ?? ''} placeholder="DAP" /></label>
          <label>Internal rating<input name="internal_rating" type="number" min="1" max="5" step="1" defaultValue={supplier.internal_rating ?? ''} /></label>
          <label className="wide">Website<input name="website_url" type="url" defaultValue={supplier.website_url ?? ''} /></label>
          <label className="check"><input name="is_preferred" type="checkbox" defaultChecked={supplier.is_preferred} />Preferred supplier</label>
          <label className="wide">Decision notes<textarea name="internal_notes" rows={5} defaultValue={supplier.internal_notes} placeholder="Record documentation quality, delivery experience, responsiveness, import handling and why this supplier is or is not preferred." /></label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button className="button primary">Save supplier profile</button>
            <button type="button" className="button ghost" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      )}
    </section>
  )
}
