import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Notice } from "@/components/ui/Notice";
import { Columns, Page, Stack } from "@/components/ui/Page";
import { PageTitle } from "@/components/ui/PageTitle";
import { BrandMark, TopBar, UserChip } from "@/components/ui/TopBar";
import { workspace } from "@/data/workspace";
import { routes } from "@/lib/routes";
import styles from "../../page.module.css";

const EMAIL_ROWS = 14;

export default function NewCasePage() {
  return (
    <>
      <TopBar
        start={
          <>
            <Button variant="ghost" icon="arrow-left" href={routes.cases()} label="Zur Vorgangsliste" />
            <BrandMark />
            <span className={styles.product}>{workspace.productName}</span>
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
