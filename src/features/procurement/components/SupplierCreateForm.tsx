import { useId, useRef, useState } from 'react'
import { OperationReceiptPanel, type OperationReceiptPanelResult } from '../../../components/ui/OperationReceiptPanel'
import type { OwnerOperationReceipt } from '../../../platform/operations/ownerOperationReceipt'
import { procurementActions } from '../actions/procurementActions'
import {
  supplierStatuses,
  supplierTypes,
  supplierVerificationStates,
  type Supplier,
  type SupplierCreateInput,
} from '../domain/procurement'
import {
  initialSupplierCreateDraft,
  supplierCreateInputFromDraft,
  supplierCreateValidationError,
  type SupplierCreateDraft,
} from './supplierCreateFormState'

const label = (value: string) => value.replaceAll('_', ' ')

interface SupplierCreateConfirmation {
  supplier: Supplier
  receipt: OwnerOperationReceipt
}

interface SupplierCreateFormProps {
  workspaceId: string
  onCancel: () => void
  onConfirmed: (confirmation: SupplierCreateConfirmation) => Promise<void> | void
}

export function SupplierCreateForm({ workspaceId, onCancel, onConfirmed }: SupplierCreateFormProps) {
  const summaryId = useId()
  const submitting = useRef(false)
  const [draft, setDraft] = useState<SupplierCreateDraft>(initialSupplierCreateDraft)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<OperationReceiptPanelResult>()

  const update = <Key extends keyof SupplierCreateDraft>(key: Key, value: SupplierCreateDraft[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }))
    setError('')
    setResult(undefined)
  }

  const submit = async () => {
    if (submitting.current) return
    const input = supplierCreateInputFromDraft(draft)
    const validationError = supplierCreateValidationError(input)
    if (validationError) {
      setError(validationError)
      return
    }
    submitting.current = true
    setBusy(true)
    setError('')
    setResult(undefined)
    try {
      const outcome = await procurementActions.createSupplier(workspaceId, input)
      if (outcome.state === 'confirmed') {
        await onConfirmed({ supplier: outcome.supplier, receipt: outcome.receipt })
        return
      }
      setResult(outcome)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create Supplier. Review the values and try again.')
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  return (
    <form
      id="supplier-create-form"
      className="panel supplier-create supplier-create-complete"
      aria-busy={busy}
      aria-describedby={`${summaryId}-intro`}
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <header className="supplier-create-header">
        <div>
          <span className="eyebrow">Supplier identity</span>
          <h2>Create Supplier</h2>
          <p id={`${summaryId}-intro`}>Record identity and operating metadata in one confirmed create. This does not approve, order, receive, or verify anything.</p>
        </div>
      </header>

      <div className="supplier-create-layout">
        <fieldset className="supplier-create-fields" disabled={busy}>
          <legend className="visually-hidden">Supplier identity and operating metadata</legend>
          <label>Legal name<input name="legal_name" required autoFocus autoComplete="organization" value={draft.legalName} onChange={(event) => update('legalName', event.target.value)} /></label>
          <label>Trading name <span className="field-optional">optional</span><input name="trading_name" value={draft.tradingName} onChange={(event) => update('tradingName', event.target.value)} /></label>
          <label>Supplier type<select name="supplier_type" value={draft.supplierType} onChange={(event) => update('supplierType', event.target.value as SupplierCreateInput['supplier_type'])}>{supplierTypes.map((type) => <option value={type} key={type}>{label(type)}</option>)}</select></label>
          <label>Status<select name="status" value={draft.status} onChange={(event) => update('status', event.target.value as SupplierCreateInput['status'])}>{supplierStatuses.map((status) => <option value={status} key={status}>{label(status)}</option>)}</select></label>
          <label>Website <span className="field-optional">optional</span><input name="website_url" type="url" inputMode="url" placeholder="https://supplier.example" value={draft.websiteUrl} onChange={(event) => update('websiteUrl', event.target.value)} /></label>
          <label>Country <span className="field-optional">optional</span><input name="country_code" inputMode="text" autoCapitalize="characters" maxLength={2} pattern="[A-Za-z]{2}" placeholder="NO" value={draft.countryCode} onChange={(event) => update('countryCode', event.target.value.toUpperCase())} /></label>
          <label>Default currency <span className="field-optional">optional</span><input name="default_currency" inputMode="text" autoCapitalize="characters" maxLength={3} pattern="[A-Za-z]{3}" placeholder="NOK" value={draft.defaultCurrency} onChange={(event) => update('defaultCurrency', event.target.value.toUpperCase())} /></label>
          <label>Verification state<select name="verification_state" value={draft.verificationState} onChange={(event) => update('verificationState', event.target.value as SupplierCreateInput['verification_state'])}>{supplierVerificationStates.map((state) => <option value={state} key={state}>{label(state)}</option>)}</select></label>
          <label className="supplier-create-notes">Internal notes <span className="field-optional">optional</span><textarea name="internal_notes" rows={4} value={draft.internalNotes} onChange={(event) => update('internalNotes', event.target.value)} /></label>
          <label className="check-label supplier-create-preferred"><input name="is_preferred" type="checkbox" checked={draft.isPreferred} onChange={(event) => update('isPreferred', event.target.checked)} />Preferred Supplier</label>
        </fieldset>

        <section className="supplier-create-review" aria-labelledby={`${summaryId}-title`} aria-live="polite">
          <span className="eyebrow">One-operation review</span>
          <h3 id={`${summaryId}-title`}>Review before creating</h3>
          <dl>
            <div><dt>Legal name</dt><dd>{draft.legalName.trim() || 'Not entered'}</dd></div>
            <div><dt>Trading name</dt><dd>{draft.tradingName.trim() || 'Not recorded'}</dd></div>
            <div><dt>Supplier type</dt><dd>{label(draft.supplierType)}</dd></div>
            <div><dt>Status</dt><dd>{label(draft.status)}</dd></div>
            <div><dt>Website</dt><dd>{draft.websiteUrl.trim() || 'Not recorded'}</dd></div>
            <div><dt>Country</dt><dd>{draft.countryCode || 'Not recorded'}</dd></div>
            <div><dt>Default currency</dt><dd>{draft.defaultCurrency || 'Not recorded'}</dd></div>
            <div><dt>Verification</dt><dd>{label(draft.verificationState)}</dd></div>
            <div><dt>Internal notes</dt><dd>{draft.internalNotes.trim() || 'None'}</dd></div>
            <div><dt>Preferred</dt><dd>{draft.isPreferred ? 'Yes' : 'No'}</dd></div>
          </dl>
          <p>Submitting creates one Supplier row. No follow-up update is used to complete this fingerprint.</p>
        </section>
      </div>

      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {result ? <OperationReceiptPanel result={result} onDismiss={() => setResult(undefined)} /> : null}
      <footer className="supplier-create-actions">
        <button type="button" className="button ghost" disabled={busy} onClick={onCancel}>Cancel</button>
        <button type="submit" className="button primary" disabled={busy}>{busy ? 'Creating Supplier…' : 'Create supplier'}</button>
      </footer>
    </form>
  )
}
