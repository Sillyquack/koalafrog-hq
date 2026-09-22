import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createHistoricalPurchaseRepository } from './historicalPurchaseRepository'
import type { HistoricalPurchaseInput } from './historicalPurchase'

const input: HistoricalPurchaseInput = {
  acknowledgement: 'already_completed_external_purchase', supplierId: 'supplier', supplierOrderNumber: 'order',
  externalOrderDate: '2025-01-02', currency: 'GBP', merchandiseSubtotal: 10, grandTotal: 10,
  evidenceType: 'invoice', evidenceReference: 'document', evidenceNote: 'Owner evidence',
  lines: [{ lineKey: '1', supplierProductId: 'product', productIdentity: 'Material', packageSize: 100, packageUnit: 'g', packageCount: 1, unitPrice: 10, lineTotal: 10 }],
}
function setup(data: unknown, error: {message: string} | null = null) {
  const rpc = vi.fn().mockResolvedValue({data, error})
  return {rpc, repository: createHistoricalPurchaseRepository({rpc} as unknown as SupabaseClient)}
}
describe('authenticated historical purchase owner API', () => {
  it('preserves explicit key, exact evidence and unknown costs through one RPC', async () => {
    const result = {purchaseOrderId: 'order-id', recordOrigin: 'historical_external', receivingCreated: false}
    const {rpc, repository} = setup(result)
    expect(await repository.reconcileHistoricalPurchase('workspace', 'stable-key', input)).toEqual(result)
    expect(rpc).toHaveBeenCalledExactlyOnceWith('reconcile_historical_external_purchase', {
      target_workspace_id: 'workspace', candidate_idempotency_key: 'stable-key', purchase_payload: input,
    })
    expect(input.vat).toBeUndefined()
  })
  it('exposes direct identity acceptance without a procurement requirement', async () => {
    const mapping = {supplierProductId: 'product', ingredientId: 'ingredient', evidenceReference: 'document', acceptanceNote: 'Reviewed'}
    const {rpc, repository} = setup({mappingId: 'mapping', status: 'accepted'})
    await repository.acceptOwnerReviewedMapping('workspace', 'stable-key', mapping)
    expect(rpc).toHaveBeenCalledExactlyOnceWith('accept_owner_reviewed_supplier_product_mapping', {
      target_workspace_id: 'workspace', candidate_idempotency_key: 'stable-key', mapping_payload: mapping,
    })
  })
  it('propagates DB rejection without a fallback or duplicate retry', async () => {
    const {rpc, repository} = setup(null, {message: 'IDEMPOTENCY_CONFLICT'})
    await expect(repository.reconcileHistoricalPurchase('workspace', 'key', input)).rejects.toThrow('IDEMPOTENCY_CONFLICT')
    expect(rpc).toHaveBeenCalledTimes(1)
  })
  it.each([null, {}, {purchaseOrderId: 'order', recordOrigin: 'planned', receivingCreated: false}, {purchaseOrderId: 'order', recordOrigin: 'historical_external', receivingCreated: true}])('fails closed for invalid reconciliation readback %j', async data => {
    const {repository} = setup(data)
    await expect(repository.reconcileHistoricalPurchase('workspace', 'key', input)).rejects.toThrow('readback')
  })
  it('fails closed for missing mapping readback', async () => {
    const {repository} = setup(null)
    await expect(repository.acceptOwnerReviewedMapping('workspace', 'key', {supplierProductId: 'p', ingredientId: 'i', evidenceReference: 'e', acceptanceNote: 'n'})).rejects.toThrow('readback')
  })
})
