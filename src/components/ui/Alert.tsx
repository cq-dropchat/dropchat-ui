import {
  AlertTriangle,
  CheckCircle2,
  Info,
  OctagonAlert,
  Package,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { TONE, type Tone } from "./Badge";

const ICON: Record<Tone, LucideIcon> = {
  neutral: Info,
  primary: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  destructive: OctagonAlert,
  kraft: Package,
};

/**
 * A notice inside the page: what happened, and what to do about it.
 *
 * `details` is for the raw text of a failure — the guards in
 * `publish_agent_template_version` raise sentences like «nothing changed
 * since the last published version of ventas-contra-entrega», which is the
 * truth and is also English, lower case and full of slugs. The translated
 * sentence goes in `children`; the original stays one click away instead of
 * being the whole message.
 */
export default function Alert({
  tone = "neutral",
  title,
  icon,
  details,
  children,
  className,
}: {
  tone?: Tone;
  title?: string;
  icon?: LucideIcon;
  details?: string;
  children?: ReactNode;
  className?: string;
}) {
  const { translate: t } = useTranslation();
  const Icon = icon || ICON[tone];
  const alerting = tone === "destructive" || tone === "warning";

  return (
    <div
      role={alerting ? "alert" : "status"}
      className={`flex items-start gap-[10px] rounded-[14px] p-[14px] ${TONE[tone]} ${className || ""}`}
    >
      <Icon className="mt-[1px] h-[20px] w-[20px] shrink-0" aria-hidden />

      <div className="flex min-w-0 flex-col gap-[4px]">
        {title && (
          <span className="text-foreground text-[15px] font-semibold">
            {title}
          </span>
        )}

        {children && (
          <div className="text-secondary-foreground text-[14px] leading-[1.5]">
            {children}
          </div>
        )}

        {details && (
          <details className="mt-[4px] text-[13px]">
            <summary className="cursor-pointer font-semibold">
              {t("Detalle técnico")}
            </summary>
            <code className="text-secondary-foreground mt-[8px] block font-mono text-[12px] leading-[1.5] break-words">
              {details}
            </code>
          </details>
        )}
      </div>
    </div>
  );
}
