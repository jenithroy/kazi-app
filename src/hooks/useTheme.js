import { useCallback, useLayoutEffect, useSyncExternalStore } from "react";

/**
 * Light / dark, remembered between visits.
 *
 * One choice for the whole app, kept in one place so everything that learns to
 * theme itself reads the same answer. The shell (AppLayout) calls `useApplyTheme()`,
 * which keeps `data-theme` on <html> for as long as someone is signed in. The top
 * bar and the Dashboard are written for both themes; every other page still has
 * only its light look and ignores the attribute until it is made ready.
 *
 * Light is the default and stays the default: a person who never touches the
 * switch sees exactly what they saw before.
 */

const KEY = "kazi_theme";
const listeners = new Set();

function read() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    // Private browsing, storage disabled — fall through to light.
  }
  return "light";
}

let current = read();

function emit() { listeners.forEach((fn) => fn()); }
function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function set(next) {
  if (next !== "dark" && next !== "light") return;
  if (next === current) return;
  current = next;
  try { localStorage.setItem(KEY, next); } catch {
    // Not being able to remember the choice is not a reason to refuse it.
  }
  emit();
}

// Two tabs on the same ERP should not disagree about the theme.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    const next = e.newValue === "dark" ? "dark" : "light";
    if (next !== current) { current = next; emit(); }
  });
}

/** The theme and how to change it. */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, () => current, () => "light");
  const toggleTheme = useCallback(() => set(current === "dark" ? "light" : "dark"), []);
  return { theme, isDark: theme === "dark", setTheme: set, toggleTheme };
}

/**
 * Put the theme on <html> for as long as the caller is mounted.
 *
 * A layout effect, so the attribute is on before the first paint and a dark
 * page never flashes light on the way in.
 */
export function useApplyTheme() {
  const { theme } = useTheme();
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    return () => root.removeAttribute("data-theme");
  }, [theme]);
  return theme;
}
