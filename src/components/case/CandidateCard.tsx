import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { OptionGroup } from "@/components/ui/OptionGroup";
import type { Candidate } from "@/domain/model";
import { SOURCE_CLASS_LABEL } from "@/domain/status";
import { routes } from "@/lib/routes";
import { ImageFrame } from "./ImageFrame";
import styles from "./CandidateCard.module.css";

interface CandidateCardProps {
  caseId: string;
  candidate: Candidate;
  /** Whether the value this candidate feeds has been confirmed by a human. */
  confirmed: boolean;
}

/** One Fundstelle. Several of these stand side by side with equal rank; only a human picks. */
export function CandidateCard({ caseId, candidate, confirmed }: CandidateCardProps) {
  const documentHref = routes.document(caseId, candidate.documentId, candidate.page);
  const activeLabel = confirmed ? "im Feld, bestätigt" : "im Feld, nicht bestätigt";
  const adoptLabel = candidate.isActive ? "Wert bestätigen" : "Diesen Wert nehmen";

  return (
    <article className={[styles.card, candidate.isActive ? styles.active : ""].join(" ")}>
      <header className={styles.header}>
        <div className={styles.headline}>
          <span className={styles.value}>{candidate.value}</span>
          <span className={styles.source}>{candidate.sourceLabel}</span>
          {candidate.isActive && (
            <Badge tone={confirmed ? "confirmed" : "neutral"} icon="corner-down-right">
              {activeLabel}
            </Badge>
          )}
        </div>
        <div className={styles.tags}>
          <Badge tone="neutral">{SOURCE_CLASS_LABEL[candidate.sourceClass]}</Badge>
          <Badge tone="neutral">{candidate.tag}</Badge>
        </div>
      </header>

      {candidate.quote && <blockquote className={styles.quote}>{`„${candidate.quote}“`}</blockquote>}

      {candidate.image && (
        <div className={styles.image}>
          <ImageFrame
            crop={candidate.image.crop}
            caption={candidate.image.caption}
            size="inline"
            action={
              <Button variant="surface" icon="search" href={documentHref}>
                Ganzes Bild
              </Button>
            }
          />
          <span className={styles.hint}>{candidate.image.hint}</span>
          {candidate.image.readings && (
            <div className={styles.readings}>
              {candidate.image.question && <span className={styles.question}>{candidate.image.question}</span>}
              <OptionGroup
                label="Lesarten"
                options={candidate.image.readings.map((r) => ({ id: r.value, label: r.value, selected: r.value === candidate.value }))}
              />
            </div>
          )}
        </div>
      )}

      <footer className={styles.actions}>
        <Button variant="accent" icon="check">
          {adoptLabel}
        </Button>
        <Button variant="secondary" icon="file-search" href={documentHref}>
          Im Dokument
        </Button>
      </footer>
    </article>
  );
}
