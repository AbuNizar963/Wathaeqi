import { toast as sonnerToast, type ExternalToast } from "sonner";

type ToastOptions = ExternalToast;

function notify(
  type: "success" | "error" | "info" | "warning",
  message: string,
  options?: ToastOptions
) {
  const titles = {
    success: "تم بنجاح",
    error: "حدث خطأ",
    info: "معلومة",
    warning: "تنبيه",
  } as const;

  sonnerToast[type](titles[type], {
    ...options,
    description: message,
  });
}

export const toast = {
  success: (message: string, options?: ToastOptions) =>
    notify("success", message, options),
  error: (message: string, options?: ToastOptions) =>
    notify("error", message, options),
  info: (message: string, options?: ToastOptions) =>
    notify("info", message, options),
  warning: (message: string, options?: ToastOptions) =>
    notify("warning", message, options),
};
