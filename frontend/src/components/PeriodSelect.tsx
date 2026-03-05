import { LuChevronDown } from "react-icons/lu";

interface PeriodSelectProps {
  value: string;
  onChange: (value: string) => void;
  options?: { value: string; label: string }[];
  /** Size variant */
  size?: "sm" | "md";
}

const DEFAULT_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

/** Reusable period selector dropdown (Daily/Weekly/Monthly) */
export function PeriodSelect({
  value,
  onChange,
  options = DEFAULT_OPTIONS,
  size = "sm",
}: PeriodSelectProps) {
  const sizeClasses = size === "sm"
    ? "pl-3 pr-8 py-1.5 text-xs"
    : "pl-3 pr-8 py-2 text-sm";

  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`appearance-none ${sizeClasses} border border-neutral-200 rounded-lg bg-white focus:outline-none focus:border-primary cursor-pointer`}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <LuChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-400 pointer-events-none" />
    </div>
  );
}
