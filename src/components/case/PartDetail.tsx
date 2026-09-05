import { confirmValueAction, setProcedureAction, toggleBasketAction } from "@/app/actions";
import { ActionForm } from "@/components/ui/ActionForm";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { OptionGroup } from "@/components/ui/OptionGroup";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Stack } from "@/components/ui/layout";
import { Text } from "@/components/ui/Text";
import { candidatesFor, hasFinding } from "@/domain/derive";
import type { CandidateTarget, CaseView, EncumbranceRow, Field, ReviewPart } from "@/domain/model";
import { FIELD_STATUS_META, PROCEDURES, PROCEDURE_META } from "@/domain/status";
import { CandidateCard } from "./CandidateCard";
import { HistoryList } from "./HistoryList";
import { ManualCorrection } from "./ManualCorrection";
import styles from "./PartDetail.module.css";

interface PartDetailProps {
  view: CaseView;
  field: Field;
  part: ReviewPart;
  /** Name of this value, e.g. "Betrag in Ziffern" or "Abt. III Nr. 1". */
  label: string;
  target: CandidateTarget;
  /** Shown when there is no candidate: the negation that stands in for a source. */
  noEvidenceText: string;
  /** Current value, prefilled into the manual-correction dialog. */
  currentValue: string;
  /** Present for encumbrance rows: the procedure choice lives with the row. */
  encumbrance?: EncumbranceRow;
}

/**
 * Everything that belongs to one value: its candidates, its finding, the actions on it
 * and its history. Rendered inside the expanded subfield or table row.
 */
export function PartDetail({ view, field, part, label, target, noEvidenceText, currentValue, encumbrance }: PartDetailProps) {
  const meta = FIELD_STATUS_META[part.status];
  const candidates = candidatesFor(field, target);
  const inBasket = view.basket.includes(field.id);
  // While a sent request is still open, the basket is that request: nothing is added to it.
  const requestIsOut = view.requestSentAt !== undefined;
  const canRequest = field.request !== undefined && part.status !== "redacted" && !requestIsOut;
  // A table row has no single value to correct; its cells get candidates of their own later.
  const canCorrect = target.kind === "subfield";

  return (
    <Stack gap="regular">
      {part.finding && hasFinding(part.status) && <Notice tone={meta.tone} icon={meta.icon} title={part.finding.title} text={part.finding.text} />}

      <Stack gap="tight">
        <SectionHeading trailing={candidates.length > 1 ? `${candidates.length} Kandidaten, gleichrangig` : undefined}>Fundstellen</SectionHeading>
        {candidates.length === 0 ? (
          <Notice tone="neutral" icon={meta.hasNoSource ? meta.icon : "circle-minus"} text={noEvidenceText} size="compact" surface="plain" />
        ) : (
          <Stack gap="tight">
            {candidates.map((candidate) => (
              <CandidateCard
                key={candidate.id}
                caseId={view.case.id}
                fieldId={field.id}
                partId={part.id}
                candidate={candidate}
                confirmed={part.status === "confirmed"}
              />
            ))}
          </Stack>
        )}
      </Stack>

      {encumbrance && (
        <Stack gap="tight">
          <SectionHeading>Verfahren</SectionHeading>
          <OptionGroup
            label={`Verfahren ${encumbrance.entry}`}
            options={PROCEDURES.map((p) => ({ id: p, label: PROCEDURE_META[p].label, selected: encumbrance.procedure === p }))}
            action={setProcedureAction}
            values={{ case: view.case.id, field: field.id, row: encumbrance.id }}
          />
          <Text variant="muted">
            {encumbrance.procedure ? PROCEDURE_META[encumbrance.procedure].consequence : "Noch kein Verfahren gewählt. Die Wahl setzt die Klauselvariante."}
          </Text>
        </Stack>
      )}

      <div className={styles.actions}>
        <div className={styles.actionsStart}>
          {part.status === "derived" && (
            <ActionForm action={confirmValueAction} values={{ case: view.case.id, field: field.id, part: part.id }}>
              <Button variant="accent" icon="check" submit>
                Gegengelesen, bestätigen
              </Button>
            </ActionForm>
          )}
          {canCorrect && (
            <ManualCorrection
              caseId={view.case.id}
              fieldId={field.id}
              partId={part.id}
              fieldLabel={field.label}
              partLabel={label}
              currentValue={currentValue}
            />
          )}
          {part.status === "redacted" && field.noRequestReason && <Text variant="muted">{field.noRequestReason}</Text>}
        </div>
        {requestIsOut && field.requestedAt && <Text variant="muted">angefordert am {field.requestedAt}</Text>}
        {canRequest && (
          <ActionForm action={toggleBasketAction} values={{ case: view.case.id, field: field.id, inBasket: String(inBasket) }}>
            <Button variant={inBasket ? "accent" : "secondary"} icon={inBasket ? "check" : "list-checks"} submit>
              {inBasket ? "Im Korb" : "Anfordern"}
            </Button>
          </ActionForm>
        )}
      </div>

      {part.history && part.history.length > 0 && <HistoryList entries={part.history} />}
    </Stack>
  );
}
