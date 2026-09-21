import { useEffect } from "react";
import { CheckCircle2, Info, OctagonAlert, X } from "lucide-react";
import useToasts, { type Toast } from "@/stores/useToasts";
import { useTranslation } from "@/hooks/useTranslation";

const ICON = {
  success: CheckCircle2,
  destructive: OctagonAlert,
  neutral: Info,
} as const;

const EDGE = {
  success: "border-l-success",
  destructive: "border-l-destructive",
  neutral: "border-l-primary",
} as const;

/** How long a notice stays before it takes itself away. */
const LINGER = 6000;

function Notice({ toast }: { toast: Toast }) {
  const { translate: t } = useTranslation();
  const dismiss = useToasts((state) => state.dismiss);
  const Icon = ICON[toast.tone];

  useEffect(() => {
    const timer = setTimeout(() => dismiss(toast.id), LINGER);
    return () => clearTimeout(timer);
  }, [toast.id, dismiss]);

  return (
    <div
      role={toast.tone === "destructive" ? "alert" : "status"}
      className={`border-border bg-card flex w-[340px] items-start gap-[12px] rounded-[14px] border border-l-[4px] p-[14px] shadow-[0_1px_2px_rgba(18,21,26,0.06),0_16px_36px_-14px_rgba(18,21,26,0.28)] ${EDGE[toast.tone]}`}
    >
      <Icon
        className={`mt-[1px] h-[20px] w-[20px] shrink-0 ${
          toast.tone === "success"
            ? "text-success"
            : toast.tone === "destructive"
              ? "text-destructive"
              : "text-primary"
        }`}
        aria-hidden
      />

      <div className="flex min-w-0 grow flex-col gap-[4px]">
        <span className="text-[15px] font-semibold">{toast.title}</span>
        {toast.description && (
          <span className="text-muted-foreground text-[13px] leading-[1.45]">
            {toast.description}
          </span>
        )}
      </div>

      <button
        type="button"
        aria-label={t("Cerrar aviso")}
        onClick={() => dismiss(toast.id)}
        className="text-muted-foreground hover:bg-accent flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full"
      >
        <X className="h-[16px] w-[16px]" aria-hidden />
      </button>
    </div>
  );
}

/** Mounted once, at the root: every notice in the app comes out here. */
export default function Toaster() {
  const toasts = useToasts((state) => state.toasts);

  if (!toasts.length) return null;

  return (
    <div className="pointer-events-none fixed right-[16px] bottom-[16px] z-50 flex flex-col-reverse gap-[10px]">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <Notice toast={toast} />
        </div>
      ))}
    </div>
  );
}
