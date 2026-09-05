import Link from "next/link";
import styles from "./PageIndicators.module.css";

export type PageState = "done" | "current" | "pending" | "hit";

export interface PageIndicator {
  number: number;
  state: PageState;
  href?: string;
}

interface PageIndicatorsProps {
  pages: readonly PageIndicator[];
  /** dots = analysis progress, thumbnails = document viewer sidebar. */
  variant: "dots" | "thumbnails";
  paper?: "text" | "photo";
}

export function PageIndicators({ pages, variant, paper = "text" }: PageIndicatorsProps) {
  return (
    <div className={[styles.strip, styles[variant], styles[paper]].join(" ")}>
      {pages.map((page) => {
        const className = [styles.page, styles[page.state]].join(" ");
        const label = `Seite ${page.number}`;
        const content =
          variant === "thumbnails" ? (
            <>
              <span className={styles.sheet} />
              <span className={styles.number}>{page.number}</span>
            </>
          ) : null;
        return page.href ? (
          <Link key={page.number} href={page.href} className={className} aria-label={label}>
            {content}
          </Link>
        ) : (
          <span key={page.number} className={className} aria-label={label}>
            {content}
          </span>
        );
      })}
    </div>
  );
}
