/**
 * The documents the redesign must not change (REDESIGN.md §2 rule 3, §10).
 *
 *   npm run shots:docs -- --label baseline
 *   npm run shots:docs -- --label after --manifest scratch/docs/baseline/manifest.json
 *   npm run shots:docs -- --compare scratch/docs/baseline --with scratch/docs/after
 *
 * For each document it saves what actually leaves the app: the on-screen
 * document markup (.html), the exact HTML written to the print pop-up
 * (.print.html) with a picture of that page at A4 width (.png), the generated
 * PDF for invoices, challans and quotations, and the print-media PDF for the
 * spec sheet and stock ledger.
 *
 * The first run picks one existing document of each kind and records it in
 * manifest.json. Later runs pass that manifest so they capture the same
 * documents with the same inputs. Nothing is saved to the database: the salary
 * slip is filled with fixed made-up figures that never leave the page, and
 * writes are blocked anyway (common.mjs).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { BASE_URL, ROOT, assertServer, goto, guardWrites, launch, parseArgs, signIn, sleep } from "./common.mjs";

// Every way this script finds a control on screen. The redesign renames the
// chrome around documents; when a later run can't find something, update this
// block. The documents themselves must come out identical.
const UI = {
  billingTabs: ".tab-button",             // in order: invoice, challan, quotation
  viewText: "View",
  docRoot: "#__kazi_doc_root__",
  docPage: ".invoice-page",
  docTitle: "#__kazi_doc_root__ .doc-toolbar span",
  printText: "Print",
  pdfText: "Download PDF",
  slipOpenText: "Salary Slip",
  slipRoot: ".modal-overlay",
  slipPrintText: "Print Salary Slip",
  inventoryTab: ".kinv-tab",
  techPacksTab: "Tech Packs",
  ledgerTab: "Stock Ledger",
  specText: "Spec Sheet",
  specCardName: ".klib-card-name",
  specArea: "#kinv-spec-print-area",
  ledgerArea: "#kinv-ledger-print-area",
};

const DEFAULTS = {
  ledger: { from: "2026-08-01", to: "2026-08-31" },
  // Invented figures so the slip is the same on every run. Keys are the field labels.
  slip: {
    "Employee ID": "EMP-TEST",
    "Employee Name": "Baseline Person",
    "Designation": "Tailor",
    "Month & Year": "Aug-26",
    "Basic Salary": 25000,
    "Allowances": 1500,
    "OT Salary": 800,
    "Receivable Due": 0,
    "Advance": 2000,
    "Income Tax Rate (%)": 1,
    "Leave Day Deduction": 500,
    "Other Payment / Deduction": 250,
  },
};

const args = parseArgs(process.argv.slice(2));

if (args.compare) {
  process.exit(compare(resolve(ROOT, String(args.compare)), resolve(ROOT, String(args.with))));
}

const label = String(args.label || "baseline");
const outDir = resolve(ROOT, "scratch/docs", label);
mkdirSync(outDir, { recursive: true });
const manifest = args.manifest
  ? JSON.parse(readFileSync(resolve(ROOT, String(args.manifest)), "utf8"))
  : structuredClone(DEFAULTS);
const only = args.only ? new Set(String(args.only).split(",")) : null;

/* ── page helpers ─────────────────────────────────────── */

async function clickByText(page, selector, text, { exact = true } = {}) {
  const ok = await page.evaluate((selector, text, exact) => {
    const el = [...document.querySelectorAll(selector)].find((e) => {
      const t = e.textContent.replace(/\s+/g, " ").trim();
      return exact ? t === text : t.includes(text);
    });
    el?.click();
    return Boolean(el);
  }, selector, text, exact);
  if (!ok) throw new Error(`no ${selector} reading "${text}"`);
}

/** Set a React-controlled field by its label's own text, the way typing would. */
async function setByLabel(page, scope, labelText, value) {
  const ok = await page.evaluate((scope, labelText, value) => {
    const root = document.querySelector(scope) || document;
    const ownText = (l) => [...l.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim();
    const label = [...root.querySelectorAll("label")].find((l) => ownText(l) === labelText);
    const input = label?.control || label?.querySelector("input, select, textarea");
    if (!input) return false;
    const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(input, String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }, scope, labelText, value);
  if (!ok) throw new Error(`no field labelled "${labelText}"`);
}

/** Swap window.open for a stand-in that records what gets written to the pop-up. */
async function capturePrint(page, trigger) {
  await page.evaluate(() => {
    window.__shotPrint = null;
    window.open = () => {
      let html = "";
      return {
        document: { write: (s) => { html += s; }, close: () => { window.__shotPrint = html; } },
        focus() {}, print() {}, close() {},
        set onload(_fn) {},
      };
    };
  });
  await trigger();
  await page.waitForFunction(() => window.__shotPrint !== null, { timeout: 10000 });
  return page.evaluate(() => window.__shotPrint);
}

/** Catch the PDF blob on its way to the download link. */
async function capturePdf(page, trigger) {
  await page.evaluate(() => {
    window.__shotPdf = null;
    const original = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      blob.arrayBuffer().then((buf) => {
        const bytes = new Uint8Array(buf);
        let s = "";
        for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        window.__shotPdf = btoa(s);
      });
      return original(blob);
    };
  });
  await trigger();
  await page.waitForFunction(() => window.__shotPdf !== null, { timeout: 60000 });
  return Buffer.from(await page.evaluate(() => window.__shotPdf), "base64");
}

/**
 * A picture of the print pop-up at A4 width. Screenshotting the on-screen
 * preview instead clips it to the scroll box it sits in. A <base> pointing at
 * the app makes relative URLs in the markup (the letterhead) resolve the way
 * they do in the real pop-up, which inherits the app's address.
 */
async function renderPrint(html, file) {
  const tab = await browser.newPage();
  const base = `<base href="${BASE_URL}/">`;
  try {
    await tab.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
    await tab.setContent(html.includes("<head>") ? html.replace("<head>", `<head>${base}`) : base + html, {
      waitUntil: "networkidle0",
      timeout: 30000,
    });
    await tab.screenshot({ path: join(outDir, file), fullPage: true });
  } finally {
    await tab.close();
  }
}

async function printMediaPdf(page, file) {
  await page.emulateMediaType("print");
  await page.pdf({ path: file, format: "A4", printBackground: true });
  await page.emulateMediaType(null);
}

const normalise = (html) => html.split(BASE_URL).join("{origin}");
const save = (name, data) => writeFileSync(join(outDir, name), data);

/* ── documents ────────────────────────────────────────── */

async function billing(page) {
  manifest.billing ||= {};
  const done = [];
  for (const [i, kind] of ["invoice", "challan", "quotation"].entries()) {
    await goto(page, "/billing");
    await page.evaluate((sel, i) => document.querySelectorAll(sel)[i]?.click(), UI.billingTabs, i);
    await sleep(900);
    const wanted = manifest.billing[kind] || null;
    const opened = await page.evaluate((text, wanted) => {
      const buttons = [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === text);
      const hasNumber = (b) => [...(b.closest("tr")?.cells || [])].some((td) => td.textContent.trim().split(/\s+/).includes(wanted));
      const btn = wanted ? buttons.find(hasNumber) : buttons[0];
      btn?.click();
      return Boolean(btn);
    }, UI.viewText, wanted);
    if (!opened) { done.push(`${kind}: ${wanted ? `${wanted} not found` : "no documents"}`); continue; }

    await page.waitForSelector(UI.docPage, { timeout: 15000 });
    await sleep(1500); // letterhead background
    const number = wanted || (await page.$eval(UI.docTitle, (s) => s.textContent.split("—").pop().trim()));
    manifest.billing[kind] = number;

    const name = `billing-${kind}`;
    save(`${name}.html`, normalise(await page.$eval(UI.docPage, (el) => el.outerHTML)));
    const printHtml = await capturePrint(page, () => clickByText(page, `${UI.docRoot} button`, UI.printText));
    save(`${name}.print.html`, normalise(printHtml));
    await renderPrint(printHtml, `${name}.png`);
    save(`${name}.pdf`, await capturePdf(page, () => clickByText(page, `${UI.docRoot} button`, UI.pdfText)));
    done.push(`${kind}: ${number}`);
  }
  return done.join(", ");
}

async function slip(page) {
  await goto(page, "/employees");
  await clickByText(page, "button", UI.slipOpenText, { exact: false });
  await page.waitForSelector(UI.slipRoot, { timeout: 10000 });
  for (const [field, value] of Object.entries(manifest.slip)) await setByLabel(page, UI.slipRoot, field, value);
  await sleep(400);

  const html = await page.evaluate((root) => {
    const heading = [...document.querySelectorAll(`${root} div`)].find((d) => !d.children.length && d.textContent.trim() === "Monthly Salary Slip");
    return heading?.parentElement?.parentElement?.outerHTML || null;
  }, UI.slipRoot);
  if (!html) throw new Error("salary slip preview not found");
  save("salary-slip.html", normalise(html));
  const printHtml = await capturePrint(page, () => clickByText(page, `${UI.slipRoot} button`, UI.slipPrintText, { exact: false }));
  save("salary-slip.print.html", normalise(printHtml));
  await renderPrint(printHtml, "salary-slip.png");
  return "fixed figures";
}

async function spec(page) {
  await goto(page, "/inventory");
  await clickByText(page, UI.inventoryTab, UI.techPacksTab, { exact: false });
  await sleep(1500);
  const card = await page.evaluate((text, nameSel, wanted) => {
    // The actions row's parent is the card; its name heading identifies the tech pack.
    const titleOf = (b) => b.parentElement?.parentElement?.querySelector(nameSel)?.textContent.trim() || "";
    const buttons = [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === text);
    const btn = wanted ? buttons.find((b) => titleOf(b) === wanted) : buttons[0];
    if (!btn) return null;
    const title = titleOf(btn);
    btn.click();
    return title;
  }, UI.specText, UI.specCardName, manifest.specCard || null);
  if (card === null) return manifest.specCard ? `${manifest.specCard} not found` : "no tech packs with a spec sheet";
  manifest.specCard = card;

  await page.waitForSelector(UI.specArea, { timeout: 10000 });
  await sleep(1500);
  save("spec-sheet.html", normalise(await page.$eval(UI.specArea, (el) => el.outerHTML)));
  await printMediaPdf(page, join(outDir, "spec-sheet.pdf"));
  return card;
}

async function ledger(page) {
  await goto(page, "/inventory");
  await clickByText(page, UI.inventoryTab, UI.ledgerTab, { exact: false });
  await page.waitForSelector(UI.ledgerArea, { timeout: 10000 });
  const scope = `:has(> ${UI.ledgerArea})`;
  await setByLabel(page, scope, "From", manifest.ledger.from);
  await setByLabel(page, scope, "To", manifest.ledger.to);
  await sleep(1000);
  save("stock-ledger.html", normalise(await page.$eval(UI.ledgerArea, (el) => el.outerHTML)));
  await printMediaPdf(page, join(outDir, "stock-ledger.pdf"));
  return `${manifest.ledger.from} to ${manifest.ledger.to}`;
}

/* ── compare ──────────────────────────────────────────── */

function compare(a, b) {
  // What changes between two captures of the same document: timestamps (react-pdf
  // keeps its own in a standalone object), the file ID, and the structure-tree
  // node numbers Chrome hands out. Everything else must match byte for byte.
  const pdfBody = (buf) => buf.toString("latin1")
    .replace(/\(D:\d{14}[^)]*\)/g, "(D:)")
    .replace(/\/ID\s*\[[^\]]*\]/g, "")
    .replace(/node\d{8}/g, "node");
  const firstDiff = (x, y) => {
    let i = 0;
    while (i < x.length && x[i] === y[i]) i++;
    return `differs at char ${i}\n    was: …${x.slice(Math.max(0, i - 40), i + 60)}…\n    now: …${y.slice(Math.max(0, i - 40), i + 60)}…`;
  };
  let same = 0;
  const problems = [];
  for (const f of readdirSync(a).filter((f) => f !== "manifest.json").sort()) {
    if (!existsSync(join(b, f))) { problems.push(`${f}: missing`); continue; }
    const A = readFileSync(join(a, f));
    const B = readFileSync(join(b, f));
    const equal = f.endsWith(".pdf") ? pdfBody(A) === pdfBody(B) : A.equals(B);
    if (equal) same++;
    else if (f.endsWith(".html")) problems.push(`${f}: ${firstDiff(A.toString(), B.toString())}`);
    else problems.push(`${f}: differs; compare by eye`);
  }
  console.log(`${same} identical`);
  for (const p of problems) console.log(`CHANGED ${p}`);
  return problems.length ? 1 : 0;
}

/* ── run ──────────────────────────────────────────────── */

await assertServer();
const browser = await launch();
const blocked = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await guardWrites(page, blocked);
  await signIn(page);
  for (const [name, run] of Object.entries({ billing, slip, spec, ledger })) {
    if (only && !only.has(name)) continue;
    try { console.log(`${name}: ${await run(page)}`); }
    catch (e) { console.log(`${name}: FAILED ${e.message}`); }
  }
} finally {
  await browser.close();
  save("manifest.json", JSON.stringify({ ...manifest, capturedAt: new Date().toISOString() }, null, 2));
}
console.log(`\n→ ${outDir}${blocked.length ? `\n${blocked.length} writes blocked: ${[...new Set(blocked)].join(", ")}` : ""}`);
