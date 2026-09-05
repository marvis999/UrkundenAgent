import type { ReactNode } from "react";
import styles from "./Stacked.module.css";

interface StackedProps {
  title: ReactNode;
  subtitle?: ReactNode;
  emphasis?: "strong" | "regular";
}

/** Two-line cell: title over a muted subtitle. Used inside Table cells everywhere. */
export function Stacked({ title, subtitle, emphasis = "regular" }: StackedProps) {
  return (
    <span className={styles.stacked}>
      <span className={emphasis === "strong" ? styles.strong : undefined}>{title}</span>
      {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
    </span>
  );
}
