import type { ReactNode } from "react";

interface MobileCardListProps {
  children: ReactNode;
  emptyMessage?: string;
  isEmpty?: boolean;
  /** Use grid layout inside the mobile view (default: true) */
  grid?: boolean;
}

/**
 * Wrapper for mobile card views in table-style pages.
 * Visible on mobile (< md), hidden on desktop.
 */
export function MobileCardList({
  children,
  emptyMessage = "No items found.",
  isEmpty = false,
  grid = true,
}: MobileCardListProps) {
  return (
    <div className="md:hidden p-4">
      {grid ? (
        <div className="grid grid-cols-1 gap-4">
          {children}
          {isEmpty && (
            <div className="col-span-full text-center py-12 text-neutral-900">
              {emptyMessage}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {children}
          {isEmpty && (
            <div className="text-center py-8 text-neutral-900">
              {emptyMessage}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
