import { useEffect, useMemo, useRef, useState } from "react";

export interface SearchableSelectOption {
  value: string;
  label: string;
  description?: string;
  keywords?: string[];
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  maxResults?: number;
  noResultsText?: string;
  inputClassName?: string;
  clearSelectionOnType?: boolean;
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Search...",
  disabled = false,
  maxResults = 10,
  noResultsText = "No results found",
  inputClassName = "",
  clearSelectionOnType = true,
}: SearchableSelectProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value) || null,
    [options, value]
  );

  useEffect(() => {
    setQuery(selectedOption?.label || "");
  }, [selectedOption]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const visibleOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return options;
    }

    return options
      .filter((opt) => {
        const base = `${opt.label} ${opt.description || ""}`.toLowerCase();
        const keywords = (opt.keywords || []).join(" ").toLowerCase();
        return base.includes(normalized) || keywords.includes(normalized);
      })
      .slice(0, maxResults);
  }, [options, query, maxResults]);

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          const next = e.target.value;
          setQuery(next);
          setIsOpen(true);

          if (
            clearSelectionOnType &&
            selectedOption &&
            next.trim().toLowerCase() !== selectedOption.label.toLowerCase()
          ) {
            onChange("");
          }
        }}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 placeholder:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary transition-all ${disabled ? "cursor-default" : ""} ${inputClassName}`}
      />

      {isOpen && !disabled && (
        <div className="absolute z-40 mt-2 w-full max-h-[280px] overflow-y-auto bg-white border border-neutral-200 rounded-xl">
          {visibleOptions.length === 0 ? (
            <p className="px-4 py-3 text-sm text-neutral-900">{noResultsText}</p>
          ) : (
            visibleOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setQuery(opt.label);
                  setIsOpen(false);
                }}
                className="w-full text-left px-4 py-2.5 hover:bg-neutral-100 transition-colors"
              >
                <p className="text-sm font-semibold text-neutral-950">{opt.label}</p>
                {opt.description && (
                  <p className="text-xs text-neutral-900">{opt.description}</p>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
