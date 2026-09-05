import type { ZodType } from "zod";
import { cacheKey, readCache, writeCache } from "./cache";
import { readCacheConfig, type CacheConfig } from "./config";
import { toStrictJsonSchema } from "./schema";
import { LlmError, LlmSchemaError, type LlmProvider, type LlmRequest, type LlmResult } from "./types";

/**
 * Schema-validated calls.
 *
 * This is the layer that makes a model answer usable: it derives the schema, it
 * parses whatever wrapping the model put around the JSON, it validates, and it
 * gives the model exactly one chance to fix a malformed answer before giving up.
 * A provider never does any of this itself, so every provider behaves the same.
 */

const stripFence = (text: string): string | undefined => {
  const match = /^```[a-zA-Z]*\s*\n?([\s\S]*?)\n?\s*```$/.exec(text);
  return match?.[1];
};

/** Widest span that could be a JSON value, for answers wrapped in prose. */
const betweenDelimiters = (text: string): string | undefined => {
  const starts = [text.indexOf("{"), text.indexOf("[")].filter((i) => i >= 0);
  const ends = [text.lastIndexOf("}"), text.lastIndexOf("]")].filter((i) => i >= 0);
  if (starts.length === 0 || ends.length === 0) return undefined;
  const start = Math.min(...starts);
  const end = Math.max(...ends);
  return end > start ? text.slice(start, end + 1) : undefined;
};

/** The JSON inside a model answer, whether it is bare, fenced, or buried in prose. */
export const extractJson = (text: string): unknown => {
  const trimmed = text.trim();
  for (const candidate of [trimmed, stripFence(trimmed), betweenDelimiters(trimmed)]) {
    if (candidate === undefined || candidate === "") continue;
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next, narrower reading.
    }
  }
  throw new LlmError("The answer contains no parsable JSON.");
};

const formatIssues = (issues: readonly { path: readonly PropertyKey[]; message: string }[]) =>
  issues.map((issue) => `${issue.path.map(String).join(".") || "<root>"}: ${issue.message}`).join("; ");

const repairPrompt = (previous: string, issues: string) =>
  [
    "Your previous answer did not satisfy the required schema.",
    "",
    "Previous answer:",
    previous,
    "",
    "Validation errors:",
    issues,
    "",
    "Answer again with the corrected JSON only. No prose, no code fence.",
  ].join("\n");

export interface CompleteJsonOptions {
  cache?: CacheConfig;
  signal?: AbortSignal;
  /** One repair round-trip when the first answer fails validation. Default true. */
  repair?: boolean;
}

export interface JsonCall<T> {
  value: T;
  result: LlmResult;
  /** True when the answer came from the cache and cost nothing. */
  cached: boolean;
  /** Provider calls actually made: 0 on a cache hit, 2 when a repair was needed. */
  attempts: number;
}

export const completeJson = async <T>(
  provider: LlmProvider,
  request: Omit<LlmRequest, "jsonSchema">,
  schema: ZodType<T>,
  options: CompleteJsonOptions = {},
): Promise<JsonCall<T>> => {
  const full: LlmRequest = { ...request, jsonSchema: toStrictJsonSchema(schema) };
  const cache = options.cache ?? readCacheConfig();
  const key = await cacheKey(full, provider.model);

  const cached = await readCache(cache, full.task, key);
  if (cached) {
    const parsed = schema.safeParse(tryExtract(cached.text));
    // A cached answer that no longer validates means the schema moved on. Ignore it.
    if (parsed.success) return { value: parsed.data, result: cached, cached: true, attempts: 0 };
  }

  const first = await provider.complete(full, options.signal);
  const firstParsed = schema.safeParse(tryExtract(first.text));
  if (firstParsed.success) {
    await writeCache(cache, full.task, key, first);
    return { value: firstParsed.data, result: first, cached: false, attempts: 1 };
  }

  const issues = firstParsed.error ? formatIssues(firstParsed.error.issues) : "unparsable JSON";
  if (options.repair === false) {
    throw new LlmSchemaError(`${full.task}: the answer did not match the schema (${issues}).`, first.text, issues);
  }

  const retry: LlmRequest = {
    ...full,
    parts: [...full.parts, { kind: "text", text: repairPrompt(first.text, issues) }],
  };
  const second = await provider.complete(retry, options.signal);
  const secondParsed = schema.safeParse(tryExtract(second.text));
  if (!secondParsed.success) {
    const retryIssues = secondParsed.error ? formatIssues(secondParsed.error.issues) : "unparsable JSON";
    throw new LlmSchemaError(
      `${full.task}: the answer did not match the schema after one repair (${retryIssues}).`,
      second.text,
      retryIssues,
    );
  }

  // Stored under the original key: a later run replays the outcome, not the detour.
  await writeCache(cache, full.task, key, second);
  return { value: secondParsed.data, result: second, cached: false, attempts: 2 };
};

/** Extraction failure and validation failure take the same repair path. */
const tryExtract = (text: string): unknown => {
  try {
    return extractJson(text);
  } catch {
    return undefined;
  }
};
