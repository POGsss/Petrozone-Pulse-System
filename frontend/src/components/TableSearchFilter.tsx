import { useState } from "react";
import { LuSearch, LuFilter, LuRefreshCw } from "react-icons/lu";

export interface TableFilter {
  key: string;
  label: string;
  value: string;
  /** "select" (default) renders a dropdown, "date" renders a date picker */
  type?: "select" | "date";
  /** Options for select type filters */
  options?: { value: string; label: string }[];
  onChange: (value: string) => void;
}

interface TableSearchFilterProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  /** The primary filter shown inline next to search (e.g., Status) */
  primaryFilter?: TableFilter;
  /** Additional filters shown in the expandable panel */
  advancedFilters?: TableFilter[];
  onApply?: () => void;
  onReset?: () => void;
  onRefresh?: () => void;
  loading?: boolean;
}

export function TableSearchFilter({
  searchQuery,
  onSearchChange,
  searchPlaceholder = "Search",
  primaryFilter,
  advancedFilters = [],
  onApply,
  onReset,
  onRefresh,
  loading = false,
}: TableSearchFilterProps) {
  const [showFilters, setShowFilters] = useState(false);

  return (
    <div className="p-4 border-b border-neutral-200 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-900" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 pr-4 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:border-primary w-full sm:w-64"
          />
        </div>
        <div className="flex items-center gap-2">
          {/* Primary filter */}
          {primaryFilter && (
            <select
              value={primaryFilter.value}
              onChange={(e) => primaryFilter.onChange(e.target.value)}
              className="appearance-none px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            >
              {primaryFilter.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}
          {/* Filter toggle */}
          {advancedFilters.length > 0 && (
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium transition-colors ${
                showFilters
                  ? "border-primary bg-primary-100 text-primary"
                  : "border-neutral-200 text-neutral-950 hover:bg-neutral-100"
              }`}
            >
              <LuFilter className="w-4 h-4" />
              <span className="hidden sm:inline">Filters</span>
            </button>
          )}
          {/* Refresh */}
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={loading}
              className="p-2 border border-neutral-200 rounded-lg text-neutral-950 hover:bg-neutral-100 disabled:opacity-100"
              title="Refresh"
            >
              <LuRefreshCw
                className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
              />
            </button>
          )}
        </div>
      </div>

      {/* Advanced Filters (expandable) */}
      {showFilters && advancedFilters.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-4">
          {advancedFilters.map((filter) => (
            <div key={filter.key} className="flex-1">
              <label className="block text-xs text-neutral-900 mb-1">
                {filter.label}
              </label>
              {filter.type === "date" ? (
                <input
                  type="date"
                  value={filter.value}
                  onChange={(e) => filter.onChange(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                />
              ) : (
                <select
                  value={filter.value}
                  onChange={(e) => filter.onChange(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  {filter.options?.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ))}
          <div className="flex items-end gap-2">
            {onApply && (
              <button
                onClick={onApply}
                className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-950 transition-colors"
              >
                Apply
              </button>
            )}
            {onReset && (
              <button
                onClick={onReset}
                className="px-4 py-2 border border-neutral-200 rounded-lg text-sm font-medium text-neutral-950 hover:bg-neutral-100 transition-colors"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
