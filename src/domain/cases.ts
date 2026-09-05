import type { Case } from "./model";
import { CASE_STATUSES, CASE_STATUS_META } from "./status";

/** "1 in Prüfung, 1 wartet auf Rückmeldung, 2 vollständig" from the list itself. */
export const caseListSummary = (cases: readonly Case[]) =>
  CASE_STATUSES.map((status) => ({ status, count: cases.filter((c) => c.status === status).length }))
    .filter(({ count }) => count > 0)
    .map(({ status, count }) => `${count} ${CASE_STATUS_META[status].label}`)
    .join(", ");
