import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * The one sub-panel of the app.
 *
 * A field too big for a 340px column — instructions, a tool, a list of
 * options — opens a panel over the one it came from. Four places wrote that
 * panel by hand (SelectField, TextAreaField, SectionField, ToolsSection and
 * each of its five editors), and the copies had drifted: a 32px back button
 * where the rest of the app has 44, a title with no idea which agent it
 * belongs to, and `bottom-[80px]` — so the panel stopped short and left the
 * footer of the screen BEHIND it showing, with two buttons that acted on
 * something you could no longer see.
 *
 * This one covers the panel whole and carries its own footer, so what is
 * underneath is never half-reachable.
 */
export default function DrillPanel({
  title,
  subtitle,
  action,
  footer,
  onBack,
  backDisabledReason,
  children,
  className,
}: {
  title: string;
  /** What this panel belongs to — the agent's name, usually. */
  subtitle?: string;
  /** A second action in the header: deleting the thing being edited. */
  action?: ReactNode;
  footer?: ReactNode;
  onBack: () => void;
  /** When leaving is refused, why — said out loud, not only in a tooltip. */
  backDisabledReason?: string;
  children: ReactNode;
  /** Replaces the body's own gap and padding, never adds to them. */
  className?: string;
}) {
  const { translate: t } = useTranslation();
  const blocked = !!backDisabledReason;

  return (
    <div className="bg-background absolute inset-0 z-50 flex flex-col">
      <div className="border-border flex shrink-0 items-center gap-[8px] border-b px-[14px] py-[8px]">
        <button
          type="button"
          aria-label={subtitle ? `${t("Volver")} — ${subtitle}` : t("Volver")}
          title={blocked ? `${t("Volver")} - ${backDisabledReason}` : undefined}
          aria-describedby={blocked ? "drill-back-reason" : undefined}
          disabled={blocked}
          onClick={onBack}
          className="hover:bg-muted -ml-[8px] flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <ArrowLeft className="h-[22px] w-[22px]" aria-hidden />
        </button>

        <div className="flex min-w-0 grow flex-col">
          <h2 className="font-display truncate text-[17px] font-bold tracking-[-0.01em] [font-stretch:112%]">
            {title}
          </h2>
          {subtitle && (
            <span className="text-muted-foreground truncate text-[12px]">
              {subtitle}
            </span>
          )}
        </div>

        {action}
      </div>

      {blocked && (
        <span id="drill-back-reason" className="sr-only">
          {backDisabledReason}
        </span>
      )}

      <div
        className={`flex grow flex-col overflow-y-auto [scrollbar-gutter:stable] ${className || "gap-[14px] p-[14px_12px]"}`}
      >
        {children}
      </div>

      {footer && (
        <div className="border-border bg-background flex shrink-0 flex-col gap-[8px] border-t px-[16px] pt-[12px] pb-[16px]">
          {footer}
        </div>
      )}
    </div>
  );
}
