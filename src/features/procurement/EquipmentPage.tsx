import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Gauge, Plus, Search, Wrench } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { OperationReceiptPanel } from '../../components/ui/OperationReceiptPanel'
import type { OwnerOperationReceipt } from '../../platform/operations/ownerOperationReceipt'
import { procurementActions } from './actions/procurementActions'
import {
  equipmentCatalog,
  equipmentCatalogCategories,
  type EquipmentCatalogItem,
} from './domain/equipmentCatalog'
import { equipmentReadiness } from './domain/procurement'
import { useProcurement } from './useProcurement'

const text = (data: FormData, name: string) =>
  String(data.get(name) ?? '').trim()
const number = (data: FormData, name: string) =>
  text(data, name) === '' ? null : Number(text(data, name))

export function EquipmentPage() {
  const { workspace, data, error, refresh } = useProcurement()
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState('')
  const [receipt, setReceipt] = useState<OwnerOperationReceipt>()

  if (error)
    return (
      <section className="panel procurement-state" role="alert">
        <h1>Equipment unavailable</h1>
        <p>{error}</p>
      </section>
    )
  if (!data)
    return <section className="panel procurement-state">Loading Equipment…</section>

  const create = async (form: HTMLFormElement) => {
    if (!workspace) return
    const values = new FormData(form)
    const quantity = number(values, 'quantity')
    const minimum = number(values, 'minimum')
    const maximum = number(values, 'maximum')
    const resolution = number(values, 'resolution')
    if (quantity != null && (!Number.isInteger(quantity) || quantity <= 0))
      return setMessage('Quantity must be a positive whole number when recorded.')
    if (minimum != null && maximum != null && minimum > maximum)
      return setMessage('Measurement minimum cannot exceed maximum.')
    if (resolution != null && resolution <= 0)
      return setMessage('Resolution must be greater than zero when recorded.')
    try {
      const saved = await procurementActions.createEquipment(workspace.workspaceId, {
        name: text(values, 'name'),
        equipment_type: text(values, 'type'),
        category: text(values, 'category') || null,
        status: text(values, 'status'),
        quantity,
        manufacturer: text(values, 'manufacturer') || null,
        model: text(values, 'model') || null,
        material: text(values, 'material') || null,
        minimum_value: minimum,
        maximum_value: maximum,
        capacity_value: maximum,
        capacity_unit: text(values, 'measurementUnit') || null,
        precision_value: resolution,
        precision_unit: text(values, 'resolutionUnit') || null,
        primary_use: text(values, 'primaryUse') || null,
        calibration_status: text(values, 'calibrationStatus'),
        calibration_date: text(values, 'calibrationDate') || null,
        calibration_due_date: text(values, 'calibrationDueDate') || null,
        calibration_note: text(values, 'calibrationNote') || null,
        operational_notes: text(values, 'operationalNotes') || null,
        ownership_state: text(values, 'ownershipState'),
        availability_state: text(values, 'availabilityState'),
        location: text(values, 'location') || null,
        internal_notes: '',
      })
      setReceipt(saved)
      setCreating(false)
      setMessage('')
      await refresh()
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Could not save Equipment.')
    }
  }

  const addCatalogCandidate = async (item: EquipmentCatalogItem) => {
    if (!workspace) return
    try {
      const saved = await procurementActions.createEquipment(workspace.workspaceId, {
        name: item.name,
        equipment_type: item.equipmentType ?? item.key,
        category: item.category,
        status: 'research',
        quantity: null,
        manufacturer: null,
        model: null,
        material: null,
        minimum_value: null,
        maximum_value: null,
        capacity_value: null,
        capacity_unit: null,
        precision_value: null,
        precision_unit: null,
        primary_use: item.description,
        calibration_status: item.calibrationRelevant
          ? 'not_recorded'
          : 'not_applicable',
        calibration_date: null,
        calibration_due_date: null,
        calibration_note: null,
        operational_notes: item.preparationInstructions,
        ownership_state: 'not_owned',
        availability_state: 'unknown',
        location: null,
        internal_notes:
          'Created explicitly from the canonical reference catalog; ownership and availability remain unverified.',
      })
      setReceipt(saved)
      setMessage('Catalog candidate recorded as not owned with unknown availability.')
      await refresh()
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : 'Could not track catalog candidate.',
      )
    }
  }

  const normalizedSearch = search.trim().toLowerCase()
  const visible = data.equipment.filter(
    (item) =>
      !item.archived_at &&
      `${item.name} ${item.equipment_type}`.toLowerCase().includes(normalizedSearch),
  )
  const trackedNames = new Set(
    data.equipment
      .filter((item) => !item.archived_at)
      .map((item) => item.name.trim().toLowerCase()),
  )

  return (
    <div className="equipment-page">
      <PageHeader
        eyebrow="Owned assets and planned tools"
        title="Equipment"
        description="Structured ownership, availability and calibration facts. Reference knowledge never counts as owned equipment."
        action={
          <button className="button primary" onClick={() => setCreating((open) => !open)}>
            <Plus size={14} /> Add Equipment
          </button>
        }
      />
      {creating ? <EquipmentForm onSubmit={create} message={message} /> : null}
      {receipt ? (
        <OperationReceiptPanel
          result={{ state: 'confirmed', receipt }}
          onDismiss={() => setReceipt(undefined)}
        />
      ) : null}
      {!creating && message ? (
        <p className="content-note" role="status">
          {message}
        </p>
      ) : null}
      <label className="procurement-search">
        <Search size={15} />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search equipment"
        />
      </label>
      <section className="equipment-library">
        {visible.length ? (
          visible.map((item) => {
            const ready = equipmentReadiness(
              item,
              data.capabilities,
              data.equipmentPolicies.find(
                (policy) => policy.equipment_item_id === item.id,
              ),
              data.serviceEvents,
            )
            return (
              <Link className="panel" key={item.id} to={`/equipment/${item.id}`}>
                <Gauge />
                <div>
                  <span className="eyebrow">
                    {item.equipment_type.replaceAll('_', ' ')} ·{' '}
                    {item.ownership_state.replaceAll('_', ' ')}
                  </span>
                  <h2>{item.name}</h2>
                  <p>
                    {item.quantity ?? 'Quantity not recorded'} ·{' '}
                    {item.availability_state.replaceAll('_', ' ')} ·{' '}
                    {item.maximum_value == null
                      ? 'Range not recorded'
                      : `${item.minimum_value ?? 0}–${item.maximum_value} ${item.capacity_unit}`}
                  </p>
                </div>
                <strong className={ready.state}>{ready.state}</strong>
              </Link>
            )
          })
        ) : (
          <article className="panel procurement-empty">
            <Wrench />
            <h2>No Equipment recorded</h2>
            <p>
              Register owned equipment or a planned candidate without inventing
              commercial or calibration facts.
            </p>
          </article>
        )}
      </section>
      <section className="panel equipment-catalog">
        <header>
          <div>
            <span className="eyebrow">Reference knowledge</span>
            <h2>Canonical Equipment Catalog</h2>
            <p>
              Formula requirements select from these definitions. Catalog entries do
              not prove ownership, availability, specification, or calibration.
            </p>
          </div>
          <BookOpen size={20} />
        </header>
        {equipmentCatalogCategories.map((category) => (
          <div className="equipment-catalog-group" key={category}>
            <h3>{category.replaceAll('_', ' ')}</h3>
            <div>
              {equipmentCatalog
                .filter((item) => item.category === category)
                .map((item) => {
                  const tracked = trackedNames.has(item.name.toLowerCase())
                  return (
                    <article key={item.key}>
                      <div>
                        <strong>{item.name}</strong>
                        <p>{item.description}</p>
                      </div>
                      <button
                        className="button ghost"
                        disabled={tracked}
                        onClick={() => void addCatalogCandidate(item)}
                      >
                        {tracked ? 'Tracked' : 'Track as not owned'}
                      </button>
                    </article>
                  )
                })}
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}

function EquipmentForm({
  onSubmit,
  message,
}: {
  onSubmit: (form: HTMLFormElement) => void
  message: string
}) {
  return (
    <form
      className="panel procurement-detail-form"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit(event.currentTarget)
      }}
    >
      <h2>Equipment record</h2>
      <label>Name<input name="name" required /></label>
      <label>Type<select name="type"><option value="scale">Scale</option><option value="mixer">Mixer</option><option value="lab_vessel">Lab vessel</option><option value="production_vessel">Production vessel</option><option value="transfer_tool">Transfer tool or pipette</option><option value="measurement">Measurement</option><option value="other">Other</option></select></label>
      <label>Category<input name="category" /></label>
      <label>Quantity<input name="quantity" type="number" min="1" step="1" /></label>
      <label>Status<select name="status" defaultValue="research"><option value="research">Candidate / research</option><option value="planned_purchase">Planned</option><option value="ordered">Ordered</option><option value="available">Available</option><option value="in_use">In use</option><option value="out_of_service">Out of service</option></select></label>
      <label>Ownership state<select name="ownershipState" defaultValue="candidate"><option>candidate</option><option>planned</option><option>ordered</option><option>owned</option><option value="not_owned">not owned</option></select></label>
      <label>Availability state<select name="availabilityState" defaultValue="unknown"><option>unknown</option><option>available</option><option value="in_use">in use</option><option>unavailable</option><option value="out_of_service">out of service</option></select></label>
      <label>Manufacturer<input name="manufacturer" /></label>
      <label>Model<input name="model" /></label>
      <label>Material<input name="material" /></label>
      <label>Measurement minimum<input name="minimum" type="number" step="any" /></label>
      <label>Measurement maximum<input name="maximum" type="number" step="any" /></label>
      <label>Measurement unit<input name="measurementUnit" placeholder="g, ml or °C" /></label>
      <label>Resolution<input name="resolution" type="number" min="0.000001" step="any" /></label>
      <label>Resolution unit<input name="resolutionUnit" /></label>
      <label>Primary use<input name="primaryUse" /></label>
      <label>Calibration status<select name="calibrationStatus" defaultValue="not_recorded"><option value="not_applicable">Not applicable</option><option value="not_recorded">Not recorded</option><option value="to_verify">To verify</option><option>verified</option><option>calibrated</option><option value="calibration_due">Calibration due</option><option value="out_of_service">Out of service</option></select></label>
      <label>Calibration date<input name="calibrationDate" type="date" /></label>
      <label>Calibration due date<input name="calibrationDueDate" type="date" /></label>
      <label>Location<input name="location" /></label>
      <label className="wide">Calibration note<textarea name="calibrationNote" /></label>
      <label className="wide">Operational notes<textarea name="operationalNotes" /></label>
      {message ? <p className="form-error" role="alert">{message}</p> : null}
      <button className="button primary">Save Equipment</button>
    </form>
  )
}
