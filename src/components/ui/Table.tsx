import Link from "next/link";
import type { ReactNode } from "react";
import { cssVars } from "@/lib/css";
import { Disclosure } from "./Disclosure";
import styles from "./Table.module.css";

/** Grid tracks shared by several column configurations. */
export const TRACK = {
  fill: "minmax(0, 1fr)",
  status: "150px",
  narrow: "120px",
} as const;

export interface Column<Row> {
  id: string;
  header?: string;
  /** A grid track, e.g. TRACK.fill or "90px". */
  width: string;
  align?: "start" | "end";
  render: (row: Row) => ReactNode;
}

export interface RowDetail {
  /** Stable DOM id for the expandable row, unique on the page. */
  id: string;
  content: ReactNode;
  open: boolean;
  /** URLs mirrored into the address bar when the row opens or closes. */
  openHref?: string;
  closedHref?: string;
}

interface TableProps<Row> {
  columns: readonly Column<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  /** Makes the row a link. Mutually exclusive with rowDetail. */
  rowHref?: (row: Row) => string | undefined;
  /** Makes the row an animated disclosure with the detail underneath, spanning all columns. */
  rowDetail?: (row: Row) => RowDetail;
  showHeader?: boolean;
  density?: "compact" | "regular";
  emptyText?: string;
}

/**
 * Grid-based row list with optional expandable rows. Case list, document list, subfield rows,
 * parcel and encumbrance tables and the draft clause list are all column configurations of it.
 * Rows stay neutral; status is carried by the badge in the row, never by the row background.
 */
export function Table<Row>({ columns, rows, rowKey, rowHref, rowDetail, showHeader = false, density = "regular", emptyText }: TableProps<Row>) {
  const cellClass = (column: Column<Row>) => [styles.cell, column.align === "end" ? styles.end : ""].join(" ");
  const cells = (row: Row) =>
    columns.map((column) => (
      <span key={column.id} className={cellClass(column)} role="cell">
        {column.render(row)}
      </span>
    ));

  return (
    <div className={[styles.table, styles[density]].join(" ")} style={cssVars({ "--table-columns": columns.map((c) => c.width).join(" ") })} role="table">
      {showHeader && (
        <div className={[styles.row, styles.header].join(" ")} role="row">
          {columns.map((column) => (
            <span key={column.id} className={cellClass(column)} role="columnheader">
              {column.header}
            </span>
          ))}
        </div>
      )}
      {rows.length === 0 && emptyText && <div className={styles.empty}>{emptyText}</div>}
      {rows.map((row) => {
        const key = rowKey(row);
        const detail = rowDetail?.(row);
        if (detail) {
          return (
            <Disclosure
              key={key}
              id={detail.id}
              defaultOpen={detail.open}
              openHref={detail.openHref}
              closedHref={detail.closedHref}
              className={styles.group}
              summaryClassName={[styles.row, styles.body, styles.trigger].join(" ")}
              summary={cells(row)}
            >
              <div className={styles.detail}>{detail.content}</div>
            </Disclosure>
          );
        }
        const href = rowHref?.(row);
        const className = [styles.row, styles.body, href ? styles.link : ""].join(" ");
        return (
          <div key={key} className={styles.group}>
            {href ? (
              <Link href={href} className={className} role="row">
                {cells(row)}
              </Link>
            ) : (
              <div className={className} role="row">
                {cells(row)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
