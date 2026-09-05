import { readFile } from "node:fs/promises";
import { readOpenRouterConfig, type OpenRouterConfig } from "../config";
import {
  LlmTransportError,
  LlmTruncatedError,
  type LlmProvider,
  type LlmRequest,
  type LlmResult,
  type LlmUsage,
} from "../types";

/**
 * OpenRouter provider.
 *
 * OpenRouter speaks the OpenAI chat-completions shape, so images go inline as
 * base64 data URLs and the schema goes in `response_format`. Everything above
 * this file is provider-agnostic; this is the only place that knows the wire
 * format.
 */

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

interface TextContent {
  type: "text";
  text: string;
}
interface ImageContent {
  type: "image_url";
  image_url: { url: string };
}
type Content = TextContent | ImageContent;

export interface OpenRouterBody {
  model: string;
  temperature: number;
  max_tokens: number;
  messages: [{ role: "system"; content: string }, { role: "user"; content: Content[] }];
  response_format?: {
    type: "json_schema";
    json_schema: { name: string; strict: true; schema: Record<string, unknown> };
  };
  /**
   * Without this, OpenRouter may route to a backend that silently ignores
   * `response_format` and answers with prose.
   */
  provider?: { require_parameters: true };
  usage: { include: true };
}

const dataUrl = (mediaType: string, bytes: Buffer) => `data:${mediaType};base64,${bytes.toString("base64")}`;

/** Schema name must match `^[a-zA-Z0-9_-]+$` for strict structured output. */
const schemaName = (task: string) => task.replace(/[^a-zA-Z0-9_-]/g, "_") || "response";

export const buildRequestBody = async (
  request: LlmRequest,
  config: Pick<OpenRouterConfig, "model" | "strictStructuredOutputs">,
): Promise<OpenRouterBody> => {
  const content: Content[] = [];
  for (const part of request.parts) {
    if (part.kind === "text") {
      content.push({ type: "text", text: part.text });
    } else {
      // The caption goes first so the model can name the page it is looking at.
      content.push({ type: "text", text: part.caption });
      content.push({ type: "image_url", image_url: { url: dataUrl(part.mediaType, await readFile(part.path)) } });
    }
  }

  const body: OpenRouterBody = {
    model: config.model,
    temperature: request.temperature,
    max_tokens: request.maxTokens,
    messages: [
      { role: "system", content: request.system },
      { role: "user", content },
    ],
    usage: { include: true },
  };

  if (config.strictStructuredOutputs) {
    body.response_format = {
      type: "json_schema",
      json_schema: { name: schemaName(request.task), strict: true, schema: request.jsonSchema },
    };
    body.provider = { require_parameters: true };
  }
  return body;
};

const RETRYABLE_STATUS = new Set([408, 409, 429]);

const isRetryable = (status: number) => RETRYABLE_STATUS.has(status) || status >= 500;

const describe = (status: number, detail: string): string => {
  if (status === 401) return `OpenRouter rejected the API key (401). Check OPENROUTER_API_KEY. ${detail}`;
  if (status === 402) return `OpenRouter reports insufficient credit (402). ${detail}`;
  if (status === 404) return `OpenRouter does not know this model (404). Check OPENROUTER_MODEL. ${detail}`;
  if (status === 429) return `OpenRouter rate limit (429). ${detail}`;
  return `OpenRouter request failed (${status}). ${detail}`;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** `Retry-After` in seconds, when the provider sends one. */
const retryAfterMs = (response: Response): number | undefined => {
  const raw = response.headers.get("retry-after");
  if (raw === null) return undefined;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined;
};

const readText = (message: unknown): string => {
  if (typeof message === "string") return message;
  if (Array.isArray(message)) {
    return message
      .map((block: unknown) =>
        typeof block === "object" && block !== null && "text" in block ? String((block as { text: unknown }).text) : "",
      )
      .join("");
  }
  return "";
};

const readUsage = (raw: unknown): LlmUsage | undefined => {
  if (typeof raw !== "object" || raw === null) return undefined;
  const usage = raw as Record<string, unknown>;
  const number = (value: unknown) => (typeof value === "number" ? value : undefined);
  const result: LlmUsage = {
    inputTokens: number(usage["prompt_tokens"]),
    outputTokens: number(usage["completion_tokens"]),
    costUsd: number(usage["cost"]),
  };
  return result.inputTokens === undefined && result.outputTokens === undefined && result.costUsd === undefined
    ? undefined
    : result;
};

export interface OpenRouterProviderOptions {
  config?: OpenRouterConfig;
  fetchImpl?: FetchLike;
}

export const createOpenRouterProvider = (options: OpenRouterProviderOptions = {}): LlmProvider => {
  if (typeof window !== "undefined") {
    throw new LlmTransportError("The OpenRouter provider is server-only; the API key must never reach a browser.", undefined, false);
  }
  const config = options.config ?? readOpenRouterConfig();
  const doFetch: FetchLike = options.fetchImpl ?? ((input, init) => fetch(input, init));

  const post = async (body: OpenRouterBody, signal?: AbortSignal): Promise<Response> => {
    const timeout = AbortSignal.timeout(config.timeoutMs);
    return doFetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": config.referer,
        "X-Title": config.title,
      },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  };

  const complete = async (request: LlmRequest, signal?: AbortSignal): Promise<LlmResult> => {
    const body = await buildRequestBody(request, config);
    let lastError: LlmTransportError | undefined;

    for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
      if (attempt > 0) {
        await sleep(lastError?.status === 429 && lastError.retryAfterMs !== undefined
          ? lastError.retryAfterMs
          : config.retryBaseDelayMs * 2 ** (attempt - 1));
      }

      let response: Response;
      try {
        response = await post(body, signal);
      } catch (cause) {
        if (signal?.aborted) throw new LlmTransportError("The request was cancelled.", undefined, false, { cause });
        lastError = new LlmTransportError(`OpenRouter could not be reached: ${String(cause)}`, undefined, true, { cause });
        continue;
      }

      if (!response.ok) {
        const detail = (await response.text().catch(() => "")).slice(0, 500);
        const error = new LlmTransportError(describe(response.status, detail), response.status, isRetryable(response.status));
        error.retryAfterMs = retryAfterMs(response);
        if (!error.retryable) throw error;
        lastError = error;
        continue;
      }

      const raw = (await response.json()) as Record<string, unknown>;
      // OpenRouter can report an error inside a 200 response.
      if (raw["error"]) {
        const message = JSON.stringify(raw["error"]).slice(0, 500);
        throw new LlmTransportError(`OpenRouter returned an error: ${message}`, undefined, false);
      }

      const choice = (raw["choices"] as Array<Record<string, unknown>> | undefined)?.[0];
      if (!choice) throw new LlmTransportError("OpenRouter returned no choices.", undefined, false);
      if (choice["finish_reason"] === "length") {
        throw new LlmTruncatedError(
          `${request.task}: the answer hit the ${request.maxTokens}-token ceiling and is cut off. Raise maxTokens or split the input.`,
        );
      }

      const message = choice["message"] as Record<string, unknown> | undefined;
      const text = readText(message?.["content"]);
      if (text.trim() === "") throw new LlmTransportError("OpenRouter returned an empty answer.", undefined, false);

      return {
        text,
        model: typeof raw["model"] === "string" ? raw["model"] : config.model,
        usage: readUsage(raw["usage"]),
        raw,
      };
    }

    throw lastError ?? new LlmTransportError("OpenRouter request failed.", undefined, false);
  };

  return { id: "openrouter", model: config.model, complete };
};
