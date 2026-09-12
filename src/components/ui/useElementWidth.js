import { useLayoutEffect, useState } from "react";

/**
 * The measured width of an element, kept current as it resizes.
 *
 * Kit components lay themselves out by their own width rather than the
 * screen's, so a table or a board inside a narrow sheet behaves the way it
 * would on a phone. Returns null until the first measurement.
 */
export function useElementWidth(ref) {
  const [width, setWidth] = useState(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setWidth(el.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}
