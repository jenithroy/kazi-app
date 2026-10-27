/**
 * What a fabric asks of the stitching. Each preset is a set of defaults for NEW objects (an object can override any of it);
 * the numbers are the usual starting points for that kind of cloth, not laws: knits shrink and sink stitches so they get more
 * underlay and more pull compensation, towels and fleece bury stitches so they get heavier underlay, caps are stiff and
 * curved so the stitches are shorter. Densities are the distance between rows in mm (a bigger number is a lighter fill).
 * A satin column puts its needle holes on the two edges in turn, so the holes on one edge are twice the row spacing apart:
 * its rows are closer (0.3 mm) than a fill's (0.4 mm), or cloth shows in the notches at the edges.
 */
export const FABRICS = {
  woven: {
    label: "Woven (shirts, twill, denim, canvas)",
    fill: { spacing: 0.4, stitchLen: 3.5, pullComp: 0.2, underlay: "auto" },
    satin: { spacing: 0.3, pullComp: 0.25, underlay: "auto" },
  },
  knit: {
    label: "Knit (T-shirts, polo, jersey)",
    fill: { spacing: 0.42, stitchLen: 3.2, pullComp: 0.35, underlay: "edge+tatami" },
    satin: { spacing: 0.32, pullComp: 0.4, underlay: "auto" },
  },
  cap: {
    label: "Cap (structured, curved)",
    fill: { spacing: 0.38, stitchLen: 2.8, pullComp: 0.2, underlay: "edge+tatami" },
    satin: { spacing: 0.3, pullComp: 0.25, underlay: "auto" },
  },
  towel: {
    label: "Towel and fleece (pile)",
    fill: { spacing: 0.45, stitchLen: 3.8, pullComp: 0.4, underlay: "edge+tatami" },
    satin: { spacing: 0.36, pullComp: 0.4, underlay: "auto" },
  },
  leather: {
    label: "Leather and vinyl (few holes)",
    fill: { spacing: 0.5, stitchLen: 3.8, pullComp: 0.1, underlay: "none" },
    satin: { spacing: 0.4, pullComp: 0.1, underlay: "none" },
  },
};

export const DEFAULT_FABRIC = "woven";

/** The thread's own width, used only for drawing and for the coverage check (mm). */
export const THREAD_MM = 0.38;
