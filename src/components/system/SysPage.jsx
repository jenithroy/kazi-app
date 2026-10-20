/**
 * The frame four of the System pages are drawn in: Admin, Usage & Activity, Bug Report and Changelog (Roles & Duties was redone as a
 * page of its own and no longer uses it).
 *
 * These pages kept their layout; only their skin changed, to the Dashboard's frosted glass (light and dark). So the page
 * itself is untouched, and this wraps it from the route table (App.jsx). The wrapper is a `.kb` (the glass kit: the
 * soft light behind the page, the slim scroll bars, the dark tokens) and a `.sys` (system.css), which is `display: contents`:
 * it is not a box, so the page is laid out exactly as if it were not here.
 *
 * `useReveal` is the light that follows the pointer across the panes. `PANES` names them; the same list is in system.css.
 * When one of these pages is properly redone, take its <SysPage> out of App.jsx and delete its rules in system.css.
 */
import { useRef } from "react";
import { useReveal } from "../../hooks/useReveal";
import "../bento/bento.css";
import "./system.css";

/** The cards the old pages drew with a white fill. They are the panes of glass. */
const PANES = [
  ".kap-stats", ".kap-editor", ".kap-rail", ".kap-panel-top", ".kap-card",   // Admin
  ".kazi-card", ".kkpi",                                                     // Usage & Activity
  ".kbug-card", ".kchg-card",                                                // Bug Report, Changelog
].join(", ");

export default function SysPage({ children }) {
  const frame = useRef(null);
  useReveal(() => frame.current?.querySelectorAll(PANES));
  return <div ref={frame} className="kb sys">{children}</div>;
}
