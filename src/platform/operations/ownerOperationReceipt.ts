export type OwnerOperationEntity =
  | "supplier"
  | "supplier_product"
  | "equipment"
  | "packaging_component"
  | "procurement_request"
  | "procurement_requested_item"
  | "procurement_supplier_offer"
  | "purchase_plan"
  | "purchase_plan_basket"
  | "purchase_plan_line";

export type OwnerOperationKind = "created" | "updated" | "reused";

export interface OwnerOperationReceipt {
  schemaVersion: 1;
  entityType: OwnerOperationEntity;
  recordId: string;
  workspaceId: string;
  operation: OwnerOperationKind;
  persistedAt: string;
  naturalIdentity: Record<string, string>;
  changedFields?: Array<{field:string;before:string|null;after:string|null}>;
  parent?: {
    entityType: "procurement_request" | "procurement_requested_item";
    recordId: string;
  };
  supplierId?: string;
  sourceSupplierProductDomain?: "raw_material" | "packaging" | null;
  sourceSupplierProductId?: string | null;
}

export interface SupplierOperationReceipt extends OwnerOperationReceipt {
  entityType: "supplier";
  operation: "created";
}

export interface ProcurementSupplierOfferOperationReceipt
  extends OwnerOperationReceipt {
  entityType: "procurement_supplier_offer";
  operation: "created";
  parent: { entityType: "procurement_requested_item"; recordId: string };
  supplierId: string;
  sourceSupplierProductDomain: "raw_material" | "packaging" | null;
  sourceSupplierProductId: string | null;
}

const ownerOperationEntities: OwnerOperationEntity[] = [
  "supplier",
  "supplier_product",
  "equipment",
  "packaging_component",
  "procurement_request",
  "procurement_requested_item",
  "procurement_supplier_offer",
  "purchase_plan",
  "purchase_plan_basket",
  "purchase_plan_line",
];
const ownerOperationKinds: OwnerOperationKind[] = [
  "created",
  "updated",
  "reused",
];

export function isOwnerOperationReceipt(
  value: unknown,
  expected: {
    entityType?: OwnerOperationEntity;
    recordId?: string;
    workspaceId?: string;
  } = {},
): value is OwnerOperationReceipt {
  if (!value || typeof value !== "object") return false;
  const receipt = value as Partial<OwnerOperationReceipt>;
  return (
    receipt.schemaVersion === 1 &&
    ownerOperationEntities.includes(receipt.entityType as OwnerOperationEntity) &&
    typeof receipt.recordId === "string" &&
    !!receipt.recordId &&
    typeof receipt.workspaceId === "string" &&
    !!receipt.workspaceId &&
    ownerOperationKinds.includes(receipt.operation as OwnerOperationKind) &&
    typeof receipt.persistedAt === "string" &&
    !!receipt.naturalIdentity &&
    typeof receipt.naturalIdentity === "object" &&
    !Array.isArray(receipt.naturalIdentity) &&
    Object.values(receipt.naturalIdentity).every(
      (item) => typeof item === "string",
    ) &&
    (!receipt.changedFields||(
      Array.isArray(receipt.changedFields)&&receipt.changedFields.every(item=>
        !!item&&typeof item.field==='string'&&(item.before===null||typeof item.before==='string')&&(item.after===null||typeof item.after==='string')
      )
    ))&&
    (!receipt.parent ||
      (["procurement_request", "procurement_requested_item"].includes(receipt.parent.entityType) &&
        typeof receipt.parent.recordId === "string" &&
        !!receipt.parent.recordId)) &&
    (receipt.supplierId === undefined ||
      (typeof receipt.supplierId === "string" && !!receipt.supplierId)) &&
    (receipt.sourceSupplierProductDomain === undefined ||
      receipt.sourceSupplierProductDomain === null ||
      receipt.sourceSupplierProductDomain === "raw_material" ||
      receipt.sourceSupplierProductDomain === "packaging") &&
    (receipt.sourceSupplierProductId === undefined ||
      receipt.sourceSupplierProductId === null ||
      (typeof receipt.sourceSupplierProductId === "string" && !!receipt.sourceSupplierProductId)) &&
    ((receipt.sourceSupplierProductDomain === undefined && receipt.sourceSupplierProductId === undefined) ||
      (receipt.sourceSupplierProductDomain === null && receipt.sourceSupplierProductId === null) ||
      ((receipt.sourceSupplierProductDomain === "raw_material" || receipt.sourceSupplierProductDomain === "packaging") &&
        typeof receipt.sourceSupplierProductId === "string" && !!receipt.sourceSupplierProductId)) &&
    (receipt.entityType !== "procurement_supplier_offer" ||
      (receipt.operation === "created" &&
        receipt.parent?.entityType === "procurement_requested_item" &&
        typeof receipt.supplierId === "string" &&
        !!receipt.supplierId &&
        receipt.sourceSupplierProductDomain !== undefined &&
        receipt.sourceSupplierProductId !== undefined)) &&
    (!expected.entityType || receipt.entityType === expected.entityType) &&
    (!expected.recordId || receipt.recordId === expected.recordId) &&
    (!expected.workspaceId || receipt.workspaceId === expected.workspaceId)
  );
}

export type ReconciliationResult =
  | { classification: "create" }
  | { classification: "reuse"; receipt: OwnerOperationReceipt }
  | { classification: "rejected_duplicate"; existingId: string }
  | { classification: "ambiguous_conflict"; candidateIds: string[] };

const required = (value: unknown, label: string) => {
  if (typeof value !== "string" || !value)
    throw new Error(`Persisted ${label} was not returned.`);
  return value;
};

export function receiptFromPersistedRow(
  entityType: OwnerOperationEntity,
  workspaceId: string,
  row: Record<string, unknown>,
  naturalIdentity: Record<string, string>,
  parentId?: string,
): OwnerOperationReceipt {
  const persistedWorkspace = required(row.workspace_id, "workspace ID");
  if (persistedWorkspace !== workspaceId)
    throw new Error("Persisted record did not belong to the active workspace.");
  return {
    schemaVersion: 1,
    entityType,
    recordId: required(row.id, "record ID"),
    workspaceId: persistedWorkspace,
    operation: "created",
    persistedAt: required(row.created_at, "creation timestamp"),
    naturalIdentity,
    ...(parentId
      ? { parent: { entityType: "procurement_request" as const, recordId: parentId } }
      : {}),
  };
}

export function reconcileOwnerRecords(
  entityType: OwnerOperationEntity,
  workspaceId: string,
  rows: Record<string, unknown>[],
  naturalIdentity: Record<string, string>,
): ReconciliationResult {
  const keys = Object.keys(naturalIdentity);
  const matches = rows.filter(
    (row) =>
      row.workspace_id === workspaceId &&
      keys.every((key) => String(row[key] ?? "") === naturalIdentity[key]),
  );
  if (!matches.length) return { classification: "create" };
  if (matches.length > 1)
    return {
      classification: "ambiguous_conflict",
      candidateIds: matches.map((row) => required(row.id, "record ID")),
    };
  return {
    classification: "reuse",
    receipt: {
      ...receiptFromPersistedRow(
        entityType,
        workspaceId,
        matches[0],
        naturalIdentity,
        typeof matches[0].procurement_request_id === "string"
          ? matches[0].procurement_request_id
          : undefined,
      ),
      operation: "reused",
    },
  };
}

export interface OwnerOperationExport {
  schemaVersion: 1;
  workspaceId: string;
  generatedAt: string;
  records: Partial<Record<OwnerOperationEntity, Record<string, unknown>[]>>;
}

const safeFields: Record<OwnerOperationEntity, string[]> = {
  supplier: ["id", "workspace_id", "legal_name", "trading_name", "supplier_type", "status", "website_url", "country_code", "default_currency", "verification_state", "internal_notes", "is_preferred", "created_at", "updated_at"],
  supplier_product: ["id", "workspace_id", "ingredient_id", "supplier_id", "supplier_name", "product_name", "lifecycle_status", "price_state", "created_at", "updated_at"],
  equipment: ["id", "workspace_id", "name", "equipment_type", "status", "ownership_state", "availability_state", "created_at", "updated_at"],
  packaging_component: ["id", "workspace_id", "name", "category", "status", "ownership_state", "stock_state", "created_at", "updated_at"],
  procurement_request: ["id", "workspace_id", "title", "category", "status", "created_at", "updated_at"],
  procurement_requested_item: ["id", "workspace_id", "procurement_request_id", "name", "category", "status", "created_at", "updated_at"],
  procurement_supplier_offer: ["id", "workspace_id", "requested_item_id", "supplier_id", "source_supplier_product_domain", "source_supplier_product_id", "product_title", "package_quantity", "package_unit", "item_price", "currency", "product_url", "date_checked", "created_at", "updated_at"],
  purchase_plan: ["id","workspace_id","title","status","placement_state","order_authorized","target_budget","absolute_stop","credible_range_minimum","credible_range_maximum","worst_credible_range_minimum","worst_credible_range_maximum","estimated_merchandise_total","known_minimum","estimated_landed_total","commercial_checked_at","created_at","updated_at"],
  purchase_plan_basket: ["id","workspace_id","purchase_plan_id","supplier_id","supplier_name_snapshot","currency","merchandise_subtotal","confirmed_discount","post_discount_subtotal","shipping","vat_adjustment","import_vat","customs","dangerous_goods_fee","handling","payment_fx","known_minimum","confirmed_total","commercial_checked_at","created_at"],
  purchase_plan_line: ["id","workspace_id","purchase_plan_id","purchase_plan_basket_id","source_kind","source_record_id","packaging_component_id","supplier_product_id","supplier_product_name_snapshot","supplier_sku_snapshot","pack_size","unit","pack_count","estimated_unit_price","estimated_line_total","currency","product_url_snapshot","commercial_checked_at","commercial_evidence_snapshot","created_at"],
};

export function buildOwnerOperationExport(
  workspaceId: string,
  input: Partial<Record<OwnerOperationEntity, Record<string, unknown>[]>>,
  generatedAt = new Date().toISOString(),
): OwnerOperationExport {
  const records: OwnerOperationExport["records"] = {};
  for (const entity of Object.keys(safeFields) as OwnerOperationEntity[]) {
    records[entity] = (input[entity] ?? [])
      .filter((row) => row.workspace_id === workspaceId)
      .sort((left, right) => String(left.id).localeCompare(String(right.id)))
      .map((row) =>
        Object.fromEntries(
          safeFields[entity]
            .filter((field) => row[field] !== undefined)
            .map((field) => [field, row[field]]),
        ),
      );
  }
  return { schemaVersion: 1, workspaceId, generatedAt, records };
}
