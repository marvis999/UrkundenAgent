import type { FieldStatus } from "./status";
import { daysBetween, fromIsoDate, toIsoDate } from "./value";

/**
 * Subfield status, computed from the stored rows. Never persisted.
 *
 * The eight rules from docs/Plan/Datenmodell.md, first match wins. Everything the UI
 * shows -- badge, field status, bar, counters -- comes from this one function, so a value
 * cannot look confirmed in one place and unconfirmed in another. `explainStatus` puts the
 * rule that fired into words, from the same input.
 */

export interface StatusCandidate {
  id: string;
  value: string | null;
  canonicalValue: string | null;
  tag: CandidateTag;
  documentId: string | null;
  confidence: number | null;
  /** Competing readings of the passage; empty when it was read cleanly. */
  readings: readonly string[];
  /** "Grundbuchauszug 15.11.2011, S. 2", so a finding can name the source. */
  sourceLabel: string;
}

export type CandidateTag = "extracted" | "manual" | "derived" | "redacted";

export interface StatusSubfield {
  chosenCandidateId: string | null;
  confirmedCandidateId: string | null;
  /** Rule 5a: the source document may not be older than this. Null = never goes stale. */
  staleAfterDays: number | null;
  /** Rule 5b: the value is itself a date, and the value having passed makes it stale. */
  staleWhenValueInPast: boolean;
  confidenceThreshold: number;
}

export interface StatusContext {
  /** ISO document date per document id. Missing entry = the document carries no date. */
  documentDate: (documentId: string) => string | undefined;
  /** ISO today. Passed in rather than read, so the same input always gives the same status. */
  today: string;
}

export interface Finding {
  title: string;
  text: string;
}

const isStaleBySource = (
  candidate: StatusCandidate,
  subfield: StatusSubfield,
  context: StatusContext,
): boolean => {
  if (subfield.staleAfterDays === null || candidate.documentId === null) return false;
  const issued = context.documentDate(candidate.documentId);
  return issued !== undefined && daysBetween(issued, context.today) > subfield.staleAfterDays;
};

const isStaleByValue = (candidate: StatusCandidate, subfield: StatusSubfield, context: StatusContext): boolean => {
  if (!subfield.staleWhenValueInPast || candidate.value === null) return false;
  const validUntil = toIsoDate(candidate.value);
  return validUntil !== undefined && daysBetween(validUntil, context.today) > 0;
};

/** The extracted candidates that disagree: one per canonical form, in the order found. */
const disagreeing = (candidates: readonly StatusCandidate[]): StatusCandidate[] => {
  const byForm = new Map<string, StatusCandidate>();
  for (const candidate of candidates) {
    if (candidate.tag === "extracted" && candidate.canonicalValue !== null && !byForm.has(candidate.canonicalValue)) {
      byForm.set(candidate.canonicalValue, candidate);
    }
  }
  return [...byForm.values()];
};

/**
 * Rule 4 compares sources with each other, so only extracted candidates take part, and
 * only while the chosen value is itself a source reading. Once a person has put a manual
 * value in front, the disagreement between documents has been decided and is history.
 * The canonical form is written with the candidate, so this is a plain string comparison.
 */
const hasConflict = (candidates: readonly StatusCandidate[], chosen: StatusCandidate): boolean =>
  chosen.tag === "extracted" && disagreeing(candidates).length > 1;

const isUncertain = (candidate: StatusCandidate, subfield: StatusSubfield): boolean =>
  candidate.readings.length > 0 || (candidate.confidence !== null && candidate.confidence < subfield.confidenceThreshold);

export const computeSubfieldStatus = (
  subfield: StatusSubfield,
  candidates: readonly StatusCandidate[],
  context: StatusContext,
): FieldStatus => {
  const chosen = candidates.find((c) => c.id === subfield.chosenCandidateId);

  if (chosen && chosen.id === subfield.confirmedCandidateId) return "confirmed";
  if (chosen?.tag === "redacted") return "redacted";
  // No chosen candidate means no value, whether or not readings exist that nobody picked.
  if (!chosen) return "missing";
  if (hasConflict(candidates, chosen)) return "conflict";
  if (isStaleBySource(chosen, subfield, context) || isStaleByValue(chosen, subfield, context)) return "outdated";
  if (isUncertain(chosen, subfield)) return "uncertain";
  if (chosen.tag === "derived") return "derived";
  return "proposed";
};

/**
 * The reason behind a status, in words the code owns.
 *
 * No model writes a finding. Every sentence below is a template, and what fills it is
 * data: the value as found, the label of its source, a date, a threshold. A status with no
 * template stands alone -- a bare "widersprüchlich" is true, and an invented explanation
 * would only look like one.
 */
export const explainStatus = (
  status: FieldStatus,
  subfield: StatusSubfield,
  candidates: readonly StatusCandidate[],
  context: StatusContext,
): Finding | undefined => {
  const chosen = candidates.find((c) => c.id === subfield.chosenCandidateId);
  if (chosen === undefined) return undefined;

  switch (status) {
    case "conflict": {
      const readings = disagreeing(candidates).map((c) => `„${c.value ?? ""}“ laut ${c.sourceLabel}`);
      return { title: "Zwei Quellen nennen verschiedene Werte", text: `${readings.join("; ")}. Welcher gilt, entscheidet eine Person.` };
    }
    case "outdated": {
      if (isStaleByValue(chosen, subfield, context)) {
        return { title: "Gültigkeit abgelaufen", text: `Gültig bis ${chosen.value}; heute ist der ${fromIsoDate(context.today)}.` };
      }
      const issued = chosen.documentId === null ? undefined : context.documentDate(chosen.documentId);
      if (issued === undefined || subfield.staleAfterDays === null) return undefined;
      return {
        title: "Quelle zu alt",
        text: `${chosen.sourceLabel} ist vom ${fromIsoDate(issued)}, älter als die ${subfield.staleAfterDays} Tage, die für diesen Wert gelten.`,
      };
    }
    case "uncertain": {
      if (chosen.readings.length > 0) {
        return { title: "Lesung nicht eindeutig", text: `Mögliche Lesarten: ${chosen.readings.join(" | ")}. Am Bild entscheiden.` };
      }
      if (chosen.confidence === null) return undefined;
      return {
        title: "Lesung unsicher",
        text: `Mit Konfidenz ${chosen.confidence.toFixed(2)} gelesen, unter der Schwelle von ${subfield.confidenceThreshold.toFixed(2)}.`,
      };
    }
    default:
      return undefined;
  }
};
