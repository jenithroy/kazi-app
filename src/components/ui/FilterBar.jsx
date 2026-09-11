import { useState } from "react";
import { Btn } from "./Btn";
import { Sheet } from "./Dialog";
import { Icons } from "./Icons";
import { PHONE_QUERY, useMediaQuery } from "./useMediaQuery";
import { cn } from "./utils";

/* ── Filter bar ───────────────────────────────────────── */
/**
 * Search plus filters above a list. On a wide screen everything sits in one
 * wrapping row. On a phone the search stays and the filters move into a
 * sheet behind a "Filters" button that says how many are active.
 *
 *   <FilterBar
 *     search={<SearchInput … />}
 *     filters={<>
 *       <Segmented label="Status" … />
 *       <Select … />
 *     </>}
 *     active={activeCount}        // how many filters differ from their default
 *     onClear={resetFilters}      // shown when active > 0
 *     end={<Btn kind="secondary">Export</Btn>}
 *   />
 */
export function FilterBar({ search, filters, active = 0, onClear, end, label = "Filters", className }) {
  const phone = useMediaQuery(PHONE_QUERY);
  const [open, setOpen] = useState(false);

  if (!phone) {
    return (
      <div className={cn("k-toolbar", "k-filterbar", className)} role="group" aria-label={label}>
        {search}
        {filters}
        {active > 0 && onClear && (
          <Btn kind="ghost" size="sm" icon={<Icons.X size={13} />} onClick={onClear}>Clear filters</Btn>
        )}
        {end && <span className="k-toolbar-spacer" aria-hidden="true" />}
        {end}
      </div>
    );
  }

  return (
    <div className={cn("k-toolbar", "k-filterbar", "k-filterbar--phone", className)} role="group" aria-label={label}>
      {search}
      <div className="k-filterbar-row">
        {filters && (
          <Btn kind="secondary" icon={<Icons.Filter size={14} />} onClick={() => setOpen(true)} aria-haspopup="dialog">
            {active > 0 ? `Filters · ${active}` : "Filters"}
          </Btn>
        )}
        {end}
      </div>
      {filters && (
        <Sheet
          open={open}
          onClose={() => setOpen(false)}
          title={label}
          footer={
            <>
              {onClear && (
                <Btn kind="ghost" disabled={active === 0} onClick={onClear}>Clear filters</Btn>
              )}
              <Btn kind="primary" onClick={() => setOpen(false)}>Done</Btn>
            </>
          }
        >
          <div className="k-filterbar-sheet">{filters}</div>
        </Sheet>
      )}
    </div>
  );
}
