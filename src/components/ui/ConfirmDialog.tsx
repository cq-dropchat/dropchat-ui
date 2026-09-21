import { useEffect, useId, useRef, type ReactNode } from "react";
import Button from "@/components/Button";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * The question before something that cannot be taken back.
 *
 * Retiring a version, archiving a template: both used to happen on the first
 * click, with the consequence written in a grey sentence somewhere else on
 * the page. Here the consequence is the body of the question, and the button
 * says what it does — «Retirar la v3», never «Aceptar».
 *
 * Focus lands on Cancel: the dialog exists because the destructive button is
 * the one nobody should hit by reflex.
 */
export default function ConfirmDialog({
  open,
  title,
  confirmLabel,
  cancelLabel,
  destructive = true,
  loading,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  const { translate: t } = useTranslation();
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-[20px]"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="border-border bg-card flex w-full max-w-[420px] flex-col gap-[14px] rounded-[18px] border p-[18px] shadow-[0_1px_2px_rgba(18,21,26,0.06),0_16px_36px_-14px_rgba(18,21,26,0.28)]"
      >
        <h2 id={titleId} className="text-[17px] font-bold">
          {title}
        </h2>

        {children && (
          <div className="text-secondary-foreground text-[14px] leading-[1.55]">
            {children}
          </div>
        )}

        <div className="flex justify-end gap-[10px]">
          <button
            ref={cancelRef}
            type="button"
            className="secondary"
            onClick={onCancel}
          >
            {cancelLabel || t("Cancelar")}
          </button>

          <Button
            type="button"
            className={destructive ? "destructive" : "primary"}
            loading={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
