import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./ListItem.module.css";

interface ListItemProps {
  leading?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Small line under the description, e.g. "Feld Kaufpreis". */
  meta?: ReactNode;
  trailing?: ReactNode;
  href?: string;
}

/** Leading, title, description, trailing. History entries, gaps, basket items, run-log items. */
export function ListItem({ leading, title, description, meta, trailing, href }: ListItemProps) {
  const content = (
    <>
      {leading && <span className={styles.leading}>{leading}</span>}
      <span className={styles.body}>
        <span className={styles.title}>{title}</span>
        {description && <span className={styles.description}>{description}</span>}
        {meta && <span className={styles.meta}>{meta}</span>}
      </span>
      {trailing && <span className={styles.trailing}>{trailing}</span>}
    </>
  );
  return href ? (
    <Link href={href} className={[styles.item, styles.link].join(" ")}>
      {content}
    </Link>
  ) : (
    <div className={styles.item}>{content}</div>
  );
}
