/**
 * Small pieces the finance tables share: an amount in the chosen currency, a plain rupee column for the books, the one-line
 * cell, a status tag, and the strip under a table that adds up what is shown.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useCurrency } from "../../context/CurrencyContext";
import { roundAmount } from "../../utils/format";
import { downloadCsv, toCsv } from "../../lib/csv";
import useMedia from "../../hooks/useMedia";
import { Icons, cn } from "../ui";
import { TwoLine } from "../table/DataTable";

/** The books are kept in rupees; lakh grouping (12,34,567) is how they are read in Nepal. */
export const npr = (n) => roundAmount(n).toLocaleString("en-IN");

/**
 * Money as a person reads it: rupees in whole rupees with lakh grouping (₨ 17,41,491), as the rest of the new look writes them;
 * any other currency keeps its pence (a small amount must not read £0).
 */
export function useMoney() {
  const { fmt, money, currency } = useCurrency();
  return (n) => (currency === "NPR" ? fmt(Number(n) || 0) : money(Number(n) || 0));
}

/** An amount in the chosen currency, with the rupee amount under it when the choice is not rupees. */
export function Amt({ n, tone, strong, sign }) {
  const { currency } = useCurrency();
  const text = useMoney();
  const v = Number(n) || 0;
  return (
    <span className="dt-stack">
      <span className={cn("dt-num", strong && "dt-strong", tone && `dt-${tone}`)}>{sign}{text(v)}</span>
      {currency !== "NPR" && <small>₨ {npr(v)}</small>}
    </span>
  );
}

/** A rupee figure for a ledger column: digits only (the header names the currency), a dash when there is nothing. */
export function Npr({ n, tone, strong }) {
  const v = Number(n) || 0;
  if (!v) return <span className="dt-dim">—</span>;
  return <span className={cn("dt-num", strong && "dt-strong", tone && `dt-${tone}`)}>{npr(v)}</span>;
}

/** One line, the first part bold, the rest quieter and the first to be cut off. */
export function Line({ main, rest, title }) {
  return (
    <span className="fn-line" title={title || [main, rest].filter(Boolean).join(" · ")}>
      <b>{main}</b>
      {rest ? <span>{rest}</span> : null}
    </span>
  );
}

/**
 * The name cell of a table. One line on a computer: the name, then a quieter rest. When the table has no room for a column (a date or a
 * status on a phone), what that column said goes on a second line under the name: a narrow table loses width, not facts. `extra` is
 * the list of those sayings (empty ones are skipped).
 */
export function NameCell({ main, rest, extra = [], title }) {
  const more = extra.filter(Boolean);
  if (more.length === 0) return <Line main={main} rest={rest} title={title} />;
  return <TwoLine main={main} sub={[...more, rest].filter(Boolean).join(" · ")} />;
}

/** A status pill in the page's own tags. */
export function Chip({ tone, children }) {
  return <span className={cn("kb-tag", tone && `kb-tag--${tone}`)}>{children}</span>;
}

/** The strip under a table: what is shown, added up. Pass the parts as children. */
export function Foot({ children }) {
  return <div className="fn-foot">{children}</div>;
}

/** One figure in the strip under a table. `count` puts the figure first ("63 entries"); otherwise the name comes first ("Total ₨ 1,000"). */
export function FootSum({ label, value, tone, count }) {
  const figure = <b className={tone ? `dt-${tone}` : undefined}>{value}</b>;
  return (
    <span className="fn-sum">
      {count ? <>{figure}<span>{label}</span></> : <><span>{label}</span>{figure}</>}
    </span>
  );
}

export const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many);

/**
 * A phone's page scrolls, so a table of two hundred rows would be a very long page: it shows the first few until "Show all" is pressed.
 * Returns [the rows to draw, the button to put under the table (or null)]. On a computer the table scrolls in its pane and shows all.
 */
export function usePhoneRows(list, n = 14) {
  const phone = useMedia("(max-width: 768px)");
  const [all, setAll] = useState(false);
  const capped = phone && !all && list.length > n ? list.slice(0, n) : list;
  const more = capped.length < list.length
    ? <div className="fn-more"><button type="button" onClick={() => setAll(true)}>Show all {list.length}</button></div>
    : null;
  return [capped, more];
}

/**
 * Shift + N starts a new record from anywhere on the page that is not a field or an open card (Finance has its own handler, which
 * also switches sections). Pass null when this person may not add: the key then does nothing.
 */
export function useShiftN(onNew) {
  const latest = useRef(onNew);
  latest.current = onNew;
  useEffect(() => {
    function onKey(e) {
      if (!latest.current || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.key.toLowerCase() !== "n") return;
      const t = e.target;
      if (t?.tagName === "INPUT" || t?.tagName === "TEXTAREA" || t?.tagName === "SELECT" || t?.isContentEditable) return;
      if (t?.closest?.("[data-no-shortcuts], .kdp-pop")) return;       // a capital typed in a dropdown of the row of fields, or in an open calendar, is typing
      if (document.querySelector(".kmodal-overlay, .modal-overlay")) return;
      e.preventDefault();
      e.stopPropagation();
      latest.current();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
}

/** "Export": what is on screen as a CSV file she can open in her own spreadsheet. `columns`: [{ label, value: (row) => … }]. */
export function ExportButton({ name, columns, rows, disabled }) {
  return (
    <button
      type="button"
      className="kb-pillbtn fn-export"
      disabled={disabled || rows.length === 0}
      title="Download what is shown as a spreadsheet file" aria-label="Export"
      onClick={() => downloadCsv(`kazi-${name}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(columns, rows))}
    >
      <Icons.Download size={14} sw={1.9} aria-hidden="true" /><span>Export</span>
    </button>
  );
}

/* ── Undo: a quiet strip that offers to take a quick action back ──── */

/** [undo, offer(label, run), clear]: `offer` shows the strip for a few seconds; `run` puts things back. */
export function useUndo(ms = 9000) {
  const [undo, setUndo] = useState(null);
  const timer = useRef(0);
  const clear = useCallback(() => { clearTimeout(timer.current); setUndo(null); }, []);
  const offer = useCallback((label, run) => {
    clearTimeout(timer.current);
    setUndo({ label, run });
    timer.current = setTimeout(() => setUndo(null), ms);
  }, [ms]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return [undo, offer, clear];
}

export function UndoStrip({ undo, onClose }) {
  const [busy, setBusy] = useState(false);
  if (!undo) return null;
  return (
    <div className="fn-undo" role="status">
      <span>{undo.label}</span>
      <button
        type="button"
        disabled={busy}
        onClick={async () => { setBusy(true); try { await undo.run(); } finally { setBusy(false); onClose(); } }}
      >
        Undo
      </button>
    </div>
  );
}
