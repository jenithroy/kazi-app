import { cn } from "./utils";

/* ── Toolbar ──────────────────────────────────────────── */
/**
 * A row of controls above the content they act on: search, filters, view
 * switches, secondary actions. It wraps onto more lines rather than scrolling.
 *
 *   <Toolbar label="Filter customers">
 *     <SearchInput … />
 *     <Segmented … />
 *     <ToolbarSpacer />          on wide screens, pushes what follows to the right
 *     <Btn kind="secondary">Export</Btn>
 *   </Toolbar>
 */
export function Toolbar({ children, label, className }) {
  return (
    <div className={cn("k-toolbar", className)} role={label ? "group" : undefined} aria-label={label}>
      {children}
    </div>
  );
}

export function ToolbarSpacer() {
  return <span className="k-toolbar-spacer" aria-hidden="true" />;
}
