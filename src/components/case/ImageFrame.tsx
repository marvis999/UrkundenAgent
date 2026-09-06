import type { ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import type { Rect } from "@/domain/model";
import { cssVars } from "@/lib/css";
import styles from "./ImageFrame.module.css";

interface ImageFrameProps {
  /** The rendered page. Without it the frame shows the placeholder paper. */
  src?: string;
  /** Highlighted region in percent of the page. */
  crop?: Rect;
  caption: string;
  /** inline = excerpt inside a candidate card, page = full page in the viewer. */
  size: "inline" | "page";
  action?: ReactNode;
}

/** Context around the marked region, so an excerpt shows more than the words themselves. */
const PADDING = 1.6;
const FULL = 100;

const clamp = (value: number) => Math.min(Math.max(value, 0), FULL);

/**
 * A page with the marked Fundstelle: the rendered image when the original has been
 * imported, a placeholder paper until then. The marker rectangle is the same in both.
 *
 * As an excerpt the frame zooms to the marked region: the same page image, scaled so the
 * region fills the width and centred on it, which is why no second image has to be
 * rendered or stored for the card.
 */
export function ImageFrame({ src, crop, caption, size, action }: ImageFrameProps) {
  const zoomed = size === "inline" && src !== undefined && crop !== undefined;
  // A real page brings its own proportions -- a landscape photo is not A4 -- and the frame
  // follows them, so the marker sits on the page rather than on a letterboxed guess.
  const sized = size === "page" && src !== undefined;
  const view = crop && { x: clamp(crop.x - PADDING), w: clamp(crop.w + PADDING * 2), centre: crop.y + crop.h / 2 };

  return (
    <figure className={[styles.frame, styles[size], sized ? styles.sized : ""].join(" ")}>
      <div
        className={zoomed ? styles.zoom : sized ? styles.natural : styles.flat}
        style={zoomed && view ? cssVars({ "--zoom": `${FULL / view.w}`, "--view-x": `${view.x}`, "--view-y": `${view.centre}` }) : undefined}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- served through the case, not optimisable */}
        {src ? <img className={styles.image} src={src} alt={caption} /> : <div className={styles.paper} />}
        {crop && (
          <div
            className={styles.marker}
            style={cssVars({ "--crop-x": `${crop.x}%`, "--crop-y": `${crop.y}%`, "--crop-w": `${crop.w}%`, "--crop-h": `${crop.h}%` })}
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
