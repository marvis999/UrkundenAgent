import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { z } from "zod";
import { cacheKey } from "./cache";
import type { CacheConfig, OpenRouterConfig } from "./config";
import { completeJson, extractJson } from "./json";
import { buildRequestBody, createOpenRouterProvider, type FetchLike } from "./providers/openRouter";
import { toStrictJsonSchema } from "./schema";
import { LlmError, LlmSchemaError, LlmTransportError, LlmTruncatedError, type LlmRequest } from "./types";

/* ---------- fixtures ---------- */

const config = (over: Partial<OpenRouterConfig> = {}): OpenRouterConfig => ({
  apiKey: "test-key",
  baseUrl: "https://example.invalid/api/v1",
  model: "anthropic/claude-opus-5",
  strictStructuredOutputs: true,
  timeoutMs: 5_000,
  maxRetries: 2,
  retryBaseDelayMs: 0,
  referer: "https://example.invalid",
  title: "test",
  ...over,
});

const request = (over: Partial<LlmRequest> = {}): LlmRequest => ({
  task: "extractCandidates",
  promptVersion: "v1",
  system: "Du liest Grundbuchauszuege.",
  parts: [{ kind: "text", text: "Kaufpreis: 2.060.000 EUR" }],
  jsonSchema: { type: "object", properties: {}, required: [], additionalProperties: false },
  maxTokens: 1_000,
  temperature: 0,
  ...over,
});

const completion = (content: string, over: Record<string, unknown> = {}) => ({
  model: "anthropic/claude-opus-5",
  choices: [{ finish_reason: "stop", message: { content } }],
  usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.0012 },
  ...over,
});

interface Recorder {
  fetchImpl: FetchLike;
  bodies: OpenRouterBodyLike[];
  headers: Record<string, string>[];
}

type OpenRouterBodyLike = Record<string, unknown>;

/** A fetch that replays a queue of responses and records what it was sent. */
const recorder = (responses: Response[]): Recorder => {
  const bodies: OpenRouterBodyLike[] = [];
  const headers: Record<string, string>[] = [];
  let index = 0;
  const fetchImpl: FetchLike = async (_input, init) => {
    bodies.push(JSON.parse(String(init.body)) as OpenRouterBodyLike);
    headers.push({ ...(init.headers as Record<string, string>) });
    const next = responses[index];
    index += 1;
    assert.ok(next, `fetch called ${index} times, only ${responses.length} responses queued`);
    return next;
  };
  return { fetchImpl, bodies, headers };
};

const json = (payload: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" }, ...init });

const tempCache = async (): Promise<CacheConfig> => ({
  enabled: true,
  dir: await mkdtemp(path.join(tmpdir(), "llm-cache-")),
});

/* ---------- extractJson ---------- */

test("extractJson reads bare, fenced and prose-wrapped JSON", () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('Hier das Ergebnis:\n{"a":1}\nSoweit.'), { a: 1 });
  assert.deepEqual(extractJson("[1,2]"), [1, 2]);
});

test("extractJson rejects an answer with no JSON in it", () => {
  assert.throws(() => extractJson("Ich kann das nicht lesen."), LlmError);
});

/* ---------- schema ---------- */

test("toStrictJsonSchema drops $schema and keeps the strict-mode shape", () => {
  const schema = toStrictJsonSchema(z.object({ value: z.string(), page: z.number() }));
  assert.equal(schema["$schema"], undefined);
  assert.equal(schema["additionalProperties"], false);
  assert.deepEqual(schema["required"], ["value", "page"]);
});

test("toStrictJsonSchema names an optional property instead of letting the provider 400", () => {
  assert.throws(
    () => toStrictJsonSchema(z.object({ value: z.string(), quote: z.string().optional() })),
    (error: unknown) => error instanceof LlmError && error.message.includes("quote"),
  );
  // .nullable() is the supported way to say "may be absent".
  assert.ok(toStrictJsonSchema(z.object({ value: z.string(), quote: z.string().nullable() })));
});

/* ---------- cache key ---------- */

test("cacheKey is stable and reacts to the prompt version", async () => {
  const a = await cacheKey(request(), "anthropic/claude-opus-5");
  const b = await cacheKey(request(), "anthropic/claude-opus-5");
  const c = await cacheKey(request({ promptVersion: "v2" }), "anthropic/claude-opus-5");
  const d = await cacheKey(request(), "anthropic/claude-sonnet-5");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.notEqual(a, d);
});

test("cacheKey hashes the image file, not its path", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "llm-image-"));
  const file = path.join(dir, "page-1.png");
  const parts = [{ kind: "image", path: file, mediaType: "image/png", caption: "Seite 1" }] as const;

  await writeFile(file, "erste fassung");
  const before = await cacheKey(request({ parts }), "m");
  await writeFile(file, "zweite fassung");
  const after = await cacheKey(request({ parts }), "m");

  assert.notEqual(before, after);
});

/* ---------- request body ---------- */

test("buildRequestBody sends the system prompt, the parts and the strict schema", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "llm-image-"));
  const file = path.join(dir, "page-2.jpg");
  await writeFile(file, "not-really-a-jpeg");

  const body = await buildRequestBody(
    request({
      parts: [
        { kind: "text", text: "Lies die Wohnflaeche." },
        { kind: "image", path: file, mediaType: "image/jpeg", caption: "Wohnflaechenberechnung 1991, Seite 2" },
      ],
    }),
    { model: "anthropic/claude-opus-5", strictStructuredOutputs: true },
  );

  assert.equal(body.messages[0].role, "system");
  assert.equal(body.messages[0].content, "Du liest Grundbuchauszuege.");
  assert.deepEqual(body.messages[1].content[0], { type: "text", text: "Lies die Wohnflaeche." });
  // The caption precedes the image so the model can name the page it is reading.
  assert.deepEqual(body.messages[1].content[1], { type: "text", text: "Wohnflaechenberechnung 1991, Seite 2" });
  const image = body.messages[1].content[2];
  assert.ok(image && image.type === "image_url");
  assert.match(image.image_url.url, /^data:image\/jpeg;base64,/);

  assert.equal(body.response_format?.json_schema.strict, true);
  assert.equal(body.response_format?.json_schema.name, "extractCandidates");
  assert.deepEqual(body.provider, { require_parameters: true });
  assert.equal(body.temperature, 0);
});

test("buildRequestBody omits response_format when structured output is off", async () => {
  const body = await buildRequestBody(request(), { model: "m", strictStructuredOutputs: false });
  assert.equal(body.response_format, undefined);
  assert.equal(body.provider, undefined);
});

/* ---------- provider ---------- */

test("a bad key fails immediately and says which variable to fix", async () => {
  const { fetchImpl, bodies } = recorder([new Response("no credentials", { status: 401 })]);
  const provider = createOpenRouterProvider({ config: config(), fetchImpl });

  await assert.rejects(
    provider.complete(request()),
    (error: unknown) =>
      error instanceof LlmTransportError && error.status === 401 && error.message.includes("OPENROUTER_API_KEY"),
  );
  assert.equal(bodies.length, 1, "a 401 must not be retried");
});

test("a rate limit is retried and then succeeds", async () => {
  const { fetchImpl, bodies } = recorder([
    new Response("slow down", { status: 429, headers: { "retry-after": "0" } }),
    json(completion('{"value":"2.060.000 EUR"}')),
  ]);
  const provider = createOpenRouterProvider({ config: config(), fetchImpl });

  const result = await provider.complete(request());
  assert.equal(bodies.length, 2);
  assert.equal(result.text, '{"value":"2.060.000 EUR"}');
  assert.deepEqual(result.usage, { inputTokens: 10, outputTokens: 5, costUsd: 0.0012 });
});

test("a truncated answer is reported as truncated, never parsed", async () => {
  const { fetchImpl } = recorder([json(completion('{"value":"2.060.0', { choices: [{ finish_reason: "length", message: { content: '{"value":"2.060.0' } }] }))]);
  const provider = createOpenRouterProvider({ config: config(), fetchImpl });

  await assert.rejects(provider.complete(request()), LlmTruncatedError);
});

test("an error inside a 200 response is still an error", async () => {
  const { fetchImpl } = recorder([json({ error: { code: 400, message: "no endpoints found" } })]);
  const provider = createOpenRouterProvider({ config: config(), fetchImpl });

  await assert.rejects(provider.complete(request()), LlmTransportError);
});

test("the attribution headers are sent", async () => {
  const { fetchImpl, headers } = recorder([json(completion('{"value":"x"}'))]);
  const provider = createOpenRouterProvider({ config: config(), fetchImpl });
  await provider.complete(request());

  const sent = headers[0];
  assert.ok(sent);
  assert.equal(sent["Authorization"], "Bearer test-key");
  assert.equal(sent["X-Title"], "test");
});

/* ---------- completeJson ---------- */

const Answer = z.object({ value: z.string(), confidence: z.number() });

test("completeJson validates, types and caches the answer", async () => {
  const cache = await tempCache();
  const first = recorder([json(completion('{"value":"2.060.000 EUR","confidence":0.94}'))]);
  const provider = createOpenRouterProvider({ config: config(), fetchImpl: first.fetchImpl });

  const call = await completeJson(provider, request(), Answer, { cache });
  assert.equal(call.value.value, "2.060.000 EUR");
  assert.equal(call.value.confidence, 0.94);
  assert.equal(call.attempts, 1);
  assert.equal(call.cached, false);

  // Same request again: served from disk, no provider call at all.
  const second = recorder([]);
  const cachedProvider = createOpenRouterProvider({ config: config(), fetchImpl: second.fetchImpl });
  const again = await completeJson(cachedProvider, request(), Answer, { cache });
  assert.equal(again.cached, true);
  assert.equal(again.attempts, 0);
  assert.equal(again.value.value, "2.060.000 EUR");
  assert.equal(second.bodies.length, 0);
});

test("a malformed answer gets one repair round-trip carrying the validation errors", async () => {
  const cache = await tempCache();
  const { fetchImpl, bodies } = recorder([
    json(completion('{"value":"2.060.000 EUR"}')), // confidence missing
    json(completion('{"value":"2.060.000 EUR","confidence":0.8}')),
  ]);
  const provider = createOpenRouterProvider({ config: config(), fetchImpl });

  const call = await completeJson(provider, request(), Answer, { cache });
  assert.equal(call.attempts, 2);
  assert.equal(call.value.confidence, 0.8);

  const retry = bodies[1];
  assert.ok(retry);
  const content = JSON.stringify(retry["messages"]);
  assert.match(content, /did not satisfy the required schema/);
  assert.match(content, /confidence/);
});

test("two bad answers fail loudly and keep the raw text", async () => {
  const cache = await tempCache();
  const { fetchImpl } = recorder([json(completion("keine Ahnung")), json(completion("immer noch nicht"))]);
  const provider = createOpenRouterProvider({ config: config(), fetchImpl });

  await assert.rejects(
    completeJson(provider, request(), Answer, { cache }),
    (error: unknown) => error instanceof LlmSchemaError && error.rawText === "immer noch nicht",
  );
});

test("repair can be switched off", async () => {
  const cache = await tempCache();
  const { fetchImpl, bodies } = recorder([json(completion('{"value":"x"}'))]);
  const provider = createOpenRouterProvider({ config: config(), fetchImpl });

  await assert.rejects(completeJson(provider, request(), Answer, { cache, repair: false }), LlmSchemaError);
  assert.equal(bodies.length, 1);
});
