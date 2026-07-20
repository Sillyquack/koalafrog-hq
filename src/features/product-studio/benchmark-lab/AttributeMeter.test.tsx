import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AttributeMeter } from "./AttributeMeter";
import { attributeDescriptor } from "./attributeDescriptors";

describe("AttributeMeter", () => {
  it("uses property-aware descriptor direction", () => {
    expect(attributeDescriptor("glide", 9)).toBe("Excellent");
    expect(attributeDescriptor("drag", 2)).toBe("Minimal");
    expect(attributeDescriptor("drag", 9)).toBe("Very high");
  });

  it("preserves semantic distinctions without numeric conversion", () => {
    expect(renderToStaticMarkup(<AttributeMeter attribute="glide" observation={{ state: "not_tested", notes: "" }} />)).toContain("Not tested — no observation recorded");
    expect(renderToStaticMarkup(<AttributeMeter attribute="glide" observation={{ state: "unknown", notes: "" }} />)).toContain("Unknown — state cannot currently be determined");
    expect(renderToStaticMarkup(<AttributeMeter attribute="glide" observation={{ state: "not_applicable", notes: "" }} />)).toContain("Not applicable — attribute does not apply");
  });

  it("shows the exact numeric score as text and accessible copy", () => {
    const markup = renderToStaticMarkup(
      <AttributeMeter attribute="Glide" observation={{ state: "scored", score: 9, notes: "" }} />,
    );
    expect(markup).toContain("9/10");
    expect(markup).toContain("Glide: Excellent, 9 out of 10");
  });
});
