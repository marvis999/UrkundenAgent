import type { Tone } from "@/domain/status";
import { Icon, type IconSize } from "./Icon";
import type { IconName } from "./icons";
import styles from "./TonedIcon.module.css";

interface TonedIconProps {
  tone: Tone;
  name: IconName;
  size?: IconSize;
}

/** An icon in its tone's foreground color. */
export function TonedIcon({ tone, name, size }: TonedIconProps) {
  return (
    <span className={styles.icon} data-tone={tone}>
      <Icon name={name} size={size} />
    </span>
  );
}
