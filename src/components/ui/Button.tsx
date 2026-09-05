import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./Icon";
import type { IconName } from "./icons";
import styles from "./Button.module.css";

/** surface = white on a grey block, translucent = white on a tinted banner. */
export type ButtonVariant = "accent" | "dark" | "secondary" | "surface" | "translucent" | "ghost";

interface ButtonProps {
  variant?: ButtonVariant;
  icon?: IconName;
  iconEnd?: IconName;
  href?: string;
  disabled?: boolean;
  /** Required when there is no visible text. */
  label?: string;
  children?: ReactNode;
}

export function Button({ variant = "secondary", icon, iconEnd, href, disabled, label, children }: ButtonProps) {
  const className = [styles.button, styles[variant], children ? "" : styles.iconOnly].join(" ");
  const content = (
    <>
      {icon && <Icon name={icon} />}
      {children}
      {iconEnd && <Icon name={iconEnd} />}
    </>
  );
  if (href && !disabled) {
    return (
      <Link href={href} className={className} aria-label={label}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" className={className} disabled={disabled} aria-label={label}>
      {content}
    </button>
  );
}
