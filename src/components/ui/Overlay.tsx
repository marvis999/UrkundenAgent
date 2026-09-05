"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";
import styles from "./Overlay.module.css";

interface OverlayProps {
  title: ReactNode;
  /** Elements next to the close button, e.g. a pager. */
  headerEnd?: ReactNode;
  /** Routed overlays close by navigating; ephemeral ones close by callback. Give exactly one. */
  closeHref?: string;
  onClose?: () => void;
  footer?: ReactNode;
  /** side = full-height drawer on the right, center = centered modal. */
  placement: "side" | "center";
  children: ReactNode;
}

/** Modal frame for the request basket, the document viewer and the manual-correction dialog. */
export function Overlay({ title, headerEnd, closeHref, onClose, footer, placement, children }: OverlayProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!onClose) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const frame = (
    <div
      className={[styles.backdrop, styles[placement]].join(" ")}
      onClick={onClose && ((event) => event.target === event.currentTarget && onClose())}
    >
      <section className={styles.panel} role="dialog" aria-modal="true">
        <header className={styles.header}>
          <div className={styles.title}>{title}</div>
          <div className={styles.headerEnd}>
            {headerEnd}
            <Button variant="secondary" icon="x" href={closeHref} onClick={onClose} label="Schließen" />
          </div>
        </header>
        <div className={styles.body}>{children}</div>
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </section>
    </div>
  );

  // Routed overlays sit at page level and stay server-rendered. Ephemeral dialogs open deep in
  // the tree, where a collapsed disclosure's transform would trap a fixed element, so they portal.
  if (!onClose) return frame;
  return mounted ? createPortal(frame, document.body) : null;
}
