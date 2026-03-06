import type { ReactNode } from "react";

interface CardGridProps {
  children: ReactNode;
  emptyMessage?: string;
  isEmpty?: boolean;
  /** Grid column config (default: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3") */
  columns?: string;
}

/**
 * Responsive card grid used for grid-style pages.
 * Adapts from 1 column on mobile → 2 on tablet → 3 on desktop.
 */
export function CardGrid({
  children,
  emptyMessage = "No items found.",
  isEmpty = false,
  columns = "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
}: CardGridProps) {
  return (
    <div className={`grid ${columns} gap-4`}>
      {children}
      {isEmpty && (
        <div className="col-span-full text-center py-12 text-neutral-900">
          {emptyMessage}
        </div>
      )}
    </div>
  );
}
