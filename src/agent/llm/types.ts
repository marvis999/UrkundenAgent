/**
 * The provider port.
 *
 * Deliberately tiny: text and images in, text out. Everything that makes an
 * extraction correct -- JSON validation, repair, caching, provenance -- lives
 * above this interface in `json.ts`, so it behaves identically no matter which
 * provider is plugged in.
 *
 * The port knows nothing about Urkunden. Domain knowledge belongs in the task
 * modules that build requests, never here.
 */

export type JsonSchema = Record<string, unknown>;

export type ImageMediaType = "image/png" | "image/jpeg" | "image/webp";

/**
 * Images travel as a path on disk, not as bytes. That keeps megabytes of base64
 * out of the calling code, lets the cache key hash the file itself, and matches
 * what the store already holds (`page.image_path`).
 */
export type PromptPart =
  | { readonly kind: "text"; readonly text: string }
  | {
      readonly kind: "image";
      readonly path: string;
      readonly mediaType: ImageMediaType;
      /** Named for the model, e.g. "Wohnflaechenberechnung 1991, Seite 2". */
      readonly caption: string;
    };

export interface LlmRequest {
  /** Stable task name, e.g. "extractCandidates". Cache key, log label, and the name given to the response schema. */
  readonly task: string;
  /** Bumped whenever the prompt changes. Part of the cache key; belongs in `run.prompt_version`. */
  readonly promptVersion: string;
  readonly system: string;
  readonly parts: readonly PromptPart[];
  readonly jsonSchema: JsonSchema;
  readonly maxTokens: number;
  /** 0 for extraction. Two runs over one document must not disagree by chance. */
  readonly temperature: number;
}

export interface LlmUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly costUsd?: number;
}

export interface LlmResult {
  /** Raw assistant text, before any JSON extraction. */
  readonly text: string;
  /** Resolved model id, as reported by the provider. Belongs in `run.model`. */
  readonly model: string;
  readonly usage?: LlmUsage;
  /** The provider envelope, kept for the call log. */
  readonly raw: unknown;
}

export interface LlmProvider {
  readonly id: string;
  /** Configured model id. Part of the cache key, so a model swap cannot serve stale answers. */
  readonly model: string;
  complete(request: LlmRequest, signal?: AbortSignal): Promise<LlmResult>;
}

export class LlmError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** Transport-level failure: network, auth, rate limit, provider 5xx. */
export class LlmTransportError extends LlmError {
  /** From a `Retry-After` header, when the provider sent one. */
  retryAfterMs?: number;

  constructor(
    message: string,
    readonly status: number | undefined,
    readonly retryable: boolean,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

/** The model hit the token ceiling. The JSON is cut off, so never try to parse it. */
export class LlmTruncatedError extends LlmError {}

/** The answer parsed but did not satisfy the schema, and the repair attempt did not fix it. */
export class LlmSchemaError extends LlmError {
  constructor(
    message: string,
    readonly rawText: string,
    readonly issues: string,
  ) {
    super(message);
  }
}
