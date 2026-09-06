import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { PageIndicators, type PageIndicator } from "@/components/ui/PageIndicators";
import type { CaseView } from "@/domain/model";
import { DOCUMENT_KIND_ICON } from "@/domain/status";
import { formatRun } from "@/lib/format";
import styles from "./AnalysisStrip.module.css";

interface AnalysisStripProps {
  view: CaseView;
}

/** Progress of a running analysis: one row per new document, one dot per page. */
export function AnalysisStrip({ view }: AnalysisStripProps) {
  const progress = view.analysisProgress ?? {};
  const documents = view.documents.filter((d) => d.isNew);
  const pagesRead = documents.reduce((sum, d) => sum + (progress[d.id] ?? 0), 0);
  const pagesTotal = documents.reduce((sum, d) => sum + d.pageCount, 0);

  return (
    <Notice
      tone="neutral"
      icon="refresh-cw"
      title={`${formatRun(view.case.nextRun)} läuft`}
      text={`${pagesRead} von ${pagesTotal} Seiten gelesen`}
      surface="plain"
    >
      <div className={styles.rows}>
        {documents.map((d) => {
          const read = progress[d.id] ?? 0;
          const started = read > 0;
          const pages: PageIndicator[] = Array.from({ length: d.pageCount }, (_, i) => {
            const number = i + 1;
            return { number, state: number <= read ? "done" : number === read + 1 && started ? "current" : "pending" };
          });
          return (
            <div key={d.id} className={[styles.row, started ? styles.started : ""].join(" ")}>
              <Icon name={DOCUMENT_KIND_ICON[d.kind]} />
              <span className={styles.name}>{d.fileName}</span>
              <PageIndicators pages={pages} variant="dots" />
            </div>
          );
        })}
      </div>
    </Notice>
  );
}
