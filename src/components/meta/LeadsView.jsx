/**
 * Meta Ads, Leads: the people who filled in a Meta lead form. Four short tiles count them (all, new and not yet contacted, in
 * follow-up, converted); under them one table with a search and the Filters button (components/filters: status, campaign, ad, city,
 * the day received, customer made or not, has a phone number, an email or a note), whose rows open that lead's card (their details,
 * the form's answers, their status, and "Add as customer"). Sync pulls any new ones from Meta; Export saves what the table shows as a CSV.
 *
 * What was different in the old page and is deliberate here:
 *   - a status is saved only when the card is saved, and read back (the old inline dropdown assumed the database had taken it);
 *   - "Add as customer" cannot be pressed twice into two customers, and if the customer is created but the lead cannot be linked to
 *     them the card says so, naming where to find them, and its button then only tries the link again (it never makes a second customer,
 *     even after the card is closed and opened again);
 *   - the CSV is built properly: quotes are doubled, a cell a spreadsheet would run as a formula is made safe (these are things strangers
 *     typed into a form), and it is saved as a file, not a data link that stops at the first # in a field.
 */
import { useMemo, useRef, useState } from "react";
import { Icons } from "../ui";
import { BentoGrid, EmptyNote, Tile } from "../bento/Bento";
import DataTable, { TwoLine } from "../table/DataTable";
import { FindBar } from "../filters/FilterMenu";
import useFilters from "../filters/useFilters";
import LeadCard from "./LeadCard";
import WebhookDialog from "./WebhookDialog";
import { Kpi, LoadError, NONE, Notice, ico, num, plural } from "./Common";
import useMetaLoad from "../../hooks/useMetaLoad";
import { fetchMetaLeads } from "../../lib/metaAds";
import { kathmanduDate } from "../../utils/date";
import { LEAD_STATUSES, filterLeads, fmtShort, leadCounts, leadStats, leadStatus, leadStatusMeta, leadWhen, leadsCsv, timeAgo } from "../../lib/metaCalc";
import { convertLead, linkLead, setLeadStatus, syncLeads } from "../../lib/metaWrites";

const BOM = String.fromCharCode(0xfeff);        // a byte-order mark first, so a spreadsheet reads the names as UTF-8
const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const when = (l) => { const d = new Date(leadWhen(l)); return Number.isNaN(d.getTime()) ? "" : DAY.format(d); };

const has = (v) => Boolean(String(v ?? "").trim());
/** The office's day (Kathmandu) a lead came in, or "" when it has no time. */
const dayReceived = (l) => { const w = leadWhen(l); return w && !Number.isNaN(Date.parse(w)) ? kathmanduDate(w) : ""; };
/** A city as strangers type it into a form ("Kathmandu", "kathmandu ", "KATHMANDU") is one city. */
const cityKey = (c) => String(c ?? "").trim().replace(/\s+/g, " ").toLowerCase();
const cityName = (key) => key.replace(/(^|\s)(\p{L})/gu, (_, gap, ch) => gap + ch.toUpperCase());

export default function LeadsView({ canEdit, today, tick, notify }) {
  const { data, status, error, stale, refreshing, reload } = useMetaLoad(async () => (await fetchMetaLeads()) || [], `${tick}`);
  const leads = data || NONE;
  const loading = status === "loading";

  const [query, setQuery] = useState("");
  const [card, setCard] = useState(null);                    // the open lead's id
  const [hook, setHook] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const syncOnce = useRef(false);
  const [patches, setPatches] = useState({});                // what a save just changed, until the next read says the same
  const [made, setMade] = useState({});                      // lead id -> the customer created from it whose link to the lead could not be saved

  const rows = useMemo(() => leads.map((l) => (patches[l.id] ? { ...l, ...patches[l.id] } : l)), [leads, patches]);
  const stats = useMemo(() => leadStats(rows), [rows]);
  const counts = useMemo(() => leadCounts(rows), [rows]);
  // The search is this view's own; everything else that narrows the list is in the Filters panel (components/filters). The status choice
  // narrows exactly as the old chips did.
  const searched = useMemo(() => filterLeads(rows, { status: "all", query }), [rows, query]);
  const filterDefs = useMemo(() => {
    const choice = (get) => new Set(rows.map(get).filter(Boolean)).size > 1;          // a dropdown is offered only when there is something to choose
    return [
      {
        id: "status", label: "Status", kind: "chips", test: (l, v) => leadStatus(l) === v,
        options: [{ value: "all", label: "All" }, ...LEAD_STATUSES.map((s) => ({ value: s.id, label: s.label, tone: s.id === "new" && counts.new > 0 ? "warn" : undefined }))],
      },
      ...(choice((l) => l.campaignName) ? [{ id: "campaign", label: "Campaign", kind: "select", of: (l) => l.campaignName, any: "Any campaign", none: "No campaign" }] : []),
      ...(choice((l) => l.adName) ? [{ id: "ad", label: "Ad", kind: "select", of: (l) => l.adName, any: "Any ad", none: "No ad" }] : []),
      ...(choice((l) => cityKey(l.city)) ? [{ id: "city", label: "City", kind: "select", of: (l) => cityKey(l.city), nameOf: cityName, any: "Any city", none: "No city" }] : []),
      { id: "received", label: "Received between", kind: "dates", get: dayReceived, show: fmtShort, pill: "Received" },
      {
        id: "customer", label: "Customer record", kind: "chips", test: (l, v) => Boolean(l.customerId) === (v === "made"),
        options: [{ value: "any", label: "Any" }, { value: "made", label: "Customer made" }, { value: "not", label: "No customer yet" }],
      },
      { id: "phone", label: "Has a phone number", kind: "toggle", test: (l) => has(l.phoneNumber) },
      { id: "email", label: "Has an email", kind: "toggle", test: (l) => has(l.email) },
      { id: "note", label: "Has a note", kind: "toggle", test: (l) => has(l.notes) },
    ];
  }, [rows, counts]);
  const tf = useFilters(filterDefs, searched);
  const list = tf.rows;
  const open = card ? rows.find((l) => l.id === card) || null : null;
  const narrowed = Boolean(query) || tf.count > 0;

  async function sync() {
    if (syncOnce.current) return;
    syncOnce.current = true;
    setSyncing(true);
    const res = await syncLeads();
    syncOnce.current = false;
    setSyncing(false);
    if (!res.ok) { notify("bad", res.message); return; }
    notify("info", res.res?.syncedCount > 0 ? `Synced ${res.res.syncedCount} ${plural(res.res.syncedCount, "lead")} from active lead ads.` : "Sync complete: no new leads found on Meta.");
    setPatches({});
    reload();
  }

  function exportCsv() {
    if (list.length === 0) return;
    const blob = new Blob([BOM, leadsCsv(list)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `meta_leads_${today}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function saveStatus(lead, next) {
    if (leadStatusMeta(lead.status).id === next) return { ok: true };
    const res = await setLeadStatus(lead, next);
    if (res.ok) { setPatches((p) => ({ ...p, [lead.id]: { status: next } })); reload(); }
    return res;
  }

  async function convert(lead) {
    const earlier = made[lead.id];                 // a customer was already created for this lead: only the link is left to do
    const res = earlier ? await linkLead(lead, earlier) : await convertLead(lead);
    if (res.ok) {
      setMade((m) => Object.fromEntries(Object.entries(m).filter(([id]) => id !== lead.id)));
      setPatches((p) => ({ ...p, [lead.id]: { status: "converted", customerId: res.customer.id } }));
      notify("info", earlier ? `Linked “${lead.fullName || "Lead"}” to the customer made from it.` : `Created customer “${lead.fullName || "Lead"}” in Kazi ERP.`);
      reload();
    } else if (res.partial) {
      if (res.customerId) setMade((m) => ({ ...m, [lead.id]: res.customerId }));
      reload();
    }
    return res;
  }

  const columns = useMemo(() => [
    {
      id: "lead", label: "Lead", grow: true, min: 200, max: 380,
      render: (l, { dropped }) => (
        <TwoLine
          main={l.fullName || "Unnamed lead"}
          sub={[l.phoneNumber, l.email, l.city, dropped.has("campaign") ? l.campaignName : ""].filter(Boolean).join(" · ")}
        />
      ),
    },
    {
      id: "campaign", label: "Campaign and ad", width: 220, drop: 2,
      render: (l) => (
        <span className="dt-two-t">
          <b title={l.campaignName}>{l.campaignName || "Meta campaign"}</b>
          {l.adName ? <span title={l.adName}>Ad: {l.adName}</span> : null}
        </span>
      ),
    },
    {
      id: "received", label: "Received", width: 122, align: "end", drop: 3,
      render: (l) => (
        <span className="dt-stack"><span className="dt-num">{timeAgo(leadWhen(l))}</span><small>{when(l)}</small></span>
      ),
    },
    {
      id: "status", label: "Status", width: 118, drop: 1,
      render: (l) => { const s = leadStatusMeta(l.status); return <span className={`kb-tag${s.tone ? ` kb-tag--${s.tone}` : ""}`}>{s.label}</span>; },
    },
    {
      id: "customer", label: "Customer", width: 112, drop: 4,
      render: (l) => (l.customerId ? <span className="kb-tag kb-tag--good">Customer ✓</span> : <span className="dt-dim">—</span>),
    },
  ], []);

  if (status === "error") return <LoadError what="Leads" onRetry={reload} busy={refreshing} />;

  return (
    <>
      {stale && <Notice tone="warn" action={{ label: refreshing ? "Trying…" : "Try again", onClick: reload, disabled: refreshing }}>Could not refresh just now. This is what was loaded last.</Notice>}
      {error && !stale && <Notice tone="warn" role="alert">{error}</Notice>}

      <BentoGrid layout="ma-leads">
        <Kpi area="tot" title="Total inquiries" icon={<Icons.Users {...ico} />} loading={loading} value={num(stats.total)} sub="all captured instant-form leads" />
        <Kpi area="new" title="New, not contacted" icon={<Icons.Alert {...ico} />} tone={stats.newLeads > 0 ? "amber" : "default"} loading={loading} value={num(stats.newLeads)} sub={stats.newLeads > 0 ? "waiting for a follow-up" : "everyone has been followed up"} />
        <Kpi area="fol" title="In follow-up" icon={<Icons.Message {...ico} />} loading={loading} value={num(stats.contacted)} sub="contacted or qualified" />
        <Kpi area="conv" title="Converted" icon={<Icons.Check {...ico} />} loading={loading} value={num(stats.converted)} sub={`${stats.convRate}% became customers`} />

        <Tile
          area="main" title="Leads" icon={<Icons.Users {...ico} />} align="top" className="ma-pane"
          note={loading ? undefined : narrowed ? `${num(list.length)} of ${num(counts.all)}` : `${num(counts.all)} ${plural(counts.all, "lead")}`}
        >
          <div className="ma-tools fn-barrow">
            <FindBar filters={tf} value={query} onChange={setQuery} placeholder="Search leads" label="Search leads by name, phone, email, campaign or city" />
            <span className="ma-tools-r">
              <button type="button" className="kb-btn kb-btn--ghost" onClick={() => setHook(true)}><Icons.Info size={13} sw={1.9} aria-hidden="true" /> Webhook</button>
              <button type="button" className="kb-btn kb-btn--ghost" onClick={exportCsv} disabled={list.length === 0}><Icons.Download size={13} sw={1.9} aria-hidden="true" /> Export CSV</button>
              <button type="button" className="kb-btn kb-btn--primary" onClick={sync} disabled={syncing}><Icons.RefreshCw size={13} sw={2} className={syncing ? "kspin" : ""} aria-hidden="true" /> {syncing ? "Syncing leads…" : "Sync leads"}</button>
            </span>
          </div>

          {!loading && list.length === 0 ? (
            <div className="dt-empty">
              <EmptyNote icon={<Icons.Users size={22} sw={1.5} />}>
                {rows.length === 0
                  ? "No leads captured yet. Run a lead ad on Facebook or Instagram, or press Sync leads to pull existing ones."
                  : <>No leads match. <button type="button" className="ma-linkbtn" onClick={() => { setQuery(""); tf.clear(); }}>Show them all</button></>}
              </EmptyNote>
            </div>
          ) : (
            <DataTable
              label="Leads" rows={list} rowKey={(l) => l.id} columns={columns} defaultSort={null}
              onOpen={(l) => setCard(l.id)} rowLabel={(l) => `Open ${l.fullName || "unnamed lead"}, ${leadStatusMeta(l.status).label}`}
              activeKey={card || undefined} loading={loading}
            />
          )}
        </Tile>
      </BentoGrid>

      {open && (
        <LeadCard
          key={open.id} lead={open} canEdit={canEdit} customerMade={Boolean(made[open.id])}
          onSave={(next) => saveStatus(open, next)} onConvert={() => convert(open)}
          onClose={() => setCard((cur) => (cur === open.id ? null : cur))}
        />
      )}
      {hook && <WebhookDialog onClose={() => setHook(false)} />}
    </>
  );
}
