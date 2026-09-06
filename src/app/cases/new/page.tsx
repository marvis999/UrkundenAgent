import { Button } from "@/components/ui/Button";
import { NewCaseForm } from "@/components/case/NewCaseForm";
import { Notice } from "@/components/ui/Notice";
import { Columns, Page } from "@/components/ui/layout";
import { PageTitle } from "@/components/ui/PageTitle";
import { Brand, TopBar, UserChip } from "@/components/ui/TopBar";
import { workspace } from "@/data/workspace";
import { routes } from "@/lib/routes";

export default function NewCasePage() {
  return (
    <>
      <TopBar
        start={
          <>
            <Button variant="ghost" icon="arrow-left" href={routes.cases()} label="Zur Vorgangsliste" />
            <Brand name={workspace.productName} />
          </>
        }
        end={<UserChip initials={workspace.userInitials} />}
      />
      <Page>
        <PageTitle>Neuer Vorgang</PageTitle>
        <Columns
          aside={
            <Notice
              tone="proposed"
              icon="mail"
              surface="tint"
              title="Was der Agent aus dem Text zieht"
              text="Beteiligte, Kaufpreis, Finanzierung, Übergabe und die Anschrift des Objekts. Alles daraus gilt als Parteiangabe und bleibt unbestätigt, bis ein Nachweis vorliegt oder ein Mensch den Wert bestätigt."
            />
          }
        >
          <NewCaseForm />
        </Columns>
      </Page>
    </>
  );
}
