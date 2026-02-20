import { toast } from "react-toastify";

type ToastType = "success" | "error" | "info" | "warning";

const titleConfig: Record<ToastType, string> = {
  success: "Success",
  error: "Error",
  info: "Info",
  warning: "Warning",
};

function CustomToastContent({ type, message }: { type: ToastType; message: string }) {
  const label = titleConfig[type];
  return (
    <div>
      <h4 className="font-semibold text-sm text-neutral-950">{label}</h4>
      <p className="text-sm text-neutral-900 mt-0.5">{message}</p>
    </div>
  );
}

export const showToast = {
  success: (message: string) => {
    toast.success(<CustomToastContent type="success" message={message} />, {
      icon: false,
    });
  },
  error: (message: string) => {
    toast.error(<CustomToastContent type="error" message={message} />, {
      icon: false,
    });
  },
  info: (message: string) => {
    toast.info(<CustomToastContent type="info" message={message} />, {
      icon: false,
    });
  },
  warning: (message: string) => {
    toast.warning(<CustomToastContent type="warning" message={message} />, {
      icon: false,
    });
  },
};
