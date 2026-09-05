import { z, type ZodType } from "zod";
import { LlmError, type JsonSchema } from "./types";

/**
 * Zod schema to the JSON Schema the provider is given.
 *
 * One schema, two jobs: it constrains the model (`response_format`) and it
 * validates the answer. Deriving both from the same Zod type is what stops the
 * two from drifting apart.
 */

/**
 * Strict structured output requires every property to be listed in `required`.
 * Zod omits `.optional()` properties from `required`, which the provider rejects
 * with an opaque 400. Fail here instead, naming the property, because the fix is
 * always the same: use `.nullable()` and let the value be explicitly absent.
 */
const assertNoOptionalProperties = (node: unknown, path: string): void => {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((child, index) => assertNoOptionalProperties(child, `${path}[${index}]`));
    return;
  }

  const record = node as Record<string, unknown>;
  const properties = record["properties"];

  if (properties !== undefined && typeof properties === "object" && properties !== null) {
    const names = Object.keys(properties as Record<string, unknown>);
    const required = Array.isArray(record["required"]) ? (record["required"] as unknown[]).map(String) : [];
    const missing = names.filter((name) => !required.includes(name));
    if (missing.length > 0) {
      throw new LlmError(
        `Schema at ${path || "<root>"} has optional properties (${missing.join(", ")}), ` +
          `which strict structured output does not allow. Use .nullable() instead of .optional().`,
      );
    }
  }

  for (const [key, value] of Object.entries(record)) {
    assertNoOptionalProperties(value, path ? `${path}.${key}` : key);
  }
};

/**
 * The response schema for one task. `$schema` is dropped: some providers reject
 * an unknown top-level key, and it carries no information the model needs.
 */
export const toStrictJsonSchema = (schema: ZodType): JsonSchema => {
  const generated = z.toJSONSchema(schema, { io: "output" }) as JsonSchema;
  const { $schema: _ignored, ...rest } = generated;
  assertNoOptionalProperties(rest, "");
  return rest;
};
