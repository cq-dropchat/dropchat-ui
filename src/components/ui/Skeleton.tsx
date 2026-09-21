/**
 * The shape of what is coming.
 *
 * A list that is loading and a list that is empty used to look the same —
 * nothing — so «todavía no hay plantillas» was indistinguishable from «no
 * llegaron todavía». The skeleton says which one it is before the answer
 * arrives.
 */
export default function Skeleton({
  width,
  height = 14,
  className,
}: {
  width: number | string;
  height?: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      style={{ width, height }}
      className={`bg-secondary animate-pulse rounded-full ${className || ""}`}
    />
  );
}
