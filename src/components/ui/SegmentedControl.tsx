/**
 * A choice between two or three ways of doing the same thing, shown in full.
 *
 * It replaces the pattern where a field's emptiness was the choice — «Publicar
 * solo para (ids, separados por coma)», empty meaning everybody. Nobody can
 * read a decision out of an empty input.
 */
export default function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`bg-secondary flex gap-[4px] self-start rounded-full p-[4px] ${className || ""}`}
    >
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`min-h-[40px] rounded-full px-[18px] text-[15px] transition-colors ${
              selected
                ? "bg-card border-border text-foreground border font-semibold"
                : "text-secondary-foreground hover:text-foreground font-medium"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
