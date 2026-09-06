/**
 * Runs the agent loop over a case from the command line.
 *
 *   npm run agent -- 2026-0412            one full run
 *   npm run agent -- 2026-0412 --dry      the plan only, no model calls, no cost
 *   npm run agent -- 2026-0412 --again    re-read the documents of the current run
 *   npm run agent -- 2026-0412 --limit 2  narrower fan-out, for a rate-limited key
 *
 * The originals and their rendered pages live under the data directory, which is not in
 * the repository. Point URKUNDEN_DATA_DIR at it when running from a worktree.
 */

import { LlmError } from "@/agent/llm";
import { planRun } from "@/agent/plan";
import { runCase } from "@/agent/run";
import { reopenRun } from "@/db/runWriter";
import { dataDirectory } from "@/db/connect";
import { todayIso } from "@/lib/clock";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // Not every environment keeps a dotenv file; the variables may already be set.
  }
}

const args = process.argv.slice(2);
const caseId = args.find((arg) => !arg.startsWith("--"));
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};

if (caseId === undefined) {
  console.error("Aufruf: npm run agent -- <vorgang-id> [--dry] [--again] [--limit N] [--today YYYY-MM-DD]");
  process.exit(1);
}

const today = option("today") ?? todayIso();

const main = async () => {
  console.log(`Vorgang    : ${caseId}`);
  console.log(`Daten      : ${dataDirectory()}`);
  console.log(`Heute      : ${today}`);

  if (flag("again")) {
    await reopenRun(caseId);
    console.log("--again    : laufenden Durchlauf wieder geoeffnet");
  }

  const plan = await planRun(caseId);
  console.log(`Durchlauf  : ${plan.number}`);
  console.log(`Zu lesen   : ${plan.documents.length} Dateien, ${plan.pageCount} Seiten`);
  for (const document of plan.documents) {
    const withText = document.pages.filter((page) => page.text.trim() !== "").length;
    console.log(`  ${document.fileName} — ${document.pages.length} Seiten, davon ${withText} mit Textebene`);
  }
  for (const skipped of plan.skipped) {
    console.log(`  übersprungen: ${skipped.fileName} (${skipped.reason})`);
  }

  if (plan.documents.length === 0) {
    console.log("\nNichts zu lesen. Sind die Seiten schon gerendert?");
    return;
  }
  if (flag("dry")) {
    console.log("\n--dry: keine Modellaufrufe.");
    return;
  }

  console.log("");
  const started = Date.now();
  const report = await runCase(caseId, {
    today,
    ...(option("limit") === undefined ? {} : { limit: Number(option("limit")) }),
    onProgress: (message) => console.log(message),
  });

  console.log("");
  console.log(`Fundstellen: ${report.candidatesWritten}`);
  console.log(`Unterfelder befüllt: ${report.subfieldsFilled}`);
  console.log(`Tabellenzeilen: ${report.rowsTouched}`);
  console.log(`Markiert   : ${report.quotesLocated} Zitate auf der Seite lokalisiert`);
  console.log(`Befunde    : ${report.findingsWritten}`);
  console.log(`Dauer      : ${Math.round((Date.now() - started) / 1000)} s`);
  console.log(`Protokoll  : ${report.summary}`);

  if (report.resolved.length > 0) {
    console.log(`\nAnforderung (${report.resolved.length}):`);
    for (const item of report.resolved) console.log(`  ${item.fieldKey}: ${item.outcome} — ${item.resolvedBy}`);
  }
  if (report.rejected.length > 0) {
    console.log(`\nVerworfen (${report.rejected.length}):`);
    for (const item of report.rejected) console.log(`  ${item.fieldKey}.${item.target}: ${item.reason}`);
  }
  if (report.failures.length > 0) {
    console.log(`\nFehlgeschlagen (${report.failures.length}):`);
    for (const failure of report.failures) console.log(`  ${failure}`);
  }
};

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof LlmError ? `\n${error.name}: ${error.message}` : error);
    process.exit(1);
  });
