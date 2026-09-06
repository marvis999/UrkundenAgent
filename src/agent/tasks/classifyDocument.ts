import { z } from "zod";
import { completeJson, type LlmProvider, type PromptPart } from "@/agent/llm";
import type { PlannedDocument } from "@/agent/plan";
import { FIELD_CATALOG } from "@/catalog/fields";
import { FIELD_IDS, type FieldId } from "@/domain/model";
import { DOC_TYPES, DOCUMENT_STATUSES, SOURCE_CLASSES, type DocType, type DocumentStatus, type SourceClass } from "@/domain/status";
import { documentHeader, pageParts } from "./parts";

/**
 * Agent 1: what is this document, and which page holds what.
 *
 * Two jobs in one call, because both need the same glance over the whole file.
 *
 * The first job fills the columns the Unterlagen tab shows: the type from a fixed list,
 * the issue date, the source class, the state of the file. Every one is a choice or a
 * date, never a sentence. `doc_date` is the one that matters beyond display -- without it
 * staleness rule 5a cannot fire at all, and the Grundbuchauszug from 2011 would pass for
 * current.
 *
 * The second job is the page routing. A Grundbuchauszug is Aufschrift, Bestands-
 * verzeichnis, Abteilung I, II and III, and that structure maps almost one to one onto
 * the fields of the deed. Knowing it lets the extraction send two pages per field
 * instead of twelve, which is most of what a run costs.
 *
 * This agent reads no values. It is allowed to be wrong about what a page contains --
 * the worst case is that extraction looks at a page that turns out to hold nothing.
 */

export const CLASSIFY_PROMPT_VERSION = "2026-09-08";

const PageRoleSchema = z.object({
  number: z.number().int().positive(),
  /** Short German name for the section, e.g. "Bestandsverzeichnis", "Abteilung III". */
  role: z.string(),
  /** Degrees clockwise the image must be turned to read upright: 0, 90, 180 or 270. */
  rotation: z.number().int(),
  /** Fields this page could contribute to. Empty is a valid and useful answer. */
  fieldKeys: z.array(z.enum(FIELD_IDS)),
});

/** The turns a page can need. Anything else the model says is read as "upright". */
const TURNS = [0, 90, 180, 270];

export const ClassificationSchema = z.object({
  /** From the fixed list. A model picks a name here; it does not write one. */
  docType: z.enum(DOC_TYPES),
  /** ISO date the document was issued, or null when it carries none. Never guessed. */
  docDate: z.string().nullable(),
  sourceClass: z.enum(SOURCE_CLASSES),
  status: z.enum(DOCUMENT_STATUSES),
  pages: z.array(PageRoleSchema),
});

export type Classification = z.infer<typeof ClassificationSchema>;

export interface DocumentFacts {
  readonly docType: DocType;
  readonly docDate: string | null;
  readonly sourceClass: SourceClass;
  readonly status: DocumentStatus;
}

/** Which fields each page can contribute to, by page number. */
export type PageRouting = ReadonlyMap<number, readonly FieldId[]>;

export interface ClassifyResult {
  readonly facts: DocumentFacts;
  readonly routing: PageRouting;
  /** Degrees clockwise each page still has to be turned to stand upright; 0 where it does. */
  readonly rotations: ReadonlyMap<number, number>;
  readonly cached: boolean;
}

/** Each field with its subfields, so the routing knows that Grundstücke includes the address. */
const FIELD_LIST = FIELD_CATALOG.map(
  (field) => `  ${field.key} — ${field.label}: ${field.subfields.map((subfield) => subfield.label).join(", ")}`,
).join("\n");

const SYSTEM = `Du bist die Dokumentenaufnahme einer notariellen Zuarbeit für einen Grundstückskaufvertrag.

Du bekommst alle Seiten einer Datei. Seiten mit Textebene kommen als Text, Seiten ohne
Textebene als Bild. Du liest keine Werte. Du beschreibst das Dokument und sagst, welche
Seite wozu etwas beitragen kann; ein späterer Schritt liest die Werte.

Liefere:

docType — die Gattung, genau einer dieser Namen: ${DOC_TYPES.join(", ")}.
Passt keiner, nimm Sonstiges.

docDate — das Ausstellungsdatum als YYYY-MM-DD. Nur ein Datum, das im Dokument steht.
Trägt das Dokument keines, gib null. Rate nicht und leite nichts her.

sourceClass — woher die Angabe stammt:
  register        Grundbuch, Handelsregister und andere öffentliche Register
  officialProof   amtlicher Nachweis, etwa Flurkarte oder Katasterauszug
  thirdPartyProof Nachweis eines Dritten, etwa Energieausweis oder Architektenberechnung
  partyStatement  Angabe einer Partei oder ihres Maklers

status — der Zustand der Datei, nicht der Werte darin:
  current         aktuell und verwendbar
  unconfirmed     verwendbar, aber von einer Partei und unbestätigt
  outdated        durch Zeitablauf überholt (vergleiche docDate mit dem heutigen Datum)
  hardToRead      eingeschränkt lesbar: Foto, schräg, Handschrift, Stempel über der Spalte
  notRelevant     kein Feld der Urkunde bezieht sich darauf
  partlyRedacted  Teile sind bewusst unlesbar gemacht

pages — für jede Seite, die du bekommen hast, genau ein Eintrag:
  number     die Seitenzahl, wie sie im Seitenkopf steht
  role       kurze deutsche Bezeichnung des Abschnitts, etwa "Aufschrift",
             "Bestandsverzeichnis", "Abteilung II", "Deckblatt", "Summenzeile"
  rotation   um wie viel Grad im Uhrzeigersinn das Bild gedreht werden muss, damit der
             Text aufrecht steht: 0, 90, 180 oder 270. Für eine Textseite und für ein
             Bild, das bereits aufrecht steht, 0.
  fieldKeys  die Felder der Urkunde, zu denen diese Seite etwas beitragen kann.
             Eine leere Liste ist eine richtige Antwort für eine Seite ohne Bezug.
             Lieber eine Seite zu viel als eine zu wenig: eine überflüssige Seite kostet
             nur Zeit, eine fehlende Seite kostet einen Wert.

Die Felder der Urkunde:
${FIELD_LIST}`;

export interface ClassifyOptions {
  /** ISO today, so the staleness judgment is reproducible rather than clock-dependent. */
  readonly today: string;
  readonly signal?: AbortSignal;
}

/**
 * Pages per call. A rendered A4 page is around half a megabyte of PNG and travels as
 * base64, so a twelve-page scan in one request is eight megabytes of body -- big enough
 * to time out before the model reads any of it. A long document is classified in
 * sections instead.
 */
const MAX_PAGES_PER_CALL = 6;

const inSections = (pages: PlannedDocument["pages"]): PlannedDocument["pages"][] => {
  const sections: PlannedDocument["pages"][] = [];
  for (let start = 0; start < pages.length; start += MAX_PAGES_PER_CALL) {
    sections.push(pages.slice(start, start + MAX_PAGES_PER_CALL));
  }
  return sections;
};

const classifySection = (
  provider: LlmProvider,
  document: PlannedDocument,
  pages: PlannedDocument["pages"],
  isFirst: boolean,
  options: ClassifyOptions,
) => {
  const parts: PromptPart[] = [
    { kind: "text", text: `Heutiges Datum: ${options.today}` },
    ...(isFirst
      ? []
      : [
          {
            kind: "text" as const,
            text:
              "Dies ist ein weiterer Abschnitt derselben Datei. Beschreibe das Dokument wie zuvor; " +
              "entscheidend sind hier die Seitenrollen.",
          },
        ]),
    documentHeader(document, pages),
    ...pageParts(pages),
  ];

  return completeJson(
    provider,
    {
      task: "classifyDocument",
      promptVersion: CLASSIFY_PROMPT_VERSION,
      system: SYSTEM,
      parts,
      maxTokens: 8_000,
      temperature: 0,
    },
    ClassificationSchema,
    { signal: options.signal },
  );
};

export const classifyDocument = async (
  provider: LlmProvider,
  document: PlannedDocument,
  options: ClassifyOptions,
): Promise<ClassifyResult> => {
  const sections = inSections(document.pages);

  // A page the model did not mention keeps no routing, which simply means no field
  // extraction looks at it. A page it invented is dropped the same way.
  const known = new Set(document.pages.map((page) => page.number));
  const routing = new Map<number, readonly FieldId[]>();
  const rotations = new Map<number, number>();

  let facts: DocumentFacts | undefined;
  let cached = true;

  for (const [index, pages] of sections.entries()) {
    const call = await classifySection(provider, document, pages, index === 0, options);
    cached = cached && call.cached;

    // The first section carries the title page, the issue date and the stamp, so it is
    // the one that describes the document. Later sections only contribute page roles.
    if (index === 0) {
      const { docType, docDate, sourceClass, status } = call.value;
      facts = { docType, docDate, sourceClass, status };
    }
    for (const page of call.value.pages) {
      if (!known.has(page.number)) continue;
      routing.set(page.number, page.fieldKeys);
      rotations.set(page.number, TURNS.includes(page.rotation) ? page.rotation : 0);
    }
  }

  if (facts === undefined) throw new Error(`${document.fileName}: keine Seiten zu klassifizieren.`);
  return { facts, routing, rotations, cached };
};
