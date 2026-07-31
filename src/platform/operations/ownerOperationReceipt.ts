export type OwnerOperationEntity =
  | "supplier_product"
  | "equipment"
  | "packaging_component"
  | "procurement_request"
  | "procurement_requested_item";

export type OwnerOperationKind = "created" | "updated" | "reused";

export interface OwnerOperationReceipt {
  schemaVersion: 1;
  entityType: OwnerOperationEntity;
  recordId: string;
  workspaceId: string;
  operation: OwnerOperationKind;
  persistedAt: string;
  naturalIdentity: Record<string, string>;
  parent?: {
    entityType: "procurement_request";
    recordId: string;
  };
}

const ownerOperationEntities: OwnerOperationEntity[] = [
  "supplier_product",
  "equipment",
  "packaging_component",
  "procurement_request",
  "procurement_requested_item",
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
    (!receipt.parent ||
      (receipt.parent.entityType === "procurement_request" &&
        typeof receipt.parent.recordId === "string" &&
        !!receipt.parent.recordId)) &&
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
  supplier_product: ["id", "workspace_id", "ingredient_id", "supplier_id", "supplier_name", "product_name", "lifecycle_status", "price_state", "created_at", "updated_at"],
  equipment: ["id", "workspace_id", "name", "equipment_type", "status", "ownership_state", "availability_state", "created_at", "updated_at"],
  packaging_component: ["id", "workspace_id", "name", "category", "status", "ownership_state", "stock_state", "created_at", "updated_at"],
  procurement_request: ["id", "workspace_id", "title", "category", "status", "created_at", "updated_at"],
  procurement_requested_item: ["id", "workspace_id", "procurement_request_id", "name", "category", "status", "created_at", "updated_at"],
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
