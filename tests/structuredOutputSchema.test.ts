import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { structuredOutputSchemaErrors } from "../supabase/functions/_shared/structuredOutputSchema";
const productionSource = readFileSync(
  new URL(
    "../supabase/functions/koalafrog-intelligence/index.ts",
    import.meta.url,
  ),
  "utf8",
);
describe("OpenAI Structured Outputs schema compatibility", () => {
  it("guards the real production schema recursively at function initialization", () => {
    expect(productionSource).toContain(
      "assertOpenAIStructuredOutputSchema(responseSchema)",
    );
    expect(productionSource).toContain(
      'schemaVersion: { type: "integer", const: 1 }',
    );
  });
  it.each([
    { name: "const without type", schema: { const: 1 }, match: "no type" },
    { name: "enum without type", schema: { enum: ["a"] }, match: "no type" },
    {
      name: "object without strict additional properties",
      schema: {
        type: "object",
        properties: { value: { type: "string" } },
        required: ["value"],
      },
      match: "additionalProperties",
    },
    {
      name: "object property missing from required",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: { value: { type: "string" } },
        required: [],
      },
      match: "not required",
    },
    { name: "array without items", schema: { type: "array" }, match: "items" },
    { name: "primitive without type", schema: {}, match: "no type" },
  ])("rejects $name", ({ schema, match }) =>
    expect(structuredOutputSchemaErrors(schema).join(" ")).toContain(match),
  );
  it("accepts a representative strict nullable object", () =>
    expect(
      structuredOutputSchemaErrors({
        type: "object",
        additionalProperties: false,
        required: ["version", "optional"],
        properties: {
          version: { type: "integer", const: 1 },
          optional: { type: ["string", "null"] },
        },
      }),
    ).toEqual([]));
});
