import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { ListItem } from "@/components/ui/ListItem";
import { Notice } from "@/components/ui/Notice";
import { OptionGroup } from "@/components/ui/OptionGroup";
import { Stack } from "@/components/ui/Page";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { candidatesFor, hasFinding } from "@/domain/derive";
import type { CandidateTarget, CaseView, EncumbranceRow, Field, HistoryEntry, ReviewPart } from "@/domain/model";
import { ACTOR_LABEL, FIELD_STATUS_META, PROCEDURES, PROCEDURE_META } from "@/domain/status";
import { formatRun } from "@/lib/format";
import { routes } from "@/lib/routes";
import { CandidateCard } from "./CandidateCard";
import styles from "./PartDetail.module.css";

interface PartDetailProps {
  view: CaseView;
  field: Field;
  part: ReviewPart;
  target: CandidateTarget;
  /** Shown when there is no candidate: the negation that stands in for a source. */
  noEvidenceText: string;
  /** Current value, prefilled into the manual-correction form. */
  currentValue: string;
  /** Present for encumbrance rows: the procedure choice lives with the row. */
  encumbrance?: EncumbranceRow;
  showManualForm?: boolean;
}

/**
 * Everything that belongs to one value: its candidates, its finding, the actions on it
 * and its history. Rendered inside the expanded subfield or table row.
 */
export function PartDetail({ view, field, part, target, noEvidenceText, currentValue, encumbrance, showManualForm }: PartDetailProps) {
  const caseId = view.case.id;
  const meta = FIELD_STATUS_META[part.status];
  const candidates = candidatesFor(field, target);
  const inBasket = view.basket.includes(field.id);
  const canRequest = field.request !== undefined && part.status !== "redacted";
  const partHref = (manual: boolean) => routes.case(caseId, field.id, { part: part.id, manual });

  return (
    <Stack gap="regular">
      {part.finding && hasFinding(part.status) && <Notice tone={meta.tone} icon={meta.icon} title={part.finding.title} text={part.finding.text} />}

      <Stack gap="tight">
        <SectionHeading trailing={candidates.length > 1 ? `${candidates.length} Kandidaten, gleichrangig` : undefined}>Fundstellen</SectionHeading>
        {candidates.length === 0 ? (
          <Notice tone="neutral" icon={meta.hasNoSource ? meta.icon : "circle-minus"} text={noEvidenceText} size="compact" surface="plain" />
        ) : (
          <div className={styles.candidates}>
            {candidates.map((candidate) => (
              <CandidateCard key={candidate.id} caseId={caseId} candidate={candidate} confirmed={part.status === "confirmed"} />
            ))}
          </div>
        )}
      </Stack>

      {encumbrance && (
        <Stack gap="tight">
          <SectionHeading>Verfahren</SectionHeading>
          <OptionGroup
            label={`Verfahren ${encumbrance.entry}`}
            options={PROCEDURES.map((p) => ({ id: p, label: PROCEDURE_META[p].label, selected: encumbrance.procedure === p }))}
          />
          <span className={styles.consequence}>
            {encumbrance.procedure ? PROCEDURE_META[encumbrance.procedure].consequence : "Noch kein Verfahren gewählt. Die Wahl setzt die Klauselvariante."}
          </span>
        </Stack>
      )}

      <div className={styles.actions}>
        {part.status === "derived" && (
          <Button variant="accent" icon="check">
            Gegengelesen, bestätigen
          </Button>
        )}
        <Button variant="secondary" icon="pencil" href={partHref(true)}>
          Manuell korrigieren
        </Button>
        {canRequest && (
          <Button variant={inBasket ? "accent" : "secondary"} icon={inBasket ? "check" : "list-checks"}>
            {inBasket ? "Im Korb" : "Anfordern"}
          </Button>
        )}
        {part.status === "redacted" && field.noRequestReason && <span className={styles.note}>{field.noRequestReason}</span>}
      </div>

      {showManualForm && (
        <Notice tone="neutral" surface="plain">
          <Stack gap="tight">
            <FormField label="Neuer Wert">
              <input defaultValue={currentValue} />
            </FormField>
            <FormField label="Begründung" required>
              <textarea rows={3} placeholder="z. B. telefonisch mit dem Makler bestätigt" />
            </FormField>
            <div className={styles.actions}>
              <Button variant="accent" disabled>
                Speichern
              </Button>
              <Button variant="ghost" href={partHref(false)}>
                Abbrechen
              </Button>
              <span className={styles.required}>Begründung ist erforderlich</span>
            </div>
          </Stack>
        </Notice>
      )}

      {part.history && part.history.length > 0 && <HistoryList entries={part.history} />}
    </Stack>
  );
}

export function HistoryList({ entries }: { entries: readonly HistoryEntry[] }) {
  return (
    <Stack gap="tight">
      <SectionHeading>Verlauf</SectionHeading>
      {entries.map((entry, index) => (
        <ListItem
          key={index}
          leading={<Badge tone="accent">{formatRun(entry.run)}</Badge>}
          title={
            <span className={styles.history}>
              <span className={styles.muted}>{entry.at}</span> <span className={styles.strong}>{ACTOR_LABEL[entry.actor]}</span> {entry.text}
            </span>
          }
        />
      ))}
    </Stack>
  );
}
