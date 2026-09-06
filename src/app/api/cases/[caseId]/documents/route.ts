import { NextResponse } from "next/server";
import { ingestDocument } from "@/db/files";
import { queryOne } from "@/db/connect";

/**
 * Import endpoint for the original documents: the upload zone and the import script both
 * post here. The originals are confidential and are never committed.
 */

const caseExists = async (caseId: string) =>
  (await queryOne("SELECT id FROM case_file WHERE id = $1", caseId)) !== undefined;

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  if (!(await caseExists(caseId))) return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });

  const form = await request.formData();
  const files = form.getAll("file").filter((entry): entry is File => entry instanceof File);
  if (files.length === 0) return NextResponse.json({ error: "Keine Datei im Feld 'file'" }, { status: 400 });

  const imported = [];
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    imported.push({ fileName: file.name, ...(await ingestDocument(caseId, file.name, bytes)) });
  }
  return NextResponse.json({ imported });
}
