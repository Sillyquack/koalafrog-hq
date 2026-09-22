/** Evidence dates describe external events, never physical receipt or shelf life. */
export interface OwnerReviewedMappingInput {
  supplierProductId: string
  ingredientId: string
  evidenceReference: string
  acceptanceNote: string
}
export interface HistoricalPurchaseLine {
  lineKey: string
  supplierProductId: string
  productIdentity: string
  sku?: string
  variant?: string
  packageSize: number
  packageUnit: string
  packageCount: number
  unitPrice: number
  lineTotal: number
}
export interface HistoricalEvidence {
  evidenceType: string
  evidenceReference: string
  evidenceNote: string
}
export interface HistoricalConfirmation extends HistoricalEvidence {
  supplierConfirmationReference: string
  supplierConfirmationDate: string
  confirmedCurrency: string
  confirmedMerchandiseSubtotal: number
  confirmedGrandTotal: number
  confirmedShipping?: number | null
  confirmedDiscount?: number | null
  confirmedTax?: number | null
  lines: (HistoricalPurchaseLine & { quantity: number })[]
}
export interface HistoricalShipment extends HistoricalEvidence {
  supplierShipmentReference: string
  status: 'preparing' | 'dispatched' | 'in_transit' | 'delayed' | 'carrier_exception' | 'delivery_reported'
  dispatchDate?: string
  reportedAt?: string
  carrier?: string
  trackingNumber?: string
  trackingUrl?: string
  lines: { lineKey: string; packageCount: number; quantity: number; supplierLineReference?: string }[]
}
export interface HistoricalPurchaseInput extends HistoricalEvidence {
  acknowledgement: 'already_completed_external_purchase'
  supplierId: string
  supplierOrderNumber: string
  customerReference?: string
  externalOrderDate: string
  currency: string
  merchandiseSubtotal: number
  shipping?: number | null
  discount?: number | null
  vat?: number | null
  importVat?: number | null
  duty?: number | null
  customs?: number | null
  handling?: number | null
  grandTotal: number
  lines: HistoricalPurchaseLine[]
  confirmation?: HistoricalConfirmation
  shipment?: HistoricalShipment
}
export interface OwnerReviewedMappingResult {
  mappingId: string
  status: 'accepted'
  acceptanceMethod: string
  acceptedBy: string
  acceptedAt: string
}
export interface HistoricalPurchaseResult {
  purchaseOrderId: string
  recordOrigin: 'historical_external'
  purchaseOrderState: 'placed' | 'supplier_confirmed' | 'partially_shipped' | 'shipped'
  purchaseOrderRevision: number
  lines: { lineKey: string; purchaseOrderLineId: string }[]
  confirmationLineIds: string[]
  shipmentLineIds: string[]
  confirmationId: string | null
  confirmationState: 'accepted_exact' | null
  shipmentId: string | null
  shipmentState: HistoricalShipment['status'] | null
  receivingCreated: false
}
/** Owner action API. Callers must retain the same key and payload on uncertain retries. */
export interface HistoricalPurchaseRepository {
  acceptOwnerReviewedMapping(workspaceId: string, idempotencyKey: string, input: OwnerReviewedMappingInput): Promise<OwnerReviewedMappingResult>
  reconcileHistoricalPurchase(workspaceId: string, idempotencyKey: string, input: HistoricalPurchaseInput): Promise<HistoricalPurchaseResult>
}
