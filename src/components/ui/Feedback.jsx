import { Children } from "react";
import { Btn, IconBtn } from "./Btn";
import { Icons } from "./Icons";
import { cn } from "./utils";

/* ── Banner ───────────────────────────────────────────── */

const BANNER_ICONS = {
  info: Icons.Info,
  success: Icons.CheckCircle,
  warn: Icons.Alert,
  error: Icons.Alert,
  viewonly: Icons.Lock,
};

/**
 * A message that stays on the page while its condition holds: a view-only
 * notice, unsaved changes, a failed load, a finance rule the page enforces.
 * For something that passes, use notify; for a question, useConfirm.
 *
 *   tone       info | success | warn | error | viewonly
 *   title      an optional bold first line
 *   children   the message: what is true and, where it helps, what to do
 *   action     a button that resolves it (Retry, Review changes)
 *   onDismiss  adds a close button; leave it off when the condition still holds
 *   icon       replaces the tone's icon
 */
export function Banner({ tone = "info", title, children, action, onDismiss, icon, className }) {
  const Icon = BANNER_ICONS[tone] || Icons.Info;
  return (
    <div className={cn("k-banner", `k-banner--${tone}`, className)} role={tone === "error" ? "alert" : "status"}>
      <span className="k-banner-ico" aria-hidden="true">{icon ?? <Icon size={16} sw={1.9} />}</span>
      <div className="k-banner-body">
        {title && <p className="k-banner-title">{title}</p>}
        {children && <div className="k-banner-text">{children}</div>}
      </div>
      {action && <div className="k-banner-action">{action}</div>}
      {onDismiss && (
        <IconBtn size="sm" className="k-banner-close" icon={<Icons.X size={14} />} label="Dismiss" onClick={onDismiss} />
      )}
    </div>
  );
}

/* ── Empty state ──────────────────────────────────────── */
/**
 * What an empty area says instead of a blank: why it is empty, and what fills it.
 *
 *   icon      an Icons element, shown in a soft circle
 *   title     short and specific: "No expenses logged in September"
 *   children  one honest line: why it is empty, or what will appear here
 *   action    the button that fills it; only when this person is allowed to
 *   size      md | sm (inside a card or beside other content)
 *   tone      default | restricted (the person cannot see this) | error
 */
export function EmptyState({ icon, title, children, action, size = "md", tone = "default", className }) {
  return (
    <div className={cn("k-empty", `k-empty--${size}`, tone !== "default" && `k-empty--${tone}`, className)}>
      {icon && <span className="k-empty-ico" aria-hidden="true">{icon}</span>}
      {title && <p className="k-empty-title">{title}</p>}
      {children && <div className="k-empty-text">{children}</div>}
      {action && <div className="k-empty-action">{action}</div>}
    </div>
  );
}

/**
 * An area that failed to load. Says so plainly and offers another try.
 *
 *   title     what did not load: "Expenses could not load"
 *   children  the likely cause or the error's own message
 *   onRetry   shows a Try again button
 */
export function ErrorState({ title = "This could not load", children, onRetry, retryLabel = "Try again", size = "md", className }) {
  return (
    <div role="alert">
      <EmptyState
        tone="error"
        size={size}
        className={className}
        icon={<Icons.Alert size={size === "sm" ? 18 : 22} sw={1.8} />}
        title={title}
        action={onRetry && <Btn kind="secondary" size="sm" onClick={onRetry}>{retryLabel}</Btn>}
      >
        {children}
      </EmptyState>
    </div>
  );
}

/* ── Skeleton ─────────────────────────────────────────── */
/**
 * A placeholder shaped like what is loading, instead of a "Loading…" sentence
 * in the middle of the page.
 *
 *   variant  text | title | block | circle
 *   lines    for text: how many lines (the last is shorter)
 *   width, height  CSS sizes, when the shape needs to match the real thing
 *
 * Wrap a group in <SkeletonGroup label="Loading expenses"> so a screen reader
 * hears one announcement instead of silence.
 */
export function Skeleton({ variant = "text", lines = 1, width, height, className }) {
  if (variant === "text" && lines > 1) {
    return (
      <span className={cn("k-skel-lines", className)} aria-hidden="true">
        {Array.from({ length: lines }, (_, i) => (
          <span key={i} className={cn("k-shimmer", "k-skel", "k-skel--text", i === lines - 1 && "k-skel--last")} />
        ))}
      </span>
    );
  }
  return (
    <span
      className={cn("k-shimmer", "k-skel", `k-skel--${variant}`, className)}
      style={width || height ? { width, height } : undefined}
      aria-hidden="true"
    />
  );
}

export function SkeletonGroup({ label = "Loading", children, className }) {
  return (
    <div className={cn("k-skel-group", className)} role="status" aria-busy="true">
      <span className="k-sr">{label}</span>
      {children}
    </div>
  );
}

/* ── Stat strip ───────────────────────────────────────── */
/**
 * A row of KPIs. It reads its own width: every KPI in one row when there is
 * room (up to four), two across in a narrow column or on a phone, one at a
 * time when it is very narrow.
 *
 *   <StatStrip label="This month">
 *     <KPI label="Revenue" … />
 *     <KPI label="Expenses" … />
 *   </StatStrip>
 */
export function StatStrip({ children, label, className }) {
  const count = Math.min(4, Children.toArray(children).length);
  return (
    <div className="k-stats-wrap">
      <div className={cn("k-stats", `k-stats--n${count}`, className)} role={label ? "group" : undefined} aria-label={label}>
        {children}
      </div>
    </div>
  );
}
