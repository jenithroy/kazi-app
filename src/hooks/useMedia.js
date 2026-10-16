import { useEffect, useState } from "react";

/**
 * Whether a CSS media query matches right now, kept up to date as the window or
 * the device changes. Read once on the first render so nothing flashes, then
 * followed. Use it when the *markup* has to differ (render this or that), not
 * just the styling — otherwise a media query in the stylesheet is simpler.
 */
export default function useMedia(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const sync = () => setMatches(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [query]);
  return matches;
}
