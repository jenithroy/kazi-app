// The whole link over real HTTP, on this computer: the real Worker code -> a pretend Supabase -> the real SQL of migration 0071 on an in-memory
// Postgres. (The Worker's own unit checks are scripts/website-orders-selftest.mjs; the SQL's are 0071.test.mjs; this proves they fit together.)
//   node website-orders-link.test.mjs      (or: npm run test:link)
import { randomUUID } from "node:crypto";
import { startDevServer } from "./website-orders-dev.mjs";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name, detail ? `-> ${detail}` : ""); }
};
const group = (t) => console.log("\n" + t);

const be32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const pad = (arr, n) => { const out = new Uint8Array(Math.max(n, arr.length)); out.set(arr); return out; };
const png = () => pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...be32(13), 0x49, 0x48, 0x44, 0x52, ...be32(300), ...be32(120), 8, 6, 0, 0, 0], 400);
const webp = () => pad([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58, 10, 0, 0, 0, 0, 0, 0, 0, 99, 0, 0, 49, 0, 0], 120);
const dst = () => { const b = new Uint8Array(900).fill(0x20); b.set(new TextEncoder().encode("LA:ACME COFFEE")); return b; };
const b64 = (b) => Buffer.from(b).toString("base64");

// the Instagram reading is switched off here so that this test asks nobody (the real reading is checked in website-orders-selftest.mjs, group F5)
const dev = await startDevServer({ quiet: true, env: { LOGO_INSTAGRAM_DIRECT: "off" } });
const API = `${dev.base}/api/website-orders`;
const SITE = "https://kazimanufacturing.com";
let n = 0;
const design = (over = {}) => ({
  v: 1, key: randomUUID(), kind: "design",
  contact: { name: "Ama Rai", email: `ama${++n}@acmecoffee.com`, phone: "+44 7700 900123", company: "Acme Coffee" },
  items: [{ garment: "hoodie", label: "Hoodie", colour: { hex: "#1B3A2B", label: "Pine" }, qty: 50 }],
  brand: { handle: "acmecoffee", website: "https://acmecoffee.com", logoFrom: "upload", rightsConfirmed: true },
  deadline: "2027-01-20", message: "Left chest, please.",
  design: { stitches: 5231, colours: 3, widthMm: 90, heightMm: 38, placement: "Left chest" },
  files: [{ kind: "logo", name: "logo.png", data: b64(png()) }, { kind: "design", name: "acme.dst", data: b64(dst()) }, { kind: "preview", name: "preview.webp", data: b64(webp()) }],
  source: { page: "/create/" }, hp: "", ...over,
});
const quote = (over = {}) => ({ v: 1, key: randomUUID(), kind: "quote", contact: { name: "Bo Tamang", email: `bo${++n}@brand.com` }, items: [{ garment: "knitwear", label: "Knitwear", qty: 250 }], service: "Embroidery", message: "Samples first.", source: { page: "/quote/" }, ...over });
const post = (body, { ip = "198.51.100.1", origin = SITE, headers = {} } = {}) => fetch(API, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, "x-test-ip": ip, ...headers }, body: JSON.stringify(body) });
const stored = async () => (await (await fetch(`${dev.base}/__dev/orders`)).json());

try {
  group("1. Health, and the door as the website uses it");
  const h = await fetch(`${API}/health`, { headers: { Origin: SITE } });
  ok("health: the Worker, its key, the real order function and the bucket all answer", h.status === 200 && JSON.stringify(await h.json()) === JSON.stringify({ ok: true, v: 1, db: true, storage: true }));
  const pre = await fetch(API, { method: "OPTIONS", headers: { Origin: SITE, "Access-Control-Request-Method": "POST" } });
  ok("the preflight from the website's origin is allowed", pre.status === 204 && pre.headers.get("access-control-allow-origin") === SITE);
  ok("from another origin it is refused", (await fetch(API, { method: "OPTIONS", headers: { Origin: "https://evil.example" } })).status === 403);

  const first = design();
  const r1 = await post(first);
  const b1 = await r1.json();
  ok("a design order is stored and numbered WEB-001", r1.status === 200 && b1.ok && b1.ref === "WEB-001" && b1.duplicate === false, JSON.stringify(b1));
  let s = await stored();
  const row = s.web[0];
  ok("the dashboard's website view shows it: who, what, how many, at which stage, made by Website, unseen", s.web.length === 1 && row.orderId === "WEB-001" && row.customerName === "Acme Coffee" && row.styleName === "Hoodie" && row.colorway === "Pine" && Number(row.quantity) === 50 && row.stage === "Order Received" && row.status === "Active" && row.createdBy === "Website" && row.source === "website" && row.webSeenAt === null && row.deliveryDate === "2027-01-20");
  ok("the order's own record carries the contact, the brand, the design facts and the three files by path", row.web.contact.email === first.contact.email && row.web.brand.handle === "acmecoffee" && row.web.design.stitches === 5231 && row.web.files.map((f) => f.path).sort().join() === [`${first.key}/design.dst`, `${first.key}/logo.png`, `${first.key}/preview.webp`].sort().join());
  ok("its first stage line, and the customer's message as the first note", row.stageHistory.length === 1 && row.stageHistory[0].by === "Website" && row.notesList.length === 1 && row.notesList[0].text === "Left chest, please." && /Ama Rai \(website\)/.test(row.notesList[0].by));
  ok("the notes line says what it is and to check the logo", /Create by design\./.test(row.notes) && /Check the logo is theirs/.test(row.notes) && row.embellishments.join() === "Embroidery");
  ok("the address hash is nowhere in what the dashboard can read", !JSON.stringify(row).includes("198.51.100.1") && !("web_ip_hash" in row));
  ok("the three files are in the bucket, byte for byte, with their types", await (async () => {
    const f = await fetch(`${dev.base}/__dev/file?path=${encodeURIComponent(`${first.key}/design.dst`)}`);
    const l = await fetch(`${dev.base}/__dev/file?path=${encodeURIComponent(`${first.key}/logo.png`)}`);
    return f.status === 200 && Buffer.compare(Buffer.from(await f.arrayBuffer()), Buffer.from(dst())) === 0 && l.headers.get("content-type") === "image/png" && Buffer.compare(Buffer.from(await l.arrayBuffer()), Buffer.from(png())) === 0;
  })());
  ok("the team's own orders are untouched: still exactly the three, and none is a website order", s.team === 3);

  group("2. A resend, a quote, and the same key sent many times at once");
  const r2 = await post(first);
  const b2 = await r2.json();
  s = await stored();
  ok("the same key again is a duplicate with the same number, and nothing is added", r2.status === 200 && b2.duplicate === true && b2.ref === "WEB-001" && s.web.length === 1 && s.files.length === 3);
  const rq = await (await post(quote())).json();
  ok("a quote (no files) is WEB-002", rq.ok && rq.ref === "WEB-002" && (await stored()).files.length === 3);
  const sameKey = design();
  const burst = await Promise.all(Array.from({ length: 8 }, () => post(sameKey, { ip: "198.51.100.50" }).then((r) => r.json())));
  s = await stored();
  ok("eight posts of one key at once: every one is answered 200, one is the order and seven are duplicates, and exactly one order exists", burst.every((b) => b.ok) && burst.filter((b) => !b.duplicate).length === 1 && new Set(burst.map((b) => b.ref)).size === 1 && s.web.filter((o) => o.web.contact.email === sameKey.contact.email).length === 1, JSON.stringify(burst.map((b) => [b.ref, b.duplicate])));

  group("3. The back end failing, and the website trying again with the same key");
  await fetch(`${dev.base}/__dev/chaos`, { method: "POST", body: JSON.stringify({ rpc: 503, times: 2 }) });
  const retry = design();
  const before = (await stored()).web.length;
  const a1 = await post(retry, { ip: "198.51.100.60" });
  ok("while the database function is down the answer is 503 'unavailable' with Retry-After, and no order exists", a1.status === 503 && (await a1.json()).error === "unavailable" && a1.headers.get("retry-after") === "30" && (await stored()).web.length === before);
  const a2 = await post(retry, { ip: "198.51.100.60" });
  ok("the second try fails the same way", a2.status === 503);
  const a3 = await post(retry, { ip: "198.51.100.60" });
  const a3b = await a3.json();
  ok("the third try, with the same key, stores exactly one order (the files from the first try were simply overwritten)", a3.status === 200 && a3b.ok && a3b.duplicate === false && (await stored()).web.length === before + 1 && (await stored()).files.filter((f) => f.startsWith(retry.key)).length === 3);

  group("4. Refusals leave nothing behind");
  const count = async () => { const t = await stored(); return [t.web.length, t.files.length, t.team]; };
  const c0 = JSON.stringify(await count());
  for (const [name, body, field, status] of [
    ["a bad e-mail", design({ contact: { name: "A", email: "nope" } }), "contact.email", 400],
    ["a logo without the rights confirmation", design({ brand: { logoFrom: "upload", rightsConfirmed: false } }), "brand.rightsConfirmed", 400],
    ["an SVG as the logo", design({ files: [{ kind: "logo", data: b64(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>")) }] }), "files[0].data", 400],
    ["a design with no logo", design({ files: [] }), "files", 400],
    ["a quantity of zero", quote({ items: [{ garment: "tee", label: "Tee", qty: 0 }] }), "items[0].qty", 400],
    ["a filled honeypot", design({ hp: "x" }), "hp", 400],
  ]) {
    const r = await post(body);
    const b = await r.json();
    ok(`${name}: ${status} naming ${field}`, r.status === status && b.field === field, JSON.stringify(b));
  }
  const big = await post({ pad: "x".repeat(4_900_000) });
  ok("a body over 4.5 MB is 413", big.status === 413);
  ok("none of those stored an order or a file", JSON.stringify(await count()) === c0);

  group("5. The limits, with the real SQL behind them");
  await fetch(`${dev.base}/__dev/reset`, { method: "POST" });
  const ip = "203.0.113.9";
  const mine = [];
  for (let i = 0; i < 10; i += 1) { const o = quote(); mine.push(o); await post(o, { ip }); }
  const over = await post(quote(), { ip });
  const overBody = await over.json();
  ok("the 11th order within the hour from one address is 429 with Retry-After", over.status === 429 && overBody.error === "rate_limited" && over.headers.get("retry-after") === "600" && (await stored()).web.length === 10);
  const dup = await post(mine[3], { ip });
  ok("a resend of one of the ten is still answered (duplicate), the limit does not turn it away", dup.status === 200 && (await dup.json()).duplicate === true);
  ok("another address is fine", (await post(quote(), { ip: "203.0.113.10" })).status === 200);
  const shared = "same@customer.com";
  for (let i = 0; i < 5; i += 1) await post(quote({ contact: { name: "S", email: shared } }), { ip: `203.0.113.${100 + i}` });
  const sixth = await post(quote({ contact: { name: "S", email: shared.toUpperCase() } }), { ip: "203.0.113.150" });
  ok("a 6th order within the hour for one e-mail (any case, any address) is 429", sixth.status === 429);
  const withSecret = await post(quote(), { ip, headers: { "x-replay-secret": "nothing-configured" } });
  ok("a replay header does nothing when no secret is configured here", withSecret.status === 429);

  group("6. The logo route (no network: the Instagram reading switched off, and addresses that must be refused)");
  const nf = await fetch(`${API}/logo?handle=acmecoffee`, { headers: { Origin: SITE } });
  const nfb = await nf.json();
  ok("with the Instagram reading off a name finds nothing, asks nobody, and says why in plain words", nf.status === 404 && nfb.error === "not_found" && nfb.tried.length === 0 && /Instagram/.test(nfb.message) && /upload/i.test(nfb.message) && /website/i.test(nfb.message), JSON.stringify(nfb));
  for (const q of ["site=http://127.0.0.1:8787", "site=localhost", "site=https://10.0.0.1", "handle=a b"]) {
    const r = await fetch(`${API}/logo?${q}`, { headers: { Origin: SITE } });
    ok(`logo?${q} is refused (400)`, r.status === 400);
  }
} finally {
  await dev.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
