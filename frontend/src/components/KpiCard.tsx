import type { ReactNode } from "react";

interface KpiCardProps {
  /** Card title/label */
  label: string;
  /** Primary value to display */
  value: string | number;
  /** Optional subtitle below value */
  subtitle?: string;
  /** Icon element */
  icon: ReactNode;
  /** Background color class for icon container */
  iconBg?: string;
  /** Top-right header content (badge text or custom control) */
  badge?: ReactNode;
  /** Additional content below the main value */
  children?: ReactNode;
  /** Additional CSS classes */
  className?: string;
}

/** KPI stat card with icon, label, value, and optional subtitle */
export function KpiCard({
  label,
  value,
  subtitle,
  icon,
  iconBg = "bg-primary-100",
  badge,
  children,
  className = "",
}: KpiCardProps) {
  return (
    <div className={`bg-white rounded-xl p-5 border border-neutral-200 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`p-2 ${iconBg} rounded-lg`}>{icon}</div>
          <span className="text-sm font-medium text-neutral-900">{label}</span>
        </div>
        {badge && <div className="text-xs text-neutral-950">{badge}</div>}
      </div>
      {children || (
        <>
          <p className="text-2xl font-bold text-neutral-950">
            {typeof value === "number" ? value.toLocaleString() : value}
          </p>
          {subtitle && <p className="text-xs text-neutral-900 mt-1">{subtitle}</p>}
        </>
      )}
    </div>
  );
}
