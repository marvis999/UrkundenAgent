import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Icon } from "@/components/ui/Icon";
import { ListItem } from "@/components/ui/ListItem";
import { Notice } from "@/components/ui/Notice";
import { Overlay } from "@/components/ui/Overlay";
import { Stack } from "@/components/ui/Page";
import type { CaseView } from "@/domain/model";
import { basketItems, requestLetter, requestSubject } from "@/domain/request";
import { formatPositions } from "@/lib/format";
import { routes } from "@/lib/routes";
import styles from "./RequestBasket.module.css";

interface RequestBasketProps {
  view: CaseView;
}

/** The Anfordern basket: positions bound to their fields, turned into one letter. */
export function RequestBasket({ view }: RequestBasketProps) {
  const items = basketItems(view);
  const closeHref = routes.case(view.case.id);

  return (
    <Overlay
      placement="side"
      closeHref={closeHref}
      title={
        <>
          <Icon name="list-checks" size="lg" />
          <span>Anforderung</span>
          <span className={styles.subtitle}>{formatPositions(items.length)} aus den Befunden</span>
        </>
      }
      footer={
        items.length > 0 && (
          <>
            <span className={styles.footerHint}>Nach dem Senden warten diese Felder auf Rückmeldung.</span>
            <span className={styles.footerActions}>
              <Button variant="secondary" icon="copy">
                Text kopieren
              </Button>
              <Button variant="accent" icon="send">
                Senden
              </Button>
            </span>
          </>
        )
      }
    >
      <div className={styles.body}>
        {items.length === 0 ? (
          <Notice
            tone="neutral"
            surface="plain"
            title="Noch keine Positionen"
            text="In den Urkundendaten steht an jedem Feld Anfordern. Was hier landet, wird zu einem Schreiben zusammengefasst und bleibt am Feld vermerkt."
          />
        ) : (
          <Stack gap="regular">
            <Stack gap="tight">
              {items.map((item) => (
                <ListItem
                  key={item.field.id}
                  leading={<span className={styles.number}>{item.number}</span>}
                  title={<span className={styles.itemTitle}>{item.title}</span>}
                  description={item.text}
                  meta={`Feld ${item.field.label}`}
                  trailing={<Button variant="ghost" icon="x" label="Position entfernen" />}
                />
              ))}
            </Stack>
            <FormField label="Empfänger">
              <input defaultValue={view.recipientEmail} />
            </FormField>
            <FormField label="Betreff">
              <input defaultValue={requestSubject(view)} />
            </FormField>
            <FormField label="Text" hint="aus den Positionen erzeugt, frei überschreibbar">
              <textarea rows={16} defaultValue={requestLetter(view, items)} />
            </FormField>
          </Stack>
        )}
      </div>
    </Overlay>
  );
}
