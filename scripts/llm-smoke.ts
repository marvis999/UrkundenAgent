/**
 * One real call against OpenRouter, to prove the path works before any pipeline
 * depends on it.
 *
 *   npm run llm:smoke                       text only
 *   npm run llm:smoke -- path/to/page.jpg   with a page image
 *
 * The prompt carries umlauts and a section sign on purpose: every value in this
 * system is German, and an encoding fault anywhere between here and the model
 * should surface in the smoke test rather than in an extracted Kaufpreis.
 */

import path from "node:path";
import { z } from "zod";
import { completeJson, createOpenRouterProvider, LlmError, type PromptPart } from "@/agent/llm";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // Not every environment keeps a dotenv file; the variables may already be set.
  }
}

const Answer = z.object({
  /** Echoed back verbatim, so a mangled character is visible in the output. */
  echo: z.string(),
  subject: z.string(),
  /** Null rather than optional: strict structured output has no optional properties. */
  amountEur: z.number().nullable(),
});

const SAMPLE = "Der Kaufpreis für das Grundstück beträgt 2.060.000 EUR gemäß § 4 des Vertragsentwurfs (Größe: 1.184,60 m²).";

const imageArg = process.argv[2];

const imagePart = (file: string): PromptPart => {
  const extension = path.extname(file).toLowerCase();
  const mediaType = extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg";
  return { kind: "image", path: file, mediaType, caption: `Testseite ${path.basename(file)}` };
};

const main = async () => {
  const provider = createOpenRouterProvider();
  console.log(`provider : ${provider.id}`);
  console.log(`model    : ${provider.model}`);

  const parts: PromptPart[] = [
    { kind: "text", text: `Satz:\n${SAMPLE}` },
    {
      kind: "text",
      text: "Gib den Satz unveraendert als 'echo' zurueck, nenne in 'subject' das Thema in drei Worten und trage den Betrag in Euro als Zahl in 'amountEur' ein (null, wenn keiner genannt ist).",
    },
    ...(imageArg ? [imagePart(imageArg)] : []),
  ];

  const started = Date.now();
  const call = await completeJson(
    provider,
    { task: "smoke", promptVersion: "1", system: "Du antwortest ausschliesslich mit JSON.", parts, maxTokens: 1_000, temperature: 0 },
    Answer,
  );

  console.log(`cached   : ${call.cached}`);
  console.log(`attempts : ${call.attempts}`);
  console.log(`elapsed  : ${Date.now() - started} ms`);
  console.log(`usage    : ${JSON.stringify(call.result.usage ?? {})}`);
  console.log(`answer   : ${JSON.stringify(call.value, null, 2)}`);

  const intact = call.value.echo.includes("Grundstück") && call.value.echo.includes("§") && call.value.echo.includes("m²");
  console.log(`encoding : ${intact ? "ok (Umlaute, Paragraphenzeichen und m2 sind heil)" : "PROBLEM - der Satz kam veraendert zurueck"}`);
  if (!intact) process.exitCode = 1;
};

main().catch((error: unknown) => {
  // A configuration mistake should read as one line, not a stack trace.
  console.error(error instanceof LlmError ? `\n${error.name}: ${error.message}` : error);
  process.exitCode = 1;
});
