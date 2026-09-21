import { useId, type ReactNode } from "react";
import Switch from "@/components/Switch";

/**
 * A row of a card that is a yes/no.
 *
 * `note` is for the thing this screen kept getting wrong: a switch that does
 * NOT wait for «Guardar». The entry agent and a template's automatic updates
 * write the moment they are flipped — one because it belongs to the
 * organization, the other because it belongs to the installation — and the
 * only way anybody could know was to notice the form had not become dirty.
 */
export default function SwitchRow({
  label,
  description,
  note,
  checked,
  onCheckedChange,
  disabled,
  disabledReason,
  plain,
  last,
}: {
  label: string;
  description?: ReactNode;
  /** «Se guarda al instante», in the data voice. */
  note?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  disabledReason?: string;
  /** Without the card's rule and padding, for a flat column of fields. */
  plain?: boolean;
  last?: boolean;
}) {
  const id = useId();
  const reasonId = `${id}-reason`;
  const describeId = `${id}-describe`;
  const showReason = !!disabled && !!disabledReason;

  const describedBy =
    [description ? describeId : null, showReason ? reasonId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <label
      title={disabled && disabledReason ? disabledReason : undefined}
      className={`flex items-start justify-between gap-[12px] ${
        plain
          ? ""
          : `border-border border-t px-[16px] py-[12px] ${last ? "rounded-b-[17px]" : ""}`
      } ${disabled ? "opacity-60" : "cursor-pointer"}`}
    >
      <span className="flex min-w-0 flex-col gap-[3px]">
        <span className={plain ? "text-[16px]" : "text-[15px] font-semibold"}>
          {label}
        </span>
        {description && (
          <span
            id={describeId}
            className="text-muted-foreground text-[13px] leading-[1.45]"
          >
            {description}
          </span>
        )}
        {note && (
          <span className="text-kraft-foreground mt-[2px] font-mono text-[11px] font-semibold tracking-[0.08em] uppercase">
            {note}
          </span>
        )}
        {showReason && (
          <span id={reasonId} className="sr-only">
            {disabledReason}
          </span>
        )}
      </span>

      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        // The label wraps the whole row, so without this the switch's
        // accessible name would be the name AND the sentence under it AND
        // «se guarda al instante».
        aria-label={label}
        aria-describedby={describedBy}
        className="mt-[3px] shrink-0"
      />
    </label>
  );
}
