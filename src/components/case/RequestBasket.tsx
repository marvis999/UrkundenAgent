import type { ReactNode } from "react";
import { sendRequestAction, toggleBasketAction } from "@/app/actions";
import { ActionForm } from "@/components/ui/ActionForm";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Icon } from "@/components/ui/Icon";
import { ListItem } from "@/components/ui/ListItem";
import { Notice } from "@/components/ui/Notice";
import { Stack } from "@/components/ui/layout";
import { Text } from "@/components/ui/Text";
import type { CaseView } from "@/domain/model";
import { basketItems, requestLetter, requestSubject } from "@/domain/request";
import { plural } from "@/lib/format";
import { routes } from "@/lib/routes";
import { CopyText } from "./CopyText";
import styles from "./RequestBasket.module.css";

const LETTER_FORM = "request-letter";
const LETTER_BODY = "request-letter-body";

interface RequestBasketProps {
  view: CaseView;
  /** The main view, which stays in use while the basket is open. */
  children: ReactNode;
}

/**
 * The Anfordern basket: positions bound to their fields, turned into one letter.
 *
 * A drawer beside the main view, not a modal over it: the positions come from the fields,
 * so a person adds one, reads the next field and adds another without closing anything.
 */
export function RequestBasket({ view, children }: RequestBasketProps) {
  const items = basketItems(view);
  // Once sent, the same panel becomes a record of what went out; positions stay put.
  const sent = view.requestSentAt !== undefined;

  return (
    <>
      {children}
      {/* data-drawer: the case chrome reads it and makes room on the right. */}
      <aside className={styles.panel} aria-label="Anforderung" data-drawer>
        <header className={styles.header}>
          <div className={styles.title}>
            <Icon name="list-checks" size="lg" />
            <span>Anforderung</span>
            <Text variant="muted">
              {plural(items.length, "Position", "Positionen")} {sent ? `gesendet am ${view.requestSentAt}` : "aus den Befunden"}
            </Text>
          </div>
          <Button variant="secondary" icon="x" href={routes.case(view.case.id)} label="Schließen" />
        </header>
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
                  leading={<Badge tone="neutral">{item.number}</Badge>}
                  title={<Text variant="strong">{item.title}</Text>}
                  description={item.text}
                  meta={`Feld ${item.field.label}`}
                  trailing={
                    sent ? undefined : (
                      <ActionForm action={toggleBasketAction} values={{ case: view.case.id, field: item.field.id, inBasket: "true" }}>
                        <Button variant="ghost" icon="x" label="Position entfernen" submit />
                      </ActionForm>
                    )
                  }
                />
              ))}
            </Stack>
            {/* Reachable from the footer button by id, so the letter posts as one form. */}
            <form id={LETTER_FORM} action={sendRequestAction}>
              <input type="hidden" name="case" value={view.case.id} />
              <Stack gap="regular">
                <FormField label="Empfänger">
                  <input name="recipient" defaultValue={view.recipient} readOnly={sent} />
                </FormField>
                <FormField label="Betreff">
                  <input name="subject" defaultValue={requestSubject(view)} readOnly={sent} />
                </FormField>
                <FormField label="Text" hint="aus den Positionen erzeugt, frei überschreibbar">
                  <textarea id={LETTER_BODY} name="body" rows={16} defaultValue={requestLetter(view, items)} readOnly={sent} />
                </FormField>
              </Stack>
            </form>
          </Stack>
        )}
        </div>
        {items.length > 0 && (
          <footer className={styles.footer}>
            <Text variant="muted">
              {sent ? "Diese Felder warten auf Rückmeldung." : "Nach dem Senden warten diese Felder auf Rückmeldung."}
            </Text>
            <span className={styles.footerActions}>
              <CopyText targetId={LETTER_BODY} label="Text kopieren" />
              {/* Once sent, the panel is the record of what went out. Sending again is a
                  different letter, and the app does not write that one -- copying the text
                  into a mail client is what a follow-up actually is here. */}
              {!sent && (
                <Button variant="accent" icon="send" form={LETTER_FORM}>
                  Senden
                </Button>
              )}
            </span>
          </footer>
        )}
      </aside>
    </>
  );
}
