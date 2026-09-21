import type { ReactNode } from "react";

/**
 * The surface a group of fields or rows sits on: `--card` over `--background`,
 * separated with a border and never a shadow (the brandbook keeps its one
 * elevation for things that float).
 *
 * `title` and `action` make the card's head; `footer` is the quiet band at the
 * bottom for the sentence that explains the rows above it.
 */
export default function Card({
  title,
  action,
  footer,
  padded = true,
  className,
  children,
}: {
  title?: string;
  action?: ReactNode;
  footer?: ReactNode;
  /** Off when the children are full-width rows that draw their own padding. */
  padded?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <section
      className={`border-border bg-card flex flex-col rounded-[18px] border ${className || ""}`}
    >
      {(title || action) && (
        <div
          className={`flex items-center justify-between gap-[16px] px-[20px] pt-[18px] ${padded ? "" : "pb-[12px]"}`}
        >
          {title && <h2 className="section-title">{title}</h2>}
          {action}
        </div>
      )}

      {children && (
        <div
          className={
            padded ? "flex flex-col gap-[18px] p-[20px]" : "flex flex-col"
          }
        >
          {children}
        </div>
      )}

      {footer && (
        <div className="border-border bg-secondary flex items-start gap-[10px] rounded-b-[17px] border-t px-[20px] py-[12px]">
          {footer}
        </div>
      )}
    </section>
  );
}
