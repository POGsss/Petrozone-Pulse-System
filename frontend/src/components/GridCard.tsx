import type { ReactNode, MouseEvent } from "react";

export interface GridCardAction {
  label: string;
  icon: ReactNode;
  onClick: (e: MouseEvent) => void;
  className?: string;
}

export interface GridCardProps {
  /** Click handler for the entire card (e.g., open view modal) */
  onClick?: () => void;
  /** Icon element rendered in the colored circle */
  icon: ReactNode;
  /** Primary title text */
  title: string;
  /** Subtitle text or element (e.g., code badge) */
  subtitle?: ReactNode;
  /** Status badge config */
  statusBadge?: {
    label: string;
    className: string;
  };
  /** Detail lines rendered in the body */
  details?: ReactNode;
  /** Action buttons in the footer */
  actions?: GridCardAction[];
  /** Extra content rendered in the footer after standard actions */
  extraActions?: ReactNode;
}

/**
 * Reusable grid card component used inside CardGrid.
 * Follows the pattern:
 *   Header (icon + title + status) → Details → Actions footer
 */
export function GridCard({
  onClick,
  icon,
  title,
  subtitle,
  statusBadge,
  details,
  actions,
  extraActions,
}: GridCardProps) {
  const hasFooter = (actions && actions.length > 0) || extraActions;

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl border p-4 border-neutral-200 cursor-pointer hover:bg-neutral-100 transition-colors"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary-100 rounded-lg">{icon}</div>
          <div>
            <h4 className="font-semibold text-neutral-950">{title}</h4>
            {subtitle && (
              typeof subtitle === "string" ? (
                <span className="text-xs font-mono bg-neutral-100 text-primary px-2 py-0.5 rounded">
                  {subtitle}
                </span>
              ) : subtitle
            )}
          </div>
        </div>
        {statusBadge && (
          <span className={`px-2 py-1 rounded text-xs font-medium ${statusBadge.className}`}>
            {statusBadge.label}
          </span>
        )}
      </div>

      {/* Details */}
      {details && (
        <div className="space-y-1 text-sm text-neutral-900 mb-3">
          {details}
        </div>
      )}

      {/* Actions footer */}
      {hasFooter && (
        <div className="flex items-center justify-end gap-4 pt-3 border-t border-neutral-200">
          {actions?.map((action, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); action.onClick(e); }}
              className={action.className || "flex items-center gap-1 text-sm text-primary hover:text-primary-900"}
            >
              {action.icon}
              {action.label}
            </button>
          ))}
          {extraActions}
        </div>
      )}
    </div>
  );
}
