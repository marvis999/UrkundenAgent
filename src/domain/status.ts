import type { IconName } from "@/components/ui/icons";
import type { Tone } from "./tone";

/** Shape shared by every status-like enum: what the badge shows. */
export interface StatusMeta {
  label: string;
  tone: Tone;
  icon: IconName;
}

/* ---------- Field / subfield / table-row status ---------- */

export const FIELD_STATUSES = [
  "confirmed",
  "proposed",
  "derived",
  "outdated",
  "conflict",
  "uncertain",
  "missing",
  "redacted",
] as const;
export type FieldStatus = (typeof FIELD_STATUSES)[number];

export interface FieldStatusMeta extends StatusMeta {
  /** Higher rank = worse. Field status is the highest-ranked status of its parts. */
  rank: number;
  /** A finding exists only for these statuses. A merely proposed value is not a finding. */
  hasFinding: boolean;
  /** Counts as open, i.e. still needs a human. */
  isOpen: boolean;
  /** Carries no source; displayed as a negation instead of a Fundstelle. */
  hasNoSource: boolean;
}

export const FIELD_STATUS_META: Record<FieldStatus, FieldStatusMeta> = {
  missing: { label: "fehlt", tone: "missing", icon: "circle-minus", rank: 6, hasFinding: true, isOpen: true, hasNoSource: true },
  conflict: { label: "widersprüchlich", tone: "attention", icon: "triangle-alert", rank: 5, hasFinding: true, isOpen: true, hasNoSource: false },
  outdated: { label: "veraltet", tone: "attention", icon: "clock", rank: 5, hasFinding: true, isOpen: true, hasNoSource: false },
  uncertain: { label: "Lesung unsicher", tone: "attention", icon: "scan-text", rank: 5, hasFinding: true, isOpen: true, hasNoSource: false },
  proposed: { label: "vorgeschlagen", tone: "proposed", icon: "circle-plus", rank: 3, hasFinding: false, isOpen: true, hasNoSource: false },
  derived: { label: "abgeleitet", tone: "proposed", icon: "corner-down-right", rank: 2, hasFinding: false, isOpen: true, hasNoSource: false },
  redacted: { label: "geschwärzt", tone: "neutral", icon: "eye-off", rank: 1, hasFinding: false, isOpen: false, hasNoSource: true },
  confirmed: { label: "bestätigt", tone: "confirmed", icon: "circle-check", rank: 1, hasFinding: false, isOpen: false, hasNoSource: false },
};

/* ---------- Overview groups (bar, legend and banner count with these) ---------- */

interface OverviewGroup extends StatusMeta {
  id: string;
  statuses: readonly FieldStatus[];
}

export const OVERVIEW_GROUPS = [
  { id: "confirmed", label: "bestätigt", tone: "confirmed", icon: "circle-check", statuses: ["confirmed"] },
  { id: "proposed", label: "vorgeschlagen", tone: "proposed", icon: "circle-plus", statuses: ["proposed", "derived"] },
  { id: "toClarify", label: "zu klären", tone: "attention", icon: "triangle-alert", statuses: ["outdated", "conflict", "uncertain"] },
  { id: "missing", label: "fehlt", tone: "missing", icon: "circle-minus", statuses: ["missing"] },
] as const satisfies readonly OverviewGroup[];
export type OverviewGroupId = (typeof OVERVIEW_GROUPS)[number]["id"];

/* ---------- Document status ---------- */

export const DOCUMENT_STATUSES = ["current", "unconfirmed", "outdated", "hardToRead", "notRelevant", "partlyRedacted"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const DOCUMENT_STATUS_META: Record<DocumentStatus, StatusMeta> = {
  current: { label: "aktuell", tone: "confirmed", icon: "circle-check" },
  unconfirmed: { label: "unbestätigt", tone: "proposed", icon: "circle-plus" },
  outdated: { label: "veraltet", tone: "attention", icon: "clock" },
  hardToRead: { label: "eingeschränkt lesbar", tone: "attention", icon: "scan-text" },
  notRelevant: { label: "nicht auszuwerten", tone: "neutral", icon: "image" },
  partlyRedacted: { label: "teils geschwärzt", tone: "neutral", icon: "eye-off" },
};

/* ---------- Document kind (drives the file icon) ---------- */

export const DOCUMENT_KINDS = ["email", "scan", "photo", "table", "register"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_KIND_ICON: Record<DocumentKind, IconName> = {
  email: "mail",
  scan: "file-text",
  photo: "image",
  table: "table",
  register: "building",
};

/* ---------- Case status ---------- */

export const CASE_STATUSES = ["complete", "inReview", "awaitingReply", "noDocuments"] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const CASE_STATUS_META: Record<CaseStatus, StatusMeta> = {
  complete: { label: "vollständig", tone: "confirmed", icon: "circle-check" },
  inReview: { label: "in Prüfung", tone: "attention", icon: "triangle-alert" },
  awaitingReply: { label: "wartet auf Rückmeldung", tone: "proposed", icon: "clock" },
  noDocuments: { label: "ohne Unterlagen", tone: "neutral", icon: "inbox" },
};

/* ---------- Source class (neutral, no ranking) ---------- */

export const SOURCE_CLASSES = ["register", "officialProof", "thirdPartyProof", "partyStatement"] as const;
export type SourceClass = (typeof SOURCE_CLASSES)[number];

export const SOURCE_CLASS_LABEL: Record<SourceClass, string> = {
  register: "Register",
  officialProof: "Amtlicher Nachweis",
  thirdPartyProof: "Nachweis Dritter",
  partyStatement: "Parteiangabe",
};

/* ---------- Procedure per encumbrance ---------- */

export const PROCEDURES = ["assumption", "deletion", "redemption"] as const;
export type Procedure = (typeof PROCEDURES)[number];

export const PROCEDURE_META: Record<Procedure, { label: string; consequence: string }> = {
  assumption: { label: "Übernahme", consequence: "Übernahme: Klausel in § 5, kein weiterer Nachweis nötig" },
  deletion: { label: "Löschung", consequence: "Löschung: Löschungsbewilligung der Berechtigten erforderlich" },
  redemption: { label: "Ablösung", consequence: "Ablösung: Ablösebetrag der Gläubigerin und Treuhandauflage erforderlich" },
};

/* ---------- Request item outcome after a run ---------- */

export const REQUEST_OUTCOMES = ["done", "partial", "open"] as const;
export type RequestOutcome = (typeof REQUEST_OUTCOMES)[number];

export const REQUEST_OUTCOME_META: Record<RequestOutcome, StatusMeta> = {
  done: { label: "erledigt", tone: "confirmed", icon: "circle-check" },
  partial: { label: "teilweise", tone: "attention", icon: "triangle-alert" },
  open: { label: "offen", tone: "missing", icon: "circle-minus" },
};

/* ---------- Case phase (the circle) ---------- */

export const PHASES = ["review", "waiting", "intake", "analysis"] as const;
export type Phase = (typeof PHASES)[number];

/* ---------- Actor of a history entry ---------- */

export const ACTORS = ["agent", "user"] as const;
export type Actor = (typeof ACTORS)[number];

export const ACTOR_LABEL: Record<Actor, string> = { agent: "Agent", user: "SB" };
