import { describe, expect, it } from "vitest";
import {
  validateIntelligenceResponse,
  type ContextManifest,
  type IntelligenceResponse,
} from "./intelligenceContract";
const manifest: ContextManifest = {
  contextVersion: 1,
  productIds: ["p"],
  formulaVersionIds: [],
  ingredientIds: ["i"],
  labBatchIds: ["b"],
  labObservationIds: ["o"],
  testSessionIds: [],
  testResponseIds: [],
};
const axes = {
  fresh: 50,
  woody: 50,
  spicy: 50,
  dark: 50,
  sweet: 50,
  dry: 50,
  warm: 50,
  aromatic: 50,
  smoky: 50,
  leathery: 50,
};
const response: IntelligenceResponse = {
  schemaVersion: 1,
  title: "Study",
  summary: "Summary",
  confidence: "medium",
  claims: [],
  scentProfile: {
    axes,
    dominantFamilies: [],
    opening: [],
    heart: [],
    base: [],
  },
  ingredientRoles: [],
  strengths: [],
  tensions: [],
  missingDimensions: [],
  directions: [],
  experiments: [],
  questions: [],
  limitations: [],
};
describe("intelligence response contract", () => {
  it("rejects facts and observations without evidence", () => {
    for (const kind of ["fact", "observation"] as const)
      expect(
        validateIntelligenceResponse(
          {
            ...response,
            claims: [{ id: "c", kind, text: "x", evidenceRefs: [] }],
          },
          manifest,
        ).valid,
      ).toBe(false);
  });
  it("accepts grounded facts and observations", () =>
    expect(
      validateIntelligenceResponse(
        {
          ...response,
          claims: [
            {
              id: "f",
              kind: "fact",
              text: "x",
              evidenceRefs: [
                { entityType: "ingredient", entityId: "i", label: "I" },
              ],
            },
            {
              id: "o",
              kind: "observation",
              text: "x",
              evidenceRefs: [
                { entityType: "labObservation", entityId: "o", label: "O" },
              ],
            },
          ],
        },
        manifest,
      ).valid,
    ).toBe(true));
  it("accepts a current Scent Memory checkpoint as empirical observation evidence",()=>expect(validateIntelligenceResponse({...response,claims:[{id:"memory",kind:"observation",text:"Recorded checkpoint",evidenceRefs:[{entityType:"scentMemoryCheckpoint",entityId:"sm-1",label:"One-hour checkpoint"}]}]},{...manifest,contextVersion:2,scentMemoryCheckpointIds:["sm-1"]}).valid).toBe(true));
  it("accepts labelled predictions and recommendations without evidence", () =>
    expect(
      validateIntelligenceResponse(
        {
          ...response,
          claims: [
            { id: "p", kind: "prediction", text: "x", evidenceRefs: [] },
            { id: "r", kind: "recommendation", text: "x", evidenceRefs: [] },
          ],
        },
        manifest,
      ).valid,
    ).toBe(true));
  it("rejects unknown evidence and out-of-range axes", () => {
    expect(
      validateIntelligenceResponse(
        {
          ...response,
          claims: [
            {
              id: "f",
              kind: "fact",
              text: "x",
              evidenceRefs: [
                { entityType: "ingredient", entityId: "no", label: "No" },
              ],
            },
          ],
        },
        manifest,
      ).valid,
    ).toBe(false);
    expect(
      validateIntelligenceResponse(
        {
          ...response,
          scentProfile: {
            ...response.scentProfile,
            axes: { ...axes, dark: 101 },
          },
        },
        manifest,
      ).valid,
    ).toBe(false);
  });
  it("rejects missing sections", () => {
    const malformed = { ...response } as Record<string, unknown>;
    delete malformed.experiments;
    expect(validateIntelligenceResponse(malformed, manifest).valid).toBe(false);
  });
});
export { response as validIntelligenceFixture };
