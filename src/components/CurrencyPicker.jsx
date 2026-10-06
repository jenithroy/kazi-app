import { useEffect, useMemo, useRef, useState } from "react";
import { useCurrency } from "../context/CurrencyContext";
import { COMMON_CURRENCIES, currencySymbol } from "../utils/currency";

/**
 * The header's currency picker: one button showing the current currency, opening a
 * searchable list of every currency we hold a rate for. Choosing one switches the whole
 * app's display (see CurrencyContext). Search matches the code or the name, so "dollar"
 * and "usd" both find US Dollar.
 */
export function CurrencyPicker({ className = "" }) {
  const { currency, currencies, currencyName, setCurrency, ratesLive, ratesUpdatedAt } = useCurrency();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef(null);
  const input = useRef(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return currencies;
    return currencies.filter((c) => c.toLowerCase().includes(q) || currencyName(c).toLowerCase().includes(q));
  }, [query, currencies, currencyName]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (root.current && !root.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("touchstart", onDown); };
  }, [open]);

  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => { setActive(0); }, [query]);

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector(".kcur-item--active")?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function choose(code) {
    setCurrency(code);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e) {
    if (e.key === "Escape") { setOpen(false); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, matches.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (matches[active]) choose(matches[active]); }
  }

  const lastCommon = !query ? COMMON_CURRENCIES.filter((c) => currencies.includes(c)).length - 1 : -1;
  const asOf = ratesUpdatedAt
    ? new Date(ratesUpdatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className={`kcur ${className}`} ref={root}>
      <button
        type="button"
        className={`kcur-btn${currency !== "NPR" ? " kcur-btn--on" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Show every amount in another currency"
      >
        <span className="kcur-sym">{currencySymbol(currency)}</span>
        <span>{currency}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>

      {open && (
        <div className="kcur-pop" role="dialog" aria-label="Choose a currency" onKeyDown={onKeyDown}>
          <input
            ref={input}
            className="kcur-search"
            placeholder="Search currency — code or name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search currencies"
            autoComplete="off"
            spellCheck={false}
          />
          <ul className="kcur-list" role="listbox">
            {matches.length === 0 && <li className="kcur-empty">No currency matches “{query}”.</li>}
            {matches.map((code, i) => (
              <li key={code} className={i === lastCommon ? "kcur-sep" : undefined}>
                <button
                  type="button"
                  role="option"
                  aria-selected={code === currency}
                  className={`kcur-item${i === active ? " kcur-item--active" : ""}${code === currency ? " kcur-item--on" : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(code)}
                >
                  <span className="kcur-code">{code}</span>
                  <span className="kcur-name">{currencyName(code)}</span>
                  <span className="kcur-mark">{currencySymbol(code)}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="kcur-foot">
            {ratesLive ? `Live rates${asOf ? ` · updated ${asOf}` : ""}` : "Approximate rates — live feed unavailable"}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * A plain <select> of every currency, for the currency of a document (quotation, invoice,
 * challan). If the value is one we hold no rate for, it stays in the list so the control
 * never shows something it cannot display.
 */
export function CurrencySelect({ value, onChange, className, ...rest }) {
  const { currencies, currencyName } = useCurrency();
  const common = COMMON_CURRENCIES.filter((c) => currencies.includes(c));
  const others = currencies.filter((c) => !common.includes(c));
  const has = !value || currencies.includes(value);
  return (
    <select className={className} value={value || "NPR"} onChange={(e) => onChange(e.target.value)} {...rest}>
      {!has && <option value={value}>{value}</option>}
      <optgroup label="Common">
        {common.map((c) => <option key={c} value={c}>{c} — {currencyName(c)}</option>)}
      </optgroup>
      <optgroup label="All currencies">
        {others.map((c) => <option key={c} value={c}>{c} — {currencyName(c)}</option>)}
      </optgroup>
    </select>
  );
}

export default CurrencyPicker;
