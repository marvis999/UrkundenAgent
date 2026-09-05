import type { FieldStatus } from "./status";
import { daysBetween, toIsoDate } from "./value";

/**
 * Subfield status, computed from the stored rows. Never persisted.
 *
 * The eight rules from docs/Plan/Datenmodell.md, first match wins. Everything the UI
 * shows -- badge, field status, bar, counters, export -- comes from this one function,
 * so a value cannot look confirmed in one place and unconfirmed in another.
 */

export interface StatusCandidate {
  id: string;
  value: string | null;
  canonicalValue: string | null;
  tag: CandidateTag;
  documentId: string | null;
  confidence: number | null;
  hasReadings: boolean;
}

export const CANDIDATE_TAGS = ["extracted", "manual", "derived", "redacted"] as const;
export type CandidateTag = (typeof CANDIDATE_TAGS)[number];

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

/**
 * Rule 4 compares sources with each other, so only extracted candidates take part, and
 * only while the chosen value is itself a source reading. Once a person has put a manual
 * value in front, the disagreement between documents has been decided and is history.
 * The canonical form is written with the candidate, so this is a plain string comparison.
 */
const hasConflict = (candidates: readonly StatusCandidate[], chosen: StatusCandidate): boolean => {
  if (chosen.tag !== "extracted") return false;
  const forms = new Set(candidates.filter((c) => c.tag === "extracted" && c.canonicalValue !== null).map((c) => c.canonicalValue));
  return forms.size > 1;
};

const isUncertain = (candidate: StatusCandidate, subfield: StatusSubfield): boolean =>
  candidate.hasReadings || (candidate.confidence !== null && candidate.confidence < subfield.confidenceThreshold);

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
