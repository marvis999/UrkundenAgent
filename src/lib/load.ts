import { notFound } from "next/navigation";
import { getCaseView } from "@/db/repository";
import { FIELD_IDS, type CaseView, type FieldId } from "@/domain/model";
import { documentById } from "@/domain/evidence";

export type CaseParams = Promise<{ caseId: string }>;
export type DocumentParams = Promise<{ caseId: string; documentId: string }>;
export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const loadCaseView = async (params: CaseParams): Promise<CaseView> => {
  const { caseId } = await params;
  const view = await getCaseView(caseId);
  if (!view) notFound();
  return view;
};

export const loadDocument = async (view: CaseView, params: DocumentParams) => {
  const { documentId } = await params;
  const document = documentById(view, documentId);
  if (!document) notFound();
  return document;
};

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export const parseFieldId = (value: string | string[] | undefined): FieldId | undefined => {
  const raw = first(value);
  return FIELD_IDS.find((id) => id === raw);
};

export const parseString = (value: string | string[] | undefined) => first(value);

export const parsePage = (value: string | string[] | undefined, fallback = 1) => {
  const parsed = Number.parseInt(first(value) ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};
