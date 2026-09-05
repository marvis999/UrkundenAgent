import Link from "next/link";
import type { OverviewCount } from "@/domain/derive";
import { cssVars } from "@/lib/css";
import { TonedIcon } from "./TonedIcon";
import styles from "./Distribution.module.css";

interface DistributionProps {
  counts: readonly OverviewCount[];
  hrefFor: (count: OverviewCount) => string | undefined;
}

/** Proportional bar plus legend. Both read the same counts, so they cannot disagree. */
export function Distribution({ counts, hrefFor }: DistributionProps) {
  const visible = counts.filter((c) => c.count > 0);
  return (
    <div className={styles.distribution}>
      <div className={styles.bar} role="img" aria-label={visible.map((c) => `${c.count} ${c.label}`).join(", ")}>
        {visible.map((c) => (
          <span key={c.id} className={styles.segment} data-tone={c.tone} style={cssVars({ "--segment-weight": c.count })} />
        ))}
      </div>
      <div className={styles.legend}>
        {visible.map((c) => {
          const href = hrefFor(c);
          const content = (
            <>
              <TonedIcon tone={c.tone} name={c.icon} />
              <span className={styles.count}>{c.count}</span>
              <span className={styles.label}>{c.label}</span>
            </>
          );
          return href ? (
            <Link key={c.id} href={href} className={styles.legendItem}>
              {content}
            </Link>
          ) : (
            <span key={c.id} className={styles.legendItem}>
              {content}
            </span>
          );
        })}
      </div>
    </div>
  );
}
