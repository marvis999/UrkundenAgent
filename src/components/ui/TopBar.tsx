import type { ReactNode } from "react";
import styles from "./TopBar.module.css";

interface TopBarProps {
  start: ReactNode;
  end?: ReactNode;
}

/** Full-width header row. The list view and the case view differ only in what they put in it. */
export function TopBar({ start, end }: TopBarProps) {
  return (
    <header className={styles.bar}>
      <div className={styles.group}>{start}</div>
      {end && <div className={styles.group}>{end}</div>}
    </header>
  );
}

/** Accent mark and product name. */
export function Brand({ name }: { name: string }) {
  return (
    <span className={styles.group}>
      <span className={styles.mark} aria-hidden="true" />
      <span className={styles.product}>{name}</span>
    </span>
  );
}

/** Initials of the single hard-wired user. */
export function UserChip({ initials }: { initials: string }) {
  return <span className={styles.user}>{initials}</span>;
}
