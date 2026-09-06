import type { DocumentKind } from "@/domain/status";

/**
 * What a file is, decided by its extension.
 *
 * One table, because three places need the same answer and they must not drift: the
 * store when it writes the row, the renderer when it turns the file into pages, and the
 * route that hands the original back out.
 *
 * The distinction that matters here is not the format but the *form*: a file either has
 * pages that must be rendered and looked at, or it is text that can be read as it stands.
 * A run treats the two differently all the way through -- a text page yields a verbatim
 * quote the merge can check, a rendered page yields a rectangle on an image -- so the
 * form is settled once, here.
 */

type DocumentForm = "rendered" | "text";

export interface FileType {
  readonly kind: DocumentKind;
  readonly contentType: string;
  readonly form: DocumentForm;
}

const BY_EXTENSION: Readonly<Record<string, FileType>> = {
  ".pdf": { kind: "scan", contentType: "application/pdf", form: "rendered" },
  ".jpg": { kind: "photo", contentType: "image/jpeg", form: "rendered" },
  ".jpeg": { kind: "photo", contentType: "image/jpeg", form: "rendered" },
  ".png": { kind: "photo", contentType: "image/png", form: "rendered" },
  /*
   * Taken as plain text, not decoded as MIME. A simple mail reads well that way and its
   * headers are useful context, but an attachment or a base64 body reaches the model as
   * the gibberish it is. Pasting the text through "Notiz oder E-Mail" is the reliable
   * route; this one is a convenience with a known edge.
   */
  ".eml": { kind: "email", contentType: "message/rfc822; charset=utf-8", form: "text" },
  ".txt": { kind: "note", contentType: "text/plain; charset=utf-8", form: "text" },
};

/** An unknown extension is treated as a scan: it may still be a PDF under another name. */
const FALLBACK: FileType = { kind: "scan", contentType: "application/octet-stream", form: "rendered" };

/** Lower-case extension including the dot, or "" for a name without one. */
const extensionOf = (fileName: string) => {
  const dot = fileName.lastIndexOf(".");
  return dot <= 0 ? "" : fileName.slice(dot).toLowerCase();
};

export const fileType = (fileName: string): FileType => BY_EXTENSION[extensionOf(fileName)] ?? FALLBACK;

/** The extensions the upload zone offers, so the picker and the store agree. */
export const ACCEPTED_EXTENSIONS = Object.keys(BY_EXTENSION).join(",");

/** Extension a typed note is stored under. A note is a file like any other. */
const NOTE_EXTENSION = ".txt";

/** Default name for text pasted where no name was asked for. */
const NOTE_FALLBACK_NAME = "Notiz";

/**
 * File name for a note somebody typed.
 *
 * A note is stored as a file, so it needs a name that behaves like one: no path
 * separators, and an extension that says what it is. A name that already carries a text
 * extension keeps it, so "Makler-E-Mail.txt" does not become "Makler-E-Mail.txt.txt".
 */
export const noteFileName = (name: string): string => {
  // Trailing dots go: a German date ends in one ("Makler-E-Mail vom 02.09.") and would
  // otherwise be read as an empty extension and end up named "... 02.09..txt".
  const cleaned = name.replace(/[\\/]/g, " ").trim().replace(/\.+$/, "").trim();
  const base = cleaned === "" ? NOTE_FALLBACK_NAME : cleaned;
  return fileType(base).form === "text" ? base : `${base}${NOTE_EXTENSION}`;
};
