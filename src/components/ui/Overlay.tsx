import type { ReactNode } from "react";
import { Button } from "./Button";
import styles from "./Overlay.module.css";

interface OverlayProps {
  title: ReactNode;
  /** Elements next to the close button, e.g. a pager. */
  headerEnd?: ReactNode;
  closeHref: string;
  footer?: ReactNode;
  /** side = full-height drawer on the right (request basket), center = centered modal (document viewer). */
  placement: "side" | "center";
  children: ReactNode;
}

export function Overlay({ title, headerEnd, closeHref, footer, placement, children }: OverlayProps) {
  return (
    <div className={[styles.backdrop, styles[placement]].join(" ")}>
      <section className={styles.panel} role="dialog" aria-modal="true">
        <header className={styles.header}>
          <div className={styles.title}>{title}</div>
          <div className={styles.headerEnd}>
            {headerEnd}
            <Button variant="secondary" icon="x" href={closeHref} label="Schließen" />
          </div>
        </header>
        <div className={styles.body}>{children}</div>
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </section>
    </div>
  );
}
