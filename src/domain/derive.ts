import type { IconName } from "@/components/ui/icons";
import { routes } from "@/lib/routes";
import { formatPositions, formatRun, plural } from "@/lib/format";
import type { Candidate, CandidateTarget, CaseView, Field, FieldId, Finding, ReviewPart } from "./model";
import { FIELD_STATUS_META, OVERVIEW_GROUPS, type FieldStatus, type OverviewGroupId } from "./status";
import type { Tone } from "./tone";

/* Every number on screen comes from these functions. Nothing is stored twice. */

export const worstStatus = (statuses: readonly FieldStatus[]): FieldStatus =>
  statuses.reduce<FieldStatus>(
    (worst, s) => (FIELD_STATUS_META[s].rank > FIELD_STATUS_META[worst].rank ? s : worst),
    "confirmed",
  );

export const isOpen = (status: FieldStatus) => FIELD_STATUS_META[status].isOpen;
export const hasFinding = (status: FieldStatus) => FIELD_STATUS_META[status].hasFinding;

/* ---------- Parts: subfields and table rows, the units everything hangs on ---------- */

export const fieldParts = (field: Field): ReviewPart[] => [...field.subfields, ...(field.table?.rows ?? [])];

const byWorstFirst = (parts: readonly ReviewPart[]) =>
  [...parts].sort((a, b) => FIELD_STATUS_META[b.status].rank - FIELD_STATUS_META[a.status].rank);

export const fieldStatus = (field: Field): FieldStatus => worstStatus(fieldParts(field).map((p) => p.status));

/** The finding shown in the field header: the worst part that carries one. */
export const fieldFinding = (field: Field): Finding | undefined =>
  byWorstFirst(fieldParts(field)).find((p) => p.finding && hasFinding(p.status))?.finding;

/** Which part opens when a field is expanded: the finding, else the worst open part, else the first. */
export const defaultPartId = (field: Field): string | undefined => {
  const parts = byWorstFirst(fieldParts(field));
  return (parts.find((p) => p.finding && hasFinding(p.status)) ?? parts.find((p) => isOpen(p.status)) ?? parts[0])?.id;
};

/** Stable string form of a target, so two targets compare with one equality check. */
const targetKey = (t: CandidateTarget) => (t.kind === "subfield" ? `subfield:${t.subfieldId}` : `row:${t.rowId}`);

export const candidatesFor = (field: Field, target: CandidateTarget): Candidate[] => {
  const key = targetKey(target);
  return field.candidates.filter((c) => targetKey(c.target) === key);
};

export const hasEvidence = (field: Field, target: CandidateTarget) => candidatesFor(field, target).length > 0;

/* ---------- Counts ---------- */

export const openFields = (fields: readonly Field[]) => fields.filter((f) => isOpen(fieldStatus(f)));
export const fieldsWithFinding = (fields: readonly Field[]) => fields.filter((f) => hasFinding(fieldStatus(f)));

export interface OverviewCount {
  id: OverviewGroupId;
  label: string;
  tone: Tone;
  icon: IconName;
  count: number;
  firstFieldId?: FieldId;
}

export const overviewCounts = (fields: readonly Field[]): OverviewCount[] =>
  OVERVIEW_GROUPS.map((group) => {
    const matching = fields.filter((f) => (group.statuses as readonly FieldStatus[]).includes(fieldStatus(f)));
    return { id: group.id, label: group.label, tone: group.tone, icon: group.icon, count: matching.length, firstFieldId: matching[0]?.id };
  });

export const overviewSummary = (fields: readonly Field[]) => {
  const open = openFields(fields).length;
  return open === 0 ? `alle ${fields.length} Felder bestätigt` : `${open} von ${fields.length} Feldern offen`;
};

/* ---------- Status banner: the case's single next action ---------- */

/** primary = accent, strong = dark, quiet = white on the tinted band (cancel, follow-up). */
export type ActionEmphasis = "primary" | "strong" | "quiet";

export interface BannerAction {
  label: string;
  icon: IconName;
  emphasis: ActionEmphasis;
  /** Where the button goes. Absent when it carries out a run action instead. */
  href?: string;
  /** The run action the button performs. Absent when it merely navigates. */
  run?: "start" | "cancel";
}

export interface Banner {
  tone: Tone;
  icon: IconName;
  title: string;
  text: string;
  action: BannerAction;
  secondary?: BannerAction;
}

export const deriveBanner = (view: CaseView): Banner => {
  const { case: c, fields, basket, documents } = view;
  const withFinding = fieldsWithFinding(fields);
  const open = openFields(fields);
  const newDocuments = documents.filter((d) => d.isNew);

  if (c.phase === "analysis") {
    return {
      tone: "neutral",
      icon: "refresh-cw",
      title: `${formatRun(c.nextRun)} läuft`,
      text: "Die Felder unten werden aktualisiert, sobald ein Wert gefunden ist.",
      action: { label: "Abbrechen", icon: "x", run: "cancel", emphasis: "quiet" },
    };
  }
  if (c.phase === "waiting") {
    return {
      tone: "proposed",
      icon: "clock",
      title: "Wartet auf Rückmeldung",
      text: `Anforderung an ${view.recipient} gesendet, ${formatPositions(basket.length)}. Die betroffenen Felder sind markiert.`,
      action: { label: "Nachfassen", icon: "mail", href: routes.caseRequest(c.id), emphasis: "quiet" },
      secondary: { label: "Rückmeldung ist da", icon: "inbox", href: routes.caseDocuments(c.id), emphasis: "quiet" },
    };
  }
  if (c.phase === "intake") {
    return {
      tone: "confirmed",
      icon: "inbox",
      title: `${plural(newDocuments.length, "neue Unterlage", "neue Unterlagen")} eingegangen`,
      // File names, not document types: what a document is gets decided by the run that
      // is about to read it, so before then the name is all there honestly is.
      text: newDocuments.map((d) => d.fileName).join(", "),
      action: { label: `${formatRun(c.nextRun)} starten`, icon: "refresh-cw", run: "start", emphasis: "primary" },
    };
  }
  /*
   * A case with nothing in it. Without this the banner counts ten fields with a Befund and
   * offers to open the first one -- true, but useless: every one of them says "fehlt"
   * because nothing has been read yet, and the work is to put something in, not to read
   * the same sentence ten times.
   */
  if (documents.length === 0) {
    return {
      tone: "neutral",
      icon: "inbox",
      title: "Noch keine Unterlagen",
      text: "Der Vorgang hat die zehn Felder der Urkunde und nichts, woraus sie zu füllen wären. Dateien ablegen oder Text einfügen, dann liest sie der erste Durchlauf.",
      action: { label: "Unterlagen öffnen", icon: "arrow-right", href: routes.caseDocuments(c.id), emphasis: "primary" },
    };
  }
  if (basket.length > 0) {
    return {
      tone: "attention",
      icon: "list-checks",
      title: `${formatPositions(basket.length)} anzufordern`,
      text: "Die Anforderung ist aus den Befunden erzeugt und bleibt an den Feldern vermerkt.",
      action: { label: "Anforderung öffnen", icon: "arrow-right", href: routes.caseRequest(c.id), emphasis: "strong" },
    };
  }
  if (withFinding.length > 0) {
    return {
      tone: "neutral",
      icon: "list-checks",
      title: `${withFinding.length} Felder mit Befund`,
      text: `${open.length} von ${fields.length} Feldern sind noch nicht bestätigt. Befunde zuerst, dann die Vorschläge.`,
      action: { label: "Nächsten Befund öffnen", icon: "arrow-right", href: routes.case(c.id, withFinding[0]?.id, { anchor: true }), emphasis: "primary" },
    };
  }
  if (open.length > 0) {
    return {
      tone: "neutral",
      icon: "list-checks",
      title: `${open.length} Vorschläge nicht bestätigt`,
      text: "Keine offenen Befunde mehr. Die restlichen Werte brauchen eine Bestätigung.",
      action: { label: "Nächstes Feld öffnen", icon: "arrow-right", href: routes.case(c.id, open[0]?.id, { anchor: true }), emphasis: "primary" },
    };
  }
  return {
    tone: "confirmed",
    icon: "circle-check",
    title: "Alle Felder bestätigt",
    text: "Keine offenen Befunde. Der Entwurf kann erzeugt werden.",
    action: { label: "Zum Entwurf", icon: "arrow-right", href: routes.caseDraft(c.id), emphasis: "primary" },
  };
};

/* ---------- Draft stamp ---------- */

export const draftStamp = (fields: readonly Field[]): { tone: Tone; icon: IconName; text: string } => {
  const open = openFields(fields).length;
  return open === 0
    ? { tone: "confirmed", icon: "circle-check", text: "Alle Felder bestätigt. Der Entwurf kann erzeugt werden." }
    : {
        tone: "attention",
        icon: "triangle-alert",
        text: `Nicht abschließend geprüft: ${open} von ${fields.length} Feldern sind unbestätigt. Ein Export ist möglich, wird aber so gekennzeichnet.`,
      };
};
