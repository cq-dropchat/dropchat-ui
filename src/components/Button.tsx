import {
  useId,
  type ButtonHTMLAttributes,
  type DetailedHTMLProps,
} from "react";
import Spinner from "./Spinner";

type ButtonProps = DetailedHTMLProps<
  ButtonHTMLAttributes<HTMLButtonElement>,
  HTMLButtonElement
> & {
  loading?: boolean;
  disabledReason?: string;
  invalid?: boolean;
};

/**
 * The app's button.
 *
 * Two things changed with the form redesign:
 *
 * - The spinner no longer takes up space. It used to be drawn twice,
 *   invisible, one on each side, so the label stayed centred while loading —
 *   which meant every button carried ~28px of accidental padding and the pill
 *   classes could not own their own shape. It now sits on top of the label,
 *   so the width never moves and `.primary` / `.secondary` / `.destructive`
 *   decide the padding.
 * - `disabledReason` is no longer only a tooltip. A disabled button is
 *   precisely the one a pointer cannot hover to ask why, so the reason is
 *   also in the accessibility tree, tied to the button.
 */
export default function Button({
  loading,
  disabledReason,
  disabled,
  invalid,
  children,
  className,
  title,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || invalid || loading;
  const reasonId = useId();
  const showReason = isDisabled && !!disabledReason;

  const tooltip =
    isDisabled && disabledReason
      ? title
        ? `${title} - ${disabledReason}`
        : disabledReason
      : title;

  return (
    <>
      <button
        {...props}
        disabled={isDisabled}
        title={tooltip}
        aria-busy={loading || undefined}
        aria-describedby={showReason ? reasonId : props["aria-describedby"]}
        className={`${className || ""} relative flex items-center justify-center gap-2 disabled:opacity-50`}
      >
        {loading && <Spinner className="absolute" />}
        <span
          className={`flex items-center justify-center gap-2 ${loading ? "invisible" : ""}`}
        >
          {children}
        </span>
      </button>
      {showReason && (
        <span id={reasonId} className="sr-only">
          {disabledReason}
        </span>
      )}
    </>
  );
}
