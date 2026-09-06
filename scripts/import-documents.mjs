// Imports original documents into a running app.
//
//   npm run import -- <case-id> <file> [<file> ...]
//   npm run import -- 2026-0001 test_files/*.pdf test_files/*.jpg
//
// The same door the Unterlagen tab uses, for a folder that is quicker to pass on the
// command line than to drag in. The originals are confidential and are not part of this
// repository: they stay on the machine that runs the app, which stores them under the
// data directory and renders their pages.
//
// The case has to exist. Open it in the app first -- a case is more than a row, it is the
// whole field catalog written out, and the app is where that happens.

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
  console.log(`${item.attachedToExisting ? "schon vorhanden" : "neu angelegt"}  ${item.fileName}  (${item.pageCount} Seiten)`);
}

const { documents } = await fetch(endpoint).then((r) => r.json());
console.log(`\n${documents.length} Unterlagen im Vorgang. Der nächste Durchlauf liest die neuen.`);
