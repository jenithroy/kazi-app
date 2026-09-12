/**
 * One palette and one set of chart settings for the whole app.
 *
 * The hexes match the --chart-* tokens in styles/tokens.css. They are repeated
 * here because Recharts writes them into SVG attributes, where a CSS variable
 * cannot be relied on. Change both together.
 */
export const CHART_COLORS = [
  "#1f6e4c", "#5ab98a", "#5688b0", "#d4a04a", "#c4654a",
  "#7c6bb0", "#3f9e8f", "#8aa74e", "#a0567e", "#8a978f",
];

/** The colour for the nth series or slice. */
export const chartColor = (i) => CHART_COLORS[i % CHART_COLORS.length];

/** Colours by meaning, for charts that show money in and out. */
export const CHART_TONES = {
  positive: "#1f6e4c",
  negative: "#c4654a",
  neutral: "#8a978f",
  accent: "#5ab98a",
  info: "#5688b0",
  warn: "#d4a04a",
};

/** Spread onto a Recharts <Tooltip>. */
export const tooltipProps = {
  cursor: { fill: "rgba(15,46,34,.05)" },
  contentStyle: {
    borderRadius: 10,
    border: "1px solid #dde3dd",
    boxShadow: "0 16px 48px -12px rgba(15,46,34,.18)",
    fontSize: 12,
    fontFamily: "var(--font)",
    padding: "8px 10px",
  },
  labelStyle: { fontWeight: 650, marginBottom: 2 },
};

/** Spread onto <CartesianGrid>, <XAxis> and <YAxis>. */
export const gridProps = { strokeDasharray: "3 3", vertical: false, stroke: "rgba(15,46,34,.10)" };
export const axisProps = {
  tick: { fontSize: 11, fill: "#5b6a62" },
  tickLine: false,
  axisLine: { stroke: "rgba(15,46,34,.14)" },
};

/** Short axis figures: 1.2L, 45k. */
export function shortNumber(n) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  if (abs >= 100000) return `${(v / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `${Math.round(v / 1000)}k`;
  return String(Math.round(v));
}
