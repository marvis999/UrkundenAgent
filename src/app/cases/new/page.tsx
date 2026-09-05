import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Notice } from "@/components/ui/Notice";
import { Columns, Page, Stack } from "@/components/ui/layout";
import { PageTitle } from "@/components/ui/PageTitle";
import { Brand, TopBar, UserChip } from "@/components/ui/TopBar";
import { workspace } from "@/data/workspace";
import { routes } from "@/lib/routes";

const EMAIL_ROWS = 14;

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
              title="Was der Agent aus der E-Mail zieht"
              text="Beteiligte, Kaufpreis, Finanzierung, Übergabe und angekündigte Unterlagen. Alles daraus gilt als Parteiangabe und bleibt unbestätigt, bis ein Nachweis vorliegt oder ein Mensch den Wert bestätigt."
            />
          }
        >
          <Stack gap="regular">
            <FormField label="Vorgangsname">
              <input placeholder="2026-0416 Straße Hausnummer" />
            </FormField>
            <FormField label="Objektadresse">
              <input placeholder="Straße Hausnummer, PLZ Ort" />
            </FormField>
            <FormField label="E-Mail des Maklers" hint="vollständig einfügen, inklusive Nachträgen">
              <textarea rows={EMAIL_ROWS} />
            </FormField>
            <div>
              <Button variant="accent" iconEnd="arrow-right">
                Vorgang anlegen
              </Button>
            </div>
          </Stack>
        </Columns>
      </Page>
    </>
  );
}
