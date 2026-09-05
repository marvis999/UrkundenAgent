"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Tabs.module.css";

export interface TabItem {
  label: string;
  detail?: string;
  /** Highlighted badge, e.g. "3 neu". */
  badge?: string;
  href: string;
}

interface TabsProps {
  items: readonly TabItem[];
}

export function Tabs({ items }: TabsProps) {
  const pathname = usePathname();
  // The most specific tab whose href prefixes the current path (sub-routes belong to their tab).
  const active = items.reduce<TabItem | undefined>(
    (best, item) => (pathname.startsWith(item.href) && item.href.length > (best?.href.length ?? 0) ? item : best),
    undefined,
  );
  return (
    <nav className={styles.tabs} aria-label="Reiter">
      {items.map((item) => (
        <Link key={item.href} href={item.href} className={[styles.tab, item === active ? styles.active : ""].join(" ")}>
          {item.label}
          {item.detail && <span className={styles.detail}>{item.detail}</span>}
          {item.badge && <span className={styles.badge}>{item.badge}</span>}
        </Link>
      ))}
    </nav>
  );
}
