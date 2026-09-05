import type { CaseView, Field } from "./model";

export interface BasketItem {
  number: number;
  field: Field;
  title: string;
  text: string;
}

export const basketItems = (view: CaseView): BasketItem[] =>
  view.basket
    .flatMap((id) => view.fields.filter((f) => f.id === id))
    .filter((field) => field.request !== undefined)
    .map((field, index) => ({ number: index + 1, field, title: field.request!.title, text: field.request!.text }));

export const requestSubject = (view: CaseView) => `${view.case.fileNumber}, ${view.case.property}: fehlende Unterlagen`;

/** The letter body generated from the basket. Free to overwrite in the UI. */
export const requestLetter = (view: CaseView, items: readonly BasketItem[]) =>
  [
    "Sehr geehrte Damen und Herren,",
    "",
    `für die Beurkundung des Kaufvertrags ${view.case.property} fehlen uns noch folgende Unterlagen:`,
    "",
    ...items.map((item) => `${item.number}. ${item.title}\n   ${item.text}`),
    "",
    "Bitte reichen Sie die Unterlagen gesammelt ein. Wir werten sie in einem Durchlauf aus und melden uns, falls etwas offen bleibt.",
    "",
    "Mit freundlichen Grüßen",
  ].join("\n");
