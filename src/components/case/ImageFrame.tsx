import type { CSSProperties, ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import type { Rect } from "@/domain/model";
import styles from "./ImageFrame.module.css";

interface ImageFrameProps {
  /** Highlighted region in percent of the page. */
  crop?: Rect;
  caption: string;
  /** inline = excerpt inside a candidate card, page = full page in the viewer. */
  size: "inline" | "page";
  action?: ReactNode;
}

/**
 * Placeholder for a photographed page with the marked Fundstelle. The real image
 * goes where the paper is; the marker rectangle stays.
 */
export function ImageFrame({ crop, caption, size, action }: ImageFrameProps) {
  const cropStyle = crop
    ? ({ "--crop-x": `${crop.x}%`, "--crop-y": `${crop.y}%`, "--crop-w": `${crop.w}%`, "--crop-h": `${crop.h}%` } as CSSProperties)
    : undefined;
  return (
    <figure className={[styles.frame, styles[size]].join(" ")}>
      <div className={styles.paper} />
      {crop && <div className={styles.marker} style={cropStyle} aria-label="Fundstelle" />}
      <figcaption className={styles.caption}>
        <Icon name="camera" size="sm" />
        {caption}
      </figcaption>
      {action && <div className={styles.action}>{action}</div>}
    </figure>
  );
}
