import { z } from "zod";
import { completeJson, type LlmProvider, type PromptPart } from "@/agent/llm";
import type { PlannedPage } from "@/agent/plan";
import { fieldDefinition } from "@/catalog/fields";
import type { FieldId } from "@/domain/model";
import type { ValueType } from "@/domain/value";
import { hasText, pagePart } from "./parts";

/**
 * Agent 2: read one field off the pages that could hold it.
 *
 * This is the only agent that produces values, and it is deliberately the narrowest.
 * It is handed one field of the deed and the handful of pages the classification routed
 * to it -- possibly from several documents at once, which is what lets it hand back two
 * competing readings of the same value in one answer.
 *
 * It proposes, it never decides. It does not pick between two readings, does not mark
 * anything confirmed, and does not judge whether a value is stale: those are rules the
 * code applies afterwards, identically every time. What it must do is say where every
 * value came from, precisely enough that the merge can check the claim.
 *
 * Pages travel as text where a text layer exists and as an image where it does not, so
 * one call routinely mixes both. Pages are addressed by their position in the request
 * (`pageRef`) rather than by file name and page number, because an index is something a
 * model cannot get subtly wrong.
 */

export const EXTRACT_PROMPT_VERSION = "2026-09-06b";

/**
 * Pages per call. Beyond this the request is split, keeping document order.
 *
 * The limit is set by image pages, not by what the model can hold: a rendered A4 page is
 * around half a megabyte of PNG and travels as base64, so a dozen of them make a request
 * big enough to time out before it is ever read.
 */
export const MAX_PAGES_PER_CALL = 4;

const CropSchema = z.object({
  /** Fractions of the page, origin top left. Stored as-is; the UI scales them. */
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});

const ReadingSchema = z.object({ value: z.string(), probability: z.number() });

const CellSchema = z.object({ column: z.string(), value: z.string() });

const CandidateSchema = z.object({
  /**
   * Which of the two targets this candidate writes to, said outright.
   *
   * Strict structured output requires every property to be present, so a model cannot
   * express "this one does not apply" by leaving a key out -- it has to put something in
   * both `subfieldKey` and `rowNaturalKey`, and a weaker one fills the wrong half with a
   * placeholder. Asking which target it means costs one token and removes the guess.
   */
  targetKind: z.enum(["subfield", "row"]),
  /** Key of the subfield this answers. Ignored when targetKind is "row". */
  subfieldKey: z.string().nullable(),
  /** Identity of the row, in the format the field spec gives. Ignored for a subfield. */
  rowNaturalKey: z.string().nullable(),
  /** The whole row, for a table candidate. Empty for a subfield candidate. */
  cells: z.array(CellSchema),
  /** The value as found. Null only with tag "redacted". */
  value: z.string().nullable(),
  tag: z.enum(["extracted", "redacted"]),
  /** 1-based position of the page in this request, as listed in the prompt. */
  pageRef: z.number().int().positive(),
  /** Verbatim from the page text. Null on an image page, where the crop takes its place. */
  quote: z.string().nullable(),
  crop: CropSchema.nullable(),
  cropHint: z.string().nullable(),
  cropQuestion: z.string().nullable(),
  confidence: z.number(),
  /** Competing readings of one passage. Null when the reading is unambiguous. */
  readings: z.array(ReadingSchema).nullable(),
  rationale: z.string(),
});

export const ExtractionSchema = z.object({ candidates: z.array(CandidateSchema) });

export type RawCandidate = z.infer<typeof CandidateSchema>;

/** A page as it was offered to the model, so a `pageRef` can be resolved back. */
export interface OfferedPage {
  readonly documentId: string;
  readonly fileName: string;
  readonly page: PlannedPage;
}

export interface ExtractResult {
  readonly fieldKey: FieldId;
  readonly offered: readonly OfferedPage[];
  readonly candidates: readonly RawCandidate[];
  readonly cached: boolean;
  readonly model: string;
}

/* ---------- What a field looks like to the model ---------- */

/**
 * The two table fields, with the columns of a row and the identity a later run uses to
 * recognise the same row again. Kept here rather than in the catalog: the catalog
 * describes the deed, this describes how to ask for it.
 */
const TABLE_SPEC: Partial<Record<FieldId, { columns: readonly [string, string][]; naturalKey: string }>> = {
  parcels: {
    columns: [
      ["district", "Gemarkung"],
      ["section", "Flur"],
      ["parcel", "Flurstück"],
      ["size", "Größe, mit Einheit"],
      ["landUse", "Wirtschaftsart"],
    ],
    naturalKey: "Gemarkung|Flur|Flurstück, zum Beispiel Beispielheide|00|000/1",
  },
  encumbrances: {
    columns: [
      ["entry", "Eintragung, etwa II/1"],
      ["text", "Inhalt der Eintragung"],
      ["proofLine", "welcher Nachweis für sie nötig wäre"],
    ],
    naturalKey: "Abteilung|laufende Nummer, zum Beispiel II|1",
  },
};

const VALUE_TYPE_HINT: Record<ValueType, string> = {
  text: "Text, so wie er dasteht",
  amount: "Geldbetrag in deutscher Schreibweise mit Währung, etwa 2.060.000,00 EUR",
  date: "Datum als TT.MM.JJJJ",
  area: "Fläche mit Einheit, etwa 1.184,60 m²",
  register: "Registerangabe, etwa HRB 12345 oder Blatt 00000",
  measure: "Messwert mit Einheit, etwa 112,4 kWh/(m²·a)",
};

const fieldSpec = (fieldKey: FieldId): string => {
  const definition = fieldDefinition(fieldKey);
  if (!definition) return "";

  const subfields = definition.subfields
    .map((subfield) => `  ${subfield.key} — ${subfield.label} (${VALUE_TYPE_HINT[subfield.valueType]})`)
    .join("\n");

  const table = TABLE_SPEC[fieldKey];
  const tableBlock = table
    ? [
        "",
        "Dieses Feld ist eine Tabelle. Gib je Zeile einen Kandidaten mit rowNaturalKey und cells:",
        ...table.columns.map(([column, label]) => `  ${column} — ${label}`),
        `rowNaturalKey: ${table.naturalKey}`,
        "value ist bei einer Tabellenzeile eine kurze Zusammenfassung der Zeile in einer Zeile.",
      ].join("\n")
    : "";

  return [`Feld: ${definition.label} (${definition.key})`, "Unterfelder:", subfields, tableBlock].join("\n");
};

const SYSTEM = `Du liest Unterlagen für einen notariellen Grundstückskaufvertrag und trägst
Fundstellen zusammen. Du entscheidest nichts.

Du bekommst genau ein Feld der Urkunde und die Seiten, die dazu etwas enthalten könnten.
Seiten mit Textebene stehen als Text da, Seiten ohne als Bild. Beides in einer Anfrage ist
normal, und die Seiten können aus verschiedenen Dateien stammen.

Für jede Angabe, die du findest, gib einen Kandidaten. Ein Kandidat braucht immer eine
Herkunft:

- targetKind: "subfield", wenn der Kandidat ein Unterfeld beantwortet, "row", wenn er eine
  Tabellenzeile ist. Bei "subfield" trägst du subfieldKey ein und lässt rowNaturalKey und
  cells leer; bei "row" trägst du rowNaturalKey und cells ein und lässt subfieldKey leer.
  subfieldKey muss einer der oben genannten Unterfeldschlüssel sein, wörtlich.
- pageRef: die Nummer der Seite, wie sie oben in dieser Anfrage aufgelistet ist. Nicht die
  Seitenzahl im Dokument, sondern die laufende Nummer in der Liste.
- quote: bei einer Textseite der Satz oder die Zeile wörtlich, Zeichen für Zeichen aus dem
  Seitentext kopiert, den du oben bekommen hast. Nicht zusammengefasst, nicht korrigiert,
  nicht gekürzt. Der Text steht dir vor Augen, wörtliches Kopieren ist also immer möglich;
  ein kurzes Zitat, das sicher dasteht, ist besser als ein langes.
- crop: bei einer Bildseite das Rechteck um die Fundstelle, als Anteile der Seite zwischen
  0 und 1, Ursprung links oben. Auf einer Bildseite ist quote null, auf einer Textseite ist
  crop null.
- confidence: zwischen 0 und 1, wie sicher du die Stelle gelesen hast.
- rationale: ein Satz, warum das der Wert ist.

Drei Antworten, die keine einfache Lesung sind, und die du geben sollst statt zu raten:

1. Zwei Quellen sagen Verschiedenes. Gib beide Kandidaten, vollständig belegt. Entscheide
   nicht, welcher gilt, und lasse keinen weg.
2. Die Stelle ist nicht eindeutig zu lesen, etwa eine überschriebene Handschrift. Setze
   readings mit zwei oder drei Lesarten und ihren Wahrscheinlichkeiten, und nimm die
   wahrscheinlichste als value. Setze cropQuestion auf die Frage, die ein Mensch
   beantworten muss.
3. An der Stelle ist überhaupt nichts zu lesen, weil sie bewusst unlesbar gemacht wurde,
   etwa geschwärzte Mieternamen. Nur dann: tag "redacted", value null, mit der Fundstelle
   der Schwärzung. Schreibe in value nichts, auch nicht "unleserlich" oder "geschwärzt".
   Kannst du etwas lesen, ist es tag "extracted" — auch wenn der Wert anonymisiert wirkt
   und auch wenn die Eintragung im Grundbuch durchgestrichen (gerötet) ist.

Was du nicht tust: Werte erfinden, aus dem Zusammenhang ergänzen, umrechnen, aus einem
anderen Wert herleiten, oder beurteilen, ob eine Quelle zu alt ist. Steht zu einem
Unterfeld auf diesen Seiten nichts, gib dazu keinen Kandidaten.

Umgekehrt gilt aber: steht der Wert da, dann gib ihn an. Nichts zurückzugeben, obwohl die
Angabe auf der Seite steht, ist der schwerere Fehler — ein Feld ohne Fundstelle wird
angefordert, und angefordert wird dann etwas, das längst vorliegt. Lieber ein Kandidat mit
niedriger Konfidenz als gar keiner.

cropHint ist ein kurzer deutscher Hinweis, was die Lesung erschwert, etwa "Stempel überdeckt
die Spalte". Bei Textseiten null.`;

const offeredList = (offered: readonly OfferedPage[]): string =>
  offered
    .map(
      (entry, index) =>
        `  ${index + 1}. ${entry.fileName}, Seite ${entry.page.number} (${hasText(entry.page) ? "Text" : "Bild"})`,
    )
    .join("\n");

export interface ExtractOptions {
  readonly signal?: AbortSignal;
}

export const extractCandidates = async (
  provider: LlmProvider,
  fieldKey: FieldId,
  offered: readonly OfferedPage[],
  options: ExtractOptions = {},
): Promise<ExtractResult> => {
  const parts: PromptPart[] = [
    { kind: "text", text: fieldSpec(fieldKey) },
    { kind: "text", text: `Seiten in dieser Anfrage, in dieser Reihenfolge:\n${offeredList(offered)}` },
    ...offered.flatMap((entry, index) => [
      { kind: "text" as const, text: `=== pageRef ${index + 1}: ${entry.fileName}, Seite ${entry.page.number} ===` },
      pagePart(entry.page),
    ]),
  ];

  const { value, result, cached } = await completeJson(
    provider,
    {
      task: "extractCandidates",
      promptVersion: EXTRACT_PROMPT_VERSION,
      system: SYSTEM,
      parts,
      // A reasoning model spends output tokens thinking before any JSON appears, so the
      // ceiling has to cover both. At 8_000 a long Bestandsverzeichnis was cut off mid-answer.
      maxTokens: 16_000,
      temperature: 0,
    },
    ExtractionSchema,
    { signal: options.signal },
  );

  return { fieldKey, offered, candidates: value.candidates, cached, model: result.model };
};

/** Splits the pages routed to one field into requests the model can hold at once. */
export const inCalls = (offered: readonly OfferedPage[]): OfferedPage[][] => {
  const calls: OfferedPage[][] = [];
  for (let start = 0; start < offered.length; start += MAX_PAGES_PER_CALL) {
    calls.push(offered.slice(start, start + MAX_PAGES_PER_CALL));
  }
  return calls;
};
