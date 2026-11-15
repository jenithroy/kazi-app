// Rehearsal of 0071_website_orders.sql and its undo on a scratch Postgres. Nothing here touches the live database.
//   node 0071.test.mjs      (or: npm run test:0071)
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { as, snapshot } from "./env.mjs";
import { freshOrdersDb, MIGRATION_0071 as MIGRATION, UNDO_0071 as UNDO } from "./orders-env.mjs";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
const GENERATOR = fs.readFileSync(REPO + "scripts/gen-schema-map.cjs", "utf8").replace(/\r\n/g, "\n");

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name, detail ? `-> ${detail}` : ""); }
};
const group = (t) => console.log("\n" + t);
async function raises(promise) {
  try { await promise; return { raised: false, message: "", code: "" }; }
  catch (e) { return { raised: true, message: String(e.message), code: String(e.code || "") }; }
}
const expectError = async (name, promise, re, code) => {
  const r = await raises(promise);
  ok(name, r.raised && re.test(r.message) && (!code || r.code === code), r.raised ? `wrong error: ${r.code} ${r.message}` : "no error was raised");
};

// --- who -----------------------------------------------------------------------------------------------------------------------------
const DIRECTOR = { sub: "uid-director" }, ADMIN = { sub: "uid-admin" }, STAFF = { sub: "uid-staff" }, STRANGER = { sub: "uid-nobody" };
const WRONG_ISSUER = { sub: "uid-director", iss: "https://evil.example/", aud: "x" };
const SERVICE = { sub: "service", role: "service_role", iss: "supabase", aud: "authenticated" };
const ANON = { sub: "anon", role: "anon", claimRole: "anon" };

const fresh = () => freshOrdersDb();

const oldColumns = async (db, view = "fs_orders") => (await db.query(`select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = $1 order by ordinal_position`, [view])).rows.map((r) => `${r.column_name}:${r.data_type}`);
const teamRows = async (db) => (await db.query(`select coalesce(jsonb_agg(to_jsonb(f) - 'source' - 'webSeenAt' - 'webSeenBy' - 'web' order by f."orderId"), '[]'::jsonb) as j from fs_orders f`)).rows[0].j;
const num = async (db, sql, params = []) => Number((await db.query(sql, params)).rows[0].n);
const door = (db, p) => db.query(`select public.ingest_website_order($1::jsonb) as r`, [JSON.stringify(p)]).then((r) => r.rows[0].r);
const order = (over = {}) => ({
  key: randomUUID(), customer_name: "Acme Coffee", style_name: "Hoodie", colorway: "Pine", quantity: 50, delivery_date: "2026-12-20",
  notes: "Design order: Hoodie, 50 pcs", message: "Left chest, please.", embellishments: ["Embroidery"], ip_hash: "ip-a",
  web: { v: 1, kind: "design", contact: { name: "Ama Rai", email: `ama-${Math.random().toString(36).slice(2)}@acme.test` }, items: [{ garment: "hoodie", qty: 50 }], files: [] },
  ...over,
});

let db = await fresh();

// ====================================================================================================================================
group("A. Applying the migration");
const S0 = await snapshot(db);
const TEAM_BEFORE = await teamRows(db);
const COLS_BEFORE = await oldColumns(db);
const VIEWDEF_BEFORE = (await db.query(`select pg_get_viewdef('public.fs_orders'::regclass, true) as d`)).rows[0].d;
const GRANTS_BEFORE = JSON.stringify((await db.query(`select grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name = 'fs_orders' order by 1, 2`)).rows);
const RELOPTS_BEFORE = (await db.query(`select reloptions from pg_class where oid = 'public.fs_orders'::regclass`)).rows[0].reloptions;
ok("the view being replaced is 0063's own (security_invoker on)", JSON.stringify(RELOPTS_BEFORE) === JSON.stringify(["security_invoker=on"]), JSON.stringify(RELOPTS_BEFORE));

await db.exec(MIGRATION);
ok("applies cleanly to a database that has never seen it", true);
const S1 = await snapshot(db);
await db.exec(MIGRATION);
const S2 = await snapshot(db);
ok("applying it a second time changes nothing (idempotent)", S1 === S2);

const before = JSON.parse(S0), after = JSON.parse(S1);
const added = (k) => after[k].filter((x) => !before[k].includes(x));
const removed = (k) => before[k].filter((x) => !after[k].includes(x));
ok("adds no table and no view (fs_orders is replaced in place; there is no second view)", added("tables").length === 0, JSON.stringify(added("tables")));
ok("adds exactly two functions: ingest_website_order(p jsonb) and website_order_limits_ok(p_ip text, p_email text)",
  JSON.stringify(added("functions").sort()) === JSON.stringify(["ingest_website_order(p jsonb)", "website_order_limits_ok(p_ip text, p_email text)"]), JSON.stringify(added("functions")));
ok("adds exactly two indexes (the key's unique one and the recent-orders one)", JSON.stringify(added("indexes").sort()) === JSON.stringify(["orders_web_recent_idx", "orders_web_ref_key"]), JSON.stringify(added("indexes")));
ok("adds no table policy and no trigger in public", added("policies").length === 0 && added("triggers").length === 0, JSON.stringify([added("policies"), added("triggers")]));
ok("removes nothing and changes no existing policy, trigger, function or index", ["tables", "functions", "policies", "triggers", "indexes"].every((k) => removed(k).length === 0));
ok("people, positions, sections and permissions are byte-identical", JSON.stringify(before.data) === JSON.stringify(after.data));

const cols = await oldColumns(db);
ok("fs_orders keeps every column it had, in the same order, and gains source, webSeenAt, webSeenBy, web at the end",
  JSON.stringify(cols.slice(0, COLS_BEFORE.length)) === JSON.stringify(COLS_BEFORE)
  && JSON.stringify(cols.slice(COLS_BEFORE.length).map((c) => c.split(":")[0])) === JSON.stringify(["source", "webSeenAt", "webSeenBy", "web"]), JSON.stringify(cols.slice(-6)));
ok("fs_orders shows neither web_ref nor the address hash", !cols.some((c) => /web_ref|web_ip_hash|ipHash/i.test(c)));
ok("every existing order is unchanged (all the old columns, byte for byte)", JSON.stringify(await teamRows(db)) === JSON.stringify(TEAM_BEFORE));
ok("every existing order has source 'dashboard'", (await num(db, `select count(*)::int as n from orders where source = 'dashboard'`)) === 3);
ok("fs_orders still returns all three (no website order exists yet)", (await num(db, `select count(*)::int as n from fs_orders`)) === 3);
ok("fs_orders is still security_invoker (REPLACE drops that setting; the migration sets it again)", JSON.stringify((await db.query(`select reloptions from pg_class where oid = 'public.fs_orders'::regclass`)).rows[0].reloptions) === JSON.stringify(["security_invoker=on"]));
ok("fs_orders kept the privileges it had (REPLACE does not touch them)", JSON.stringify((await db.query(`select grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name = 'fs_orders' order by 1, 2`)).rows) === GRANTS_BEFORE);

group("A2. The schema-map generator can still read the view (scripts/gen-schema-map.cjs: its own code, extracted from the file)");
{
  const start = GENERATOR.indexOf("function selectItems");
  const end = GENERATOR.indexOf("return { map, derived: [...new Set(derived)] };", start) + "return { map, derived: [...new Set(derived)] };\n}".length;
  const { parseViewDef } = new Function(`${GENERATOR.slice(start, end)}\nreturn { selectItems, parseViewDef };`)();
  const tableColumns = new Set((await db.query(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'orders'`)).rows.map((r) => r.column_name));
  const maps = {};
  for (const v of ["fs_orders"]) {
    const def = (await db.query(`select pg_get_viewdef('public.${v}'::regclass, true) as d`)).rows[0].d;
    maps[v] = parseViewDef(def, tableColumns, "orders");
  }
  const m = maps.fs_orders.map;
  const want = { orderId: "order_no", customerName: "customer_name", styleName: "style_name", quantity: "quantity", deliveryDate: "delivery_date", date: "order_date", createdAt: "created_at", stage: "stage", status: "status", patternId: "pattern_id", source: "source", webSeenAt: "web_seen_at", webSeenBy: "web_seen_by", web: "web_data" };
  const wrong = Object.entries(want).filter(([k, c]) => m[k] !== c);
  ok("every field the page writes, and the four new ones, maps to its column", wrong.length === 0, JSON.stringify(wrong));
  ok("the three computed fields stay derived (read-only)", ["stageHistory", "notesList", "assignedTo"].every((k) => maps.fs_orders.derived.includes(k)), JSON.stringify(maps.fs_orders.derived));
}

// ====================================================================================================================================
group("B. The door: ingest_website_order");
const K1 = randomUUID();
const r1 = await door(db, order({ key: K1, ip_hash: "ip-1" }));
ok("the first order is stored and numbered WEB-001", r1.ok === true && r1.duplicate === false && r1.ref === "WEB-001" && /^[0-9a-f-]{36}$/.test(r1.id), JSON.stringify(r1));
{
  const o = (await db.query(`select * from orders where web_ref = $1`, [K1])).rows[0];
  ok("it is a website order at 'Order Received', Active, made by Website, with no price", o.source === "website" && o.stage === "Order Received" && o.status === "Active" && o.created_by === "Website" && Number(o.price_per_pc_npr) === 0 && Number(o.total_value_npr) === 0);
  ok("its fields are the ones sent", o.customer_name === "Acme Coffee" && o.style_name === "Hoodie" && o.colorway === "Pine" && Number(o.quantity) === 50 && String(o.delivery_date.toISOString?.().slice(0, 10) ?? o.delivery_date).startsWith("2026-12-20") && o.notes === "Design order: Hoodie, 50 pcs");
  ok("embellishments are ['Embroidery']", JSON.stringify(o.embellishments) === JSON.stringify(["Embroidery"]));
  ok("web_data is what the website sent, the address hash is in its own column", o.web_data.kind === "design" && o.web_data.contact.name === "Ama Rai" && !("ipHash" in o.web_data) && o.web_ip_hash === "ip-1");
  const kathmandu = (await db.query(`select (now() at time zone 'Asia/Kathmandu')::date::text as d`)).rows[0].d;
  ok("the order date is the office's today (Kathmandu)", String(o.order_date.toISOString?.().slice(0, 10) ?? o.order_date).startsWith(kathmandu), `${o.order_date} vs ${kathmandu}`);
  const h = (await db.query(`select stage, changed_by, seq from order_stage_history where order_id = $1`, [o.id])).rows;
  ok("it has its first stage line", h.length === 1 && h[0].stage === "Order Received" && h[0].changed_by === "Website" && h[0].seq === 0);
  const n = (await db.query(`select text, author from order_notes where order_id = $1`, [o.id])).rows;
  ok("the customer's message is its first note, by name", n.length === 1 && n[0].text === "Left chest, please." && n[0].author === "Ama Rai (website)", JSON.stringify(n));
}
const counts = async () => [await num(db, `select count(*)::int as n from orders`), await num(db, `select count(*)::int as n from order_stage_history`), await num(db, `select count(*)::int as n from order_notes`)];
const c0 = await counts();
const r1b = await door(db, order({ key: K1, customer_name: "Somebody Else", quantity: 9999 }));
ok("the same key again is a duplicate: same id and number, nothing written", r1b.ok && r1b.duplicate === true && r1b.id === r1.id && r1b.ref === "WEB-001" && JSON.stringify(await counts()) === JSON.stringify(c0), JSON.stringify(r1b));
ok("the duplicate did not overwrite the order", (await db.query(`select customer_name, quantity from orders where web_ref = $1`, [K1])).rows[0].customer_name === "Acme Coffee");
const r2 = await door(db, order({ ip_hash: "ip-2" }));
ok("the next key gets the next number, and the resend did not use one up", r2.ref === "WEB-002" && r2.duplicate === false, JSON.stringify(r2));
ok("ORD- numbers are untouched by the WEB- series", (await num(db, `select count(*)::int as n from orders where order_no like 'ORD-%'`)) === 3);

group("B2. What it refuses");
for (const [name, p] of [
  ["no key", order({ key: undefined })], ["a key that is not a uuid", order({ key: "not-a-uuid" })], ["a numeric key", order({ key: 12345 })],
  ["quantity 0", order({ quantity: 0 })], ["a negative quantity", order({ quantity: -3 })], ["a fractional quantity", order({ quantity: 1.5 })],
  ["a huge quantity", order({ quantity: 1000001 })], ["a quantity that is text", order({ quantity: "lots" })], ["no quantity", order({ quantity: undefined })],
]) await expectError(`${name} is refused as invalid (PT400)`, door(db, p), /invalid/, "PT400");
await expectError("a body that is not an object is refused", db.query(`select public.ingest_website_order('[1,2]'::jsonb)`), /invalid: body/, "PT400");
await expectError("a null body is refused", db.query(`select public.ingest_website_order(null)`), /invalid: body/, "PT400");
await expectError("a web block over 200 KB is refused", door(db, order({ web: { contact: { email: "x@y.test" }, blob: "x".repeat(210000) } })), /too large/, "PT400");
ok("none of those wrote anything", JSON.stringify(await counts()) === JSON.stringify([c0[0] + 1, c0[1] + 1, c0[2] + 1]), JSON.stringify(await counts()));

group("B3. What it cleans");
{
  const rr = await door(db, order({
    customer_name: "  Evil\u0007\u0000Co\n\nLtd  ".replace("\u0000", "") + "x".repeat(300), style_name: "Hood\tie", colorway: "Pine\r\nGreen",
    notes: "line one\nline two\u0007bell\ttab", message: "a\nb\u0001c " + "m".repeat(5000), embellishments: ["Embroidery", "Evil", "DTF", "DTF", 7, null],
    delivery_date: "not a date", web: { contact: { name: "N\u0007ame", email: "c@d.test" } },
  }));
  const o = (await db.query(`select * from orders where id = $1`, [rr.id])).rows[0];
  ok("the customer's name has no control characters and is cut at 160", !/[\u0000-\u001f]/.test(o.customer_name) && o.customer_name.length <= 160 && o.customer_name.startsWith("Evil"), JSON.stringify(o.customer_name.slice(0, 30)));
  ok("style and colour lose tabs and line breaks", o.style_name === "Hood ie" && o.colorway === "Pine Green", JSON.stringify([o.style_name, o.colorway]));
  ok("notes keep their line breaks and tabs but lose the other control characters", o.notes === "line one\nline two bell\ttab", JSON.stringify(o.notes));
  const n = (await db.query(`select text, author from order_notes where order_id = $1`, [rr.id])).rows[0];
  ok("the message note is cut at 4000, keeps its line break, loses control characters", n.text.length === 4000 && n.text.startsWith("a\nb c "), String(n.text.length));
  ok("the note's author has no control characters", n.author === "N ame (website)", JSON.stringify(n.author));
  ok("only the known embellishments are kept, once each", JSON.stringify(o.embellishments) === JSON.stringify(["DTF", "Embroidery"]), JSON.stringify(o.embellishments));
  ok("a delivery date that is not a date is dropped, the order still arrives", o.delivery_date === null);
  const o2 = await door(db, order({ embellishments: "Embroidery", web: "nope", message: "", delivery_date: "2026-12-24" }));
  const row2 = (await db.query(`select embellishments, web_data, delivery_date from orders where id = $1`, [o2.id])).rows[0];
  ok("embellishments that are not a list give none; a web block that is not an object gives {}; no message gives no note",
    row2.embellishments.length === 0 && JSON.stringify(row2.web_data) === "{}" && (await num(db, `select count(*)::int as n from order_notes where order_id = $1`, [o2.id])) === 0);
  const o3 = await door(db, order({ customer_name: "   ", style_name: "", colorway: "", notes: "" }));
  const row3 = (await db.query(`select customer_name, style_name, colorway, notes from orders where id = $1`, [o3.id])).rows[0];
  ok("a blank customer name becomes 'Website customer'; blank style, colour and notes are null", row3.customer_name === "Website customer" && row3.style_name === null && row3.colorway === null && row3.notes === null, JSON.stringify(row3));
}

group("B4. The limits");
await db.exec(`delete from orders where source = 'website'`);          // a clean slate (history and notes go with them)
{
  // per address: 10 an hour
  const ip = "ip-limit";
  for (let i = 0; i < 10; i++) await door(db, order({ ip_hash: ip }));
  await expectError("an 11th order within the hour from one address is refused (PT429)", door(db, order({ ip_hash: ip })), /rate_limited/, "PT429");
  ok("another address is not affected", (await door(db, order({ ip_hash: "ip-other" }))).ok === true);
  const key10 = (await db.query(`select web_ref from orders where web_ip_hash = $1 order by created_at, id limit 1`, [ip])).rows[0].web_ref;
  const again = await door(db, order({ key: key10, ip_hash: ip }));
  ok("a RESEND of an order that was stored is still answered (a duplicate, not a 429) even when that address is at its limit", again.ok === true && again.duplicate === true, JSON.stringify(again));
  ok("an order with no address hash is not counted against any address", (await door(db, order({ ip_hash: undefined }))).ok === true);
  const replay = await door(db, order({ ip_hash: ip, replay: true }));
  ok("replay: true skips the limits (the Worker sets it only for a caller that holds the secret)", replay.ok === true && replay.duplicate === false);
  await db.exec(`update orders set created_at = now() - interval '2 hours' where web_ip_hash = '${ip}'`);
  ok("orders older than an hour no longer count", (await door(db, order({ ip_hash: ip }))).ok === true);
}
await db.exec(`delete from orders where source = 'website'`);
{
  // per e-mail: 5 an hour, case-insensitive, whatever the address
  const mail = "Same@Customer.test";
  for (let i = 0; i < 5; i++) await door(db, order({ ip_hash: `ip-e${i}`, web: { contact: { name: "S", email: i % 2 ? mail.toLowerCase() : mail } } }));
  await expectError("a 6th order within the hour for one e-mail (any case, any address) is refused (PT429)", door(db, order({ ip_hash: "ip-e9", web: { contact: { name: "S", email: "SAME@customer.TEST" } } })), /rate_limited/, "PT429");
  ok("another e-mail is fine", (await door(db, order({ ip_hash: "ip-e9" }))).ok === true);
}
await db.exec(`delete from orders where source = 'website'`);
{
  // all of them: 120 an hour
  await db.exec(`insert into orders (order_no, quantity, source, web_ref, web_data, created_at) select 'WEB-9' || g, 1, 'website', gen_random_uuid(), '{}'::jsonb, now() from generate_series(1, 119) g`);
  ok("the 120th website order within the hour is still taken", (await door(db, order({ ip_hash: "ip-fresh" }))).ok === true);
  await expectError("the 121st is refused (PT429)", door(db, order({ ip_hash: "ip-fresh-2" })), /rate_limited/, "PT429");
  ok("the limits count website orders only: the team's own orders are not in the 120", (await num(db, `select count(*)::int as n from orders where source = 'dashboard'`)) === 3);
  ok("the Worker's pre-check says the same (false while the hour is full, with an address and without)", await (async () => {
    const q = (ip, email) => db.query(`select public.website_order_limits_ok($1, $2) as ok`, [ip, email]).then((r) => r.rows[0].ok);
    return (await q("ip-x", "x@y.test")) === false && (await q(null, null)) === false;
  })());
  await db.exec(`update orders set created_at = now() - interval '61 minutes' where source = 'website'`);
  ok("and the count falls as the hour passes", (await door(db, order({ ip_hash: "ip-fresh" }))).ok === true);
  ok("...and the pre-check says yes again", (await db.query(`select public.website_order_limits_ok('ip-new', 'new@y.test') as ok`)).rows[0].ok === true);
}
await db.exec(`delete from orders where source = 'website'`);

// ====================================================================================================================================
group("C. The table's own rules");
await expectError("a source other than dashboard / website is refused", db.query(`insert into orders (order_no, quantity, source) values ('X-1', 1, 'phone')`), /check constraint/i);
await expectError("a website order with no key is refused", db.query(`insert into orders (order_no, quantity, source) values ('X-2', 1, 'website')`), /orders_website_has_key|check constraint/i);
{
  const k = randomUUID();
  await db.query(`insert into orders (order_no, quantity, source, web_ref) values ('X-3', 1, 'website', $1)`, [k]);
  await expectError("two orders cannot share a key", db.query(`insert into orders (order_no, quantity, source, web_ref) values ('X-4', 1, 'website', $1)`, [k]), /duplicate key|unique/i);
  await db.exec(`delete from orders where order_no = 'X-3'`);
  await db.query(`insert into orders (order_no, quantity) values ('X-5', 1), ('X-6', 1)`);
  ok("orders with no key (everything the team enters) do not collide on the empty key", (await num(db, `select count(*)::int as n from orders where web_ref is null and order_no in ('X-5','X-6')`)) === 2);
  await db.exec(`delete from orders where order_no in ('X-5','X-6')`);
}
ok("deleting a website order takes its stage line and notes with it", await (async () => {
  const r = await door(db, order());
  await db.query(`delete from orders where id = $1`, [r.id]);
  return (await num(db, `select count(*)::int as n from order_stage_history where order_id = $1`, [r.id])) === 0 && (await num(db, `select count(*)::int as n from order_notes where order_id = $1`, [r.id])) === 0;
})());

// ====================================================================================================================================
group("D. Who can see and do what (Supabase-style roles)");
const W1 = await door(db, order({ ip_hash: "ip-d" }));
const W2 = await door(db, order({ ip_hash: "ip-d2" }));
ok("a website order is a real order everywhere: fs_orders holds the team's three AND the website's two, and 'source' tells them apart",
  (await num(db, `select count(*)::int as n from fs_orders`)) === 5
  && (await num(db, `select count(*)::int as n from fs_orders where source = 'dashboard'`)) === 3 && (await num(db, `select count(*)::int as n from fs_orders where source = 'website' and "orderId" like 'WEB-%'`)) === 2);
ok("the old columns of the team's three orders are unchanged even with website orders beside them", JSON.stringify((await db.query(`select coalesce(jsonb_agg(to_jsonb(f) - 'source' - 'webSeenAt' - 'webSeenBy' - 'web' order by f."orderId"), '[]'::jsonb) as j from fs_orders f where f.source = 'dashboard'`)).rows[0].j) === JSON.stringify(TEAM_BEFORE));
await as(db, DIRECTOR, async () => {
  ok("a director reads the website orders with the rest", (await num(db, `select count(*)::int as n from fs_orders`)) === 5 && (await num(db, `select count(*)::int as n from fs_orders where source = 'website'`)) === 2);
  const row = (await db.query(`select * from fs_orders where id = $1`, [W1.id])).rows[0];
  ok("the view shows the website block without the address hash, and the stage line and note", row.web && row.web.contact.name === "Ama Rai" && !JSON.stringify(row).includes("ip-d") && row.stageHistory.length === 1 && row.notesList.length === 1 && row.webSeenAt === null);
  const upd = await db.query(`update orders set web_seen_at = now(), web_seen_by = 'Dina Director' where id = $1 returning web_seen_by`, [W1.id]);
  ok("a person who can edit orders can mark one as seen", upd.rows.length === 1 && upd.rows[0].web_seen_by === "Dina Director");
  const seen = (await db.query(`select "webSeenAt", "webSeenBy" from fs_orders where id = $1`, [W1.id])).rows[0];
  ok("...and the view shows it", seen.webSeenAt !== null && seen.webSeenBy === "Dina Director");
});
await as(db, ADMIN, async () => {
  ok("a view-only admin reads the website orders too", (await num(db, `select count(*)::int as n from fs_orders where source = 'website'`)) === 2);
  const upd = await db.query(`update orders set web_seen_at = now() where id = $1 returning id`, [W2.id]);
  ok("...but cannot mark one as seen (row level security: nothing is updated)", upd.rows.length === 0);
});
await as(db, STAFF, async () => ok("regular staff see no orders at all, website or team", (await num(db, `select count(*)::int as n from fs_orders`)) === 0));
await as(db, STRANGER, async () => ok("a token that matches no person sees nothing", (await num(db, `select count(*)::int as n from fs_orders`)) === 0));
await as(db, WRONG_ISSUER, async () => ok("a director's token from the wrong issuer sees nothing", (await num(db, `select count(*)::int as n from fs_orders`)) === 0));
await as(db, ANON, async () => ok("anonymous visitors see nothing through the view either (row level security on the table)", (await num(db, `select count(*)::int as n from fs_orders`)) === 0));
ok("...and on the table itself they see no rows (row level security, as for every table here)", await as(db, ANON, async () => (await num(db, `select count(*)::int as n from orders`)) === 0));
ok("the service role (the Worker) can read the website orders", await as(db, SERVICE, async () => (await num(db, `select count(*)::int as n from fs_orders where source = 'website'`)) === 2));
for (const [who, name] of [[DIRECTOR, "a director"], [ADMIN, "a mid-tier admin"], [STAFF, "regular staff"], [ANON, "an anonymous visitor"]]) {
  await expectError(`${name} cannot call ingest_website_order`, as(db, who, () => door(db, order())), /permission denied/);
}
ok("the service role can call it", await as(db, SERVICE, async () => (await door(db, order({ ip_hash: "ip-svc" }))).ok === true));
for (const [who, name] of [[DIRECTOR, "a director"], [ADMIN, "a mid-tier admin"], [STAFF, "regular staff"], [ANON, "an anonymous visitor"]]) {
  await expectError(`${name} cannot call website_order_limits_ok either`, as(db, who, () => db.query(`select public.website_order_limits_ok('a', 'b')`)), /permission denied/);
}
ok("the service role can ask the limits", await as(db, SERVICE, async () => (await db.query(`select public.website_order_limits_ok('a', 'b') as ok`)).rows[0].ok === true));
await expectError("nobody can touch the sequence from outside", as(db, DIRECTOR, () => db.query(`select nextval('public.web_order_seq')`)), /permission denied/);

group("E. The files");
{
  const b = (await db.query(`select * from storage.buckets where id = 'website-orders'`)).rows;
  ok("the bucket exists, is private, holds up to 6 MB a file and accepts pictures, pdf and the embroidery file",
    b.length === 1 && b[0].public === false && Number(b[0].file_size_limit) === 6291456 && b[0].allowed_mime_types.includes("application/octet-stream") && b[0].allowed_mime_types.includes("image/png"));
  ok("applying twice left one bucket", (await num(db, `select count(*)::int as n from storage.buckets where id = 'website-orders'`)) === 1);
  await db.exec(`insert into storage.buckets (id, name) values ('somewhere-else', 'somewhere-else')`);
  await db.exec(`insert into storage.objects (bucket_id, name) values ('website-orders', 'abc/logo.png'), ('somewhere-else', 'x.png')`);
  ok("one read policy on storage.objects", (await num(db, `select count(*)::int as n from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'website_orders_read'`)) === 1);
  ok("a director can read a file in the bucket, and only that bucket's", await as(db, DIRECTOR, async () => (await db.query(`select name from storage.objects order by name`)).rows.map((r) => r.name).join() === "abc/logo.png"));
  ok("a view-only admin can read it too", await as(db, ADMIN, async () => (await num(db, `select count(*)::int as n from storage.objects`)) === 1));
  ok("regular staff cannot", await as(db, STAFF, async () => (await num(db, `select count(*)::int as n from storage.objects`)) === 0));
  ok("a token that matches no person cannot", await as(db, STRANGER, async () => (await num(db, `select count(*)::int as n from storage.objects`)) === 0));
  ok("an anonymous visitor cannot", await as(db, ANON, async () => (await num(db, `select count(*)::int as n from storage.objects`)) === 0));
  await expectError("a director cannot write a file from the browser (no insert policy)", as(db, DIRECTOR, () => db.query(`insert into storage.objects (bucket_id, name) values ('website-orders', 'evil.png')`)), /row-level security/i);
  await expectError("...nor change one", as(db, DIRECTOR, async () => { const r = await db.query(`update storage.objects set name = 'x' where bucket_id = 'website-orders' returning id`); if (r.rows.length === 0) throw new Error("row-level security: nothing updated"); }), /row-level security/i);
}

// ====================================================================================================================================
group("F. The undo");
const SNAP_FULL = await snapshot(db);
await expectError("it refuses while website orders exist", db.exec(UNDO), /Website orders exist/, "23514");
await db.exec("rollback").catch(() => {});
ok("the refusal changed nothing (the view and columns are still there)", (await num(db, `select count(*)::int as n from fs_orders where source = 'website'`)) === 2 && (await snapshot(db)) === SNAP_FULL);
await db.exec(`set kazi.confirm_drop_website_orders = 'yes'`);
await db.exec(UNDO);
ok("with the confirmation it runs, and the website orders go with their stage lines and notes", (await num(db, `select count(*)::int as n from orders`)) === 3 && (await num(db, `select count(*)::int as n from order_stage_history`)) === 2 && (await num(db, `select count(*)::int as n from order_notes`)) === 1);
await db.exec(`reset kazi.confirm_drop_website_orders`);
const S3 = await snapshot(db);
ok("everything it added is gone: the snapshot equals the one from before the migration", S3 === S0, "snapshots differ");
ok("fs_orders is exactly 0063's again (definition, columns, privileges, security_invoker)",
  (await db.query(`select pg_get_viewdef('public.fs_orders'::regclass, true) as d`)).rows[0].d === VIEWDEF_BEFORE
  && JSON.stringify(await oldColumns(db)) === JSON.stringify(COLS_BEFORE)
  && JSON.stringify((await db.query(`select grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name = 'fs_orders' order by 1, 2`)).rows) === GRANTS_BEFORE
  && JSON.stringify((await db.query(`select reloptions from pg_class where oid = 'public.fs_orders'::regclass`)).rows[0].reloptions) === JSON.stringify(RELOPTS_BEFORE));
ok("the team's orders are byte-identical to before", JSON.stringify(await teamRows(db)) === JSON.stringify(TEAM_BEFORE));
ok("the orders table has none of the new columns", (await num(db, `select count(*)::int as n from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name in ('source','web_ref','web_data','web_seen_at','web_seen_by','web_ip_hash')`)) === 0);
ok("the sequence and the storage policy are gone", (await num(db, `select count(*)::int as n from pg_class where relname = 'web_order_seq'`)) === 0 && (await num(db, `select count(*)::int as n from pg_policies where schemaname = 'storage' and policyname = 'website_orders_read'`)) === 0);
ok("the bucket is left alone (Storage refuses SQL deletes; the file says so)", (await num(db, `select count(*)::int as n from storage.buckets where id = 'website-orders'`)) === 1);
await db.exec(UNDO);
ok("running the undo again is harmless", (await snapshot(db)) === S0);

group("F2. The undo without any website order, on a database that never had the migration, and the round trip");
{
  const d2 = await fresh();
  const s0 = await snapshot(d2);
  await d2.exec(UNDO);
  ok("on a database that never had 0071 it runs and changes nothing", (await snapshot(d2)) === s0);
  await d2.exec(MIGRATION);
  const r = await d2.query(`select public.ingest_website_order($1::jsonb) as r`, [JSON.stringify(order())]);
  ok("after a round trip (apply, undo, apply) a new order is WEB-001 again", r.rows[0].r.ref === "WEB-001");
  await d2.exec(`delete from orders where source = 'website'`);
  await d2.exec(UNDO);
  ok("a migration with no website orders is undone without the confirmation", (await snapshot(d2)) === s0);
  await d2.exec(MIGRATION);
  await d2.exec(UNDO);
  ok("and the undo leaves a database that takes the migration again", true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
