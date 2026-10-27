/**
 * A plain chart of thread colours to pick from, and a way to find the one nearest to any colour. The colours are named by what
 * they look like, not by a maker's number: every thread maker's numbers differ, and the factory matches a colour on the spool
 * by eye anyway. The production sheet lists these names next to the colour's hex so the operator knows what to load.
 */
export const THREADS = [
  ["White", "#ffffff"], ["Ivory", "#f3ecd8"], ["Light grey", "#c9ccd0"], ["Grey", "#8c9096"], ["Charcoal", "#4a4d52"], ["Black", "#14161a"],
  ["Pale yellow", "#f7e98e"], ["Yellow", "#f4c820"], ["Gold", "#d6a216"], ["Orange", "#ee7a1c"], ["Burnt orange", "#c4561a"], ["Peach", "#f4b69c"],
  ["Pink", "#f08fb0"], ["Hot pink", "#d91f78"], ["Red", "#d0262c"], ["Dark red", "#8d1620"], ["Burgundy", "#611425"], ["Coral", "#ef6a5a"],
  ["Lilac", "#b9a2d8"], ["Purple", "#6f3d99"], ["Plum", "#4b2358"], ["Sky blue", "#86c4ea"], ["Light blue", "#4e9fd8"], ["Royal blue", "#1f4fb0"],
  ["Blue", "#1c6fc9"], ["Navy", "#16255c"], ["Dark navy", "#0d1636"], ["Turquoise", "#14a9b4"], ["Teal", "#0e7c80"], ["Mint", "#8fd6b4"],
  ["Light green", "#8fcf4f"], ["Green", "#2f9e44"], ["Kelly green", "#0f8a3f"], ["Forest green", "#1d5a33"], ["Olive", "#6f7a2a"], ["Lime", "#c4d62c"],
  ["Beige", "#d9c3a0"], ["Tan", "#bc946a"], ["Light brown", "#9a6a3f"], ["Brown", "#6a4224"], ["Dark brown", "#3e2616"], ["Khaki", "#b4a66a"],
  ["Silver", "#b8bcc4"], ["Metallic gold", "#c9a040"], ["Cream", "#fbf6e6"], ["Skin tone", "#e8b898"], ["Maroon", "#7a1a2c"], ["Magenta", "#b5176b"],
].map(([name, hex]) => ({ name, hex, ...hexToRgb(hex) }));

export function hexToRgb(hex) {
  const n = parseInt(String(hex).replace("#", ""), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
export const rgbToHex = (r, g, b) => `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;

/** sRGB (0-255) to CIELAB (D65). */
export function toLab(r, g, b) {
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const R = lin(r), G = lin(g), B = lin(b);
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const Z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

const chartLab = THREADS.map((t) => toLab(t.r, t.g, t.b));

/** The chart colour nearest to (r, g, b) by CIELAB distance: { name, hex, r, g, b, distance }. */
export function nearestThread(r, g, b) {
  const lab = toLab(r, g, b);
  let best = 0, bd = Infinity;
  for (let i = 0; i < chartLab.length; i++) {
    const d = (lab[0] - chartLab[i][0]) ** 2 + (lab[1] - chartLab[i][1]) ** 2 + (lab[2] - chartLab[i][2]) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return { ...THREADS[best], distance: Math.sqrt(bd) };
}

/** A name for any colour: the chart's name when it is close, else "Navy-ish" style is avoided: it says the nearest name. */
export function threadName(hex) {
  const { r, g, b } = hexToRgb(hex);
  const n = nearestThread(r, g, b);
  return n.distance < 6 ? n.name : `${n.name} (close)`;
}
