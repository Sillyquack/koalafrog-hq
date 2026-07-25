import { useEffect, useMemo, useRef, useState } from 'react'
import {
  calculateCartScenario,
  type ProcurementData,
  type SupplierDiscount,
  type SupplierShippingRule,
} from './domain/procurement'
import { procurementActions } from './actions/procurementActions'

const numberOrNull = (value: FormDataEntryValue | null) =>
  value == null || value === '' ? null : Number(value)
const textOrNull = (value: FormDataEntryValue | null) =>
  value == null || value === '' ? null : String(value)
const money = (value: number | null, currency: string) =>
  value == null
    ? 'Unknown'
    : new Intl.NumberFormat('nb-NO', { style: 'currency', currency }).format(value)
const dateLabel = (value: string | null) =>
  value ? new Intl.DateTimeFormat('nb-NO').format(new Date(value)) : 'Not checked'

const cardStyle = {
  display: 'grid',
  gap: '8px',
  padding: '14px',
  border: '1px solid var(--line)',
  borderRadius: '7px',
  background: '#eceee7',
} as const
const cardHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: '12px',
} as const
const actionRowStyle = { display: 'flex', flexWrap: 'wrap', gap: '8px' } as const

export function PurchasingIntelligencePanel({
  workspaceId,
  data,
  refresh,
}: {
  workspaceId: string
  data: ProcurementData
  refresh: () => Promise<void>
}) {
  const [supplierId, setSupplierId] = useState(data.suppliers[0]?.id ?? '')
  const [editingDiscount, setEditingDiscount] = useState<SupplierDiscount | null>(null)
  const [editingRule, setEditingRule] = useState<SupplierShippingRule | null>(null)
  const [discountFormOpen, setDiscountFormOpen] = useState(false)
  const [ruleFormOpen, setRuleFormOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [savedRecordId, setSavedRecordId] = useState('')
  const [offerId, setOfferId] = useState('')
  const [packageCount, setPackageCount] = useState(1)
  const [discountId, setDiscountId] = useState('')
  const [ruleId, setRuleId] = useState('')
  const savedRecordRef = useRef<HTMLDivElement | null>(null)

  const supplier = data.suppliers.find((item) => item.id === supplierId)
  const discounts = useMemo(
    () => data.supplierDiscounts.filter((item) => item.supplier_id === supplierId),
    [data.supplierDiscounts, supplierId],
  )
  const rules = useMemo(
    () => data.supplierShippingRules.filter((item) => item.supplier_id === supplierId),
    [data.supplierShippingRules, supplierId],
  )
  const offers = data.offers.filter(
    (item) => item.supplier_id === supplierId && item.item_price != null && item.currency,
  )
  const offer = data.offers.find((item) => item.id === offerId)
  const currency = offer?.currency ?? supplier?.default_currency ?? 'NOK'
  const scenario = {
    id: 'preview',
    supplier_id: supplierId,
    name: 'Cart preview',
    destination_country_code: 'NO',
    currency,
    shipping_rule_id: ruleId || null,
    discount_id: discountId || null,
    manual_shipping_cost: null,
    manual_tax_estimate: null,
    manual_duty_estimate: null,
    payment_fee: null,
    additional_cost: null,
    status: 'draft' as const,
    notes: '',
    calculated_at: null,
    created_at: '',
    updated_at: '',
  }
  const preview = calculateCartScenario({
    scenario,
    items: offer
      ? [
          {
            id: 'preview-item',
            scenario_id: 'preview',
            supplier_offer_id: offer.id,
            requested_item_id: offer.requested_item_id,
            package_count: packageCount,
            unit_price: offer.item_price!,
            line_discount: 0,
            display_order: 0,
            notes: '',
            created_at: '',
            updated_at: '',
          },
        ]
      : [],
    discount: discounts.find((item) => item.id === discountId),
    shippingRule: rules.find((item) => item.id === ruleId),
  })

  useEffect(() => {
    if (!savedRecordId) return
    const frame = requestAnimationFrame(() => {
      savedRecordRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      savedRecordRef.current?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [savedRecordId, data])

  const closeDiscountForm = () => {
    setEditingDiscount(null)
    setDiscountFormOpen(false)
  }
  const closeRuleForm = () => {
    setEditingRule(null)
    setRuleFormOpen(false)
  }

  const saveDiscount = async (form: HTMLFormElement) => {
    const value = new FormData(form)
    const record = {
      supplier_id: supplierId,
      name: String(value.get('name')),
      discount_type: value.get('discount_type'),
      percentage: numberOrNull(value.get('percentage')),
      fixed_amount: numberOrNull(value.get('fixed_amount')),
      currency: textOrNull(value.get('currency'))?.toUpperCase() ?? null,
      coupon_code: textOrNull(value.get('coupon_code')),
      minimum_order_value: numberOrNull(value.get('minimum_order_value')),
      maximum_discount: numberOrNull(value.get('maximum_discount')),
      first_purchase_only: value.get('first_purchase_only') === 'on',
      requires_newsletter: false,
      valid_from: textOrNull(value.get('valid_from')),
      expires_at: textOrNull(value.get('expires_at')),
      status: value.get('status'),
      source_url: textOrNull(value.get('source_url')),
      evidence_notes: String(value.get('evidence_notes') ?? ''),
      verified_at: textOrNull(value.get('verified_at')),
      used_at: editingDiscount?.used_at ?? null,
    }
    try {
      let id = editingDiscount?.id
      if (editingDiscount) {
        await procurementActions.updatePurchasingRecord(
          'procurement_supplier_discounts',
          editingDiscount.id,
          record,
        )
      } else {
        const saved = await procurementActions.createSupplierDiscount(workspaceId, record)
        id = saved.id
      }
      closeDiscountForm()
      setSavedRecordId(id ?? '')
      setMessage('Discount saved and shown below.')
      await refresh()
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Could not save discount.')
    }
  }

  const saveRule = async (form: HTMLFormElement) => {
    const value = new FormData(form)
    const country = textOrNull(value.get('destination_country_code'))?.toUpperCase() ?? null
    const region = textOrNull(value.get('destination_region'))
    const record = {
      supplier_id: supplierId,
      destination_country_code: country,
      destination_region: region,
      shipping_method: textOrNull(value.get('shipping_method')),
      currency: textOrNull(value.get('currency'))?.toUpperCase() ?? null,
      flat_rate: numberOrNull(value.get('flat_rate')),
      free_shipping_threshold: numberOrNull(value.get('free_shipping_threshold')),
      minimum_order_value: null,
      delivery_estimate_min_days: null,
      delivery_estimate_max_days: null,
      tax_handling: value.get('tax_estimate') === '' ? 'unknown' : 'excluded',
      duty_handling: value.get('duty_estimate') === '' ? 'unknown' : 'excluded',
      tax_estimate: numberOrNull(value.get('tax_estimate')),
      duty_estimate: numberOrNull(value.get('duty_estimate')),
      status: value.get('status'),
      source_url: textOrNull(value.get('source_url')),
      evidence_notes: String(value.get('evidence_notes') ?? ''),
      verified_at: textOrNull(value.get('verified_at')),
    }
    try {
      const duplicate = rules.find(
        (item) =>
          item.id !== editingRule?.id &&
          item.status !== 'inactive' &&
          item.status !== 'expired' &&
          ((country && item.destination_country_code === country) ||
            (!country && region && item.destination_region?.toLowerCase() === region.toLowerCase())),
      )
      const target = editingRule ?? duplicate
      let id = target?.id
      if (target) {
        await procurementActions.updatePurchasingRecord(
          'procurement_supplier_shipping_rules',
          target.id,
          record,
        )
      } else {
        const saved = await procurementActions.createSupplierShippingRule(workspaceId, record)
        id = saved.id
      }
      closeRuleForm()
      setSavedRecordId(id ?? '')
      setMessage(
        duplicate
          ? 'Existing shipping rule updated instead of creating a duplicate.'
          : 'Shipping rule saved and shown below.',
      )
      await refresh()
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Could not save shipping rule.')
    }
  }

  const archiveDiscount = async (discount: SupplierDiscount) => {
    await procurementActions.updatePurchasingRecord('procurement_supplier_discounts', discount.id, {
      status: 'invalid',
    })
    setMessage('Discount archived.')
    if (discountId === discount.id) setDiscountId('')
    await refresh()
  }

  const archiveRule = async (rule: SupplierShippingRule) => {
    await procurementActions.updatePurchasingRecord(
      'procurement_supplier_shipping_rules',
      rule.id,
      { status: 'inactive' },
    )
    setMessage('Shipping rule archived.')
    if (ruleId === rule.id) setRuleId('')
    await refresh()
  }

  const saveScenario = async () => {
    if (!offer) return
    try {
      const saved = await procurementActions.createCartScenario(workspaceId, {
        ...scenario,
        id: undefined,
        name: `${supplier?.trading_name || supplier?.legal_name || 'Supplier'} Norway cart`,
        calculated_at: new Date().toISOString(),
        created_at: undefined,
        updated_at: undefined,
      })
      await procurementActions.createCartScenarioItem(workspaceId, {
        scenario_id: saved.id,
        supplier_offer_id: offer.id,
        requested_item_id: offer.requested_item_id,
        package_count: packageCount,
        unit_price: offer.item_price,
        line_discount: 0,
        display_order: 0,
        notes: '',
      })
      setMessage('Cart scenario saved.')
      await refresh()
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Could not save scenario.')
    }
  }

  if (!data.suppliers.length) return null

  return (
    <section className="purchasing-intelligence" aria-labelledby="purchasing-intelligence-title">
      <header>
        <div>
          <span className="eyebrow">Planning only</span>
          <h2 id="purchasing-intelligence-title">Purchasing intelligence</h2>
          <p>Review supplier terms and estimate a cart. This does not order, pay, or change inventory.</p>
        </div>
        <label>
          Supplier
          <select
            value={supplierId}
            onChange={(event) => {
              setSupplierId(event.target.value)
              setOfferId('')
              setDiscountId('')
              setRuleId('')
              closeDiscountForm()
              closeRuleForm()
            }}
          >
            {data.suppliers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.trading_name || item.legal_name}
              </option>
            ))}
          </select>
        </label>
      </header>

      {message && <p className="form-message" role="status">{message}</p>}

      <div className="purchasing-columns">
        <section className="panel">
          <div className="section-header">
            <div>
              <h3>Commercial terms</h3>
              <p>{discounts.length ? `${discounts.length} saved discount${discounts.length === 1 ? '' : 's'}` : 'No saved discounts'}</p>
            </div>
            <button
              type="button"
              className="button primary"
              onClick={() => {
                setEditingDiscount(null)
                setDiscountFormOpen(true)
              }}
            >
              + Add discount
            </button>
          </div>

          <div style={{ display: 'grid', gap: '10px', marginBottom: '18px' }}>
            {discounts.map((discount) => (
              <div
                key={discount.id}
                ref={savedRecordId === discount.id ? savedRecordRef : undefined}
                tabIndex={savedRecordId === discount.id ? -1 : undefined}
                style={cardStyle}
              >
                <div style={cardHeaderStyle}>
                  <div>
                    <strong>{discount.name}</strong>
                    <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: '10px' }}>
                      {discount.percentage != null ? `${discount.percentage}%` : discount.fixed_amount != null ? money(discount.fixed_amount, discount.currency ?? currency) : discount.discount_type}
                      {discount.coupon_code ? ` · Code ${discount.coupon_code}` : ''}
                      {discount.first_purchase_only ? ' · First order only' : ''}
                    </p>
                  </div>
                  <span className="status-pill">{discount.status}</span>
                </div>
                <small>Checked {dateLabel(discount.verified_at)}</small>
                <div style={actionRowStyle}>
                  <button type="button" className="button ghost" onClick={() => { setEditingDiscount(discount); setDiscountFormOpen(true) }}>Edit</button>
                  {discount.status !== 'invalid' && <button type="button" className="button ghost" onClick={() => void archiveDiscount(discount)}>Archive</button>}
                </div>
              </div>
            ))}
          </div>

          {discountFormOpen && (
            <form
              className="purchasing-form"
              key={editingDiscount?.id ?? `new-${supplierId}`}
              onSubmit={(event) => { event.preventDefault(); void saveDiscount(event.currentTarget) }}
            >
              <h3 style={{ gridColumn: '1 / -1' }}>{editingDiscount ? 'Edit discount' : 'Add discount'}</h3>
              <label>Name<input name="name" required defaultValue={editingDiscount?.name} /></label>
              <label>Type<select name="discount_type" defaultValue={editingDiscount?.discount_type ?? 'percentage'}><option value="percentage">Percentage</option><option value="fixed_amount">Fixed discount</option><option value="free_shipping">Free shipping</option><option value="other">Other</option></select></label>
              <label>Percentage<input name="percentage" type="number" min="0.01" max="100" step="any" defaultValue={editingDiscount?.percentage ?? ''} /></label>
              <label>Fixed amount<input name="fixed_amount" type="number" min="0" step="any" defaultValue={editingDiscount?.fixed_amount ?? ''} /></label>
              <label>Currency<input name="currency" maxLength={3} defaultValue={editingDiscount?.currency ?? currency} /></label>
              <label>Code<input name="coupon_code" defaultValue={editingDiscount?.coupon_code ?? ''} /></label>
              <label>Minimum order<input name="minimum_order_value" type="number" min="0" step="any" defaultValue={editingDiscount?.minimum_order_value ?? ''} /></label>
              <label>Maximum discount<input name="maximum_discount" type="number" min="0" step="any" defaultValue={editingDiscount?.maximum_discount ?? ''} /></label>
              <label>Status<select name="status" defaultValue={editingDiscount?.status ?? 'available'}>{['unknown', 'available', 'planned', 'used', 'expired', 'invalid'].map((status) => <option key={status}>{status}</option>)}</select></label>
              <label>Valid from<input name="valid_from" type="date" defaultValue={editingDiscount?.valid_from ?? ''} /></label>
              <label>Valid until<input name="expires_at" type="date" defaultValue={editingDiscount?.expires_at?.slice(0, 10) ?? ''} /></label>
              <label>Checked date<input name="verified_at" type="date" defaultValue={editingDiscount?.verified_at?.slice(0, 10) ?? ''} /></label>
              <label className="check"><input name="first_purchase_only" type="checkbox" defaultChecked={editingDiscount?.first_purchase_only} />First order only</label>
              <label className="wide">Source URL<input name="source_url" type="url" defaultValue={editingDiscount?.source_url ?? ''} /></label>
              <label className="wide">Notes<textarea name="evidence_notes" defaultValue={editingDiscount?.evidence_notes} /></label>
              <div style={actionRowStyle}>
                <button className="button primary">{editingDiscount ? 'Save changes' : 'Save discount'}</button>
                <button type="button" className="button ghost" onClick={closeDiscountForm}>Cancel</button>
              </div>
            </form>
          )}

          <div className="shipping-form">
            <div className="section-header">
              <div>
                <h3>Shipping rules</h3>
                <p>{rules.length ? `${rules.length} saved rule${rules.length === 1 ? '' : 's'}` : 'No saved shipping rules'}</p>
              </div>
              <button
                type="button"
                className="button primary"
                onClick={() => { setEditingRule(null); setRuleFormOpen(true) }}
              >
                + Add shipping rule
              </button>
            </div>

            <div style={{ display: 'grid', gap: '10px', marginBottom: '18px' }}>
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  ref={savedRecordId === rule.id ? savedRecordRef : undefined}
                  tabIndex={savedRecordId === rule.id ? -1 : undefined}
                  style={cardStyle}
                >
                  <div style={cardHeaderStyle}>
                    <div>
                      <strong>{rule.destination_country_code || rule.destination_region || 'Destination unknown'}</strong>
                      <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: '10px' }}>
                        Shipping {money(rule.flat_rate, rule.currency ?? currency)} · Tax {money(rule.tax_estimate, rule.currency ?? currency)} · Duty {money(rule.duty_estimate, rule.currency ?? currency)}
                      </p>
                    </div>
                    <span className="status-pill">{rule.status}</span>
                  </div>
                  <small>Checked {dateLabel(rule.verified_at)}</small>
                  <div style={actionRowStyle}>
                    <button type="button" className="button ghost" onClick={() => { setEditingRule(rule); setRuleFormOpen(true) }}>Edit</button>
                    {rule.status !== 'inactive' && <button type="button" className="button ghost" onClick={() => void archiveRule(rule)}>Archive</button>}
                  </div>
                </div>
              ))}
            </div>

            {ruleFormOpen && (
              <form
                className="purchasing-form"
                key={editingRule?.id ?? `rule-${supplierId}`}
                onSubmit={(event) => { event.preventDefault(); void saveRule(event.currentTarget) }}
              >
                <h3 style={{ gridColumn: '1 / -1' }}>{editingRule ? 'Edit shipping rule' : 'Add shipping rule'}</h3>
                <label>Country<input name="destination_country_code" maxLength={2} placeholder="NO" defaultValue={editingRule?.destination_country_code ?? ''} /></label>
                <label>Region<input name="destination_region" placeholder="Norway, EU…" defaultValue={editingRule?.destination_region ?? ''} /></label>
                <label>Fixed shipping<input name="flat_rate" type="number" min="0" step="any" defaultValue={editingRule?.flat_rate ?? ''} /></label>
                <label>Free over<input name="free_shipping_threshold" type="number" min="0" step="any" defaultValue={editingRule?.free_shipping_threshold ?? ''} /></label>
                <label>Currency<input name="currency" maxLength={3} defaultValue={editingRule?.currency ?? currency} /></label>
                <label>Tax estimate<input name="tax_estimate" type="number" min="0" step="any" defaultValue={editingRule?.tax_estimate ?? ''} /></label>
                <label>Duty estimate<input name="duty_estimate" type="number" min="0" step="any" defaultValue={editingRule?.duty_estimate ?? ''} /></label>
                <label>Status<select name="status" defaultValue={editingRule?.status ?? 'needs_verification'}>{['active', 'needs_verification', 'inactive', 'expired'].map((status) => <option key={status}>{status}</option>)}</select></label>
                <label>Checked date<input name="verified_at" type="date" defaultValue={editingRule?.verified_at?.slice(0, 10) ?? ''} /></label>
                <label className="wide">Source URL<input name="source_url" type="url" defaultValue={editingRule?.source_url ?? ''} /></label>
                <label className="wide">Notes<textarea name="evidence_notes" defaultValue={editingRule?.evidence_notes} /></label>
                <div style={actionRowStyle}>
                  <button className="button primary">{editingRule ? 'Save changes' : 'Save shipping rule'}</button>
                  <button type="button" className="button ghost" onClick={closeRuleForm}>Cancel</button>
                </div>
              </form>
            )}
          </div>
        </section>

        <section className="panel cart-scenario">
          <h3>Cart scenario</h3>
          <label>Accepted supplier offer<select value={offerId} onChange={(event) => setOfferId(event.target.value)}><option value="">Select offer</option>{offers.map((item) => <option key={item.id} value={item.id}>{item.product_title} · {money(item.item_price, item.currency!)}</option>)}</select></label>
          <label>Package count<input value={packageCount} onChange={(event) => setPackageCount(Math.max(1, Number(event.target.value)))} type="number" min="1" step="1" /></label>
          <label>Discount<select value={discountId} onChange={(event) => setDiscountId(event.target.value)}><option value="">None</option>{discounts.filter((item) => item.status !== 'invalid').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Norway shipping rule<select value={ruleId} onChange={(event) => setRuleId(event.target.value)}><option value="">Unknown</option>{rules.filter((item) => item.status !== 'inactive' && item.status !== 'expired').map((item) => <option key={item.id} value={item.id}>{item.destination_country_code || item.destination_region || 'Unknown destination'}</option>)}</select></label>
          <dl><div><dt>Merchandise</dt><dd>{money(preview.components.merchandise, currency)}</dd></div><div><dt>Discount</dt><dd>{money(preview.components.orderDiscount, currency)}</dd></div><div><dt>Shipping</dt><dd>{money(preview.components.shipping, currency)}</dd></div><div><dt>Tax</dt><dd>{money(preview.components.tax, currency)}</dd></div><div><dt>Duty</dt><dd>{money(preview.components.duty, currency)}</dd></div><div><dt>Payment fee</dt><dd>{money(preview.components.paymentFee, currency)}</dd></div><div><dt>Additional fee</dt><dd>{money(preview.components.additional, currency)}</dd></div><div><dt>Known total</dt><dd>{money(preview.knownTotal, currency)}</dd></div><div><dt>Complete landed total</dt><dd>{money(preview.landedTotal, currency)}</dd></div></dl>
          <p className={preview.complete ? 'complete' : 'unknown'}>{preview.complete ? 'Complete estimate' : `Incomplete · unknown: ${preview.missing.join(', ') || 'none'}`}</p>
          <button className="button primary" disabled={!offer} onClick={() => void saveScenario()}>Save scenario</button>
        </section>
      </div>
    </section>
  )
}
