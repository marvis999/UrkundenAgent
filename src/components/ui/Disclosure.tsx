"use client";

import { useState, type ReactNode } from "react";
import type { Tone } from "@/domain/status";
import styles from "./Disclosure.module.css";

interface DisclosureProps {
  /**
   * Stable DOM id for this disclosure, unique on the page; the panel gets "<id>-panel".
   * Derived from domain ids rather than useId, which would not match between server and client.
   */
  id: string;
  /** Initial state. A new value from the server (after a navigation) replaces the local state. */
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
export function Disclosure({ id, defaultOpen, tone, openHref, closedHref, className, summaryClassName, summary, children }: DisclosureProps) {
  // Local state plus the prop value it was derived from; when the prop changes, adopt it.
  const [state, setState] = useState({ open: defaultOpen, from: defaultOpen });
  if (state.from !== defaultOpen) setState({ open: defaultOpen, from: defaultOpen });
  const open = state.from === defaultOpen ? state.open : defaultOpen;
  const panelId = `${id}-panel`;

  const toggle = () => {
    const next = !open;
    setState({ open: next, from: defaultOpen });
    const href = next ? openHref : closedHref;
    if (href) window.history.replaceState(null, "", href);
  };

  return (
    <div id={id} className={className} data-open={open} data-tone={tone}>
      <button type="button" className={summaryClassName} aria-expanded={open} aria-controls={panelId} onClick={toggle}>
        {summary}
      </button>
      <div className={styles.region}>
        <div id={panelId} className={styles.content} inert={!open}>
          {children}
        </div>
      </div>
    </div>
  );
}
