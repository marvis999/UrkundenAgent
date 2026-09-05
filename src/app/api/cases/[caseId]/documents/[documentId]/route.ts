import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { readDocumentFile } from "@/db/files";

/**
 * Serves one original.
 *
 * Deliberately a route rather than a file in `public/`: the material is confidential, so
 * every read goes through the case it belongs to and can be refused. `no-store` keeps it
 * out of shared caches.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ caseId: string; documentId: string }> }) {
  const { caseId, documentId } = await params;
  const file = await readDocumentFile(caseId, documentId);
  if (!file) return NextResponse.json({ error: "Datei nicht im Vorgang" }, { status: 404 });

  // Streamed, so a large scan is never held in memory whole and the viewer can start early.
  const body = Readable.toWeb(createReadStream(file.absolutePath)) as ReadableStream;
  return new NextResponse(body, {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.size),
      "Content-Disposition": `inline; filename="${encodeURIComponent(file.fileName)}"`,
      "Cache-Control": "no-store",
    },
  });
}
