import { useRef } from "react";
import { EmptyState, ErrorState, Skeleton } from "./Feedback";
import { useElementWidth } from "./useElementWidth";
import { cn } from "./utils";

/* ── Chart frame ──────────────────────────────────────── */
/**
 * The box a chart sits in: a title, its actions, a legend, and the states a
 * chart has before it has anything to draw. The chart itself goes inside, in a
 * Recharts <ResponsiveContainer width="100%" height="100%">.
 *
 *   height        how tall the plot is on a wide screen
 *   narrowHeight  how tall below 480px of the frame's own width
 *   legend        a node under the plot; a legend that scrolls sideways is the
 *                 one thing allowed to
 *   loading, error, onRetry, empty   what to show instead of the chart
 *   label         what the chart shows, for screen readers, since the SVG says nothing useful
 *
 *   <ChartFrame title="Expenses by category" height={240} legend={…}>
 *     <ResponsiveContainer width="100%" height="100%">…</ResponsiveContainer>
 *   </ChartFrame>
 */
export function ChartFrame({
  title,
  actions,
  height = 240,
  narrowHeight,
  legend,
  loading = false,
  error,
  onRetry,
  empty,
  label,
  children,
  className,
}) {
  const ref = useRef(null);
  const width = useElementWidth(ref);
  const plotHeight = width != null && width < 480 && narrowHeight ? narrowHeight : height;

  let body;
  if (error) body = <ErrorState size="sm" title={error} onRetry={onRetry} />;
  else if (loading) body = <Skeleton variant="block" height={`${plotHeight}px`} />;
  else if (empty) body = typeof empty === "string" ? <EmptyState size="sm">{empty}</EmptyState> : empty;
  else body = <div className="k-chart-plot" style={{ height: plotHeight }} role="img" aria-label={label || title}>{children}</div>;

  return (
    <figure ref={ref} className={cn("k-chart", className)}>
      {(title || actions) && (
        <figcaption className="k-chart-head">
          {title && <span className="k-chart-title">{title}</span>}
          {actions && <span className="k-chart-actions">{actions}</span>}
        </figcaption>
      )}
      {body}
      {legend && !loading && !error && !empty && <div className="k-chart-legend">{legend}</div>}
    </figure>
  );
}
