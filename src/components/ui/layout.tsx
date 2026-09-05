import type { ReactNode } from "react";
import styles from "./layout.module.css";

interface PageProps {
  children: ReactNode;
}

/** Centered content column with the standard vertical rhythm. */
export function Page({ children }: PageProps) {
  return <main className={styles.page}>{children}</main>;
}

interface ColumnsProps {
  children: ReactNode;
  aside: ReactNode;
}

/** Main column plus fixed-width side column. Field detail, draft and new-case form share it. */
export function Columns({ children, aside }: ColumnsProps) {
  return (
    <div className={styles.columns}>
      <div className={styles.main}>{children}</div>
      <aside className={styles.aside}>{aside}</aside>
    </div>
  );
}

/** Vertical stack with one of the standard gaps. */
export function Stack({ children, gap = "regular" }: { children: ReactNode; gap?: "rows" | "tight" | "regular" | "loose" }) {
  return <div className={[styles.stack, styles[gap]].join(" ")}>{children}</div>;
}
