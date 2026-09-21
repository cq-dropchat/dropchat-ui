import { useId, type ReactNode } from "react";

interface FieldRenderProps {
  id: string;
  "aria-describedby": string | undefined;
  "aria-invalid": true | undefined;
}

/**
 * One form field: its name, what the name cannot say, the control, and what
 * went wrong with it.
 *
 * The wiring is the point. Before this, help lived in a `title` attribute —
 * invisible on a touch screen and skipped by a screen reader — and an error
 * was a red div beside the input with nothing tying the two together. Here
 * the hint and the error are both in `aria-describedby`, so whoever reads the
 * control hears them; `aria-invalid` is what turns the border red, so the
 * colour is never the only signal.
 *
 * The control comes in as a function because only the caller knows whether it
 * is an input, a textarea, a select or something of its own — it just has to
 * spread what it is given.
 */
export default function Field({
  label,
  hint,
  error,
  count,
  optional,
  className,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  /** Shown as «used/max», in the data voice, red once it is over. */
  count?: { value: number; max: number };
  optional?: string;
  className?: string;
  children: (props: FieldRenderProps) => ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className={`flex flex-col gap-[6px] ${className || ""}`}>
      <label htmlFor={id} className="label mb-0">
        {label}
        {optional && (
          <span className="text-muted-foreground font-normal">
            {" "}
            ({optional})
          </span>
        )}
      </label>

      {hint && (
        <span id={hintId} className="hint">
          {hint}
        </span>
      )}

      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
      })}

      {(error || count) && (
        <div className="flex items-start justify-between gap-[12px]">
          {error ? (
            <span
              id={errorId}
              role="alert"
              className="text-destructive flex items-center gap-[6px] text-[13px]"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                className="shrink-0"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v4.5" />
                <path d="M12 16h.01" />
              </svg>
              {error}
            </span>
          ) : (
            <span />
          )}

          {count && (
            <span
              className={`shrink-0 font-mono text-[12px] tabular-nums ${
                count.value > count.max
                  ? "text-destructive"
                  : "text-muted-foreground"
              }`}
            >
              {count.value}/{count.max}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
