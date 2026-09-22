import type { SupabaseClient } from '@supabase/supabase-js'
import type { HistoricalPurchaseRepository, HistoricalPurchaseResult, OwnerReviewedMappingResult } from './historicalPurchase'

/** Authenticated owner API only. No service key, direct inserts, local fallback or UI provider switch. */
export function createHistoricalPurchaseRepository(client: SupabaseClient): HistoricalPurchaseRepository {
  return {
    async acceptOwnerReviewedMapping(workspaceId, idempotencyKey, input) {
      const { data, error } = await client.rpc('accept_owner_reviewed_supplier_product_mapping', {
        target_workspace_id: workspaceId,
        candidate_idempotency_key: idempotencyKey,
        mapping_payload: input,
      })
      if (error) throw new Error(error.message)
      if (!data?.mappingId || data.status !== 'accepted') throw new Error('Owner mapping readback is missing.')
      return data as OwnerReviewedMappingResult
    },
    async reconcileHistoricalPurchase(workspaceId, idempotencyKey, input) {
      const { data, error } = await client.rpc('reconcile_historical_external_purchase', {
        target_workspace_id: workspaceId,
        candidate_idempotency_key: idempotencyKey,
        purchase_payload: input,
      })
      if (error) throw new Error(error.message)
      if (!data?.purchaseOrderId || data.recordOrigin !== 'historical_external' || data.receivingCreated !== false) {
        throw new Error('Historical purchase readback is missing or outside the reconciliation boundary.')
      }
      return data as HistoricalPurchaseResult
    },
  }
}
