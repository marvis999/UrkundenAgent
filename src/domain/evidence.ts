import type { Candidate, CaseView, Document, Field } from "./model";

export interface LocatedCandidate {
  field: Field;
  candidate: Candidate;
}

/** Every candidate that points into the given document, with the field it belongs to. */
export const candidatesInDocument = (view: CaseView, documentId: string): LocatedCandidate[] =>
  view.fields.flatMap((field) =>
    field.candidates.filter((c) => c.documentId === documentId).map((candidate) => ({ field, candidate })),
  );

export const candidateOnPage = (view: CaseView, documentId: string, page: number) =>
  candidatesInDocument(view, documentId).find(({ candidate }) => candidate.page === page);

export const pagesWithEvidence = (view: CaseView, documentId: string) =>
  new Set(candidatesInDocument(view, documentId).map(({ candidate }) => candidate.page));

export const documentById = (view: CaseView, documentId: string): Document | undefined =>
  view.documents.find((d) => d.id === documentId);

export const documentPageCount = (documents: readonly Document[]) => documents.reduce((sum, d) => sum + d.pageCount, 0);

export const photoCount = (documents: readonly Document[]) => documents.filter((d) => d.kind === "photo").length;

export const clampPage = (page: number, pageCount: number) => Math.min(Math.max(page, 1), pageCount);
