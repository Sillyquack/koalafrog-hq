const lowIsGoodAttributes = new Set([
  "drag",
  "tack",
  "greasiness",
  "residue",
  "white marks",
  "transfer to clothing",
]);

export function attributeDescriptor(attribute: string, score: number) {
  const band = Math.ceil(score / 2);
  return lowIsGoodAttributes.has(attribute.toLowerCase())
    ? ["Minimal", "Low", "Moderate", "High", "Very high"][band - 1]
    : ["Very low", "Low", "Moderate", "Very good", "Excellent"][band - 1];
}
