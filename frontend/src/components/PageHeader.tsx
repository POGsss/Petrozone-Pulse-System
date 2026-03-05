import { LuPlus } from "react-icons/lu";
import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle: string | ReactNode;
  buttonLabel?: string;
  onAdd?: () => void;
  showButton?: boolean;
  /** Optional custom actions rendered on the right side (replaces the add button when provided) */
  actions?: ReactNode;
}

export function PageHeader({
  title,
  subtitle,
  buttonLabel,
  onAdd,
  showButton = true,
  actions,
}: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between bg-white rounded-xl p-4 border border-neutral-200">
      <div>
        <h3 className="text-lg font-semibold text-neutral-950">{title}</h3>
        {typeof subtitle === "string" ? (
          <p className="text-sm text-neutral-900">{subtitle}</p>
        ) : (
          subtitle
        )}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : (
        showButton && buttonLabel && onAdd && (
          <button
            onClick={onAdd}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-950 transition-colors"
          >
            <LuPlus className="w-4 h-4" />
            {buttonLabel}
          </button>
        )
      )}
    </div>
  );
}
