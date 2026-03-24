import type { ReactNode } from "react";
import { useTheme } from "../lib/ThemeContext";

export interface DesktopTableColumn {
  label: string;
  /** Header alignment: 'left' (default) | 'center' | 'right' */
  align?: "left" | "center" | "right";
  /** Optional width class, e.g. "w-[22%]" */
  width?: string;
  /** Whether to add whitespace-nowrap to the header */
  nowrap?: boolean;
}

interface DesktopTableProps {
  columns: DesktopTableColumn[];
  children: ReactNode;
  emptyMessage?: string;
  isEmpty?: boolean;
  /** Extra table className (e.g. "table-fixed min-w-175") */
  tableClassName?: string;
}

/**
 * Desktop table wrapper for table-style pages.
 * Hidden on mobile (< md), visible on desktop.
 */
export function DesktopTable({
  columns,
  children,
  emptyMessage = "No items found.",
  isEmpty = false,
  tableClassName = "",
}: DesktopTableProps) {
  const { settings } = useTheme();
  const densityClass =
    settings.tableDensity === "compact"
      ? "table-density-compact"
      : "table-density-comfortable";

  return (
    <div className="hidden md:block">
      <table className={`w-full ${densityClass} ${tableClassName}`.trim()}>
        <thead>
          <tr className="border-b border-neutral-200 bg-neutral-100">
            {columns.map((col, i) => (
              <th
                key={i}
                className={`py-3 px-4 text-sm font-medium text-neutral-950 ${
                  col.nowrap !== false ? "whitespace-nowrap" : ""
                } ${col.width || ""} text-${col.align || "left"}`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>

      {isEmpty && (
        <div className="text-center py-12 text-neutral-900">
          {emptyMessage}
        </div>
      )}
    </div>
  );
}

export interface DesktopTableRowProps {
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}

/**
 * Standard row for DesktopTable with consistent hover and border styles.
 */
export function DesktopTableRow({ onClick, children, className = "" }: DesktopTableRowProps) {
  return (
    <tr
      onClick={onClick}
      className={`border-b border-neutral-200 hover:bg-neutral-100 transition-colors cursor-pointer last:border-b-0 ${className}`.trim()}
    >
      {children}
    </tr>
  );
}
