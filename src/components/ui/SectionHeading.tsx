import type { ReactNode } from "react";
import styles from "./SectionHeading.module.css";

interface SectionHeadingProps {
  children: ReactNode;
  trailing?: ReactNode;
}

/** Small uppercase label above a block: field groups, Fundstellen, Verlauf, Durchläufe. */
export function SectionHeading({ children, trailing }: SectionHeadingProps) {
  return (
    <div className={styles.heading}>
      <span>{children}</span>
      {trailing && <span className={styles.trailing}>{trailing}</span>}
    </div>
  );
}
