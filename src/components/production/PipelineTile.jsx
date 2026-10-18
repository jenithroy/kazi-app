import { Icons, cn } from "../ui";
import { Tile } from "../bento/Bento";
import { STAGES, rampOf, stageShort, stageTiny } from "../../lib/production";

/**
 * The ten stages in one row, each with how many open orders sit there. It is also the list's
 * filter: press a stage to see only those orders, "All open" for the whole working list, and
 * "Done" for the finished and called-off ones. (A Delivered order is finished, so that stage
 * only gets a cell if something is somehow still open there.)
 */
export default function PipelineTile({ counts, view, stage, onPick, loading }) {
  const { open, closed, byStage } = counts;
  const cells = STAGES.filter((s) => s !== "Delivered" || byStage[s] > 0);
  const allOn = view === "open" && !stage;

  return (
    <Tile
      area="pipe"
      icon={<Icons.Production size={14} sw={1.8} />}
      title="Pipeline"
      note={loading ? undefined : `${open} open`}
      loading={loading}
      align="top"
      className="pr-pipe"
    >
      <div className="pr-rail" role="group" aria-label="Show orders at a stage" data-tour="production-pipeline">
        <button
          type="button"
          className={cn("pr-cell pr-cell--all", allOn && "is-on")}
          aria-pressed={allOn}
          onClick={() => onPick("open", "")}
        >
          <b>{open}</b>{" "}
          <span className="pr-cell-l">All open</span>
        </button>

        <span className="pr-rail-sep" aria-hidden="true" />

        {cells.map((s) => {
          const n = byStage[s];
          const on = view === "open" && stage === s;
          return (
            <button
              key={s}
              type="button"
              className={cn("pr-cell", `pr-r${rampOf(s)}`, on && "is-on", n === 0 && "is-zero")}
              aria-pressed={on}
              aria-label={`${n} ${stageShort(s)}${stageShort(s) === s ? "" : ` (${s})`}, open order${n === 1 ? "" : "s"}`}
              title={s}
              onClick={() => onPick("open", on ? "" : s)}
            >
              <b>{n}</b>{" "}
              <span className="pr-cell-l"><span className="pr-l-f">{stageShort(s)}</span><span className="pr-l-s">{stageTiny(s)}</span></span>
            </button>
          );
        })}

        <span className="pr-rail-sep" aria-hidden="true" />

        <button
          type="button"
          className={cn("pr-cell pr-cell--done", view === "closed" && "is-on", closed === 0 && "is-zero")}
          aria-pressed={view === "closed"}
          aria-label={`${closed} Done, finished and cancelled orders`}
          onClick={() => onPick(view === "closed" ? "open" : "closed", "")}
        >
          <b>{closed}</b>{" "}
          <span className="pr-cell-l">Done</span>
        </button>
      </div>
    </Tile>
  );
}
