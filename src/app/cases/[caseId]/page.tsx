import { DeedData } from "@/components/case/DeedData";
import { loadCaseView, parseFieldId, parseString, type CaseParams, type SearchParams } from "@/lib/load";
import { QUERY } from "@/lib/routes";

export default async function DeedDataPage({ params, searchParams }: { params: CaseParams; searchParams: SearchParams }) {
  const view = await loadCaseView(params);
  const query = await searchParams;
  return <DeedData view={view} activeFieldId={parseFieldId(query[QUERY.field])} activePartId={parseString(query[QUERY.part])} />;
}
