import type { LucideIcon } from "lucide-react";

export type Tone =
  | "neutral"
  | "primary"
  | "success"
  | "warning"
  | "destructive"
  | "kraft";

/**
 * The tone table the whole UI shares: a veil to sit on, and a text colour
 * that reaches AA on it in both themes. Every use carries a word, and most
 * carry an icon too — the brandbook's rule is that colour is never the only
 * thing saying what a state is.
 */
export const TONE: Record<Tone, string> = {
  neutral: "bg-secondary text-secondary-foreground",
  primary: "bg-primary-veil text-primary",
  success: "bg-success-veil text-success",
  warning: "bg-warning-veil text-warning",
  destructive: "bg-destructive-veil text-destructive",
  kraft: "bg-kraft-veil text-kraft-foreground",
};

export default function Badge({
  tone = "neutral",
  icon: Icon,
  children,
  className,
}: {
  tone?: Tone;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-[6px] rounded-full px-[10px] py-[4px] text-[12px] font-semibold ${TONE[tone]} ${className || ""}`}
    >
      {Icon && <Icon className="h-[13px] w-[13px] shrink-0" aria-hidden />}
      {children}
    </span>
  );
}
