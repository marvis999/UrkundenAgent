import type { CSSProperties, ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { excerptView } from "@/domain/excerpt";
import type { Rect } from "@/domain/model";
import styles from "./ImageFrame.module.css";

/** Assumed when the page's proportions are unknown. */
const A4_PORTRAIT = 1.41;

interface ImageFrameProps {
  /** The rendered page. */
  src: string;
  /** Highlighted region in percent of the page. */
  crop?: Rect;
  /** Height of the page divided by its width. Without it an A4 portrait is assumed. */
  pageAspect?: number;
  caption: string;
  /** inline = excerpt inside a candidate card, page = full page in the viewer. */
  size: "inline" | "page";
  action?: ReactNode;
}

/**
 * A page with the marked Fundstelle.
 *
 * As an excerpt the frame zooms to the marked region: the same page image, scaled and
 * slid so the region sits in the middle of the frame, which is why no second image has to
 * be rendered or stored for the card. The marker lives inside the scaled layer, so it
 * keeps its place without any arithmetic of its own.
 */
export function ImageFrame({ src, crop, pageAspect, caption, size, action }: ImageFrameProps) {
  const view = size === "inline" && crop !== undefined ? excerptView(crop, pageAspect ?? A4_PORTRAIT) : undefined;

  return (
    <figure
      className={[styles.frame, styles[size]].join(" ")}
      // CSS aspect-ratio is width over height, the arithmetic above is height over width.
      style={view ? ({ "--excerpt-ratio": `${1 / view.ratio}` } as CSSProperties) : undefined}
    >
      <div
        className={view ? styles.zoom : styles.natural}
        style={view ? ({ "--zoom": `${view.zoom}`, "--view-x": `${view.x}`, "--view-y": `${view.y}` } as CSSProperties) : undefined}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- served through the case, not optimisable */}
        <img className={styles.image} src={src} alt={caption} />
        {crop && (
          <div
            className={styles.marker}
            style={{ "--crop-x": `${crop.x}%`, "--crop-y": `${crop.y}%`, "--crop-w": `${crop.w}%`, "--crop-h": `${crop.h}%` } as CSSProperties}
            aria-label="Fundstelle"
          />
        )}
      </div>
      <figcaption className={styles.caption}>
        <Icon name="camera" size="sm" />
        {caption}
      </figcaption>
      {action && <div className={styles.action}>{action}</div>}
    </figure>
  );
}
