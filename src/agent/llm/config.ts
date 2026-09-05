import { LlmError } from "./types";

/**
 * Configuration, read from the environment at call time rather than at import
 * time. A missing key must fail the run that needs it, not the build.
 */

export interface OpenRouterConfig {
  apiKey: string;
  baseUrl: string;
  /** Slug from https://openrouter.ai/api/v1/models, e.g. "anthropic/claude-opus-5". */
  model: string;
  /**
   * Send `response_format: json_schema` and require a backend that honours it.
   * Turn off only for a model that does not support structured output; the
   * schema still reaches the model in the prompt, and the answer is validated
   * either way.
   */
  strictStructuredOutputs: boolean;
  timeoutMs: number;
  maxRetries: number;
  /** Backoff base; the test suite sets this to 0. */
  retryBaseDelayMs: number;
  /** OpenRouter attribution headers. */
  referer: string;
  title: string;
}

export interface CacheConfig {
  enabled: boolean;
  dir: string;
}

type Env = Record<string, string | undefined>;

const readNumber = (raw: string | undefined, fallback: number, name: string): number => {
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new LlmError(`${name} must be a non-negative number, got "${raw}".`);
  }
  return parsed;
};

const readBoolean = (raw: string | undefined, fallback: boolean): boolean => {
  if (raw === undefined || raw.trim() === "") return fallback;
  return !["0", "false", "no", "off"].includes(raw.trim().toLowerCase());
};

export const DEFAULT_MODEL = "anthropic/claude-opus-5";
export const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

export const readOpenRouterConfig = (env: Env = process.env): OpenRouterConfig => {
  const apiKey = env["OPENROUTER_API_KEY"]?.trim();
  if (!apiKey) {
    throw new LlmError(
      "OPENROUTER_API_KEY is not set. Copy .env.example to .env.local and add a key from https://openrouter.ai/keys.",
    );
  }
  return {
    apiKey,
    baseUrl: (env["OPENROUTER_BASE_URL"]?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    model: env["OPENROUTER_MODEL"]?.trim() || DEFAULT_MODEL,
    strictStructuredOutputs: readBoolean(env["OPENROUTER_STRUCTURED_OUTPUTS"], true),
    timeoutMs: readNumber(env["LLM_TIMEOUT_MS"], 120_000, "LLM_TIMEOUT_MS"),
    maxRetries: readNumber(env["LLM_MAX_RETRIES"], 2, "LLM_MAX_RETRIES"),
    retryBaseDelayMs: readNumber(env["LLM_RETRY_BASE_MS"], 500, "LLM_RETRY_BASE_MS"),
    referer: env["OPENROUTER_REFERER"]?.trim() || "https://github.com/urkunden-agent",
    title: env["OPENROUTER_TITLE"]?.trim() || "Urkunden-Zuarbeit",
  };
};

export const readCacheConfig = (env: Env = process.env): CacheConfig => ({
  enabled: readBoolean(env["LLM_CACHE"], true),
  dir: env["LLM_CACHE_DIR"]?.trim() || ".llm-cache",
});
