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

/** The square accent mark next to the product name. */
export function BrandMark() {
  return <span className={styles.brand} aria-hidden="true" />;
}

/** Initials of the single hard-wired user. */
export function UserChip({ initials }: { initials: string }) {
  return <span className={styles.user}>{initials}</span>;
}
