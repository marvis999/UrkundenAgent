import type { ReactNode } from "react";
import styles from "./Text.module.css";

/** The handful of inline text styles the UI needs, defined once. */
export type TextVariant = "muted" | "strong" | "label" | "placeholder" | "mono";

interface TextProps {
  variant: TextVariant;
  as?: "span" | "p";
  children: ReactNode;
}

export function Text({ variant, as: Tag = "span", children }: TextProps) {
  return <Tag className={styles[variant]}>{children}</Tag>;
}
