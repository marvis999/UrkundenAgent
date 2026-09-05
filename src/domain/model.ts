import type {
  Actor,
  CaseStatus,
  DocumentKind,
  DocumentStatus,
  FieldStatus,
  Phase,
  Procedure,
  RequestOutcome,
  SourceClass,
} from "./status";

export const FIELD_IDS = [
  "seller",
  "buyer",
  "landRegister",
  "parcels",
  "purchasePrice",
  "financing",
  "encumbrances",
  "tenancies",
  "energyCertificate",
  "handover",
] as const;
export type FieldId = (typeof FIELD_IDS)[number];

export interface FieldGroup {
  id: string;
  title: string;
  fieldIds: readonly FieldId[];
}

export interface HistoryEntry {
  run: number;
  at: string;
  actor: Actor;
  text: string;
}

export interface Reading {
  value: string;
  probability: number;
}

/** Percent-based rectangle within the page image. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ImageEvidence {
  crop: Rect;
  caption: string;
  hint: string;
  question?: string;
  readings?: Reading[];
}

/** What a candidate writes into: exactly one subfield or one table row. */
export type CandidateTarget = { kind: "subfield"; subfieldId: string } | { kind: "row"; rowId: string };

export interface Candidate {
  id: string;
  target: CandidateTarget;
  value: string;
  sourceLabel: string;
  sourceClass: SourceClass;
  documentId: string;
  page: number;
  confidence: number;
  tag: string;
  quote?: string;
  image?: ImageEvidence;
  isActive: boolean;
}

export interface Finding {
  title: string;
  text: string;
}

/**
 * The atomic unit of review. Status, finding and history hang here, never on the field.
 * Ids are unique within a field across subfields and table rows.
 */
export interface ReviewPart {
  id: string;
  status: FieldStatus;
  finding?: Finding;
  history?: HistoryEntry[];
}

export interface Subfield extends ReviewPart {
  label: string;
  value: string | null;
  sourceLabel: string;
}

export interface ParcelRow extends ReviewPart {
  district: string;
  section: string;
  parcel: string;
  size: string;
  landUse: string;
}

export interface EncumbranceRow extends ReviewPart {
  entry: string;
  text: string;
  proofLine: string;
  procedure: Procedure | null;
}

export type FieldTable = { kind: "parcels"; rows: ParcelRow[] } | { kind: "encumbrances"; rows: EncumbranceRow[] };

export interface RequestTemplate {
  title: string;
  text: string;
}

export interface Field {
  id: FieldId;
  label: string;
  shortValue: string;
  sourceLabel: string;
  subfields: Subfield[];
  table?: FieldTable;
  candidates: Candidate[];
  request?: RequestTemplate;
  /** Set when a request would be wrong, e.g. deliberately redacted data. */
  noRequestReason?: string;
  requestedAt?: string;
  isNew?: boolean;
  /** Run-level events that concern the whole field. Value-level events sit on the part. */
  history: HistoryEntry[];
}

export interface PhotoNote {
  caption: string;
  hint: string;
}

export interface Document {
  id: string;
  fileName: string;
  type: string;
  kind: DocumentKind;
  date: string;
  pageCount: number;
  status: DocumentStatus;
  sourceClass: SourceClass;
  quality: string;
  title: string;
  subtitle: string;
  photoNote?: PhotoNote;
  isNew?: boolean;
}

export interface RequestItem {
  fieldId: FieldId;
  title: string;
  resolvedBy: string;
  outcome: RequestOutcome;
}

export interface Run {
  number: number;
  at: string;
  summary: string;
  items: RequestItem[];
}

export interface Clause {
  number: string;
  title: string;
  fieldIds: readonly FieldId[];
}

export interface Case {
  id: string;
  name: string;
  fileNumber: string;
  property: string;
  status: CaseStatus;
  changedAt: string;
  phase: Phase;
  currentRun: number;
}

/** Everything a case view needs. */
export interface CaseView {
  case: Case;
  fields: Field[];
  groups: readonly FieldGroup[];
  documents: Document[];
  runs: Run[];
  clauses: readonly Clause[];
  /** Field ids currently in the request basket. */
  basket: FieldId[];
  recipient: string;
  recipientEmail: string;
  /** Pages read per document while a run is in progress. */
  analysisProgress?: Record<string, number>;
}
