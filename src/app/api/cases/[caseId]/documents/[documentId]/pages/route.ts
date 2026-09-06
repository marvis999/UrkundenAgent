import { NextResponse } from "next/server";
import { documentPageTexts, renderDocumentPages } from "@/db/pages";

/**
 * Pages of one document. GET lists the page texts, POST renders (or re-renders) the pages
 * from the stored original. Import renders on its own; this is for files that were
 * imported before rendering existed, or after the renderer changed.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ caseId: string; documentId: string }> }) {
  const { caseId, documentId } = await params;
  return NextResponse.json({ pages: await documentPageTexts(caseId, documentId) });
}

export async function POST(_request: Request, { params }: { params: Promise<{ caseId: string; documentId: string }> }) {
  const { caseId, documentId } = await params;
  const result = await renderDocumentPages(caseId, documentId);
  if (!result) return NextResponse.json({ error: "Keine renderbare Datei im Vorgang" }, { status: 404 });
  return NextResponse.json(result);
}
