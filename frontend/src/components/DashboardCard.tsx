import type { ReactNode } from "react";

interface DashboardCardProps {
  /** Additional CSS classes */
  className?: string;
  /** Card content */
  children: ReactNode;
}

/** Basic white card wrapper used across the dashboard */
export function DashboardCard({ className = "", children }: DashboardCardProps) {
  return (
    <div className={`bg-white rounded-xl p-5 border border-neutral-200 ${className}`}>
      {children}
    </div>
  );
}
