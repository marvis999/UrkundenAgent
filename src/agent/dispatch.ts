import { createOpenRouterProvider, LlmError, type LlmProvider } from "./llm";
import { planRun } from "./plan";
import { runCase, RunCancelled } from "./run";
import { endAnalysis, startRun } from "@/db/runWriter";
import { plural } from "@/lib/format";

/**
 * Starting and stopping a run from the browser.
 *
 * A run is dozens of model calls over several minutes, so the click that starts it cannot
 * wait for it. The action returns as soon as the case is in the analysis phase, and the
 * run continues in the background of the same Node process; the page polls, and every
 * number it shows comes from the database, not from this module. That is why a reload,
 * a second tab or a different browser all see the same progress.
 *
 * Two things are held here rather than in the database:
 *
 *  - the guard against starting the same case twice, so a double click does not put two
 *    runs on the same documents;
 *  - the AbortController, which is what makes `Abbrechen` stop the calls in flight rather
 *    than only hiding the strip.
 *
 * Both are per process, which is exactly as far as they can reach: the app is one
 * container against one database, and a second instance would need the guard in Postgres.
 * The database still has the last word -- `endAnalysis` leaves the run unfinished, so a
 * cancelled or crashed run re-reads its documents rather than skipping them.
 */

const running = new Map<string, AbortController>();

export interface StartResult {
  readonly started: boolean;
  /** German sentence for the clerk, when there was nothing to start. */
  readonly reason?: string;
  readonly runNumber?: number;
}

export const isAnalysing = (caseId: string) => running.has(caseId);

/** What the run log says about a run that did not finish. A stop is not a fault. */
const note = (error: unknown) =>
  error instanceof RunCancelled
    ? error.message
    : `Durchlauf fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`;

/**
 * The model access, built before the run is opened.
 *
 * A missing key is a configuration mistake, not a failed run: without this the case would
 * move to `analysis`, fail on its first call and drop back, leaving the reason in a run
 * summary nobody was looking at. Built here rather than inside `runCase` so the check and
 * the run cannot end up using different settings.
 */
const provider = (): LlmProvider | string => {
  try {
    return createOpenRouterProvider();
  } catch (error) {
    if (!(error instanceof LlmError)) throw error;
    return `Kein Modellzugang konfiguriert: ${error.message}`;
  }
};

export const startAnalysis = async (caseId: string): Promise<StartResult> => {
  if (running.has(caseId)) return { started: false, reason: "Für diesen Vorgang läuft bereits ein Durchlauf." };

  const model = provider();
  if (typeof model === "string") return { started: false, reason: model };

  // Planned before anything is promised: a run over no documents would open a run row,
  // finish it empty and mark the case as read.
  const plan = await planRun(caseId);
  if (plan.documents.length === 0) {
    const skipped = plan.skipped.map((document) => `${document.fileName} (${document.reason})`).join(", ");
    return {
      started: false,
      reason: skipped === "" ? "Keine ungelesenen Unterlagen im Vorgang." : `Nichts zu lesen: ${skipped}`,
    };
  }

  const controller = new AbortController();
  running.set(caseId, controller);

  // The phase moves before the answer goes back, so the page that triggered this shows
  // the progress strip on its first refresh instead of the button it just used.
  await startRun(caseId, plan.number);

  void runCase(caseId, { provider: model, signal: controller.signal })
    .catch((error: unknown) => endAnalysis(caseId, note(error)))
    .finally(() => {
      running.delete(caseId);
    });

  return {
    started: true,
    runNumber: plan.number,
    reason: `${plural(plan.documents.length, "Datei", "Dateien")}, ${plural(plan.pageCount, "Seite", "Seiten")}`,
  };
};

/**
 * Stops a run in flight. Without a controller the run belongs to a process that is gone,
 * so the case is freed anyway -- otherwise a restart during a run would leave it showing
 * a progress strip that nothing will ever move.
 */
export const cancelAnalysis = async (caseId: string): Promise<void> => {
  running.get(caseId)?.abort();
  if (!running.has(caseId)) await endAnalysis(caseId, new RunCancelled().message);
};
