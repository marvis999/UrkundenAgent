import { Badge } from "@/components/ui/Badge";
import { ListItem } from "@/components/ui/ListItem";
import { Text } from "@/components/ui/Text";
import { TonedIcon } from "@/components/ui/TonedIcon";
import type { Run } from "@/domain/model";
import { REQUEST_OUTCOME_META } from "@/domain/status";
import { formatRun } from "@/lib/format";
import styles from "./RunLogEntry.module.css";

/** One analysis run: when, what happened, and how each requested position was resolved. */
export function RunLogEntry({ run }: { run: Run }) {
  return (
    <div className={styles.run}>
      <div className={styles.header}>
        <Badge tone="accent">{formatRun(run.number)}</Badge>
        <Text variant="muted">{run.at}</Text>
      </div>
      <span>{run.summary}</span>
      {run.items.map((item) => {
        const meta = REQUEST_OUTCOME_META[item.outcome];
        return (
          <ListItem
            key={item.fieldId}
            leading={<TonedIcon tone={meta.tone} name={meta.icon} />}
            title={item.title}
            description={item.resolvedBy}
            trailing={<Badge tone={meta.tone}>{meta.label}</Badge>}
          />
        );
      })}
    </div>
  );
}
