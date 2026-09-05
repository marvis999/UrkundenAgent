import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CacheConfig } from "./config";
import type { LlmRequest, LlmResult } from "./types";

/**
 * Content-addressed cache of raw model answers.
 *
 * Two reasons it exists. Re-running the pipeline while building the extraction
 * must not re-pay for pages that did not change; and a cached run is a
 * reproducible one -- the same documents and the same prompt version give the
 * same candidates, which is what makes a demo trustworthy.
 *
 * A cache failure must never fail a run: every operation here swallows its
 * errors and degrades to a live call.
 */

/** Deterministic JSON: object keys sorted, so key order cannot change the hash. */
const canonical = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`);
  return `{${entries.join(",")}}`;
};

const sha256 = (input: string | Buffer) => createHash("sha256").update(input).digest("hex");

/**
 * The identity of a call. Image parts contribute the hash of the file, not its
 * path: re-scanning a page under the same name must miss the cache, and moving
 * the data directory must not.
 */
export const cacheKey = async (request: LlmRequest, model: string): Promise<string> => {
  const parts = [];
  for (const part of request.parts) {
    if (part.kind === "text") {
      parts.push({ kind: "text", text: part.text });
    } else {
      const bytes = await readFile(part.path);
      parts.push({ kind: "image", mediaType: part.mediaType, caption: part.caption, sha256: sha256(bytes) });
    }
  }
  return sha256(
    canonical({
      task: request.task,
      promptVersion: request.promptVersion,
      model,
      system: request.system,
      parts,
      jsonSchema: request.jsonSchema,
      maxTokens: request.maxTokens,
      temperature: request.temperature,
    }),
  );
};

const safeSegment = (raw: string) => raw.replace(/[^a-zA-Z0-9._-]/g, "_") || "task";

const entryPath = (config: CacheConfig, task: string, key: string) =>
  path.join(config.dir, safeSegment(task), `${key}.json`);

interface CacheEntry {
  key: string;
  task: string;
  createdAt: string;
  result: LlmResult;
}

export const readCache = async (
  config: CacheConfig,
  task: string,
  key: string,
): Promise<LlmResult | undefined> => {
  if (!config.enabled) return undefined;
  try {
    const raw = await readFile(entryPath(config, task, key), "utf8");
    const entry = JSON.parse(raw) as CacheEntry;
    return typeof entry.result?.text === "string" ? entry.result : undefined;
  } catch {
    return undefined;
  }
};

export const writeCache = async (
  config: CacheConfig,
  task: string,
  key: string,
  result: LlmResult,
): Promise<void> => {
  if (!config.enabled) return;
  const file = entryPath(config, task, key);
  const entry: CacheEntry = { key, task, createdAt: new Date().toISOString(), result };
  try {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(entry, null, 2)}\n`, "utf8");
  } catch {
    // A cache that cannot be written is not a reason to fail the run.
  }
};
