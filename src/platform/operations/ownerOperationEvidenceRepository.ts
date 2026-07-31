import { supabase } from "../supabase/client";
import {
  buildOwnerOperationExport,
  type OwnerOperationExport,
} from "./ownerOperationReceipt";

const fields = {
  supplierProducts:
    "id,workspace_id,ingredient_id,supplier_id,supplier_name,product_name,lifecycle_status,price_state,created_at,updated_at",
  equipment:
    "id,workspace_id,name,equipment_type,status,ownership_state,availability_state,created_at,updated_at",
  packaging:
    "id,workspace_id,name,category,status,ownership_state,stock_state,created_at,updated_at",
  requests:
    "id,workspace_id,title,category,status,created_at,updated_at",
  requestedItems:
    "id,workspace_id,procurement_request_id,name,category,status,created_at,updated_at",
} as const;

export async function loadOwnerOperationEvidence(
  activeWorkspaceId: string,
): Promise<OwnerOperationExport> {
  if (!supabase)
    throw new Error("Configure Supabase before loading operation evidence.");
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Authenticated owner required.");

  const workspace = await supabase
    .from("workspaces")
    .select("id")
    .eq("id", activeWorkspaceId)
    .eq("owner_id", user.id)
    .eq("lifecycle_state", "active")
    .single();
  if (workspace.error || !workspace.data)
    throw new Error("Active owner workspace could not be resolved.");

  const [supplierProducts, equipment, packaging, requests, requestedItems] =
    await Promise.all([
      supabase
        .from("supplier_products")
        .select(fields.supplierProducts)
        .eq("workspace_id", workspace.data.id),
      supabase
        .from("equipment_items")
        .select(fields.equipment)
        .eq("workspace_id", workspace.data.id),
      supabase
        .from("packaging_components")
        .select(fields.packaging)
        .eq("workspace_id", workspace.data.id),
      supabase
        .from("procurement_requests")
        .select(fields.requests)
        .eq("workspace_id", workspace.data.id),
      supabase
        .from("procurement_requested_items")
        .select(fields.requestedItems)
        .eq("workspace_id", workspace.data.id),
    ]);
  const error =
    supplierProducts.error ??
    equipment.error ??
    packaging.error ??
    requests.error ??
    requestedItems.error;
  if (error) throw error;

  return buildOwnerOperationExport(workspace.data.id, {
    supplier_product: supplierProducts.data ?? [],
    equipment: equipment.data ?? [],
    packaging_component: packaging.data ?? [],
    procurement_request: requests.data ?? [],
    procurement_requested_item: requestedItems.data ?? [],
  });
}
