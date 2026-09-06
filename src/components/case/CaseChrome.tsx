import type { ReactNode } from "react";
import { cancelRunAction } from "@/app/actions";
import { ActionForm } from "@/components/ui/ActionForm";
import { Badge } from "@/components/ui/Badge";
import { Button, type ButtonVariant } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { Text } from "@/components/ui/Text";
import { TopBar, UserChip } from "@/components/ui/TopBar";
import { CLAUSES } from "@/catalog/fields";
import { workspace } from "@/data/workspace";
import { deriveBanner, type ActionEmphasis, type BannerAction } from "@/domain/derive";
import type { CaseView } from "@/domain/model";
import { CASE_STATUS_META } from "@/domain/status";
import { plural } from "@/lib/format";
import { routes } from "@/lib/routes";
import { AutoRefresh } from "./AutoRefresh";
import { StartRun } from "./RunControl";
import styles from "./CaseChrome.module.css";

const ACTION_VARIANT: Record<ActionEmphasis, ButtonVariant> = {
  primary: "accent",
  strong: "dark",
  quiet: "translucent",
};

/**
 * One banner button. Most of them navigate, so they are links; the two that drive the
 * run itself submit instead, because starting and cancelling a run are writes and a link
 * that writes is a link that a browser may follow on its own.
 */
const renderAction = (caseId: string, action: BannerAction, iconSide: "start" | "end") => {
  const variant = ACTION_VARIANT[action.emphasis];
  if (action.run === "start") return <StartRun caseId={caseId} label={action.label} />;
  if (action.run === "cancel") {
    return (
      <ActionForm action={cancelRunAction} values={{ case: caseId }}>
        <Button variant={variant} icon={action.icon} submit>
          {action.label}
        </Button>
      </ActionForm>
    );
  }
  return (
    <Button
      variant={variant}
      {...(iconSide === "end" ? { iconEnd: action.icon } : { icon: action.icon })}
      href={action.href}
    >
      {action.label}
    </Button>
  );
};

interface CaseChromeProps {
  view: CaseView;
  children: ReactNode;
}

/** Header, tabs and status banner around every case tab. */
export function CaseChrome({ view, children }: CaseChromeProps) {
  const { case: c } = view;
  const banner = deriveBanner(view);
  const newDocuments = view.documents.filter((d) => d.isNew).length;

  const tabs: TabItem[] = [
    { label: "Urkundendaten", detail: `${view.fields.length} Felder`, href: routes.case(c.id) },
    {
      label: "Unterlagen",
      detail: plural(view.documents.length, "Datei", "Dateien"),
      badge: c.phase === "intake" && newDocuments > 0 ? `${newDocuments} neu` : undefined,
      href: routes.caseDocuments(c.id),
    },
    { label: "Entwurf", detail: `${CLAUSES.length} §§`, href: routes.caseDraft(c.id) },
  ];

  return (
    <div className={styles.chrome}>
      <TopBar
        start={
          <>
            <Button variant="ghost" icon="arrow-left" href={routes.cases()} label="Zur Vorgangsliste" />
            <span className={styles.name}>{c.name}</span>
            <Text variant="muted">{c.fileNumber}</Text>
            <StatusBadge meta={CASE_STATUS_META[c.status]} />
          </>
        }
        end={
          <>
            <Button variant={view.basket.length > 0 ? "accent" : "secondary"} icon="list-checks" href={routes.caseRequest(c.id)}>
              Anfordern
              <Badge tone="neutral">{view.basket.length}</Badge>
            </Button>
            <UserChip initials={workspace.userInitials} />
          </>
        }
      />
      <div className={styles.band}>
        <Tabs items={tabs} />
        <Notice
          tone={banner.tone}
          icon={banner.icon}
          title={banner.title}
          text={banner.text}
          size="prominent"
          attached
          actions={
            <>
              {banner.secondary && renderAction(c.id, banner.secondary, "start")}
              {renderAction(c.id, banner.action, "end")}
            </>
          }
        />
      </div>
      {/* Only while a run is in flight; a case at rest polls nothing. */}
      {c.phase === "analysis" && <AutoRefresh />}
      {children}
    </div>
  );
}
