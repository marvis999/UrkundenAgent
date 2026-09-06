import type { ReactNode } from "react";
import type { Tone } from "@/domain/status";
import { Icon } from "./Icon";
import type { IconName } from "./icons";
import styles from "./Badge.module.css";

interface BadgeProps {
  tone: Tone;
  icon?: IconName;
  children: ReactNode;
}

/** Status label, source-class pill, run marker: one element, colored by tone. */
export function Badge({ tone, icon, children }: BadgeProps) {
  return (
    <span className={styles.badge} data-tone={tone}>
      {icon && <Icon name={icon} size="sm" />}
      {children}
    </span>
  );
}
