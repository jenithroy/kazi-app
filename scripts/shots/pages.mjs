/**
 * Page screenshots for the responsive redesign (REDESIGN.md §10).
 *
 *   npm run shots -- --label before --widths 390,768,1440
 *   npm run shots -- --label tasks-after --routes /tasks --widths 390,1440
 *   npm run shots -- --label kit --kit
 *
 * Writes one PNG per route and width, plus report.json, to scratch/shots/<label>/.
 * The report records, per shot, how far the page overflows sideways and the
 * outermost elements causing it. It also lists where the route actually landed
 * (a missing permission redirects) and which writes the guard refused.
 *
 * Needs the dev server: npm run dev -- --port 5199
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { BASE_URL, ROOT, assertServer, goto, guardWrites, launch, parseArgs, signIn, sleep } from "./common.mjs";

const ALL_ROUTES = [
  "/login",
  "/dashboard", "/tasks", "/attendance",
  "/production", "/qc", "/inventory",
  "/sales", "/finance", "/purchases", "/billing", "/content",
  "/employees", "/customers", "/marketing",
  "/messenger", "/admin", "/usage", "/roles", "/bug-report", "/changelog",
];

const HEIGHTS = { 360: 780, 390: 844, 768: 1024, 1024: 768, 1440: 900 };
const MAX_SHOT_HEIGHT = 16000;

const args = parseArgs(process.argv.slice(2));
const label = args.label || new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
// Git Bash rewrites an argument that starts with "/" into a Windows path
// ("/login" arrives as "C:/Program Files/Git/login"), so routes may be given
// without the slash: --routes login,tasks
function toRoute(r) {
  if (/^[A-Za-z]:[\\/]/.test(r)) {
    throw new Error(`"${r}" looks like a path the shell rewrote. Pass routes without the leading slash (login,tasks) or set MSYS_NO_PATHCONV=1.`);
  }
  return "/" + r.replace(/^\/+/, "");
}
const routes = args.kit ? ["/__kit"] : args.routes ? String(args.routes).split(",").map((r) => r.trim()).filter(Boolean).map(toRoute) : ALL_ROUTES;
const widths = String(args.widths || "390,1440").split(",").map(Number);
const outDir = resolve(ROOT, "scratch/shots", label);
mkdirSync(outDir, { recursive: true });

const slug = (route) => route.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "root";

/** Runs in the page. How far does it spill past the right edge, and what is doing it? */
function measure() {
  const vw = document.documentElement.clientWidth;
  const scroller = document.querySelector(".kscroll");
  const describe = (el) => {
    const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 3).join(".") : "";
    return el.tagName.toLowerCase() + (el.id ? `#${el.id}` : "") + (cls ? `.${cls}` : "");
  };
  const escapes = (el) => {
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.position === "fixed") return false;
      if (p !== el && p !== scroller && /auto|scroll|hidden|clip/.test(cs.overflowX) && p.getBoundingClientRect().right <= vw + 1) return false;
    }
    return true;
  };
  const found = new Set();
  const offenders = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (!r.width || r.right <= vw + 1) continue;
    if (el.parentElement && found.has(el.parentElement)) { found.add(el); continue; }
    if (!escapes(el)) continue;
    found.add(el);
    offenders.push({ el: describe(el), right: Math.round(r.right) });
  }
  offenders.sort((a, b) => b.right - a.right);

  // The document itself rarely scrolls here: the shell (or #root) does. Take the
  // bottom of whichever wide vertical scroller holds the most content.
  let contentHeight = document.documentElement.scrollHeight;
  for (const el of document.querySelectorAll("body, body *")) {
    if (el.scrollHeight <= el.clientHeight + 1 || el.clientWidth < vw * 0.5) continue;
    if (!/auto|scroll/.test(getComputedStyle(el).overflowY) && el !== document.body) continue;
    contentHeight = Math.max(contentHeight, el.getBoundingClientRect().top + el.scrollHeight);
  }

  return {
    viewport: vw,
    pageOverflow: Math.max(0, document.documentElement.scrollWidth - vw),
    mainOverflow: scroller ? Math.max(0, scroller.scrollWidth - scroller.clientWidth) : 0,
    offenders: offenders.slice(0, 6),
    contentHeight,
  };
}

await assertServer();
const browser = await launch();
const report = [];
const blocked = [];

try {
  const page = await browser.newPage();
  await guardWrites(page, blocked);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message || e)));

  async function shoot(route, width) {
    const height = HEIGHTS[width] || 900;
    const touch = width < 1024;
    const viewport = { width, height, deviceScaleFactor: 1, isMobile: touch, hasTouch: touch };
    await page.setViewport(viewport);
    const blockedFrom = blocked.length;
    const errorsFrom = errors.length;
    await goto(page, route);
    // The app treats any failed profile load, a network blip included, as signed
    // out and shows the login screen. Sign back in once rather than capture that.
    if (!args.kit && route !== "/login" && new URL(page.url()).pathname === "/login") {
      console.log(`  ${route}@${width} landed on /login; signing in again`);
      await signIn(page);
      await page.setViewport(viewport);
      await goto(page, route);
    }

    const { contentHeight, ...m } = await page.evaluate(measure);
    // The app scrolls inside its own main area, so a full-page capture would stop at
    // the fold. Grow the window to the content instead.
    const tall = Math.min(Math.ceil(contentHeight), MAX_SHOT_HEIGHT);
    if (tall > height) { await page.setViewport({ ...viewport, height: tall }); await sleep(500); }

    const file = `${slug(route)}@${width}.png`;
    await page.screenshot({ path: resolve(outDir, file) });
    report.push({
      route, width, file,
      landedOn: new URL(page.url()).pathname,
      ...m,
      blockedWrites: blocked.slice(blockedFrom),
      pageErrors: errors.slice(errorsFrom),
    });
    const flag = m.pageOverflow || m.mainOverflow ? `  overflow page=${m.pageOverflow} main=${m.mainOverflow}` : "";
    console.log(`${file}${flag}`);
  }

  if (routes.includes("/login")) for (const w of widths) await shoot("/login", w);
  if (!args.kit) await signIn(page);
  for (const route of routes.filter((r) => r !== "/login")) {
    for (const w of widths) {
      try { await shoot(route, w); }
      catch (e) { console.log(`FAILED ${route}@${w}: ${e.message}`); report.push({ route, width: w, failed: e.message }); }
    }
  }
} finally {
  await browser.close();
  writeFileSync(resolve(outDir, "report.json"), JSON.stringify(report, null, 2));
}

const spills = report.filter((r) => r.pageOverflow || r.mainOverflow);
const redirected = report.filter((r) => r.landedOn && r.landedOn !== r.route);
console.log(`\n${report.length} shots → ${outDir}`);
console.log(`${spills.length} with sideways overflow, ${redirected.length} redirected, ${blocked.length} writes blocked (base ${BASE_URL})`);
