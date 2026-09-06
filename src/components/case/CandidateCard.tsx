import { chooseCandidateAction, chooseReadingAction, confirmValueAction } from "@/app/actions";
import { ActionForm } from "@/components/ui/ActionForm";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { OptionGroup } from "@/components/ui/OptionGroup";
import { Text } from "@/components/ui/Text";
import type { Candidate } from "@/domain/model";
import { CANDIDATE_TAG_LABEL, SOURCE_CLASS_LABEL } from "@/domain/status";
import { routes } from "@/lib/routes";
import { ImageFrame } from "./ImageFrame";
import styles from "./CandidateCard.module.css";

interface CandidateCardProps {
  caseId: string;
  /** The field and value this candidate feeds, so confirming knows what it confirms. */
  fieldId: string;
  partId: string;
  candidate: Candidate;
  /** Whether the value this candidate feeds has been confirmed by a human. */
  confirmed: boolean;
  /** The rendered page this candidate cites, once the original has been imported. */
  pageSrc?: string;
}

const REDACTED_VALUE = "unlesbar gemacht";

/** One Fundstelle. Several of these stand side by side with equal rank; only a human picks. */
export function CandidateCard({ caseId, fieldId, partId, candidate, confirmed, pageSrc }: CandidateCardProps) {
  // A manual correction or a derived value has no document behind it; its origin is its reason.
  const documentHref = candidate.documentId === undefined ? undefined : routes.document(caseId, candidate.documentId, candidate.page);
  const activeLabel = confirmed ? "im Feld, bestätigt" : "im Feld, nicht bestätigt";
  const adoptLabel = candidate.isActive ? "Wert bestätigen" : "Diesen Wert nehmen";

  return (
    <article className={[styles.card, candidate.isActive ? styles.active : ""].join(" ")}>
      <header className={styles.header}>
        <div className={styles.headline}>
          <span className={styles.value}>{candidate.value ?? REDACTED_VALUE}</span>
          <Text variant="muted">{candidate.sourceLabel}</Text>
          {candidate.isActive && (
            <Badge tone={confirmed ? "confirmed" : "neutral"} icon="corner-down-right">
              {activeLabel}
            </Badge>
          )}
        </div>
        <div className={styles.tags}>
          {candidate.sourceClass && <Badge tone="neutral">{SOURCE_CLASS_LABEL[candidate.sourceClass]}</Badge>}
          <Badge tone="neutral">{candidate.note ?? CANDIDATE_TAG_LABEL[candidate.tag]}</Badge>
        </div>
      </header>

      {candidate.quote && <blockquote className={styles.quote}>{`„${candidate.quote}“`}</blockquote>}
      {!candidate.quote && candidate.rationale && <Text variant="muted">{candidate.rationale}</Text>}

      {candidate.image && (
        <div className={styles.image}>
          {pageSrc && (
            <ImageFrame
              src={pageSrc}
              crop={candidate.image.crop}
              {...(candidate.image.pageAspect === undefined ? {} : { pageAspect: candidate.image.pageAspect })}
              caption={candidate.image.caption}
              size="inline"
              action={
                documentHref && (
                  <Button variant="surface" icon="search" href={documentHref}>
                    Ganzes Bild
                  </Button>
                )
              }
            />
          )}
          {candidate.image.hint && <Text variant="muted">{candidate.image.hint}</Text>}
          {candidate.image.readings && (
            <div className={styles.readings}>
              {candidate.image.question && <Text variant="label">{candidate.image.question}</Text>}
              {/* Choosing one is the whole point of `Lesung unsicher`: the model could not
                  tell the characters apart, a person looks at the scan and decides. */}
              <OptionGroup
                label="Lesarten"
                options={candidate.image.readings.map((r) => ({ id: r.value, label: r.value, selected: r.value === candidate.value }))}
                action={chooseReadingAction}
                values={{ case: caseId, candidate: candidate.id }}
              />
            </div>
          )}
        </div>
      )}

      <footer className={styles.actions}>
        <ActionForm
          action={candidate.isActive ? confirmValueAction : chooseCandidateAction}
          values={candidate.isActive ? { case: caseId, field: fieldId, part: partId } : { case: caseId, candidate: candidate.id }}
        >
          <Button variant="accent" icon="check" submit>
            {adoptLabel}
          </Button>
        </ActionForm>
        {documentHref && (
          <Button variant="secondary" icon="file-search" href={documentHref}>
            Im Dokument
          </Button>
        )}
      </footer>
    </article>
  );
}
