import { useId } from "react";

/**
 * A choice between two or three ways of doing the same thing, shown in full.
 *
 * It replaces the pattern where a field's emptiness was the choice — «Publicar
 * solo para (ids, separados por coma)», empty meaning everybody. Nobody can
 * read a decision out of an empty input. It also replaces a drill-down for
 * three words: a door you walk through to pick between «Activo», «Borrador» e
 * «Inactivo» is a door for nothing.
 */
export default function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  disabledReason,
  className,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
  disabledReason?: string;
  className?: string;
}) {
  const reasonId = useId();
  const showReason = !!disabled && !!disabledReason;

  return (
    <div
      role="group"
      aria-label={label}
      aria-describedby={showReason ? reasonId : undefined}
      title={disabled && disabledReason ? disabledReason : undefined}
      className={`bg-secondary flex gap-[4px] rounded-full p-[4px] ${disabled ? "opacity-60" : ""} ${className || ""}`}
    >
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`min-h-[44px] grow rounded-full px-[18px] text-[15px] transition-colors ${
              selected
                ? "bg-card border-border text-foreground border font-semibold"
                : "text-secondary-foreground hover:text-foreground font-medium"
            }`}
          >
            {option.label}
          </button>
        );
      })}

      {showReason && (
        <span id={reasonId} className="sr-only">
          {disabledReason}
        </span>
      )}
    </div>
  );
}
