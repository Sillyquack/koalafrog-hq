import { describe, expect, it } from 'vitest'
import { formulaSeed } from '../../data/formulaSeed'
import { assertFormulaEquipmentRequirementsReadback, assertSupplierProductPersistenceReadback, formulaEquipmentRequirementDatabaseRow, normalizeProductRow, relationalMigrationPayload, relationalTableByCollection, toDatabaseValue, toDomainValue } from './supabaseWorkspaceRepository'

describe('relational workspace mapping', () => {
  it('maps every relational collection explicitly and keeps Beard Studio as a typed aggregate gateway', () => {
    expect(Object.keys(relationalTableByCollection)).toEqual(Object.keys(formulaSeed).filter(key=>key!=='beardStudio'))
    expect(new Set(Object.values(relationalTableByCollection)).size).toBe(Object.keys(formulaSeed).length-1)
    expect(Object.values(relationalTableByCollection)).not.toContain('workspace_records')
  })

  it('preserves stable IDs while translating column names', () => {
    const product = formulaSeed.products[0]
    const row = toDatabaseValue(product) as Record<string, unknown>
    expect(row.id).toBe(product.id)
    expect(row.development_stage).toBe(product.developmentStage)
    expect(toDomainValue(row)).toEqual(product)
  })

  it('creates migration input without mutating the v9 source', () => {
    const before = structuredClone(formulaSeed)
    const payload = relationalMigrationPayload(formulaSeed)
    expect((payload.formulaVersions as Array<Record<string, unknown>>)[0].formula_id).toBe(formulaSeed.formulaVersions[0].formulaId)
    expect(formulaSeed).toEqual(before)
  })

  it('maps Formula Equipment snapshots onto the existing process requirement root',()=>{
    const requirement={id:'11111111-1111-4111-8111-111111111111',formulaVersionId:'formula-version',catalogKey:'precision_balance',requirementName:'Precision balance',category:'weighing',requiredEquipmentType:'scale',requiredPrecision:.01,unit:'g',quantityRequired:1,requirementLevel:'required',preparationInstructions:'Verify before use.',notes:'',sortOrder:1,createdAt:'2026-08-21T10:00:00.000Z',updatedAt:'2026-08-21T10:00:00.000Z'}
    const row=formulaEquipmentRequirementDatabaseRow(requirement)
    expect(row).toMatchObject({source_type:'formula_version',source_id:'formula-version',formula_version_id:'formula-version',catalog_key:'precision_balance'})
    expect(()=>assertFormulaEquipmentRequirementsReadback([requirement], [row])).not.toThrow()
    expect(()=>assertFormulaEquipmentRequirementsReadback([requirement], [{...row,required_precision:.1}])).toThrow(/requiredPrecision/)
  })

  it('hydrates a nullable Product launch date as absent', () => {
    expect(normalizeProductRow({id:'product',target_launch_date:null})).toEqual({id:'product'})
    expect(normalizeProductRow({id:'product',target_launch_date:''})).toEqual({id:'product'})
  })

  it('does not serialize an absent Product launch date as an empty string', () => {
    const row = toDatabaseValue({ id:'product', targetLaunchDate:undefined }) as Record<string, unknown>
    expect(row.target_launch_date).toBeUndefined()
    expect(row.target_launch_date).not.toBe('')
  })

  it('requires canonical Supplier identity to survive persistence readback', () => {
    const requested={id:'supplier-product',ingredientId:'ingredient',supplierId:'supplier',supplierName:'Mystic Moments UK',productName:'Jojoba Golden Carrier Oil'}
    const persisted={id:'supplier-product',ingredient_id:'ingredient',supplier_id:'supplier',supplier_name:'Mystic Moments UK',product_name:'Jojoba Golden Carrier Oil',created_at:'2026-07-31T08:00:00.000Z',updated_at:'2026-07-31T08:00:00.000Z'}
    expect(()=>assertSupplierProductPersistenceReadback(requested,persisted)).not.toThrow()
    expect(()=>assertSupplierProductPersistenceReadback(requested,{...persisted,supplier_id:null})).toThrow(/selected canonical Supplier/)
    expect(()=>assertSupplierProductPersistenceReadback(requested,{...persisted,supplier_name:'Stale display text'})).toThrow(/selected canonical Supplier/)
  })
})
