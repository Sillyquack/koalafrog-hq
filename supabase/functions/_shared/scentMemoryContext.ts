export interface ScentMemoryContextSelection {
  productId?: string;
  formulaVersionId?: string;
  selectedIngredientIds: string[];
}
export interface ScentMemoryContextSession {
  id: string;
  product_id: string | null;
  formula_version_id: string | null;
  lab_batch_id: string | null;
  ingredient_id: string | null;
}
export function relevantScentMemorySessions<T extends ScentMemoryContextSession>(
  sessions: T[],
  selection: ScentMemoryContextSelection,
  relevantLabBatchIds: string[],
) {
  return sessions.filter(
    (memory) =>
      (!!selection.productId && memory.product_id === selection.productId) ||
      (!!selection.formulaVersionId &&
        memory.formula_version_id === selection.formulaVersionId) ||
      (!!memory.lab_batch_id && relevantLabBatchIds.includes(memory.lab_batch_id)) ||
      (!!memory.ingredient_id &&
        selection.selectedIngredientIds.includes(memory.ingredient_id)),
  );
}
