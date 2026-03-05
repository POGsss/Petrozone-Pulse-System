import type { ReactNode } from "react";
import { DashboardCard } from "./DashboardCard";

interface ChartCardProps {
  /** Chart title */
  title: string;
  /** Actions rendered top-right (e.g., PeriodSelect, date label) */
  actions?: ReactNode;
  /** Chart content or empty state */
  children: ReactNode;
  /** Additional CSS classes */
  className?: string;
}

/** Card wrapper for chart sections with a title and optional actions header */
export function ChartCard({ title, actions, children, className = "" }: ChartCardProps) {
  return (
    <DashboardCard className={className}>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <h4 className="text-sm font-semibold text-neutral-950">{title}</h4>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </DashboardCard>
  );
}
