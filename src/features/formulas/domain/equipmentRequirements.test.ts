import { describe, expect, it } from 'vitest'
import type { FormulaEquipmentRequirement } from '../../../types/domain'
import type {
  EquipmentCapability,
  EquipmentItem,
  EquipmentPolicy,
} from '../../procurement/domain/procurement'
import { catalogRequirement } from '../../procurement/domain/equipmentCatalog'
import {
  equipmentPreparationChecklist,
  evaluateEquipmentRequirements,
  hasEquipmentBlockers,
} from './equipmentRequirements'

const requirement = (
  patch: Partial<FormulaEquipmentRequirement> = {},
): FormulaEquipmentRequirement => ({
  ...catalogRequirement('precision_balance'),
  id: '11111111-1111-4111-8111-111111111111',
  formulaVersionId: 'formula-version',
  sortOrder: 1,
  createdAt: '2026-08-21T10:00:00.000Z',
  updatedAt: '2026-08-21T10:00:00.000Z',
  ...patch,
})

const equipment = (patch: Partial<EquipmentItem> = {}): EquipmentItem => ({
  id: 'equipment-1',
  name: 'Precision balance',
  equipment_type: 'scale',
  status: 'available',
  quantity: 1,
  category: 'weighing',
  material: null,
  manufacturer: null,
  model: null,
  serial_number: null,
  supplier_id: null,
  purchase_date: null,
  purchase_cost: null,
  purchase_currency: null,
  location: null,
  capacity_value: 500,
  capacity_unit: 'g',
  minimum_value: 0,
  maximum_value: 500,
  precision_value: 0.01,
  precision_unit: 'g',
  primary_use: null,
  calibration_status: 'verified',
  calibration_date: null,
  calibration_due_date: null,
  calibration_note: null,
  operational_notes: null,
  ownership_state: 'owned',
  availability_state: 'available',
  internal_notes: '',
  archived_at: null,
  revision: 1,
  created_at: '2026-08-21T10:00:00.000Z',
  updated_at: '2026-08-21T10:00:00.000Z',
  ...patch,
})

describe('Formula Equipment readiness', () => {
  it('matches current owned Equipment with unit-aware precision, capacity, range and material constraints', () => {
    const rows = evaluateEquipmentRequirements(
      [
        requirement({
          requiredPrecision: 10,
          minimumCapacity: 250_000,
          minimumValue: 0,
          maximumValue: 500_000,
          unit: 'mg',
          requiredMaterial: 'stainless|glass',
        }),
      ],
      [equipment({ material: 'Stainless steel' })],
    )
    expect(rows[0]).toMatchObject({
      state: 'available',
      blocking: false,
      matchedEquipmentIds: ['equipment-1'],
    })
  })

  it('does not count planned, unavailable, under-specified or unverified records as ready', () => {
    const target = requirement({ requiredPrecision: 0.01, unit: 'g' })
    const planned = evaluateEquipmentRequirements(
      [target],
      [equipment({ ownership_state: 'not_owned', status: 'planned_purchase' })],
    )[0]
    const imprecise = evaluateEquipmentRequirements(
      [target],
      [equipment({ precision_value: 0.1 })],
    )[0]
    const calibrationDue = evaluateEquipmentRequirements(
      [target],
      [equipment({ calibration_status: 'calibration_due' })],
    )[0]
    expect(planned).toMatchObject({ state: 'unavailable', blocking: true })
    expect(imprecise.explanation).toContain('resolution 0.01 g or better')
    expect(calibrationDue).toMatchObject({ state: 'unavailable', blocking: true })
  })

  it('supports capability-only requirements and treats recommended gaps as warnings', () => {
    const target = requirement({
      requiredEquipmentType: undefined,
      requiredCapability: 'temperature_control',
      requirementLevel: 'recommended',
    })
    const capabilities: EquipmentCapability[] = [
      {
        id: 'capability-1',
        equipment_item_id: 'equipment-1',
        capability_type: 'temperature_control',
        minimum_value: null,
        maximum_value: null,
        precision: null,
        unit: null,
        notes: '',
      },
    ]
    const available = evaluateEquipmentRequirements(
      [target],
      [equipment({ name: 'Controlled bath', equipment_type: 'water_bath' })],
      capabilities,
    )
    const missing = evaluateEquipmentRequirements([target], [])
    expect(available[0].state).toBe('available')
    expect(missing[0]).toMatchObject({ state: 'missing', blocking: false })
    expect(hasEquipmentBlockers(missing)).toBe(false)
  })

  it('adds current pre-use cleaning policy to the generated preparation checklist', () => {
    const readiness = evaluateEquipmentRequirements(
      [requirement()],
      [equipment()],
    )
    const policies: EquipmentPolicy[] = [
      {
        id: 'policy-1',
        equipment_item_id: 'equipment-1',
        status: 'active',
        inspection_interval_days: null,
        calibration_interval_days: null,
        maintenance_interval_days: null,
        cleaning_required_before_use: true,
        cleaning_required_after_use: false,
        verification_notes: '',
        revision: 1,
      },
    ]
    expect(equipmentPreparationChecklist(readiness, policies)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'policy:clean-before-use', state: 'warning' }),
      ]),
    )
  })

  it('keeps catalog definitions separate from version-owned snapshots', () => {
    const first = requirement()
    const second = requirement({
      id: '22222222-2222-4222-8222-222222222222',
      requirementName: 'Version-specific balance snapshot',
    })
    expect(catalogRequirement('precision_balance').requirementName).toBe(
      'Precision balance',
    )
    expect(first.requirementName).toBe('Precision balance')
    expect(second.requirementName).toBe('Version-specific balance snapshot')
  })
})
