/**
 * Shared plumbing for the redesign's screenshot and document scripts
 * (REDESIGN.md §10): find Edge, sign in, and make sure a run can only look.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import puppeteer from "puppeteer-core";

export const ROOT = resolve(import.meta.dirname, "../..");
export const BASE_URL = process.env.KAZI_SHOT_BASE || "http://localhost:5199";

const EDGE_PATHS = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
];

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** `--key value` and bare `--flag` pairs. */
export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

/** .env.local without pulling in dotenv. Only the script reads it; Vite never exposes non-VITE_ keys. */
export function loadEnvLocal() {
  const file = resolve(ROOT, ".env.local");
  const env = {};
  if (!existsSync(file)) return env;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

export async function assertServer() {
  try {
    await fetch(BASE_URL, { method: "HEAD" });
  } catch {
    throw new Error(`Nothing is answering at ${BASE_URL}. Start it with: npm run dev -- --port 5199`);
  }
}

export async function launch() {
  const executablePath = process.env.KAZI_SHOT_BROWSER || EDGE_PATHS.find((p) => existsSync(p));
  if (!executablePath) throw new Error("Microsoft Edge not found. Set KAZI_SHOT_BROWSER to a Chromium binary.");
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-first-run", "--no-default-browser-check", "--hide-scrollbars"],
  });
  // "Download PDF" clicks a blob link; the document scripts read the blob instead.
  const session = await browser.target().createCDPSession();
  await session.send("Browser.setDownloadBehavior", { behavior: "deny" });
  return browser;
}

// RPCs that only read. Everything else under /rest/v1/rpc/ can change data
// (award_points, next_doc_number, chat_*), so it is refused like any other write.
const READ_RPCS = new Set(["me"]);

/**
 * Would this request change anything? Runs sign in with a real account against
 * the real database, and several pages write on load (seeding empty tables,
 * tidying old rows, logging usage). A screenshot must not do any of that.
 */
export function isWrite(req) {
  const method = req.method();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return false;
  const url = new URL(req.url());
  if (url.pathname.startsWith("/auth/v1/")) return false; // sign-in and token refresh
  const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/([^/?]+)/);
  if (rpc) return !READ_RPCS.has(rpc[1]);
  if (url.hostname === "identitytoolkit.googleapis.com" || url.hostname === "securetoken.googleapis.com") return false;
  // Firestore listens over POST too; only its write stream and commits change data.
  if (url.hostname.endsWith("googleapis.com")) return /\/Write\/channel|:commit|:batchWrite/.test(url.pathname);
  return true;
}

/** Abort writes (recording them in `log`) and dismiss every alert/confirm/prompt. */
export async function guardWrites(page, log) {
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    if (req.isInterceptResolutionHandled()) return;
    if (isWrite(req)) {
      log.push(`${req.method()} ${req.url().split("?")[0]}`);
      req.abort("blockedbyclient");
    } else {
      req.continue();
    }
  });
  page.on("dialog", (d) => d.dismiss().catch(() => {}));
}

export async function signIn(page, env = loadEnvLocal()) {
  const email = env.KAZI_SHOT_EMAIL;
  const password = env.KAZI_SHOT_PASSWORD;
  if (!email || !password) throw new Error("Set KAZI_SHOT_EMAIL and KAZI_SHOT_PASSWORD in .env.local");
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[type="email"]', { timeout: 30000 });
  await page.type('input[type="email"]', email);
  await page.type('input[type="password"]', password);
  await Promise.all([
    page.waitForFunction(() => !location.pathname.startsWith("/login"), { timeout: 45000 }),
    page.click('button[type="submit"]'),
  ]);
  await settle(page);
}

/** Wait for data to arrive: network quiet, the auth gate gone, then a beat for charts. */
export async function settle(page, extraMs = 1200) {
  await page.waitForNetworkIdle({ idleTime: 700, timeout: 20000 }).catch(() => {});
  await page
    .waitForFunction(() => !/Loading KAZI data/.test(document.body?.innerText || ""), { timeout: 20000 })
    .catch(() => {});
  await sleep(extraMs);
}

export async function goto(page, path) {
  await page.goto(BASE_URL + path, { waitUntil: "domcontentloaded" });
  await settle(page);
}
