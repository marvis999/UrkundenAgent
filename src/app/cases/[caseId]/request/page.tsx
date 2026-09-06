import { DeedData } from "@/components/case/DeedData";
import { RequestBasket } from "@/components/case/RequestBasket";
import { loadCaseView, type CaseParams } from "@/lib/load";

export default async function RequestPage({ params }: { params: CaseParams }) {
  const view = await loadCaseView(params);
  return (
    <RequestBasket view={view}>
      <DeedData view={view} />
    </RequestBasket>
  );
}
