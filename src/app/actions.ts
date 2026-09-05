"use server";

import { revalidatePath } from "next/cache";
import { PROCEDURES, type Procedure } from "@/domain/status";
import { chooseCandidate, confirmValue, correctSubfield, sendRequest, setBasketItem, setProcedure } from "@/db/mutations";
import { parseFieldId } from "@/lib/load";

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
