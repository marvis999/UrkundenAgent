import type { CandidateTag, Finding } from "./computeStatus";
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
  /** The document's type, as the label on the excerpt. */
  caption: string;
  /** Height of the cited page divided by its width. Absent while the page is unrendered. */
  pageAspect?: number;
  readings?: Reading[];
}

/** What a candidate writes into: exactly one subfield or one table row. */
export type CandidateTarget = { kind: "subfield"; subfieldId: string } | { kind: "row"; rowId: string };

export interface Candidate {
  id: string;
  target: CandidateTarget;
  /** Null only for a redacted passage: the Fundstelle exists, the value does not. */
  value: string | null;
  sourceLabel: string;
  /** How the value came to be. Drives what the candidate must carry; see the data model. */
  tag: CandidateTag;
  /** Short German label on the card, e.g. "spaeterer Stand". Falls back to the tag. */
  note?: string;
  /** Absent for manual and derived candidates, which have no document behind them. */
  sourceClass?: SourceClass;
  documentId?: string;
  page?: number;
  confidence?: number;
  quote?: string;
  /** The model's sentence, or the person's reason for a manual correction. */
  rationale?: string;
  image?: ImageEvidence;
  /** Whether this is the candidate the value currently comes from. */
  isActive: boolean;
}

export type { Finding };

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
  /** Set while a sent request for this field has not been reconciled by a later run. */
  requestedAt?: string;
  /** A run later than the first produced a value here. */
  isNew?: boolean;
  /** Run-level events that concern the whole field. Value-level events sit on the part. */
  history: HistoryEntry[];
}

export interface Document {
  id: string;
  fileName: string;
  /** The name a notary uses, from the fixed list in DOC_TYPES. */
  type: string;
  kind: DocumentKind;
  date: string;
  pageCount: number;
  status: DocumentStatus;
  sourceClass: SourceClass;
  isNew?: boolean;
  /** Set once the original has been rendered, so the viewer can show real pages. */
  hasPages?: boolean;
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
  /**
   * The run the case is in or about to start: the unfinished run while one is in flight,
   * otherwise the next number. Every "Durchlauf N" on screen is this one, so the button
   * that starts a run and the strip that shows it running name the same number.
   */
  nextRun: number;
}

/** Everything a case view needs. */
export interface CaseView {
  case: Case;
  fields: Field[];
  documents: Document[];
  runs: Run[];
  /**
   * Positions of the request currently in play: the draft basket if one is open,
   * otherwise the request that was sent and is still awaiting a reply.
   */
  basket: FieldId[];
  /** Set once that request has gone out. Until then the basket is still editable. */
  requestSentAt?: string;
  /** Who that request went to; empty while it is still a basket. */
  recipient: string;
  /** Pages read per document while a run is in progress. */
  analysisProgress?: Record<string, number>;
}
