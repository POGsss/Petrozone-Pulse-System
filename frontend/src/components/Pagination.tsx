import { LuChevronLeft, LuChevronRight } from "react-icons/lu";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** "table" renders inline (inside table wrapper), "card" renders as standalone card */
  variant?: "table" | "card";
  /** Total filtered items — used for range display in table variant */
  totalItems?: number;
  /** Items per page — used for range display in table variant */
  itemsPerPage?: number;
  /** Entity name for range text, e.g. "items", "orders" */
  entityName?: string;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  variant = "table",
  totalItems,
  itemsPerPage,
  entityName = "items",
}: PaginationProps) {
  if (variant === "table" && totalItems && itemsPerPage) {
    // Table variant: show range text + nav
    if (totalItems <= itemsPerPage) return null;
  } else {
    if (totalPages <= 1) return null;
  }

  const wrapperClass =
    variant === "card"
      ? "flex flex-row items-center justify-between gap-4 bg-white rounded-xl p-4 border border-neutral-200"
      : "flex flex-row border-t border-neutral-200 items-center justify-between gap-4 p-4";

  const infoText =
    variant === "card" ? (
      <p className="text-sm text-neutral-900">
        Page {currentPage} of {totalPages}
      </p>
    ) : totalItems && itemsPerPage ? (
      <p className="text-sm text-neutral-900">
        {(currentPage - 1) * itemsPerPage + 1}-
        {Math.min(currentPage * itemsPerPage, totalItems)} of {totalItems}{" "}
        {entityName}
      </p>
    ) : (
      <p className="text-sm text-neutral-900">
        Page {currentPage} of {totalPages}
      </p>
    );

  return (
    <div className={wrapperClass}>
      {infoText}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="p-2 border border-neutral-200 rounded-lg text-neutral-900 hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <LuChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm text-neutral-900 px-2">
          {currentPage} of {totalPages}
        </span>
        <button
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="p-2 border border-neutral-200 rounded-lg text-neutral-900 hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <LuChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
