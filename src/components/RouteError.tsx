import { useEffect } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { reportError } from "@/errors/report";

/**
 * F04. Route-level fallback (`errorComponent` on the root and `_auth`
 * routes): the shell survives a throw in a route's component tree, and the
 * person gets a way back that is not "close the tab".
 */
export default function RouteError({ error }: { error: unknown }) {
  const { translate: t } = useTranslation();
  const message = error instanceof Error ? error.message : String(error);

  // E1. TanStack Router renders this instead of the crashed route; there is no
  // componentDidCatch to hang the report on, so it goes in an effect keyed by
  // the error — one report per distinct failure, not one per re-render.
  useEffect(() => {
    reportError(error, { boundary: "RouteError" });
  }, [error]);

  return (
    <div
      role="alert"
      className="flex flex-col gap-4 items-center justify-center h-dvh w-full bg-background text-foreground p-6"
    >
      <div className="text-[18px] font-semibold">{t("Algo salió mal")}</div>
      <pre className="text-[12px] text-muted-foreground max-w-[600px] whitespace-pre-wrap break-words">
        {message}
      </pre>
      <button
        type="button"
        className="primary"
        onClick={() => window.location.reload()}
      >
        {t("Recargar")}
      </button>
    </div>
  );
}
