/**
 * Inventory & Library.
 *
 * One frame (a header, a bar of tabs and search, one glass pane) and, in the pane, the table for the tab you are on:
 *
 *   Stock          what is on the shelf, with In / Out / Balance
 *   Items cost     what a piece costs to make and what it sells for
 *   Stock ledger   Opening + In − Out = Closing over a date range; prints
 *   Fabrics · Processes · Samples · Tech packs   the library
 *
 * A table row is a button: pressing it opens the card in the middle of the screen (components/inventory/ItemCard.jsx
 * and LibraryCards.jsx, on components/EditCard.jsx), which is where things are edited. Nothing is edited in a row, so
 * there is no Save to find at the far end of a wide table.
 *
 * Tech packs are not a table: they are cards in a grid (components/techpack/PackGrid.jsx). A card opens the printed sheet (or the
 * photographed pages of an older pack); the editor, the sheet and the pages are opened through components/techpack/TechPackProvider.jsx,
 * so every page can open them. What a tech pack is lives in lib/techpack.js.
 *
 * What each tab shows, which positions may edit, the stock sums and every write are the old page's. (One thing the
 * old page did not do: deleting an item, process, fabric or sample. Its delete handler was named like the database
 * call it made, so it called itself forever. The cards' Delete works.)
 *
 * Everything that narrows a tab is one Filters button beside its search box (components/filters; what each tab offers is
 * components/inventory/inventoryFilters.js): the side of the business (the Nepal / UK switch that used to fill the header),
 * the old All / Low and All / Heavy / Light chips, the Stock ledger's From and To, and more. Each tab keeps its own choices.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BentoPage, EmptyNote } from "../components/bento/Bento";
import { Icons } from "../components/ui";
import { PageTabs } from "../components/table/Bar";
import { FindBar } from "../components/filters/FilterMenu";
import useFilters from "../components/filters/useFilters";
import ItemCard from "../components/inventory/ItemCard";
import { FabricCard, ProcessCard, SampleCard } from "../components/inventory/LibraryCards";
import { CostTable, FabricTable, ProcessTable, SampleTable, StockTable } from "../components/inventory/Tables";
import LedgerReport from "../components/inventory/LedgerReport";
import Rail from "../components/inventory/Rail";
import {
  costFilters, fabricFilters, ledgerFilters, patternFilters, processFilters, sampleFilters, stockFilters,
} from "../components/inventory/inventoryFilters";
import PackGrid from "../components/techpack/PackGrid";
import { useTechPack } from "../components/techpack/TechPackProvider";
import "../components/inventory/inventory.css";
import { useAuth } from "../context/AuthContext";
import { useRegion } from "../context/RegionContext";
import { useCurrency } from "../context/CurrencyContext";
import { useReveal } from "../hooks/useReveal";
import { sectionCanEdit, sectionVisible } from "../utils/permissions";
import { fetchAll, insertRow } from "../lib/db";
import { PACK_LIST_COLUMNS, PACK_PICTURE_COLUMNS } from "../lib/packColumns";
import { brandName, completeness, readPack, searchText } from "../lib/techpack";
import { STOCK_MOVEMENTS_COLLECTION } from "../utils/stockLedger";
import { countUntagged, countUntaggedBy, filterByRegion, filterByRegionField } from "../utils/region";
import { kathmanduDate } from "../utils/date";
import { costOf, movementIndex, savedCost, stockLedgerReportRows, stockRow } from "../lib/inventory";

const NONE = [];

const DEFAULT_FABRICS = [
  { name: "Rib Fabric", gsm: 200, composition: "Woolen", status: "In Stock" },
  { name: "Collar T-shirt", gsm: 210, composition: "Cotton 100%", status: "In Stock" },
  { name: "Linen", gsm: null, composition: "Cotton 100%", status: "In Stock" },
  { name: "AP Cotton", gsm: 380, composition: "Cotton 100%", status: "In Stock" },
  { name: "24 Come Sinker", gsm: 160, composition: "Cotton 100%", status: "In Stock" },
  { name: "Stripe Linen", gsm: null, composition: "Cotton 100%", status: "In Stock" },
  { name: "Cotton Terry", gsm: 280, composition: "Cotton 100%", status: "In Stock" },
  { name: "SOS Cotton", gsm: 420, composition: "Cotton 100%", status: "In Stock" },
  { name: "30s Sinker Nepali", gsm: 160, composition: "Cotton 100%", status: "In Stock" },
  { name: "PC PK", gsm: 260, composition: "Cotton 100%", status: "In Stock" },
  { name: "Anti-Grunge Cotton", gsm: 420, composition: "Cotton 100%", status: "In Stock" },
  { name: "Sinker Cotton", gsm: 140, composition: "Cotton 100%", status: "In Stock" },
];

const TAB_NOUN = { stock: "item", cost: "cost item", ledger: "item", fabrics: "fabric", processes: "process", patterns: "tech pack", samples: "sample" };

const has = (hay, q) => String(hay || "").toLowerCase().includes(q);

function Inventory() {
  const { profile } = useAuth();
  const { region, label: regionLabel } = useRegion();
  const { money } = useCurrency();
  const isNepalStaff = profile?.appRole === "nepal_staff" || profile?.role === "nepal_staff";
  // Inventory & Library are one merged page in the UI (see the combined nav item in constants/nav.js): granting either
  // permission unlocks the whole page, so a partial grant never hides a tab from someone who was meant to have it all.
  const canEdit = sectionCanEdit(profile, "inventory") || sectionCanEdit(profile, "library") || isNepalStaff;
  const showPage = sectionVisible(profile, "inventory") || sectionVisible(profile, "library");

  const tabList = useMemo(() => (showPage ? [
    { id: "stock", label: "Stock" },
    { id: "cost", label: "Items cost" },
    { id: "ledger", label: "Stock ledger" },
    { gap: true },
    { id: "fabrics", label: "Materials & fabrics" },
    { id: "processes", label: "Processes" },
    { id: "patterns", label: "Tech packs" },
    { id: "samples", label: "Samples" },
  ] : []), [showPage]);
  const [tab, setTab] = useState("stock");
  const [query, setQuery] = useState("");
  const [ledgerFrom, setLedgerFrom] = useState(() => kathmanduDate().slice(0, 8) + "01");
  const [ledgerTo, setLedgerTo] = useState(() => kathmanduDate());

  /* ── the data ───────────────────────────────────────────────── */
  const [data, setData] = useState({ rows: NONE, econ: {}, movements: NONE, fabrics: NONE, processes: NONE, patterns: NONE, samples: NONE, customers: NONE, orders: NONE });
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(NONE);
  const [notice, setNotice] = useState("");          // something a person did that did not work, said on the page rather than in a browser pop-up

  /* The photographs kept inside an older tech pack's row are 2 MB of the 2.2 the packs weigh, and every tab of this page would wait for them.
     So the page reads the packs without them, and the Tech packs tab asks for them the first time it is opened (a pack's own pictures are
     read again after every reload from then on). `pictures` is { [pack id]: { tech_pack_images, frontSketchUrl, backSketchUrl } }, null until they are in. */
  const [pictures, setPictures] = useState(null);
  const picturesWanted = useRef(false);
  const readPictures = useCallback(async () => {
    try {
      const rows = await fetchAll("patterns", { columns: PACK_PICTURE_COLUMNS });
      setPictures(Object.fromEntries(rows.map((r) => [String(r.id), r])));
      setFailed((f) => f.filter((k) => k !== "pictures"));
    } catch (err) {
      console.error("Failed to read the tech pack pictures:", err);
      setPictures((p) => p || {});                    // the cards are drawn without them rather than not at all, and the notice below says so
      setFailed((f) => (f.includes("pictures") ? f : [...f, "pictures"]));
    }
  }, []);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!showPage) { setLoading(false); return; }
    if (!quiet) setLoading(true);
    if (picturesWanted.current) readPictures();       // (not waited for: the cards are there already)
    const jobs = {
      rows: fetchAll("inventory"), econ: fetchAll("unit_economics"), movements: fetchAll(STOCK_MOVEMENTS_COLLECTION),
      fabrics: fetchAll("fabrics"), processes: fetchAll("processes"), patterns: fetchAll("patterns", { columns: PACK_LIST_COLUMNS }), samples: fetchAll("samples"),
      // who a tech pack is for and how many orders were made from it (a position that may not read them gets an empty list, not an error)
      customers: fetchAll("customers"), orders: fetchAll("orders"),
    };
    const keys = Object.keys(jobs);
    const results = await Promise.allSettled(keys.map((k) => jobs[k]));
    const next = {};
    const bad = [];
    results.forEach((r, i) => {
      if (r.status !== "fulfilled") { bad.push(keys[i]); return; }
      if (keys[i] === "rows") next.rows = r.value.slice().sort((a, b) => (a.item || "").localeCompare(b.item || ""));
      // The costing sheet is stored as one jsonb blob per item, keyed by that item's id: unwrap `data` back into the shape the page works with.
      else if (keys[i] === "econ") next.econ = Object.fromEntries(r.value.map((e) => [e.id, e.data || {}]));
      else next[keys[i]] = r.value;
    });
    setData((prev) => ({ ...prev, ...next }));
    setFailed((f) => [...bad, ...f.filter((k) => k === "pictures")]);       // (the pictures are read on their own and keep their own notice)
    setLoading(false);
  }, [showPage, readPictures]);

  useEffect(() => { load().catch(console.error); }, [load, profile]);
  const reload = useCallback(() => load({ quiet: true }), [load]);

  // the Tech packs tab opened for the first time: now the pictures are wanted
  useEffect(() => {
    if (tab !== "patterns" || !showPage || picturesWanted.current) return;
    picturesWanted.current = true;
    readPictures();
  }, [tab, showPage, readPictures]);

  /* ── one region at a time ──────────────────────────────────────
     Everything the page draws comes from these, so the switch in the header reaches every tab without any of them being
     aware of it. Items with no region set show on both sides until somebody files them (see utils/region.js).
     `movements` stays whole on purpose: it is only ever looked up by item id, and the item is what carries the region.
     `data.rows` likewise stays whole where an id is minted, because an item's code must be unique across the company. */
  const rows = useMemo(() => filterByRegion(data.rows, region), [data.rows, region]);
  const fabrics = useMemo(() => filterByRegion(data.fabrics, region), [data.fabrics, region]);
  const processes = useMemo(() => filterByRegion(data.processes, region), [data.processes, region]);
  // Tech packs are the exception: a pattern has always carried a `market` ("UK" / "Nepal"), the same question the switch asks.
  const patterns = useMemo(() => filterByRegionField(data.patterns, region, "market"), [data.patterns, region]);
  const samples = useMemo(() => filterByRegion(data.samples, region), [data.samples, region]);

  const index = useMemo(() => movementIndex(data.movements), [data.movements]);
  const stock = useMemo(() => rows.map((r) => stockRow(r, index)), [rows, index]);
  const totals = useMemo(() => ({ items: stock.length, low: stock.filter((s) => s.low).length, value: stock.reduce((sum, s) => sum + s.value, 0) }), [stock]);

  /* ── search and filters ─────────────────────────────────────── */
  const q = query.trim().toLowerCase();
  const today = kathmanduDate();
  const stockFound = useMemo(
    () => stock.filter((s) => !q || has(s.row.item, q) || has(s.row.itemId, q) || has(s.row.category, q) || has(s.row.supplier, q)),
    [stock, q],
  );
  const fabricsFound = useMemo(() => fabrics.filter((r) => !q || has(r.name, q) || has(r.composition, q) || has(r.supplier, q)), [fabrics, q]);
  const processesFound = useMemo(() => processes.filter((r) => !q || has(r.name, q) || has(r.category, q) || has(r.description, q)), [processes, q]);
  // A tech pack with what the cards and filters need beside it: the pack as the app reads it, whether it is complete, who it is for, how many orders.
  const customerById = useMemo(() => new Map(data.customers.map((c) => [String(c.id), c])), [data.customers]);
  const ordersByPack = useMemo(() => {
    const n = new Map();
    for (const o of data.orders) if (o.patternId) n.set(o.patternId, (n.get(o.patternId) || 0) + 1);
    return n;
  }, [data.orders]);
  const packs = useMemo(() => patterns.map((listed) => {
    const row = pictures && pictures[listed.id] ? { ...listed, ...pictures[listed.id] } : listed;     // (the list row, with its pictures once they are in)
    const pack = readPack(row);
    const c = completeness(pack);
    const customer = customerById.get(pack.customerId) || null;
    return {
      id: row.id, row, pack, c, customer, customerName: brandName(pack, customer),
      state: pack.legacy ? "old" : c.ok ? "complete" : "needs",
      orders: ordersByPack.get(row.id) || 0,
      search: searchText(pack, customer),
    };
  }).sort((a, b) => String(b.row.updatedAt || b.row.createdAt || "").localeCompare(String(a.row.updatedAt || a.row.createdAt || "")) || a.pack.name.localeCompare(b.pack.name)),
  [patterns, customerById, ordersByPack, pictures]);
  const patternsFound = useMemo(() => packs.filter((w) => !q || w.search.includes(q)), [packs, q]);
  const samplesFound = useMemo(
    () => samples.filter((r) => !q || has(r.name, q) || has(r.product_type, q) || has(r.stage, q) || has(r.fabric_used, q)),
    [samples, q],
  );
  // the ledger's lines for the dates on screen (the screen shows the ones that pass the search and the filters; a printout is always every item)
  const ledgerReport = useMemo(() => stockLedgerReportRows(rows, data.movements, ledgerFrom, ledgerTo), [rows, data.movements, ledgerFrom, ledgerTo]);
  const ledgerFound = useMemo(() => {
    const codes = new Map(rows.map((r) => [r.id, r.itemId]));
    return ledgerReport.filter((r) => !q || has(r.item, q) || has(codes.get(r.id), q) || has(r.category, q));
  }, [ledgerReport, rows, q]);

  /* The Filters panel of each tab (components/filters; what each offers is components/inventory/inventoryFilters.js). A hook for every tab
     keeps its choices while another tab is open; only the open tab's is drawn. */
  const lastMoved = useMemo(() => {
    const day = new Map();
    for (const m of data.movements) {
      const d = String(m.date || "").slice(0, 10);
      if (d && d > (day.get(m.itemId) || "")) day.set(m.itemId, d);
    }
    return day;
  }, [data.movements]);
  const costById = useMemo(() => new Map(stock.map((s) => [s.id, costOf(savedCost(data.econ[s.id]))])), [stock, data.econ]);
  const stockDefs = useMemo(() => stockFilters({ stock, today, lastMoved }), [stock, today, lastMoved]);
  const costDefs = useMemo(() => costFilters({ stock, costById }), [stock, costById]);
  const ledgerDefs = useMemo(
    () => ledgerFilters({ report: ledgerReport, today, from: ledgerFrom, to: ledgerTo, onFrom: setLedgerFrom, onTo: setLedgerTo }),
    [ledgerReport, today, ledgerFrom, ledgerTo],
  );
  const fabricDefs = useMemo(() => fabricFilters({ fabrics }), [fabrics]);
  const processDefs = useMemo(() => processFilters({ processes }), [processes]);
  const patternDefs = useMemo(() => patternFilters({ packs }), [packs]);
  const sampleDefs = useMemo(() => sampleFilters({ samples }), [samples]);
  const tfStock = useFilters(stockDefs, stockFound);
  const tfCost = useFilters(costDefs, stockFound);
  const tfLedger = useFilters(ledgerDefs, ledgerFound);
  const tfFabrics = useFilters(fabricDefs, fabricsFound);
  const tfProcesses = useFilters(processDefs, processesFound);
  const tfPatterns = useFilters(patternDefs, patternsFound);
  const tfSamples = useFilters(sampleDefs, samplesFound);
  const tf = { stock: tfStock, cost: tfCost, ledger: tfLedger, fabrics: tfFabrics, processes: tfProcesses, patterns: tfPatterns, samples: tfSamples }[tab];
  const stockShown = tfStock.rows;
  const costShown = tfCost.rows;
  const ledgerShown = tfLedger.rows;
  const fabricsShown = tfFabrics.rows;
  const processesShown = tfProcesses.rows;
  const patternsShown = tfPatterns.rows;
  const samplesShown = tfSamples.rows;

  /* ── what is open on top of the page ────────────────────────── */
  const [dialog, setDialog] = useState(null);       // { kind: "item" | "fabric" | "process" | "sample", mode: "create" | "edit" | …, id?, section? }
  // Tech packs open through the provider (components/techpack/): the printed sheet, the photographed pages of an older pack, the editor.
  const { openSheet, openPages, openEditor } = useTechPack();
  const [seeding, setSeeding] = useState(false);
  const found = {
    item: dialog?.kind === "item" && dialog.mode === "edit" ? data.rows.find((r) => r.id === dialog.id) : null,
    fabric: dialog?.kind === "fabric" && dialog.mode === "edit" ? data.fabrics.find((r) => r.id === dialog.id) : null,
    process: dialog?.kind === "process" && dialog.mode === "edit" ? data.processes.find((r) => r.id === dialog.id) : null,
    sample: dialog?.kind === "sample" && dialog.mode === "edit" ? data.samples.find((r) => r.id === dialog.id) : null,
  };
  // an item that was deleted (here or on another screen) closes its card
  useEffect(() => {
    if (loading || !dialog || dialog.mode !== "edit") return;
    if (!found[dialog.kind]) setDialog(null);
  }, [loading, dialog, data]);   // eslint-disable-line react-hooks/exhaustive-deps

  // when a card closes and the thing it was opened from is gone (a deleted item), focus goes to the first row, not to the page
  useEffect(() => {
    if (!dialog && document.activeElement === document.body) document.querySelector(".inv-pane .dt-hit")?.focus({ preventScroll: true });
  }, [dialog]);

  const openItem = useCallback((row, section) => setDialog({ kind: "item", mode: "edit", id: row.id, section }), []);

  function handleTabChange(next) {
    setTab(next);
    setQuery("");
  }

  async function seedDefaultFabrics() {
    if (!canEdit) return;
    setSeeding(true);
    try {
      for (const f of DEFAULT_FABRICS) {
        await insertRow("fabrics", { name: f.name, gsm: f.gsm, weight: "", composition: f.composition, status: f.status, swatchImageUrl: "" });
      }
      await reload();
    } catch (err) {
      console.error("Failed to seed fabrics:", err);
      setNotice(`The standard catalog could not be added: ${err.message}`);
    } finally {
      setSeeding(false);
    }
  }

  // A card opens the printed sheet. An older pack that is only photographs of the paper (and has no sheet's worth of data yet) opens those pages.
  const openPack = useCallback((w) => {
    if (w.pack.legacy && w.pack.pages.length && openPages) openPages({ id: w.id });
    else if (openSheet) openSheet({ id: w.id });
  }, [openSheet, openPages]);
  const editPack = useCallback((w) => openEditor?.({ id: w.id, onSaved: reload, onDeleted: reload }), [openEditor, reload]);
  const newPack = useCallback(() => openEditor?.({ id: null, onSaved: reload }), [openEditor, reload]);

  useReveal(() => document.querySelectorAll(".inv-page .kb-tile"));

  /* ── the header ─────────────────────────────────────────────── */
  const addButton = (() => {
    if (!canEdit || tab === "ledger") return null;
    const open = {
      stock: () => setDialog({ kind: "item", mode: "create-stock" }),
      cost: () => setDialog({ kind: "item", mode: "create-cost" }),
      fabrics: () => setDialog({ kind: "fabric", mode: "create" }),
      processes: () => setDialog({ kind: "process", mode: "create" }),
      samples: () => setDialog({ kind: "sample", mode: "create" }),
      patterns: newPack,
    }[tab];
    return (
      <button type="button" className="kb-btn kb-btn--primary inv-newbtn" data-tour={tab === "stock" || tab === "cost" ? "add-stock" : undefined} onClick={open}>
        <Icons.Plus size={13} sw={2.2} /> Add {TAB_NOUN[tab]}
      </button>
    );
  })();

  // Tech packs count a missing `market`; everything else a missing `region`.
  const untagged = tab === "patterns" ? countUntaggedBy(data.patterns, "market") : countUntagged(
    tab === "fabrics" ? data.fabrics : tab === "processes" ? data.processes : tab === "samples" ? data.samples : data.rows,
  );

  // what is on screen, in words: the side of the business (its switch is in the Filters panel), then what the tab holds
  const sub = (() => {
    if (loading) return <span>Loading…</span>;
    if (tab === "stock" || tab === "cost") {
      return (
        <>
          <span>{regionLabel}</span>
          <span>{totals.items} {totals.items === 1 ? "item" : "items"}</span>
          {totals.low > 0 ? <span className="kb-bad">{totals.low} low</span> : <span>all stocked</span>}
          <span>{money(totals.value)} in stock</span>
          {!canEdit && <span className="kb-tag">View only</span>}
        </>
      );
    }
    const n = { fabrics: fabrics.length, processes: processes.length, patterns: patterns.length, samples: samples.length }[tab];
    return (
      <>
        <span>{regionLabel}</span>
        {tab === "ledger" ? <span>{ledgerFrom} to {ledgerTo}</span> : <span>{n} {n === 1 ? TAB_NOUN[tab] : `${TAB_NOUN[tab]}s`}</span>}
        {!canEdit && <span className="kb-tag">View only</span>}
      </>
    );
  })();

  const tabs = tabList.map((t) => (t.gap ? t : {
    ...t,
    count: t.id === "stock" || t.id === "cost" ? rows.length
      : t.id === "fabrics" ? fabrics.length : t.id === "processes" ? processes.length : t.id === "patterns" ? patterns.length : t.id === "samples" ? samples.length : undefined,
  }));

  /* ── what to say when a table is empty ──────────────────────── */
  const noun = TAB_NOUN[tab];
  const showRail = tab === "stock" || tab === "cost";
  const emptyFor = (total, shownCount, addIt) => {
    if (total > 0 && shownCount === 0) {
      return (
        <EmptyNote icon={<Icons.Search size={22} sw={1.5} />}>
          Nothing matches{q ? ` “${query.trim()}”` : " that filter"}.{" "}
          <button type="button" className="inv-link" onClick={() => { setQuery(""); tf.clear(); }}>Show everything</button>
        </EmptyNote>
      );
    }
    return (
      <EmptyNote icon={<Icons.Inventory size={22} sw={1.5} />}>
        No {noun}s yet.{" "}
        {canEdit && addIt ? <button type="button" className="inv-link" onClick={addIt}>Add the first one</button> : null}
      </EmptyNote>
    );
  };

  const failedText = failed.map((k) => ({ rows: "stock", econ: "costs", movements: "stock movements", fabrics: "fabrics", processes: "processes", patterns: "tech packs", pictures: "the tech pack pictures", samples: "samples", customers: "customers", orders: "orders" }[k])).join(", ");

  if (!showPage) {
    return (
      <BentoPage className="inv-page">
        <header className="kb-head"><div className="kb-head-l"><h1>Inventory & library</h1></div></header>
        <EmptyNote icon={<Icons.Inventory size={22} sw={1.5} />}>Inventory is not part of your position.</EmptyNote>
      </BentoPage>
    );
  }

  return (
    <BentoPage className="inv-page">
      <header className="kb-head">
        <div className="kb-head-l">
          <h1>Inventory & library</h1>
          <p className="kb-head-sub">{sub}</p>
        </div>
        <div className="kb-head-r">
          {addButton}
        </div>
      </header>

      {failed.length > 0 && (
        <div className="inv-banner" role="alert">
          <Icons.AlertTriangle size={16} sw={1.8} aria-hidden="true" />
          <span>Some of this page did not load ({failedText}), so what you see may be incomplete.</span>
          <button type="button" onClick={() => load()}>Try again</button>
        </div>
      )}

      {notice && (
        <div className="inv-banner" role="alert">
          <Icons.AlertTriangle size={16} sw={1.8} aria-hidden="true" />
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice("")}>Dismiss</button>
        </div>
      )}

      <div className="inv-bar">
        <div className="inv-tabs" data-tour="inventory-tabs">
          <PageTabs label="Inventory sections" tabs={tabs} value={tab} onChange={handleTabChange} />
        </div>
        <div className="inv-find fn-barrow">
          <FindBar
            filters={tf}
            value={query}
            onChange={setQuery}
            placeholder={`Search ${tab === "cost" || tab === "ledger" ? "items" : tab === "patterns" ? "tech packs" : `${noun}s`}`}
            scope={{ region: { untagged } }}
          />
        </div>
      </div>

      <div className={`inv-layout${showRail ? " has-rail" : ""}`}>
        <section className="kb-tile inv-pane" aria-label={tabList.find((t) => t.id === tab)?.label}>
          {tab === "stock" && (
            <StockTable rows={stockShown} loading={loading} canEdit={canEdit} onOpen={openItem} activeId={dialog?.id} empty={emptyFor(stock.length, stockShown.length, () => setDialog({ kind: "item", mode: "create-stock" }))} />
          )}

          {tab === "cost" && (
            <CostTable rows={costShown} economics={data.econ} loading={loading} onOpen={openItem} activeId={dialog?.id} empty={emptyFor(stock.length, costShown.length, () => setDialog({ kind: "item", mode: "create-cost" }))} />
          )}

          {tab === "ledger" && (
            <LedgerReport
              report={ledgerShown}
              printReport={ledgerReport}
              from={ledgerFrom}
              to={ledgerTo}
              onOpenItem={(id) => setDialog({ kind: "item", mode: "edit", id, section: "moves" })}
              empty={ledgerReport.length > 0 && ledgerShown.length === 0 ? emptyFor(ledgerReport.length, 0, null) : undefined}
            />
          )}

          {tab === "fabrics" && (
            <>
              <FabricTable
                rows={fabricsShown}
                loading={loading}
                onOpen={(r) => setDialog({ kind: "fabric", mode: "edit", id: r.id })}
                activeId={dialog?.kind === "fabric" ? dialog.id : undefined}
                empty={fabrics.length === 0 && canEdit ? (
                  <EmptyNote icon={<Icons.Inventory size={22} sw={1.5} />}>
                    <span>No fabrics in the library yet.</span>
                    <button type="button" className="kb-btn kb-btn--primary" onClick={seedDefaultFabrics} disabled={seeding}>
                      {seeding ? <><span className="kb-spin" aria-hidden="true" /> Adding…</> : "Add the standard catalog"}
                    </button>
                  </EmptyNote>
                ) : emptyFor(fabrics.length, fabricsShown.length, () => setDialog({ kind: "fabric", mode: "create" }))}
              />
            </>
          )}

          {tab === "processes" && (
            <ProcessTable rows={processesShown} loading={loading} onOpen={(r) => setDialog({ kind: "process", mode: "edit", id: r.id })} activeId={dialog?.kind === "process" ? dialog.id : undefined} empty={emptyFor(processes.length, processesShown.length, () => setDialog({ kind: "process", mode: "create" }))} />
          )}

          {tab === "samples" && (
            <SampleTable rows={samplesShown} loading={loading} onOpen={(r) => setDialog({ kind: "sample", mode: "edit", id: r.id })} activeId={dialog?.kind === "sample" ? dialog.id : undefined} empty={emptyFor(samples.length, samplesShown.length, () => setDialog({ kind: "sample", mode: "create" }))} />
          )}

          {tab === "patterns" && (
            <PackGrid
              packs={patternsShown}
              loading={loading || pictures === null}
              canEdit={canEdit && Boolean(openEditor)}
              onOpen={openPack}
              onEdit={editPack}
              empty={emptyFor(patterns.length, patternsShown.length, canEdit && openEditor ? newPack : null)}
            />
          )}
        </section>

        {showRail && <Rail stock={stock} movements={data.movements} loading={loading} onOpen={openItem} />}
      </div>

      {dialog?.kind === "item" && (dialog.mode !== "edit" || found.item) && (
        <ItemCard
          key={`${dialog.mode}:${dialog.id || ""}`}
          mode={dialog.mode}
          row={found.item}
          economics={dialog.id ? data.econ[dialog.id] : undefined}
          movements={data.movements}
          fabrics={fabrics}
          allRows={data.rows}
          canEdit={canEdit}
          region={region}
          profileName={profile?.name}
          initialSection={dialog.section}
          onChanged={reload}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "fabric" && (dialog.mode !== "edit" || found.fabric) && (
        <FabricCard key={dialog.id || "new"} item={found.fabric} canEdit={canEdit} region={region} onChanged={reload} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "process" && (dialog.mode !== "edit" || found.process) && (
        <ProcessCard key={dialog.id || "new"} item={found.process} canEdit={canEdit} region={region} onChanged={reload} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "sample" && (dialog.mode !== "edit" || found.sample) && (
        <SampleCard key={dialog.id || "new"} item={found.sample} canEdit={canEdit} region={region} onChanged={reload} onClose={() => setDialog(null)} />
      )}

    </BentoPage>
  );
}

export default Inventory;
