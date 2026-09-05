/**
 * The model layer. Server-only.
 *
 * A task module builds a request and a Zod schema and calls `completeJson`:
 *
 *   const provider = createOpenRouterProvider();
 *   const { value } = await completeJson(provider, {
 *     task: "extractCandidates",
 *     promptVersion: "2026-09-06",
 *     system: EXTRACTION_SYSTEM,
 *     parts: [{ kind: "text", text: pageText }],
 *     maxTokens: 8000,
 *     temperature: 0,
 *   }, CandidatesSchema);
 *
 * `value` is typed and validated; `result.model` and the request's
 * `promptVersion` are what `run.model` and `run.prompt_version` record.
 */

export { completeJson, extractJson, type CompleteJsonOptions, type JsonCall } from "./json";
export { createOpenRouterProvider, type OpenRouterProviderOptions } from "./providers/openRouter";
export { readCacheConfig, readOpenRouterConfig, DEFAULT_BASE_URL, DEFAULT_MODEL } from "./config";
export type { CacheConfig, OpenRouterConfig } from "./config";
export { toStrictJsonSchema } from "./schema";
export {
  LlmError,
  LlmSchemaError,
  LlmTransportError,
  LlmTruncatedError,
  type ImageMediaType,
  type JsonSchema,
  type LlmProvider,
  type LlmRequest,
  type LlmResult,
  type LlmUsage,
  type PromptPart,
} from "./types";
