import { useEffect, useState } from "react";

/**
 * Whether a media query matches, kept current as the window changes.
 * For behaviour that differs by screen (a tab bar becoming a select, a dialog
 * becoming a bottom sheet). Pure appearance belongs in CSS instead.
 *
 *   const phone = useMediaQuery("(max-width: 639px)");
 */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : false,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [query]);

  return matches;
}

/** The phone breakpoint from REDESIGN.md §5.1. */
export const PHONE_QUERY = "(max-width: 639px)";
