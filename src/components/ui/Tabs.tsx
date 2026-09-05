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
  const active = [...items].sort((a, b) => b.href.length - a.href.length).find((item) => pathname.startsWith(item.href));
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
