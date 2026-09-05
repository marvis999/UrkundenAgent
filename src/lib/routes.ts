/** Single place for every URL the UI links to. */

export const QUERY = {
  field: "field",
  part: "part",
  page: "page",
  manual: "manual",
} as const;

/** Explicit "no part open" value; part ids never take this value. */
export const PART_NONE = "none";

type QueryValue = string | number | boolean | undefined;

const withQuery = (path: string, params: Record<string, QueryValue>, fragment?: string) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === false) continue;
    search.set(key, value === true ? "1" : String(value));
  }
  const query = search.toString();
  return `${path}${query ? `?${query}` : ""}${fragment ? `#${fragment}` : ""}`;
};

/** DOM id of a field block, so links can scroll to it. */
export const fieldAnchor = (fieldId: string) => `field-${fieldId}`;

interface CaseRouteOptions {
  /** Subfield or table row to expand inside the field. Omit for the default part, PART_NONE for none. */
  part?: string;
  /** Opens the manual-correction form of the expanded part. */
  manual?: boolean;
  /** Scrolls to the expanded field instead of the page top. */
  anchor?: boolean;
}

export const routes = {
  cases: () => "/",
  newCase: () => "/cases/new",
  case: (caseId: string, fieldId?: string, options: CaseRouteOptions = {}) =>
    withQuery(
      `/cases/${caseId}`,
      { [QUERY.field]: fieldId, [QUERY.part]: options.part, [QUERY.manual]: options.manual },
      options.anchor && fieldId ? fieldAnchor(fieldId) : undefined,
    ),
  caseDocuments: (caseId: string) => `/cases/${caseId}/documents`,
  document: (caseId: string, documentId: string, page?: number) =>
    withQuery(`/cases/${caseId}/documents/${documentId}`, { [QUERY.page]: page }),
  caseDraft: (caseId: string) => `/cases/${caseId}/draft`,
  caseRequest: (caseId: string) => `/cases/${caseId}/request`,
};
