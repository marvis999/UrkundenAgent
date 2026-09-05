import type { CSSProperties } from "react";

/** Typed CSS custom properties for data-driven styling (column templates, weights, crop boxes). */
export const cssVars = (vars: Record<`--${string}`, string | number>): CSSProperties => vars as CSSProperties;
