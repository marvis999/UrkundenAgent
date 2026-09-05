import type { ReactNode } from "react";
import { CaseChrome } from "@/components/case/CaseChrome";
import { loadCaseView, type CaseParams } from "@/lib/load";

export default async function CaseLayout({ children, params }: { children: ReactNode; params: CaseParams }) {
  const view = await loadCaseView(params);
  return <CaseChrome view={view}>{children}</CaseChrome>;
}
