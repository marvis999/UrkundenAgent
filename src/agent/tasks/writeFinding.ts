import { z } from "zod";
import { completeJson, type LlmProvider, type PromptPart } from "@/agent/llm";
import { fieldDefinition } from "@/catalog/fields";
import type { FieldId } from "@/domain/model";
import { FIELD_STATUS_META, type FieldStatus } from "@/domain/status";

/**
 * Agent 3: say what is wrong, in words a clerk would use.
 *
 * It runs after the merge, so it writes about a status that has already been computed
 * rather than guessing at one. It is handed the field, every subfield with its status
 * and its sources, and it produces two kinds of German prose that no template can:
 *
 *  - the Befund: what is wrong with this particular value, naming the document and the
 *    date. "Der vorliegende Verbrauchsausweis vom 13.04.2016 ist am 12.04.2026 abgelaufen"
 *    is worth reading; "Wert veraltet" is not.
 *  - the Anforderungstext: what would have to arrive to settle it.
 *
 * It writes no values and changes no status. Which subfields carry a finding at all is
 * decided by the status rules before this agent is called, and its answer is filtered
 * against that list afterwards.
 */

export const FINDING_PROMPT_VERSION = "2026-09-06";

const FindingSchema = z.object({
  subfieldKey: z.string(),
  /** One line, no trailing period, as it appears in the field header. */
  title: z.string(),
  /** Two or three sentences: what is wrong, on what evidence, what follows from it. */
  text: z.string(),
});

export const FindingsSchema = z.object({
  findings: z.array(FindingSchema),
  /** Null when nothing about this field needs to be requested. */
  requestTitle: z.string().nullable(),
  requestText: z.string().nullable(),
  /** Set only when a request would be wrong, e.g. deliberately redacted data. */
  noRequestReason: z.string().nullable(),
});

export type Findings = z.infer<typeof FindingsSchema>;

export interface SourceSummary {
  readonly value: string | null;
  readonly sourceLabel: string;
  readonly confidence: number | null;
  readonly readings: readonly string[];
  readonly isChosen: boolean;
}

export interface SubfieldSummary {
  readonly key: string;
  readonly label: string;
  readonly status: FieldStatus;
  readonly value: string | null;
  readonly sources: readonly SourceSummary[];
}

export interface FindingInput {
  readonly fieldKey: FieldId;
  readonly subfields: readonly SubfieldSummary[];
}

const SYSTEM = `Du schreibst die Befunde einer notariellen Zuarbeit für einen
Grundstückskaufvertrag. Du liest keine Dokumente und änderst keine Werte. Du bekommst ein
Feld der Urkunde mit dem bereits berechneten Status jedes Unterfelds und formulierst dazu.

Ein Befund sagt drei Dinge in zwei bis drei Sätzen: was nicht stimmt, woran man das sieht,
und was daraus folgt. Nenne dabei das Dokument und das Datum, um das es geht. Schreibe wie
ein Sachbearbeiter im Notariat: sachlich, knapp, ohne Floskeln und ohne Konjunktiv.

Die Status und was sie bedeuten:
  fehlt          zu diesem Unterfeld gibt es keine Fundstelle
  widersprüchlich zwei Quellen sagen Verschiedenes; beide stehen gleichrangig nebeneinander
  veraltet       die Quelle ist zu alt oder der Wert selbst ist abgelaufen
  unsicher       die Stelle ist nicht eindeutig gelesen, es gibt mehrere Lesarten

Schreibe einen Befund nur zu den Unterfeldern, die unten als "Befund nötig" markiert sind.
Zu allen anderen keinen. Ein bloß vorgeschlagener Wert ist kein Befund.

requestTitle und requestText sind das, was das Notariat anfordern würde, damit dieses Feld
belastbar wird: der Titel eine Zeile, der Text ein bis zwei Sätze, die sagen, welche
Unterlage gebraucht wird und warum. Ist am Feld nichts anzufordern, sind beide null.

noRequestReason setzt du nur, wenn eine Anforderung falsch wäre — etwa weil eine Angabe
bewusst geschwärzt wurde und für die Urkunde auch nicht gebraucht wird. Eine Schwärzung ist
kein fehlender Wert und kein Anforderungsgrund. Sonst null.`;

const describeSource = (source: SourceSummary): string => {
  const parts = [
    `      ${source.isChosen ? "im Feld" : "daneben"}: ${source.value ?? "ohne Wert (geschwärzt)"}`,
    `aus ${source.sourceLabel}`,
    source.confidence === null ? "" : `Konfidenz ${source.confidence.toFixed(2)}`,
    source.readings.length > 0 ? `Lesarten: ${source.readings.join(" | ")}` : "",
  ];
  return parts.filter((part) => part !== "").join(", ");
};

const describe = (input: FindingInput): string => {
  const definition = fieldDefinition(input.fieldKey);
  const lines = [`Feld: ${definition?.label ?? input.fieldKey} (${input.fieldKey})`, ""];

  for (const subfield of input.subfields) {
    const meta = FIELD_STATUS_META[subfield.status];
    lines.push(
      `  ${subfield.key} — ${subfield.label}`,
      `    Status: ${meta.label}${meta.hasFinding ? "   [Befund nötig]" : ""}`,
      `    Wert: ${subfield.value ?? "keiner"}`,
      ...(subfield.sources.length === 0 ? ["      keine Fundstelle"] : subfield.sources.map(describeSource)),
      "",
    );
  }
  return lines.join("\n");
};

export interface FindingOptions {
  readonly today: string;
  readonly signal?: AbortSignal;
}

export const writeFinding = async (
  provider: LlmProvider,
  input: FindingInput,
  options: FindingOptions,
): Promise<Findings> => {
  const parts: PromptPart[] = [
    { kind: "text", text: `Heutiges Datum: ${options.today}` },
    { kind: "text", text: describe(input) },
  ];

  const { value } = await completeJson(
    provider,
    {
      task: "writeFinding",
      promptVersion: FINDING_PROMPT_VERSION,
      system: SYSTEM,
      parts,
      /*
       * The prose itself is a few hundred tokens, but a reasoning model bills its thinking
       * against the same ceiling and spends most of it before writing a word. At 2000 every
       * finding of a run came back truncated -- a field would then show `fehlt` with no
       * sentence saying why, which is the one thing this agent exists to prevent. Kept in
       * line with the other two stages rather than tuned to one model's appetite.
       */
      maxTokens: 8_000,
      temperature: 0,
    },
    FindingsSchema,
    { signal: options.signal },
  );

  // The status rules decide which subfields carry a finding; a finding written for any
  // other subfield is dropped rather than shown, so the two can never disagree.
  const allowed = new Set(
    input.subfields.filter((subfield) => FIELD_STATUS_META[subfield.status].hasFinding).map((subfield) => subfield.key),
  );
  return { ...value, findings: value.findings.filter((finding) => allowed.has(finding.subfieldKey)) };
};
