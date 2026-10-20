/**
 * A campaign, ad set or ad opened from the Campaigns list: its delivery status with the button that pauses or resumes it, its budget
 * with the button that changes it, and what it did in the date range. It is the shared EditCard with nothing to save (the actions each
 * ask for their own confirmation, in ActionDialogs.jsx, so a slip of the mouse cannot spend or stop money).
 *
 * Who can do what: pause and resume are offered when the person may edit Meta Ads and the thing can be toggled (it is active or
 * paused, and not held by its parent); the budget when it has one of its own. A thing paused by its parent says so and where to go,
 * rather than offering a button that would do nothing.
 */
import EditCard, { Field, KV } from "../EditCard";
import { Icons } from "../ui";
import { StatusTag, Thumb, num } from "./Common";
import { PAUSED_BY_PARENT, budgetFieldOf, canToggle, hasOwnBudget, objectiveWords, rangeWords } from "../../lib/metaCalc";
import { money, moneyMinor } from "../../lib/metaMoney";

const LEVEL = { campaign: "Campaign", adset: "Ad set", ad: "Ad" };

export default function EntityCard({ entity, level, currency, metrics, range, canEdit, budgetOpen, budgetWhy, parentHasBudget, onPause, onBudget, onHistory, onClose }) {
  const paused = entity.status === "PAUSED";
  const heldBy = PAUSED_BY_PARENT[entity.effectiveStatus];
  const own = hasOwnBudget(entity);
  const { daily, currentMinor } = budgetFieldOf(entity);
  const m = metrics || {};

  const budgetLine = own
    ? `${moneyMinor(currentMinor, currency)}${daily ? " / day" : " total"}`
    : level === "adset" && parentHasBudget ? "Uses its campaign's budget" : "No budget of its own";

  const main = (
    <>
      <Field label="Delivery" wide>
        <div className="ma-act">
          <StatusTag card effectiveStatus={entity.effectiveStatus} status={entity.status} />
          {canEdit && canToggle(entity) && (
            <button type="button" className="ghost-button" onClick={() => onPause(paused ? "resume" : "pause")}>
              {paused ? "Resume" : "Pause"} {LEVEL[level].toLowerCase()}
            </button>
          )}
        </div>
        {heldBy && <small className="ec-hint">{heldBy}: resume that first and this one follows.</small>}
        {!heldBy && !canToggle(entity) && <small className="ec-hint">It cannot be paused or resumed from here in this state.</small>}
      </Field>

      <Field label={own ? `${daily ? "Daily" : "Lifetime"} budget` : "Budget"} wide>
        <div className="ma-act">
          <b className="ma-big">{budgetLine}</b>
          {canEdit && own && (
            <button type="button" className="ghost-button" onClick={onBudget} disabled={!budgetOpen} title={budgetOpen ? undefined : budgetWhy}>Edit budget</button>
          )}
        </div>
        {canEdit && own && !budgetOpen && <small className="ec-hint">{budgetWhy}</small>}
      </Field>

      {level === "campaign" && entity.objective && (
        <Field label="Objective" wide><span className="ma-line">{objectiveWords(entity.objective)}</span></Field>
      )}
    </>
  );

  const side = (
    <>
      {level === "ad" && (
        <div className="ec-wide ma-creative"><Thumb url={entity.creativeThumbnailUrl} size={96} /></div>
      )}
      <p className="ec-wide ma-sidehead">In {rangeWords(range)}</p>
      <KV
        rows={[
          ["Spend", m.spend ? money(m.spend, currency) : "—"],
          ["Messages", num(m.messages)],
          ["Comments", num(m.comments)],
          ["Leads", num(m.leads)],
          ["Cost per inquiry", m.costPerInquiry ? money(m.costPerInquiry, currency) : "—"],
          ["Clicks", num(m.clicks)],
          ["Impressions", num(m.impressions)],
        ]}
      />
    </>
  );

  return (
    <EditCard
      title={entity.name} subtitle={`${LEVEL[level]}${entity.objective ? ` · ${objectiveWords(entity.objective)}` : ""}`}
      main={main} side={side} mainLabel="Details" sideLabel="Numbers"
      canEdit={false} closeLabel="Close" onClose={onClose} className="kmodal--meta"
      footerExtra={(
        <button type="button" className="ghost-button ec-ft-l" onClick={onHistory}>
          <Icons.Clock size={13} sw={1.9} aria-hidden="true" /> History
        </button>
      )}
    />
  );
}
