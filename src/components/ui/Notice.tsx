import type { ReactNode } from "react";
import type { Tone } from "@/domain/tone";
import { Icon } from "./Icon";
import type { IconName } from "./icons";
import styles from "./Notice.module.css";

interface NoticeProps {
  tone: Tone;
  icon?: IconName;
  title?: ReactNode;
  text?: ReactNode;
  /** Buttons rendered on the trailing edge. */
  actions?: ReactNode;
  /** Extra content rendered below the text, inside the box. */
  children?: ReactNode;
  size?: "compact" | "regular" | "prominent";
  /** solid = tone background, tint = light tone background, plain = neutral surface, white = card on a grey block. */
  surface?: "solid" | "tint" | "plain" | "white";
}

/**
 * Icon, title, text, actions in a tinted box. Serves as status banner, finding card,
 * draft stamp, info note, empty state and upload zone. One implementation, sized by props.
 */
export function Notice({ tone, icon, title, text, actions, children, size = "regular", surface = "solid" }: NoticeProps) {
  return (
    <section className={[styles.notice, styles[size], styles[surface]].join(" ")} data-tone={tone}>
      <div className={styles.row}>
        {icon && (
          <span className={styles.icon}>
            <Icon name={icon} size={size === "prominent" ? "xl" : "md"} />
          </span>
        )}
        <div className={styles.body}>
          {title && <div className={styles.title}>{title}</div>}
          {text && <div className={styles.text}>{text}</div>}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
      {children && <div className={styles.children}>{children}</div>}
    </section>
  );
}
