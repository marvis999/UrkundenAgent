import type { ReactNode } from "react";
import styles from "./PageTitle.module.css";

interface PageTitleProps {
  children: ReactNode;
  /** Summary line, e.g. "7 von 10 Feldern offen". Same count function as everything else. */
  summary?: ReactNode;
  actions?: ReactNode;
}

export function PageTitle({ children, summary, actions }: PageTitleProps) {
  return (
    <div className={styles.title}>
      <div className={styles.text}>
        <h2 className={styles.heading}>{children}</h2>
        {summary && <span className={styles.summary}>{summary}</span>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
