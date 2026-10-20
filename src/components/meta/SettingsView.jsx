/**
 * Meta Ads, Settings: which ad accounts the app tracks, how the last sync went, and the budget guard rails.
 *
 *   ad accounts    each account, whether it is tracked, its currency and when it was last synced; with edit rights one can be
 *                  stopped or resumed and a new one added by its id ("act_" and digits)
 *   sync status    the latest run and a Sync now button
 *   guard rails    a hard ceiling no budget may go above (in one currency) and the multiple of a budget above which an edit asks
 *                  for a second confirmation. The ceiling is enforced by the server whoever asks; this page only sets it.
 *
 * Every save is read back (lib/metaWrites.js). The form shows what is saved and offers Save and Reset only once something has changed.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Icons } from "../ui";
import { BentoGrid, EmptyNote, Tile } from "../bento/Bento";
import DataTable from "../table/DataTable";
import Select from "../Select";
import { Notice, ico, num, plural } from "./Common";
import useMetaLoad from "../../hooks/useMetaLoad";
import { fetchSettings } from "../../lib/metaAds";
import { SYNC_STATUS, guardDirty, guardDraftOf, guardProblem, normalizeAccountId, timeAgo } from "../../lib/metaCalc";
import { addAccount, saveGuardRails, setAccountActive } from "../../lib/metaWrites";

export default function SettingsView({ canEdit, core, reloadCore, tick, go, notify, onSync, syncing }) {
  const uid = useId();
  const { data: settings, status, reload } = useMetaLoad(async () => (await fetchSettings()) ?? null, `${tick}`);
  const accounts = core.accounts;
  const latest = core.runs[0] || null;

  const saved = useMemo(() => guardDraftOf(settings), [settings]);
  const [draft, setDraft] = useState(saved);
  useEffect(() => { setDraft(saved); }, [saved]);
  const dirty = guardDirty(draft, saved);
  // The form is only for changing what was read. While the rows are still loading, or could not be read, it shows blanks, and saving blanks
  // would erase the ceiling Meta Ads enforces on every budget.
  const editable = canEdit && status === "ready";
  const [problem, setProblem] = useState("");
  const [saving, setSaving] = useState(false);

  const [newId, setNewId] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [busyAccount, setBusyAccount] = useState("");

  const tracked = [...new Set(accounts.filter((a) => a.isActive).map((a) => a.currency).filter(Boolean))];
  const currencies = [...new Set([...(tracked.length > 0 ? tracked : ["USD", "GBP", "EUR", "NPR"]), draft.currency])].filter(Boolean);

  // one write at a time per button, even for two presses in the same instant (state would not have changed yet, a ref has)
  const busy = useRef({});
  const once = async (name, fn) => {
    if (busy.current[name]) return;
    busy.current[name] = true;
    try { await fn(); } finally { busy.current[name] = false; }
  };

  const submitRails = (e) => {
    e.preventDefault();
    if (!editable) return undefined;
    return once("rails", async () => {
      const why = guardProblem(draft);
      setProblem(why);
      if (why) return;
      setSaving(true);
      const res = await saveGuardRails(draft);
      setSaving(false);
      if (!res.ok) { setProblem(res.message); return; }
      notify("info", "Budget guard rails saved.");
      reload();
    });
  };

  const submitAccount = (e) => {
    e.preventDefault();
    if (!newId || newId === "act_") return undefined;
    return once("add", async () => {
      setAdding(true);
      setAddError("");
      const res = await addAccount(newId);
      setAdding(false);
      if (!res.ok) { setAddError(res.message); return; }
      notify("info", `Added account ${newId}. Run a sync to fetch its campaigns.`);
      setNewId("");
      reloadCore();
    });
  };

  const toggle = (account) => once("toggle", async () => {
    setBusyAccount(account.id);
    const res = await setAccountActive(account, !account.isActive);
    setBusyAccount("");
    if (!res.ok) { notify("bad", res.message); return; }
    reloadCore();
  });

  const columns = useMemo(() => [
    {
      id: "name", label: "Account", grow: true, min: 180, max: 340,
      render: (a) => (
        <span className="dt-two-t"><b title={a.name || a.id}>{a.name || "Name pending sync"}</b><span className="ma-mono">{a.id}</span></span>
      ),
    },
    { id: "cur", label: "Currency", width: 88, drop: 3, render: (a) => <span className="ma-mono">{a.currency || "—"}</span> },
    { id: "tz", label: "Time zone", width: 160, drop: 4, render: (a) => <span className="ma-line">{a.timezoneName || "—"}</span> },
    { id: "state", label: "Status", width: 108, drop: 1, render: (a) => <span className={`kb-tag${a.isActive ? " kb-tag--good" : ""}`}>{a.isActive ? "Tracking" : "Paused"}</span> },
    { id: "last", label: "Last synced", width: 104, align: "end", drop: 2, render: (a) => <span className="dt-num">{timeAgo(a.lastSyncedAt)}</span> },
    ...(canEdit ? [{
      id: "act", label: "Actions", width: 150, align: "end",
      render: (a) => (
        <button type="button" className="kb-btn kb-btn--ghost dt-act" onClick={() => toggle(a)} disabled={busyAccount === a.id}>
          {a.isActive ? "Stop tracking" : "Resume tracking"}
        </button>
      ),
    }] : []),
  ], [canEdit, busyAccount]);                                                  // eslint-disable-line react-hooks/exhaustive-deps

  const s = latest ? SYNC_STATUS[latest.status] || { label: latest.status, tone: "" } : null;

  return (
    <>
      {status === "error" && (
        <Notice tone="warn" role="alert" action={{ label: "Try again", onClick: reload }}>The budget guard rails could not be read, so they are not shown and cannot be changed until they can be.</Notice>
      )}

      <BentoGrid layout="ma-set">
        <Tile area="acc" title="Ad accounts" icon={<Icons.Users {...ico} />} align="top" className="ma-pane" note={`${accounts.length} ${plural(accounts.length, "account")}`}>
          <p className="ma-sub">The Facebook and Instagram ad accounts the app reads from.</p>
          {core.accountsLost ? (
            <div className="dt-empty"><EmptyNote icon={<Icons.Users size={22} sw={1.5} />}>The ad accounts could not be read. <button type="button" className="ma-linkbtn" onClick={reloadCore}>Try again</button></EmptyNote></div>
          ) : accounts.length === 0 ? (
            <div className="dt-empty"><EmptyNote icon={<Icons.Users size={22} sw={1.5} />}>No ad accounts added yet.</EmptyNote></div>
          ) : (
            <DataTable label="Ad accounts" rows={accounts} rowKey={(a) => a.id} columns={columns} focusBody={!canEdit} />
          )}
          {canEdit && (
            <form className="ma-add" onSubmit={submitAccount}>
              <div className="ma-f">
                <label htmlFor={`${uid}-acct`}>Add an ad account</label>
                <div className="ma-inline">
                  <input
                    id={`${uid}-acct`} value={newId} onChange={(e) => { setAddError(""); setNewId(normalizeAccountId(e.target.value)); }}
                    placeholder="Its digits, or act_123456789" disabled={adding} autoComplete="off" spellCheck={false}
                  />
                  <button type="submit" className="kb-btn kb-btn--primary" disabled={adding || !newId || newId === "act_"}>{adding ? "Adding…" : "Add account"}</button>
                </div>
                {addError && <small className="ma-bad" role="alert">{addError}</small>}
              </div>
            </form>
          )}
        </Tile>

        <Tile area="sync" title="Sync status" icon={<Icons.RefreshCw {...ico} />} align="top" className="ma-pane"
          note={canEdit ? <button type="button" className="kb-btn kb-btn--ghost kb-act" onClick={onSync} disabled={syncing}>{syncing ? "Syncing…" : "Sync now"}</button> : undefined}>
          {core.runsLost ? (
            <p className="ma-line ma-dim">The sync history could not be read.</p>
          ) : latest ? (
            <div className="ma-sync">
              <span className={`kb-tag${s.tone ? ` kb-tag--${s.tone}` : ""}`}>{s.label}</span>
              <p>Last run <b>{timeAgo(latest.startedAt)}</b>: {num(latest.campaignsSynced)} campaigns, {num(latest.adsetsSynced)} ad sets, {num(latest.adsSynced)} ads.</p>
            </div>
          ) : <p className="ma-line ma-dim">No sync runs recorded yet.</p>}
          <button type="button" className="ma-linkbtn" onClick={() => go("activity")}>See the full sync history in Activity →</button>
        </Tile>

        <Tile area="rails" title="Budget guard rails" icon={<Icons.Alert {...ico} />} align="top" className="ma-pane">
          <p className="ma-sub">Protection against an accidental overspend when a budget is changed.</p>
          <form className="ma-form ma-form--two" onSubmit={submitRails} noValidate>
            <div className="ma-f">
              <label htmlFor={`${uid}-ceil`}>Hard ceiling</label>
              <div className="ma-inline">
                <input
                  id={`${uid}-ceil`} type="number" min="0" step="0.01" inputMode="decimal" disabled={!editable} value={draft.ceiling} placeholder="e.g. 50.00"
                  onChange={(e) => { setProblem(""); setDraft((d) => ({ ...d, ceiling: e.target.value })); }}
                />
                <Select variant="pill" label="Ceiling currency" value={draft.currency} onChange={(v) => { setProblem(""); setDraft((d) => ({ ...d, currency: v })); }} searchable={false} disabled={!editable || !draft.ceiling}
                  options={currencies.map((c) => ({ value: c, label: c }))} />
              </div>
            </div>
            <div className="ma-f">
              <label htmlFor={`${uid}-mult`}>Ask to confirm above</label>
              <div className="ma-inline">
                <input
                  id={`${uid}-mult`} type="number" min="1" step="0.5" inputMode="decimal" disabled={!editable} value={draft.multiplier} placeholder="3"
                  onChange={(e) => { setProblem(""); setDraft((d) => ({ ...d, multiplier: e.target.value })); }}
                />
                <span className="ma-unit">× current</span>
              </div>
            </div>
            {canEdit && saved.ceiling !== "" && saved.currency === "" && <p className="ma-bad ma-wide">The saved ceiling has no currency, so every budget change is refused until one is chosen. Choose it above and save.</p>}
            <p className="ma-help">
              No budget above the ceiling is ever sent to Meta, whoever asks (in one of the currencies your tracked accounts spend in). An edit
              above {Number(draft.multiplier) >= 1 ? draft.multiplier : saved.multiplier}× the current budget asks for a second confirmation.
            </p>
            {problem && <p className="ma-bad ma-wide" role="alert">{problem}</p>}
            {editable && dirty && (
              <div className="ma-save ma-wide">
                <span>You have unsaved changes.</span>
                <button type="button" className="kb-btn kb-btn--ghost" onClick={() => { setDraft(saved); setProblem(""); }} disabled={saving}>Reset</button>
                <button type="submit" className="kb-btn kb-btn--primary" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
              </div>
            )}
          </form>
        </Tile>
      </BentoGrid>
    </>
  );
}
