import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button, type ButtonVariant } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { Text } from "@/components/ui/Text";
import { TopBar, UserChip } from "@/components/ui/TopBar";
import { workspace } from "@/data/workspace";
import { deriveBanner, type ActionEmphasis } from "@/domain/derive";
import type { CaseView } from "@/domain/model";
import { CASE_STATUS_META } from "@/domain/status";
import { formatFiles } from "@/lib/format";
import { routes } from "@/lib/routes";
import styles from "./CaseChrome.module.css";

const ACTION_VARIANT: Record<ActionEmphasis, ButtonVariant> = {
  primary: "accent",
  strong: "dark",
  quiet: "translucent",
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
      detail: formatFiles(view.documents.length),
      badge: c.phase === "intake" && newDocuments > 0 ? `${newDocuments} neu` : undefined,
      href: routes.caseDocuments(c.id),
    },
    { label: "Entwurf", detail: `${view.clauses.length} §§`, href: routes.caseDraft(c.id) },
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
              {banner.secondary && (
                <Button variant={ACTION_VARIANT[banner.secondary.emphasis]} icon={banner.secondary.icon} href={banner.secondary.href}>
                  {banner.secondary.label}
                </Button>
              )}
              <Button variant={ACTION_VARIANT[banner.action.emphasis]} iconEnd={banner.action.icon} href={banner.action.href}>
                {banner.action.label}
              </Button>
            </>
          }
        />
      </div>
      {children}
    </div>
  );
}
