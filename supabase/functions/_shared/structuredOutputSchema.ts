type SchemaNode = {
  type?: string | string[];
  const?: unknown;
  enum?: unknown[];
  properties?: Record<string, SchemaNode>;
  required?: string[];
  additionalProperties?: boolean;
  items?: SchemaNode;
};
export function structuredOutputSchemaErrors(
  schema: SchemaNode,
  path = "$",
): string[] {
  const errors: string[] = [];
  if (!schema.type) errors.push(`${path} has no type.`);
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (types.includes("object")) {
    if (schema.additionalProperties !== false)
      errors.push(`${path} must set additionalProperties to false.`);
    if (!schema.properties) errors.push(`${path} has no properties.`);
    else
      for (const [key, child] of Object.entries(schema.properties)) {
        if (!schema.required?.includes(key))
          errors.push(`${path}.${key} is not required.`);
        errors.push(...structuredOutputSchemaErrors(child, `${path}.${key}`));
      }
  }
  if (types.includes("array")) {
    if (!schema.items) errors.push(`${path} has no items schema.`);
    else
      errors.push(...structuredOutputSchemaErrors(schema.items, `${path}[]`));
  }
  if (schema.enum && !schema.type) errors.push(`${path} enum has no type.`);
  if ("const" in schema && !schema.type)
    errors.push(`${path} const has no type.`);
  return [...new Set(errors)];
}
export function assertOpenAIStructuredOutputSchema(schema: SchemaNode) {
  const errors = structuredOutputSchemaErrors(schema);
  if (errors.length)
    throw new Error(
      `Invalid OpenAI Structured Output schema: ${errors.join(" ")}`,
    );
}
