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

interface BrandProps {
  name: string;
  office?: string;
}

/** Accent mark, product name and optional office name. */
export function Brand({ name, office }: BrandProps) {
  return (
    <span className={styles.group}>
      <span className={styles.mark} aria-hidden="true" />
      <span className={styles.product}>{name}</span>
      {office && <span className={styles.office}>{office}</span>}
    </span>
  );
}

/** Initials of the single hard-wired user. */
export function UserChip({ initials }: { initials: string }) {
  return <span className={styles.user}>{initials}</span>;
}
