import { Badge } from "@/components/ui/Badge";
import { ListItem } from "@/components/ui/ListItem";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Stack } from "@/components/ui/layout";
import { Text } from "@/components/ui/Text";
import type { HistoryEntry } from "@/domain/model";
import { ACTOR_LABEL } from "@/domain/status";
import { formatRun } from "@/lib/format";
import styles from "./HistoryList.module.css";

/** Who did what, when, in which run. Used per value and per field. */
export function HistoryList({ entries }: { entries: readonly HistoryEntry[] }) {
  return (
    <Stack gap="tight">
      <SectionHeading>Verlauf</SectionHeading>
      {entries.map((entry, index) => (
        <ListItem
          key={index}
          leading={<Badge tone="accent">{formatRun(entry.run)}</Badge>}
          title={
            <span className={styles.entry}>
              <Text variant="muted">{entry.at}</Text> <Text variant="strong">{ACTOR_LABEL[entry.actor]}</Text> {entry.text}
            </span>
          }
        />
      ))}
    </Stack>
  );
}
