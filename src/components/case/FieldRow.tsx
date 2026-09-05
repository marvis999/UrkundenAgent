import { Badge } from "@/components/ui/Badge";
import { Disclosure } from "@/components/ui/Disclosure";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { fieldFinding, fieldStatus } from "@/domain/derive";
import type { CaseView, Field } from "@/domain/model";
import { FIELD_STATUS_META } from "@/domain/status";
import { fieldAnchor, routes } from "@/lib/routes";
import { FieldDetail } from "./FieldDetail";
import styles from "./FieldRow.module.css";

interface FieldRowProps {
  view: CaseView;
  field: Field;
  expanded: boolean;
  activePartId?: string;
  showManualForm?: boolean;
}

export function FieldRow({ view, field, expanded, activePartId, showManualForm }: FieldRowProps) {
  const status = fieldStatus(field);
  const meta = FIELD_STATUS_META[status];
  const finding = fieldFinding(field);

  return (
    <article id={fieldAnchor(field.id)} data-tone={meta.tone}>
      <Disclosure
        defaultOpen={expanded}
        openHref={routes.case(view.case.id, field.id)}
        closedHref={routes.case(view.case.id)}
        className={styles.field}
        summaryClassName={styles.header}
        summary={
          <>
            <span className={styles.chevron}>
              <Icon name="chevron-right" />
            </span>
            <span className={styles.label}>
              {field.label}
              {field.isNew && <Badge tone="accent">neu</Badge>}
            </span>
            <span className={styles.summary}>
              <span className={styles.value}>{field.shortValue}</span>
              <span className={styles.source}>{field.sourceLabel}</span>
              {finding && (
                <span className={styles.hint}>
                  <Icon name={meta.icon} size="sm" />
                  {finding.title}
                </span>
              )}
              {field.requestedAt && (
                <span className={[styles.hint, styles.requested].join(" ")}>
                  <Icon name="clock" size="sm" />
                  angefordert am {field.requestedAt}
                </span>
              )}
            </span>
            <span className={styles.status}>
              <StatusBadge meta={meta} />
            </span>
          </>
        }
      >
        <FieldDetail view={view} field={field} activePartId={activePartId} showManualForm={showManualForm} />
      </Disclosure>
    </article>
  );
}
