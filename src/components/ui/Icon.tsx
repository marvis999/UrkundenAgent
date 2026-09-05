import { ICON_PATHS, type IconName } from "./icons";
import styles from "./Icon.module.css";

const ICON_SIZES = { sm: 13, md: 15, lg: 18, xl: 20 } as const;
export type IconSize = keyof typeof ICON_SIZES;

interface IconProps {
  name: IconName;
  size?: IconSize;
}

export function Icon({ name, size = "md" }: IconProps) {
  const px = ICON_SIZES[size];
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" width={px} height={px} aria-hidden="true">
      {ICON_PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
