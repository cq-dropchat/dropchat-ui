import { type RefObject, useEffect, useState } from "react";

/**
 * F21: whether the element is in (or near) the viewport. Media starts its
 * automatic download here instead of on mount. Once seen, it stays true:
 * scrolling away does not cancel a download.
 */
export function useInView(
  ref: RefObject<Element | null>,
  rootMargin = "200px",
) {
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (seen || !element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(element);

    return () => observer.disconnect();
  }, [ref, rootMargin, seen]);

  return seen;
}
