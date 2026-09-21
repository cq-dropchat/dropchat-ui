import type { ReactNode } from "react";

/**
 * A row of a list panel: an icon, what it is, and one line about it.
 *
 * A row that does something is a real `<button>`. It used to be a `<div>`
 * with an `onClick`, which Tab skips and a screen reader announces as
 * nothing — so half the app's navigation only existed for a mouse. A row
 * with no `onClick` stays a plain box.
 */
export default function SectionItem({
  title,
  description,
  aside,
  onClick,
  className,
  disabled,
  disabledReason,
}: {
  title: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const isDisabled = disabled;
  const tooltip =
    typeof title === "string"
      ? title + (isDisabled ? " - " + disabledReason : "")
      : undefined;

  const classes =
    `h-[72px] w-full flex text-left rounded-xl group ${className || ""} ` +
    (onClick && !isDisabled ? " cursor-pointer hover:bg-accent" : "") +
    (isDisabled ? " opacity-50 grayscale" : "");

  const content = (
    <>
      {/* Left Pane: Avatar/Icon */}
      <div className="flex items-center pr-[15px] pl-[10px]">{aside}</div>

      {/* Right Pane: Content */}
      <div className="flex min-w-0 grow flex-col justify-center pr-[15px]">
        {/* Upper Row: Title */}
        <div className="flex items-baseline justify-between">
          <div className="text-foreground truncate text-[16px]">{title}</div>
        </div>

        {/* Lower Row: Description */}
        {description && (
          <div className="mt-[2px] flex items-start justify-between">
            <div className="text-muted-foreground flex w-full min-w-0 items-start truncate text-[14px]">
              {description}
            </div>
          </div>
        )}
      </div>
    </>
  );

  if (!onClick) {
    return (
      <div title={tooltip} className={classes}>
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      title={tooltip}
      disabled={isDisabled}
      aria-disabled={isDisabled || undefined}
      className={classes}
      onClick={isDisabled ? undefined : onClick}
    >
      {content}
    </button>
  );
}
