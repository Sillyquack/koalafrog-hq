import type { FormulaState } from "../../../types/domain";
import type {
  ContextManifest,
  IntelligenceContextSelection,
} from "./intelligenceContract";
export function buildScentContext(
  state: FormulaState,
  selection: IntelligenceContextSelection,
) {
  const products = state.products
    .filter((p) => p.id === selection.productId)
    .sort((a, b) => a.id.localeCompare(b.id));
  const versions = state.formulaVersions
    .filter((v) => v.id === selection.formulaVersionId)
    .sort((a, b) => a.id.localeCompare(b.id));
  const lines = state.formulaLines
    .filter((l) => versions.some((v) => v.id === l.formulaVersionId))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const ingredientIds = new Set([
    ...selection.selectedIngredientIds,
    ...lines.map((l) => l.ingredientId),
  ]);
  const ingredients = state.ingredients
    .filter((i) => ingredientIds.has(i.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  const batches = state.labBatches
    .filter(
      (b) =>
        (selection.productId && b.productId === selection.productId) ||
        (selection.formulaVersionId &&
          b.formulaVersionId === selection.formulaVersionId),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  const observations = state.labObservations
    .filter((o) => batches.some((b) => b.id === o.labBatchId) && !!o.observedAt)
    .sort((a, b) => a.id.localeCompare(b.id));
  const sessions = state.testSessions
    .filter((s) => batches.some((b) => b.id === s.labBatchId))
    .sort((a, b) => a.id.localeCompare(b.id));
  const responses = state.testResponses
    .filter((r) => sessions.some((s) => s.id === r.testSessionId))
    .sort((a, b) => a.id.localeCompare(b.id));
  const manifest: ContextManifest = {
    contextVersion: 1,
    productIds: products.map((x) => x.id),
    formulaVersionIds: versions.map((x) => x.id),
    ingredientIds: ingredients.map((x) => x.id),
    labBatchIds: batches.map((x) => x.id),
    labObservationIds: observations.map((x) => x.id),
    testSessionIds: sessions.map((x) => x.id),
    testResponseIds: responses.map((x) => x.id),
  };
  return {
    contextVersion: 1,
    products,
    formulaVersions: versions,
    formulaLines: lines,
    ingredients,
    labBatches: batches,
    labObservations: observations,
    testSessions: sessions,
    testResponses: responses,
    conceptMaterials: [...selection.conceptMaterials].sort(),
    manifest,
  };
}
