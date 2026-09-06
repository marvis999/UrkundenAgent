import { createHash } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { documentsDirectory, int, query, queryOne, text, textOrNull } from "./connect";
import { renderDocumentPages } from "./pages";

/**
 * Original documents on disk.
 *
 * The database holds paths, not bytes. Postgres is good at large objects but a deed file
 * is read whole, streamed to one person and never queried, so the filesystem is the right
 * place and the backup story stays a directory plus a dump.
 *
 * Files live under the data directory, never in the repository and never in `public/`:
 * the material is confidential, so it is only ever handed out through a route that can
 * check which case it belongs to. Content is addressed by the SHA-256 of the bytes, so
 * importing the same file twice stores it once.
 */

const EXTENSION_KIND: Readonly<Record<string, { kind: string; contentType: string }>> = {
  ".pdf": { kind: "scan", contentType: "application/pdf" },
  ".jpg": { kind: "photo", contentType: "image/jpeg" },
  ".jpeg": { kind: "photo", contentType: "image/jpeg" },
  ".png": { kind: "photo", contentType: "image/png" },
  ".eml": { kind: "email", contentType: "message/rfc822" },
  ".txt": { kind: "email", contentType: "text/plain; charset=utf-8" },
};

const FALLBACK = { kind: "scan", contentType: "application/octet-stream" } as const;

const describe = (fileName: string) => EXTENSION_KIND[path.extname(fileName).toLowerCase()] ?? FALLBACK;

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/**
 * Relative to the data directory, so the store can be moved without rewriting rows.
 * Always with forward slashes: a row written on Windows is read inside the Linux container.
 */
const storagePath = (caseId: string, hash: string, fileName: string) =>
  path.posix.join(caseId, `${hash}${path.extname(fileName).toLowerCase()}`);

/**
 * A document that arrives after the current run has finished belongs to the next one:
 * that is what makes it show as new until a run has read it.
 */
const receivingRun = async (caseId: string): Promise<number> => {
  const row = await queryOne(
    `SELECT c.current_run, r.finished_at FROM case_file c
     LEFT JOIN run r ON r.case_id = c.id AND r.number = c.current_run
     WHERE c.id = $1`,
    caseId,
  );
  const current = int(row?.current_run);
  return row?.finished_at === null ? current : current + 1;
};

export interface IngestResult {
  documentId: string;
  /** True when the bytes were already present, or the file matched a document row. */
  attachedToExisting: boolean;
  /** Pages rendered from the file, 0 for a kind that cannot be rendered. */
  pageCount: number;
}

/**
 * Puts a file into the store, points a document row at it and renders its pages.
 *
 * A row whose file_name matches is adopted rather than duplicated: the seeded case
 * already describes which documents belong to it, and importing the originals fills in
 * the bytes the description was written about.
 */
export const ingestDocument = async (caseId: string, fileName: string, bytes: Uint8Array): Promise<IngestResult> => {
  const stored = await storeDocument(caseId, fileName, bytes);
  const pages = await renderDocumentPages(caseId, stored.documentId);
  return { ...stored, pageCount: pages?.pageCount ?? 0 };
};

const storeDocument = async (caseId: string, fileName: string, bytes: Uint8Array): Promise<Omit<IngestResult, "pageCount">> => {
  const hash = sha256(bytes);

  const existingHash = await queryOne("SELECT id FROM document WHERE case_id = $1 AND hash = $2", caseId, hash);
  if (existingHash) return { documentId: text(existingHash.id), attachedToExisting: true };

  const relative = storagePath(caseId, hash, fileName);
  const absolute = path.join(documentsDirectory(), relative);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, bytes);

  const known = await queryOne("SELECT id FROM document WHERE case_id = $1 AND file_name = $2", caseId, fileName);
  if (known) {
    await query("UPDATE document SET storage_path = $1, hash = $2 WHERE id = $3", relative, hash, text(known.id));
    return { documentId: text(known.id), attachedToExisting: true };
  }

  const documentId = `${caseId}:${hash.slice(0, 12)}`;
  await query(
    `INSERT INTO document (id, case_id, file_name, storage_path, hash, doc_type, kind, doc_date, page_count,
                           source_class, quality, status, title, subtitle, received_in_run, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, 0, 'partyStatement', '', 'unconfirmed', $8, '', $9,
             (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM document WHERE case_id = $2))`,
    documentId,
    caseId,
    fileName,
    relative,
    hash,
    "noch nicht ausgewertet",
    describe(fileName).kind,
    fileName,
    await receivingRun(caseId),
  );
  return { documentId, attachedToExisting: false };
};

export interface StoredFile {
  /** Absolute path, for streaming: a scanned deed is not read into memory whole. */
  absolutePath: string;
  size: number;
  contentType: string;
  fileName: string;
}

/** Locates a document's original, or undefined while only its description exists. */
export const readDocumentFile = async (caseId: string, documentKey: string): Promise<StoredFile | undefined> => {
  const row = await queryOne(
    "SELECT file_name, storage_path FROM document WHERE case_id = $1 AND (id = $2 OR id = $3)",
    caseId,
    documentKey,
    `${caseId}:${documentKey}`,
  );
  const relative = row === undefined ? null : textOrNull(row.storage_path);
  if (row === undefined || relative === null) return undefined;

  const fileName = text(row.file_name);
  const absolutePath = path.join(documentsDirectory(), relative);
  return {
    absolutePath,
    size: (await stat(absolutePath)).size,
    contentType: describe(fileName).contentType,
    fileName,
  };
};

export interface DocumentFileInfo {
  documentId: string;
  fileName: string;
  hasFile: boolean;
  pageCount: number;
}

/** What the import script reports back: which descriptions still have no original. */
export const documentFiles = async (caseId: string): Promise<DocumentFileInfo[]> =>
  (await query("SELECT id, file_name, storage_path, page_count FROM document WHERE case_id = $1 ORDER BY file_name", caseId)).map(
    (row) => ({
      documentId: text(row.id),
      fileName: text(row.file_name),
      hasFile: textOrNull(row.storage_path) !== null,
      pageCount: int(row.page_count),
    }),
  );
