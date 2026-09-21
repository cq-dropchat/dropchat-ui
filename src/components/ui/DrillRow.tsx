import { useId, type ReactNode } from "react";
import { ChevronRight, Lock, type LucideIcon } from "lucide-react";

/**
 * A row that opens a sub-panel.
 *
 * Inside a card it is a row of that card: the name, what is behind the door,
 * and a chevron. It replaces the trigger the drill-down fields used to draw
 * — a full input box, border and 48px and all, for something that is not a
 * field but a door. Two doors in a row looked like two empty inputs, and
 * neither said what was behind them: «Instrucciones / Ninguna».
 *
 * `plain` keeps that old boxed trigger, for the screens that are still a
 * flat column of fields rather than cards.
 */
export default function DrillRow({
  label,
  badge,
  icon: Icon,
  readOnly,
  plain,
  children,
  onClick,
  disabled,
  disabledReason,
  last,
}: {
  label: string;
  /** A chip beside the name: whose this field is, mostly. */
  badge?: ReactNode;
  icon?: LucideIcon;
  /** Drawn as the template's own block: readable, and only readable. */
  readOnly?: boolean;
  /** The boxed trigger, for a form that is not made of cards. */
  plain?: boolean;
  /** The second line: a preview, a count, a row of chips. */
  children?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  disabledReason?: string;
  /** Rounds the bottom corners when it is the last row of its card. */
  last?: boolean;
}) {
  const reasonId = useId();
  const showReason = !!disabled && !!disabledReason;
  const Mark = Icon ?? (readOnly ? Lock : undefined);

  const chrome = plain
    ? "text items-center"
    : `border-border hover:bg-accent min-h-[56px] items-center border-t px-[16px] py-[12px] disabled:hover:bg-transparent ${
        readOnly ? "bg-kraft-veil hover:bg-kraft-veil/70" : ""
      } ${last ? "rounded-b-[17px]" : ""}`;

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={disabled && disabledReason ? disabledReason : undefined}
        aria-describedby={showReason ? reasonId : undefined}
        className={`flex w-full justify-between gap-[12px] text-left disabled:opacity-50 ${chrome}`}
      >
        <span className="flex min-w-0 flex-col gap-[4px]">
          <span className="flex items-center gap-[8px]">
            {Mark && (
              <Mark
                className={`h-[14px] w-[14px] shrink-0 ${readOnly ? "text-kraft-foreground" : "text-muted-foreground"}`}
                aria-hidden
              />
            )}
            <span
              className={plain ? "text-[16px]" : "text-[15px] font-semibold"}
            >
              {label}
            </span>
            {badge}
          </span>
          {children}
        </span>

        <ChevronRight
          className={`h-[20px] w-[20px] shrink-0 self-center ${readOnly ? "text-kraft-foreground" : "text-muted-foreground"}`}
          aria-hidden
        />
      </button>

      {showReason && (
        <span id={reasonId} className="sr-only">
          {disabledReason}
        </span>
      )}
    </>
  );
}

/** The one-line preview under a drill row's name, cut where it stops fitting. */
export function RowPreview({
  children,
  mono,
}: {
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <span
      className={`text-muted-foreground block truncate ${
        mono ? "font-mono text-[12px]" : "text-[13px] leading-[1.45]"
      }`}
    >
      {children}
    </span>
  );
}
