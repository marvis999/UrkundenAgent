import type { ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { excerptView } from "@/domain/excerpt";
import type { Rect } from "@/domain/model";
import { cssVars } from "@/lib/css";
import styles from "./ImageFrame.module.css";

/** Assumed when the page has not been rendered and its proportions are unknown. */
const A4_PORTRAIT = 1.41;

interface ImageFrameProps {
  /** The rendered page. Without it the frame shows the placeholder paper. */
  src?: string;
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
 * A page with the marked Fundstelle: the rendered image when the original has been
 * imported, a placeholder paper until then. The marker rectangle is the same in both.
 *
 * As an excerpt the frame zooms to the marked region: the same page image, scaled and
 * slid so the region sits in the middle of the frame, which is why no second image has to
 * be rendered or stored for the card. The marker lives inside the scaled layer, so it
 * keeps its place without any arithmetic of its own.
 */
export function ImageFrame({ src, crop, pageAspect, caption, size, action }: ImageFrameProps) {
  const zoomed = size === "inline" && src !== undefined && crop !== undefined;
  // A real page brings its own proportions -- a landscape photo is not A4 -- and the frame
  // follows them, so the marker sits on the page rather than on a letterboxed guess.
  const sized = size === "page" && src !== undefined;
  const view = crop === undefined ? undefined : excerptView(crop, pageAspect ?? A4_PORTRAIT);

  return (
    <figure
      className={[styles.frame, styles[size], sized ? styles.sized : ""].join(" ")}
      // CSS aspect-ratio is width over height, the arithmetic above is height over width.
      style={zoomed && view ? cssVars({ "--excerpt-ratio": `${1 / view.ratio}` }) : undefined}
    >
      <div
        className={zoomed ? styles.zoom : sized ? styles.natural : styles.flat}
        style={
          zoomed && view
            ? cssVars({ "--zoom": `${view.zoom}`, "--view-x": `${view.x}`, "--view-y": `${view.y}` })
            : undefined
        }
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
