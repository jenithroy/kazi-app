import { Icons, cn } from "../ui";
import { Tile, Sub } from "../bento/Bento";
import { stageRamp, stageShort, stageTiny } from "../../lib/sales";

const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many);

/**
 * The orders that are still being made, counted by where they are. The cells are also the filter for
 * the orders list beside it: press a stage to see only those orders, press it again to see them all.
 * Under the cells (when the tile is tall enough) are the pieces and the week's movement.
 */
export default function PipelineTile({ stages, sums, stage, onStage, loading }) {
  const { cells, other, open } = stages;
  const max = Math.max(1, ...cells.map((c) => c.n), other);
  const all = [...cells, ...(other > 0 ? [{ stage: "Other", n: other }] : [])];

  return (
    <Tile
      area="pipe"
      icon={<Icons.Production size={14} sw={1.8} />}
      title="Pipeline"
      note={`${open} open${sums.onHold > 0 ? ` · ${sums.onHold} on hold` : ""}`}
      section="orders"
      loading={loading}
      align="top"
      className="sl-pipe"
    >
      <div className="sl-rail" style={{ "--cells": all.length }} role="group" aria-label="Show orders at a stage">
        {all.map((c) => {
          const known = c.stage !== "Other";
          const on = known && stage === c.stage;
          return (
            <button
              key={c.stage}
              type="button"
              className={cn("sl-cell", known ? `sl-r${stageRamp(c.stage)}` : "sl-r0", on && "is-on", c.n === 0 && "is-zero")}
              aria-pressed={known ? on : undefined}
              disabled={!known}
              aria-label={`${c.n} ${stageShort(c.stage)}${stageShort(c.stage) !== c.stage ? ` (${c.stage})` : ""}: open ${plural(c.n, "order")}`}
              title={c.stage}
              onClick={() => known && onStage(on ? "" : c.stage)}
            >
              <b>{c.n}</b>{" "}
              <span className="sl-cell-l"><span className="sl-lf">{stageShort(c.stage)}</span><span className="sl-lt" aria-hidden="true">{stageTiny(c.stage)}</span></span>
              <i className="sl-cell-bar" aria-hidden="true"><i style={{ "--p": `${Math.round((c.n / max) * 100)}%` }} /></i>
            </button>
          );
        })}
      </div>

      <Sub className="sl-pipe-sub">
        <b>{sums.units.toLocaleString()}</b> {plural(sums.units, "piece")} in the pipeline
        <span className="sl-dotsep"> · </span><b>{sums.newThisWeek}</b> new this week
        <span className="sl-dotsep"> · </span><b>{sums.deliveredThisMonth}</b> delivered this month
      </Sub>
    </Tile>
  );
}
