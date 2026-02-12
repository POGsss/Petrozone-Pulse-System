import { LuSearch, LuFilter, LuX } from "react-icons/lu";
import { useState, useRef, useEffect } from "react";

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterGroup {
  key: string;
  label: string;
  options: FilterOption[];
}

interface SearchFilterProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters?: FilterGroup[];
  activeFilters?: Record<string, string>;
  onFilterChange?: (key: string, value: string) => void;
}

export function SearchFilter({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search...",
  filters = [],
  activeFilters = {},
  onFilterChange,
}: SearchFilterProps) {
  const [showFilters, setShowFilters] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  const activeFilterCount = Object.values(activeFilters).filter(
    (v) => v && v !== "all"
  ).length;

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setShowFilters(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function clearFilters() {
    if (onFilterChange) {
      filters.forEach((f) => onFilterChange(f.key, "all"));
    }
  }

  return (
    <div className="flex items-center gap-2 bg-white rounded-xl p-4 border border-neutral-200">
      {/* Search input */}
      <div className="relative flex-1">
        <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 pr-4 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:border-primary w-full sm:w-64"
        />
      </div>

      {/* Filter button + dropdown */}
      {filters.length > 0 && (
        <div className="relative" ref={filterRef}>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeFilterCount > 0
                ? "bg-primary-100 text-primary border border-primary"
                : "text-neutral-950 border border-neutral-200 hover:bg-neutral-100"
            }`}
          >
            <LuFilter className="w-4 h-4" />
            <span className="hidden sm:inline">Filter</span>
            {activeFilterCount > 0 && (
              <span className="bg-primary text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>

          {showFilters && (
            <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-neutral-200 rounded-xl z-20 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-neutral-950">Filters</span>
                {activeFilterCount > 0 && (
                  <button
                    onClick={clearFilters}
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <LuX className="w-3 h-3" />
                    Clear all
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {filters.map((group) => (
                  <div key={group.key}>
                    <label className="block text-xs font-medium text-neutral-900 mb-1">
                      {group.label}
                    </label>
                    <select
                      value={activeFilters[group.key] || "all"}
                      onChange={(e) =>
                        onFilterChange?.(group.key, e.target.value)
                      }
                      className="appearance-none w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:border-primary"
                    >
                      <option value="all">All</option>
                      {group.options.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
