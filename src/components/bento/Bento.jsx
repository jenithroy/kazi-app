/**
 * Bento — the page frame and tiles the Dashboard is built from.
 *
 *   <BentoPage>            fills the window under the top bar; never scrolls on desktop
 *     <DashHead/>          greeting, time, and the page's own controls (region, costs)
 *     <BentoGrid layout>   a fixed grid of named areas, one per tile
 *       <Tile area …>      one box, one destination
 *
 * Each tile is its own container (`container: kb / size`), so what it shows is
 * decided by the room it was actually given — not by the window — and the
 * `.kb-h-*` / `.kb-w-*` classes in bento.css hide the extras a small tile
 * cannot hold. On a phone the tiles keep their width but grow with their
 * content, because there the page is allowed to scroll.
 *
 * The whole tile is the click target: a stretched <Link> (or a <button> for the
 * two tiles that open a pop-up) sits over it, and anything that has to be
 * pressed on its own (clock in, approve) carries `.kb-act` to sit above it.
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Icons, cn } from "../ui";
import { useAuth } from "../../context/AuthContext";
import { useCurrency } from "../../context/CurrencyContext";
import { sectionVisible } from "../../utils/permissions";
import { useReveal } from "../../hooks/useReveal";
import { ArrowUpRight, Lock } from "./icons";
import "./bento.css";

/* ── Page frame ─────────────────────────────────────────── */

export function BentoPage({ children, className }) {
  return <div className={cn("kb", className)}>{children}</div>;
}

/** The tiles sit on frosted glass; `useReveal` is the light that follows the pointer across them. */
export function BentoGrid({ layout, children }) {
  const grid = useRef(null);
  useReveal(() => grid.current?.querySelectorAll(":scope > .kb-tile"));
  return <div ref={grid} className={cn("kb-grid", `kb-grid--${layout}`)}>{children}</div>;
}

/* ── Header ─────────────────────────────────────────────── */

function useKathmanduTime() {
  const read = () =>
    new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Kathmandu", hour: "2-digit", minute: "2-digit" });
  const [time, setTime] = useState(read);
  useEffect(() => {
    const id = setInterval(() => setTime(read()), 15000);
    return () => clearInterval(id);
  }, []);
  return time;
}

/** Greeting on the left; the page's own controls on the right. (Light / dark lives in the profile card.) */
export function DashHead({ profile, children }) {
  const time = useKathmanduTime();
  const hour = Number(new Date().toLocaleString("en-GB", { timeZone: "Asia/Kathmandu", hour: "2-digit", hour12: false })) % 24;
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const date = new Date().toLocaleDateString("en-GB", {
    timeZone: "Asia/Kathmandu", weekday: "long", day: "numeric", month: "long",
  });
  const first = profile?.name?.split(" ")[0];

  return (
    <header className="kb-head">
      <div className="kb-head-l">
        <h1>{first ? `${greeting}, ${first}` : greeting}</h1>
        <p className="kb-head-sub">
          <span>{date} · Kathmandu HQ</span>
          <span className="kb-head-time"><Icons.Clock size={13} sw={1.8} />{time} KTM</span>
        </p>
      </div>
      <div className="kb-head-r">{children}</div>
    </header>
  );
}

/* ── Tile ───────────────────────────────────────────────── */

/**
 * tone    default | terra | amber | wash — remaps the tile's tokens, so everything
 *         inside follows without knowing which tone it is in. Tint a tile only when it
 *         is asking for attention (terra, amber) or saying all is well (wash)
 * to      destination route; `onOpen` instead opens a pop-up
 * section permission section(s) the destination needs; without it the tile is
 *         shown locked rather than showing zeros the person cannot actually see
 * can     the same idea for a destination that needs more than a section: (profile) => boolean
 * align   where the content sits when the tile is taller than it needs: end | top | center
 */
export function Tile({
  area, tone = "default", to, onOpen, section, can, icon, title, note, loading,
  align = "end", label, className, children,
}) {
  const { profile } = useAuth();
  const needs = section ? (Array.isArray(section) ? section : [section]) : [];
  const locked = (needs.length > 0 && !needs.some((s) => sectionVisible(profile, s)))
    || (can ? !can(profile) : false);
  const live = !locked && Boolean(to || onOpen);
  const name = label || `Open ${title}`;

  return (
    <section
      className={cn("kb-tile", `kb-tile--${tone}`, live && "kb-tile--live", locked && "kb-tile--locked", className)}
      style={{ gridArea: area }}
      data-tile={area}
    >
      <div className="kb-hd">
        {icon && <span className="kb-chip" aria-hidden="true">{icon}</span>}
        <h2 className="kb-ttl">{title}</h2>
        {note && !locked && <span className="kb-note">{note}</span>}
        {live && <ArrowUpRight className="kb-go" size={15} sw={1.8} aria-hidden="true" />}
        {locked && <Lock className="kb-go" size={14} sw={1.8} aria-hidden="true" />}
      </div>

      {locked ? (
        <div className="kb-main kb-main--center">
          <p className="kb-locked">Not part of your position</p>
        </div>
      ) : (
        <div className={cn("kb-main", `kb-main--${align}`)}>
          {loading ? <Skeleton /> : children}
        </div>
      )}

      {live && (to
        ? <Link className="kb-hit" to={to} aria-label={name} />
        : <button type="button" className="kb-hit" onClick={onOpen} aria-label={name} />)}
    </section>
  );
}

function Skeleton() {
  return (
    <div className="kb-skel-wrap" aria-hidden="true">
      <span className="kb-skel kb-skel--lg" />
      <span className="kb-skel kb-h-120" />
    </div>
  );
}

/* ── Content pieces ─────────────────────────────────────── */

/** The one big number a tile exists to show. */
export function Figure({ children, unit, tone, className }) {
  return (
    <div className={cn("kb-fig", tone && `kb-fig--${tone}`, className)}>
      {children}
      {unit != null && <span className={cn("kb-fig-u", unit === "%" && "is-pct")}>{unit}</span>}
    </div>
  );
}

export function Sub({ children, className }) {
  return <div className={cn("kb-sub", className)}>{children}</div>;
}

/** A thick bar; `pct` 0–100. Decorative — the numbers beside it say the same thing. */
export function Meter({ pct, tone }) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  return (
    <div className="kb-meter" aria-hidden="true">
      <i className={tone ? `kb-meter--${tone}` : undefined} style={{ "--p": `${p}%` }} />
    </div>
  );
}

/**
 * An amount in the currency picked in the top bar. Tiles are narrow, so it
 * carries both spellings — "₨ 1,23,456" and "₨ 1.2L" — and the stylesheet shows
 * whichever one the tile has room for. `compact` pins the short one.
 */
export function Money({ npr, compact }) {
  const { fmt, prefix, short, fromNPR } = useCurrency();
  const n = Number(npr) || 0;
  const abs = Math.abs(fromNPR(n));
  const brief = abs < 1000 ? fmt(n) : `${n < 0 ? "-" : ""}${prefix}${short(Math.abs(n))}`;
  if (compact) return <span className="kb-money">{brief}</span>;
  return (
    <span className="kb-money">
      <span className="kb-money-f">{fmt(n)}</span>
      <span className="kb-money-s">{brief}</span>
    </span>
  );
}

/** A list that shows only the rows that fit; the rest wrap out of sight. */
export function RowList({ children, className }) {
  return <ul className={cn("kb-list", className)}>{children}</ul>;
}

/** The button used inside a tile, sitting above the tile's own link. */
export function TileButton({ kind = "ghost", children, className, ...rest }) {
  return (
    <button type="button" className={cn("kb-btn", `kb-btn--${kind}`, "kb-act", className)} {...rest}>
      {children}
    </button>
  );
}

export function EmptyNote({ icon, children }) {
  return (
    <div className="kb-empty">
      {icon}
      <span>{children}</span>
    </div>
  );
}
