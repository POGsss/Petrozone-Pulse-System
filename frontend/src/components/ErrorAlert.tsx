import { LuCircleAlert } from "react-icons/lu";

interface ErrorAlertProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorAlert({ message, onRetry }: ErrorAlertProps) {
  return (
    <div className="bg-negative-200 border border-negative rounded-lg p-4 flex items-center gap-3">
      <LuCircleAlert className="w-5 h-5 text-negative-950 shrink-0" />
      <div>
        <p className="text-sm text-negative-950">{message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="text-sm text-negative-900 hover:underline mt-1"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
