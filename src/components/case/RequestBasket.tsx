import { sendRequestAction, toggleBasketAction } from "@/app/actions";
import { ActionForm } from "@/components/ui/ActionForm";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Icon } from "@/components/ui/Icon";
import { ListItem } from "@/components/ui/ListItem";
import { Notice } from "@/components/ui/Notice";
import { Overlay } from "@/components/ui/Overlay";
import { Stack } from "@/components/ui/layout";
import { Text } from "@/components/ui/Text";
import type { CaseView } from "@/domain/model";
import { basketItems, requestLetter, requestSubject } from "@/domain/request";
import { formatPositions } from "@/lib/format";
import { routes } from "@/lib/routes";
import styles from "./RequestBasket.module.css";

const LETTER_FORM = "request-letter";

interface RequestBasketProps {
  view: CaseView;
}

/** The Anfordern basket: positions bound to their fields, turned into one letter. */
export function RequestBasket({ view }: RequestBasketProps) {
  const items = basketItems(view);
  const closeHref = routes.case(view.case.id);
  // Once sent, the same drawer becomes a record of what went out; positions stay put.
  const sent = view.requestSentAt !== undefined;

  return (
    <Overlay
      placement="side"
      closeHref={closeHref}
      title={
        <>
          <Icon name="list-checks" size="lg" />
          <span>Anforderung</span>
          <Text variant="muted">
            {formatPositions(items.length)} {sent ? `gesendet am ${view.requestSentAt}` : "aus den Befunden"}
          </Text>
        </>
      }
      footer={
        items.length > 0 && (
          <>
            <Text variant="muted">
              {sent ? "Diese Felder warten auf Rückmeldung." : "Nach dem Senden warten diese Felder auf Rückmeldung."}
            </Text>
            <span className={styles.footerActions}>
              <Button variant="secondary" icon="copy">
                Text kopieren
              </Button>
              <Button variant="accent" icon={sent ? "mail" : "send"} form={sent ? undefined : LETTER_FORM} disabled={sent}>
                {sent ? "Nachfassen" : "Senden"}
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
                  <input name="recipient" defaultValue={view.recipientEmail} readOnly={sent} />
                </FormField>
                <FormField label="Betreff">
                  <input name="subject" defaultValue={requestSubject(view)} readOnly={sent} />
                </FormField>
                <FormField label="Text" hint="aus den Positionen erzeugt, frei überschreibbar">
                  <textarea name="body" rows={16} defaultValue={requestLetter(view, items)} readOnly={sent} />
                </FormField>
              </Stack>
            </form>
          </Stack>
        )}
      </div>
    </Overlay>
  );
}
