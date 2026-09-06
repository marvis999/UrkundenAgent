import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { readPageImage } from "@/db/pages";

/**
 * Serves one rendered page as PNG. Same rules as the original: through the case, never
 * from `public/`, never cached by anything shared.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ caseId: string; documentId: string; number: string }> }) {
  const { caseId, documentId, number } = await params;
  const pageNumber = Number.parseInt(number, 10);
  const image = Number.isFinite(pageNumber) ? await readPageImage(caseId, documentId, pageNumber) : undefined;
  if (!image) return NextResponse.json({ error: "Seite nicht gerendert" }, { status: 404 });

  const body = Readable.toWeb(createReadStream(image.absolutePath)) as ReadableStream;
  return new NextResponse(body, {
    headers: {
      "Content-Type": image.contentType,
      "Content-Length": String(image.size),
      "Cache-Control": "no-store",
    },
  });
}
