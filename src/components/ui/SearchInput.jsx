import { useRef } from "react";
import { Icons } from "./Icons";
import { cn } from "./utils";

/* ── Search input ─────────────────────────────────────── */
/**
 * A search box: an icon, the input, and a clear button once there is text.
 *
 *   value, onChange  controlled; onChange receives the new text, not the event
 *   label            the accessible name ("Search customers"), and the
 *                    placeholder unless `placeholder` is given
 *   size             sm | md
 *   block            stretch to the width of the container
 *   inputProps       anything else for the <input> (data-role, onBlur, …)
 *
 * Escape clears the text and keeps focus in the box. It only stops Escape from
 * reaching an enclosing dialog when there was text to clear.
 */
export function SearchInput({ value, onChange, label = "Search", placeholder, size = "md", block = false, autoFocus, className, inputProps }) {
  const inputRef = useRef(null);

  const clear = () => {
    onChange("");
    inputRef.current?.focus();
  };

  return (
    <div className={cn("k-search", `k-search--${size}`, block && "k-search--block", className)}>
      <Icons.Search size={size === "sm" ? 14 : 15} aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.preventDefault();
            e.stopPropagation();
            onChange("");
          }
        }}
        placeholder={placeholder ?? label}
        aria-label={label}
        autoFocus={autoFocus}
        {...inputProps}
      />
      {value ? (
        <button type="button" className="k-search-clear" onClick={clear} aria-label="Clear search">
          <Icons.X size={13} sw={2} />
        </button>
      ) : null}
    </div>
  );
}
