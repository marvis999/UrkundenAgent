// Imports original documents into a running app.
//
//   npm run import -- <case-id> <file> [<file> ...]
//   npm run import -- 2026-0412 test_files/*.pdf test_files/*.jpg
//
// The originals are confidential and are not part of this repository. They stay on the
// machine that runs the app: this posts them to the local server, which stores them under
// the data directory and attaches them to the document rows that already describe them.

import { basename } from "node:path";
import { readFile } from "node:fs/promises";

const BASE_URL = process.env.URKUNDEN_URL ?? "http://localhost:3000";

const [caseId, ...files] = process.argv.slice(2);

if (!caseId || files.length === 0) {
  console.error("Aufruf: npm run import -- <vorgang-id> <datei> [<datei> ...]");
  console.error(`Beispiel: npm run import -- 2026-0412 test_files/grundbuch_15.11.11.pdf`);
  process.exit(1);
}

const endpoint = `${BASE_URL}/api/cases/${encodeURIComponent(caseId)}/documents`;

const form = new FormData();
for (const path of files) {
  form.append("file", new File([await readFile(path)], basename(path)));
}

const response = await fetch(endpoint, { method: "POST", body: form });
if (!response.ok) {
  const { error } = await response.json().catch(() => ({ error: response.statusText }));
  console.error(`Import fehlgeschlagen (${response.status}): ${error}`);
  console.error(`Läuft die App unter ${BASE_URL}? Sonst URKUNDEN_URL setzen.`);
  process.exit(1);
}

const { imported } = await response.json();
for (const item of imported) {
  console.log(`${item.attachedToExisting ? "zugeordnet" : "neu angelegt"}  ${item.fileName}`);
}

const { documents } = await fetch(endpoint).then((r) => r.json());
const missing = documents.filter((d) => !d.hasFile);
console.log(`\n${documents.length - missing.length} von ${documents.length} Unterlagen haben jetzt eine Datei.`);
for (const document of missing) console.log(`  ohne Datei: ${document.fileName}`);
