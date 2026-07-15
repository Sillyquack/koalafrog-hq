import { describe, expect, it } from "vitest";
import { formulaSeed } from "../../../data/formulaSeed";
import { buildScentContext } from "./contextBuilder";
describe("Scent context builder", () => {
  it("includes selected related evidence and excludes unrelated records deterministically", () => {
    const product = formulaSeed.products[0],
      version = formulaSeed.formulaVersions.find(
        (v) =>
          formulaSeed.formulas.find((f) => f.id === v.formulaId)?.productId ===
          product.id,
      )!;
    const context = buildScentContext(formulaSeed, {
      productId: product.id,
      formulaVersionId: version.id,
      selectedIngredientIds: [],
      conceptMaterials: ["Leather", "Bergamot"],
    });
    expect(context.products.map((x) => x.id)).toEqual([product.id]);
    expect(context.formulaVersions.map((x) => x.id)).toEqual([version.id]);
    expect(
      context.formulaLines.every((x) => x.formulaVersionId === version.id),
    ).toBe(true);
    expect(context.manifest.ingredientIds).toEqual(
      [...context.manifest.ingredientIds].sort(),
    );
    expect(context.conceptMaterials).toEqual(["Bergamot", "Leather"]);
    expect(context.products).toHaveLength(1);
  });
  it("keeps an empty material workspace usable", () => {
    const empty = {
      ...formulaSeed,
      products: [],
      formulas: [],
      formulaVersions: [],
      formulaLines: [],
      ingredients: [],
      labBatches: [],
      labObservations: [],
      testSessions: [],
      testResponses: [],
    };
    const c = buildScentContext(empty, {
      selectedIngredientIds: [],
      conceptMaterials: ["Cardamom"],
    });
    expect(c.conceptMaterials).toEqual(["Cardamom"]);
    expect(c.manifest.ingredientIds).toEqual([]);
  });
});
