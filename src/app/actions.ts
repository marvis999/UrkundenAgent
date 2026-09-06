"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cancelAnalysis, startAnalysis } from "@/agent/dispatch";
import { PROCEDURES, type Procedure } from "@/domain/status";
import { createCase } from "@/db/cases";
import { ingestDocument } from "@/db/files";
import { chooseCandidate, confirmValue, correctSubfield, sendRequest, setBasketItem, setProcedure } from "@/db/mutations";
import { noteFileName } from "@/lib/documents";
import { parseFieldId } from "@/lib/load";
import { routes } from "@/lib/routes";

/**
 * The actions a clerk can take, as server actions.
 *
 * Each one is a thin wrapper: the rules live in db/mutations.ts, so a mutation behaves
 * the same whether a form, a script or a later agent run triggers it. Form values are
 * strings from the browser, so every one is validated against the domain before use.
 */

const value = (form: FormData, name: string) => {
  const raw = form.get(name);
  return typeof raw === "string" ? raw : "";
};

const fieldId = (form: FormData, name: string) => parseFieldId(value(form, name));

/** One store, one set of pages: after any write every route re-reads. */
const refresh = () => revalidatePath("/", "layout");

export async function confirmValueAction(form: FormData) {
  const field = fieldId(form, "field");
  if (!field) return;
  await confirmValue(value(form, "case"), field, value(form, "part"));
  refresh();
}

export async function chooseCandidateAction(form: FormData) {
  await chooseCandidate(value(form, "case"), value(form, "candidate"));
  refresh();
}

export async function correctValueAction(form: FormData) {
  const field = fieldId(form, "field");
  if (!field) return;
  await correctSubfield(value(form, "case"), field, value(form, "part"), value(form, "value"), value(form, "reason"));
  refresh();
}

export async function toggleBasketAction(form: FormData) {
  const field = fieldId(form, "field");
  if (!field) return;
  await setBasketItem(value(form, "case"), field, value(form, "inBasket") !== "true");
  refresh();
}

export async function setProcedureAction(form: FormData) {
  const field = fieldId(form, "field");
  const procedure = PROCEDURES.find((p): p is Procedure => p === value(form, "option"));
  if (!field || !procedure) return;
  await setProcedure(value(form, "case"), field, value(form, "row"), procedure);
  refresh();
}

export async function sendRequestAction(form: FormData) {
  await sendRequest(value(form, "case"), value(form, "recipient"), value(form, "subject"), value(form, "body"));
  refresh();
}

/* ---------- Text that arrives without a file ---------- */

/**
 * Files typed or pasted text as a document.
 *
 * Most of what a notary is told first is not a file: the broker's e-mail, a note from a
 * phone call, a correction sent later. It goes through the same door as a scan -- stored
 * under the hash of its bytes, turned into one page, read by the next run -- so a value
 * taken from it has a Fundstelle like any other, and the quote can be checked against the
 * text it came from.
 */
const fileText = (caseId: string, name: string, body: string) =>
  ingestDocument(caseId, noteFileName(name), new TextEncoder().encode(body));

export async function addNoteAction(_previous: string | undefined, form: FormData): Promise<string | undefined> {
  const body = value(form, "text");
  if (body.trim() === "") return "Ohne Text gibt es nichts abzulegen.";
  await fileText(value(form, "case"), value(form, "name"), body);
  refresh();
  return undefined;
}

/**
 * Opens a case and files whatever was pasted with it.
 *
 * Only the name is asked for. The address of the property is in the documents, so the
 * first run derives it; asking a clerk to retype what the Grundbuch already says is how
 * the two come to disagree.
 */
export async function createCaseAction(_previous: string | undefined, form: FormData): Promise<string | undefined> {
  const name = value(form, "name").trim();
  if (name === "") return "Der Vorgang braucht einen Namen.";

  const caseId = await createCase({ name });
  const body = value(form, "text");
  if (body.trim() !== "") await fileText(caseId, value(form, "noteName"), body);
  refresh();
  // Throws, so it has to come last: everything above must already be written.
  redirect(routes.case(caseId));
}

/* ---------- The run itself ---------- */

/**
 * Starts a run and comes straight back. The answer is either nothing -- the case is in
 * the analysis phase now and the page will show the progress strip -- or one German
 * sentence saying why no run was started, which is the only outcome the pages cannot
 * derive from the case itself.
 */
export async function startRunAction(_previous: string | undefined, form: FormData): Promise<string | undefined> {
  const result = await startAnalysis(value(form, "case"));
  refresh();
  return result.started ? undefined : result.reason;
}

export async function cancelRunAction(form: FormData) {
  await cancelAnalysis(value(form, "case"));
  refresh();
}
