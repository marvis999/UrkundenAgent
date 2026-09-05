"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import type { Tone } from "@/domain/tone";
import styles from "./Disclosure.module.css";

interface DisclosureProps {
  /** Initial state, re-applied whenever the server renders a new value (e.g. after a navigation). */
  defaultOpen: boolean;
  /** Tone exposed as data-tone on the wrapper, for status-tinted rows. */
  tone?: Tone;
  /** URLs mirrored into the address bar on toggle, without a navigation. */
  openHref?: string;
  closedHref?: string;
  className?: string;
  summaryClassName?: string;
  summary: ReactNode;
  children: ReactNode;
}

/**
 * Animated expand/collapse. The wrapper carries data-open so parent styles can react
 * (rotate a chevron, tint a background). Content stays mounted; while closed it is inert.
 */
export function Disclosure({ defaultOpen, tone, openHref, closedHref, className, summaryClassName, summary, children }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  useEffect(() => {
    setOpen(defaultOpen);
  }, [defaultOpen]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    const href = next ? openHref : closedHref;
    if (href) window.history.replaceState(null, "", href);
  };

  return (
    <div className={className} data-open={open} data-tone={tone}>
      <button type="button" className={summaryClassName} aria-expanded={open} aria-controls={contentId} onClick={toggle}>
        {summary}
      </button>
      <div className={styles.region}>
        <div id={contentId} className={styles.content} inert={!open}>
          {children}
        </div>
      </div>
    </div>
  );
}
