import { CircleAlert, ClipboardCheck, LockKeyhole } from 'lucide-react'
import type { FormulaEquipmentRequirement, FormulaVersion } from '../../../types/domain'
import type {
  EquipmentCapability,
  EquipmentItem,
  EquipmentPolicy,
} from '../../procurement/domain/procurement'
import {
  equipmentPreparationChecklist,
  evaluateEquipmentRequirements,
  hasEquipmentBlockers,
} from '../domain/equipmentRequirements'

export function EquipmentPreparationChecklist({
  version,
  requirements,
  equipment,
  capabilities = [],
  policies = [],
  equipmentError,
}: {
  version: FormulaVersion
  requirements: FormulaEquipmentRequirement[]
  equipment?: EquipmentItem[]
  capabilities?: EquipmentCapability[]
  policies?: EquipmentPolicy[]
  equipmentError?: string
}) {
  const readiness = evaluateEquipmentRequirements(
    requirements,
    equipment,
    capabilities,
  )
  const checklist = equipmentPreparationChecklist(readiness, policies)
  const blocked = hasEquipmentBlockers(readiness)

  return (
    <section className={`panel equipment-checklist execution-equipment-checklist ${blocked ? 'blocked' : ''}`}>
      <header>
        <div>
          <span className="eyebrow">Exact Formula Version preparation</span>
          <h2>Equipment checklist</h2>
          <p>
            <LockKeyhole size={14} /> Formula {version.version} requirements are
            historical snapshots; availability is read from current Equipment.
          </p>
        </div>
        <span className={blocked ? 'blocked' : 'ready'}>
          {blocked ? 'Preparation blocked' : 'No required gaps'}
        </span>
      </header>
      {equipmentError ? (
        <p className="content-note" role="alert">
          <CircleAlert size={14} /> Owned Equipment readback unavailable:{' '}
          {equipmentError}
        </p>
      ) : null}
      {!requirements.length ? (
        <div className="empty-copy">
          <ClipboardCheck size={18} />
          <p>
            This Formula Version predates structured Equipment requirements. No
            requirement is inferred from process prose.
          </p>
        </div>
      ) : (
        <ul>
          {checklist.map((item) => (
            <li className={item.state} key={item.id}>
              <strong>{item.state}</strong>
              <span>
                {item.label}
                <small>{item.detail}</small>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
