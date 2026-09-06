import { createHash } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileType } from "@/lib/documents";
import { documentsDirectory, int, query, queryOne, text, textOrNull } from "./connect";
import { renderDocumentPages } from "./pages";
import { noteIntake } from "./runWriter";

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

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/**
 * Relative to the data directory, so the store can be moved without rewriting rows.
 * Always with forward slashes: a row written on Windows is read inside the Linux container.
 */
const storagePath = (caseId: string, hash: string, fileName: string) =>
  path.posix.join(caseId, `${hash}${path.extname(fileName).toLowerCase()}`);

/**
 * The run that will read a document arriving now, which is what makes it show as new
 * until one has.
 *
 * Deliberately not `nextRunNumber`: that one resumes an unfinished run, and a run in
 * flight settled which documents it reads when it planned itself. A file dropped while it
 * is running belongs to the run after it, however few seconds separate the two.
 */
const receivingRun = async (caseId: string): Promise<number> => {
  const row = await queryOne("SELECT current_run FROM case_file WHERE id = $1", caseId);
  // current_run is 0 until something has run, so the first arrival waits for run 1.
  return int(row?.current_run) + 1;
};

export interface IngestResult {
  documentId: string;
  /** True when the bytes were already present, or the file matched a document row. */
  attachedToExisting: boolean;
  /** Pages rendered from the file, 0 for a kind that cannot be rendered. */
  pageCount: number;
}

/**
 * Puts a file into the store, points a document row at it and turns it into pages.
 *
 * A row whose file_name matches is adopted rather than duplicated, so re-sending a file
 * a case already knows about fills in its bytes instead of listing it twice.
 */
export const ingestDocument = async (caseId: string, fileName: string, bytes: Uint8Array): Promise<IngestResult> => {
  const stored = await storeDocument(caseId, fileName, bytes);
  const pages = await renderDocumentPages(caseId, stored.documentId);
  // Rendering first, then the phase: a file that turned out to be unreadable has not
  // arrived as far as the loop is concerned, and must not offer a run that would skip it.
  await noteIntake(caseId);
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
                           source_class, status, received_in_run, sort_order)
     VALUES ($1, $2, $3, $4, $5, 'Sonstiges', $6, NULL, 0, 'partyStatement', 'unconfirmed', $7,
             (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM document WHERE case_id = $2))`,
    documentId,
    caseId,
    fileName,
    relative,
    hash,
    fileType(fileName).kind,
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
    contentType: fileType(fileName).contentType,
    fileName,
  };
};
