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
  /** Client-side action. Ignored when href is given. */
  onClick?: () => void;
  disabled?: boolean;
  /** Required when there is no visible text. */
  label?: string;
  children?: ReactNode;
}

export function Button({ variant = "secondary", icon, iconEnd, href, onClick, disabled, label, children }: ButtonProps) {
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
    <button type="button" className={className} onClick={onClick} disabled={disabled} aria-label={label}>
      {content}
    </button>
  );
}
