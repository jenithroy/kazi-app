// The website-orders link, running on this computer with nothing live behind it:
//
//   website  ->  THE REAL WORKER CODE (worker/lib/websiteOrders.js, logoFinder.js)  ->  a pretend Supabase  ->  THE REAL SQL (migration 0071)
//                                                                                                              on an in-memory Postgres (PGlite)
//
//   node scripts/rehearse-migration/website-orders-dev.mjs [--port 8787]
//
// Then build or run the website with NEXT_PUBLIC_DASHBOARD_API_URL=http://127.0.0.1:8787 and place orders. Nothing here touches the live
// database, bucket or Worker; everything is lost when it stops. What it serves:
//
//   /api/website-orders ...        the Worker's own routes (orders, logo, health), exactly as deployed (CORS allows localhost here)
//   /__supabase/...                what the Worker's calls to Supabase land on (PostgREST rpc + select, Storage upload + bucket)
//   GET  /__dev/orders             every website order stored, as the dashboard's fs_orders view shows it (source = 'website'), and how many team orders exist
//   GET  /__dev/file?path=<key>/logo.png     a stored file, with its type
//   POST /__dev/reset              start again (empty database, empty bucket)
//   POST /__dev/chaos              {"rpc":503,"times":2}: the next 2 calls to the order function answer 503 (to watch the website retry)
//   an  x-test-ip: 1.2.3.4  header on a request is used as the sender's address (to try the per-address limit)
//
// The logo finder here is the real one and uses the real network: an Instagram name (?handle=) reads the real instagram.com page and a website
// (?site=) the real site. Set LOGO_INSTAGRAM_DIRECT=off in the environment of this process (or pass env to startDevServer) to switch the
// Instagram reading off, which is what the automatic test does so that it asks nobody.
import http from "node:http";
import { pathToFileURL } from "node:url";
import { freshOrdersDb, MIGRATION_0071 } from "./orders-env.mjs";
import { handleWebsiteOrders } from "../../worker/lib/websiteOrders.js";

const readBody = (req) => new Promise((resolve, reject) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => resolve(Buffer.concat(chunks)));
  req.on("error", reject);
});

const json = (res, status, body, extra = {}) => {
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", ...extra });
  res.end(JSON.stringify(body));
};

export async function startDevServer({ port = 0, quiet = false, env: extraEnv = {} } = {}) {
  const say = (...a) => { if (!quiet) console.log(...a); };
  let db = null;
  const files = new Map();
  const chaos = { rpc: 0, status: 503 };
  let chain = Promise.resolve();
  // one connection, one thing at a time (PGlite is a single connection)
  const serial = (fn) => { const p = chain.then(fn); chain = p.catch(() => {}); return p; };

  async function reset() {
    return serial(async () => {
      db = await freshOrdersDb();
      await db.exec(MIGRATION_0071);
      files.clear();
      chaos.rpc = 0;
    });
  }
  await reset();

  /** Run fn inside a committed transaction as the service role (what a request with the service key is). */
  const asService = (fn) => serial(async () => {
    await db.exec("set session authorization authenticator");
    await db.exec("begin");
    try {
      await db.exec("set local role service_role");
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role", iss: "supabase", aud: "authenticated", sub: "service" })]);
      const out = await fn();
      await db.exec("commit");
      return out;
    } catch (err) {
      await db.exec("rollback").catch(() => {});
      throw err;
    } finally {
      await db.exec("set session authorization postgres").catch(() => {});
    }
  });

  // what the Worker's calls to Supabase land on
  async function supabase(req, res, url, rest) {
    const method = req.method;
    const bodyBuf = method === "GET" ? Buffer.alloc(0) : await readBody(req);
    if (method === "GET" && rest === "/rest/v1/orders") {
      const key = (url.searchParams.get("web_ref") || "").replace(/^eq\./, "");
      const rows = await asService(async () => (await db.query(`select id, order_no from orders where web_ref = $1::uuid limit 1`, [key])).rows);
      return json(res, 200, rows);
    }
    if (method === "POST" && rest.startsWith("/rest/v1/rpc/")) {
      const fn = rest.slice("/rest/v1/rpc/".length);
      const args = bodyBuf.length ? JSON.parse(bodyBuf.toString("utf8")) : {};
      try {
        if (fn === "ingest_website_order") {
          if (chaos.rpc > 0) { chaos.rpc -= 1; say("   (chaos: the order function answers", chaos.status, ")"); return json(res, chaos.status, { message: "pretend outage" }); }
          const out = await asService(async () => (await db.query(`select public.ingest_website_order($1::jsonb) as r`, [JSON.stringify(args.p ?? null)])).rows[0].r);
          if (out && out.ok && !out.duplicate) say(`   stored ${out.ref}`);
          return json(res, 200, out);
        }
        if (fn === "website_order_limits_ok") {
          const out = await asService(async () => (await db.query(`select public.website_order_limits_ok($1, $2) as r`, [args.p_ip ?? null, args.p_email ?? null])).rows[0].r);
          return json(res, 200, out);
        }
        return json(res, 404, { code: "PGRST202", message: `no function ${fn}` });
      } catch (err) {
        const status = err.code === "PT400" ? 400 : err.code === "PT429" ? 429 : err.code === "42501" ? 403 : 500;
        return json(res, status, { code: err.code || "XX000", message: String(err.message || err) });
      }
    }
    if (method === "POST" && rest.startsWith("/storage/v1/object/website-orders/")) {
      const p = decodeURIComponent(rest.slice("/storage/v1/object/website-orders/".length));
      files.set(p, { type: req.headers["content-type"] || "application/octet-stream", bytes: bodyBuf });
      await asService(async () => {
        await db.query(`delete from storage.objects where bucket_id = 'website-orders' and name = $1`, [p]);
        await db.query(`insert into storage.objects (bucket_id, name) values ('website-orders', $1)`, [p]);
      });
      say(`   stored file ${p} (${bodyBuf.length} bytes)`);
      return json(res, 200, { Key: `website-orders/${p}` });
    }
    if (method === "GET" && rest === "/storage/v1/bucket/website-orders") {
      const found = await asService(async () => (await db.query(`select 1 from storage.buckets where id = 'website-orders'`)).rows.length);
      return found ? json(res, 200, { id: "website-orders" }) : json(res, 404, { message: "Bucket not found" });
    }
    return json(res, 404, { message: `the pretend Supabase does not do ${method} ${rest}` });
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      if (url.pathname.startsWith("/__supabase/")) return await supabase(req, res, url, url.pathname.slice("/__supabase".length));
      if (url.pathname === "/__dev/orders" && req.method === "GET") {
        const out = await serial(async () => ({
          web: (await db.query(`select * from fs_orders where source = 'website' order by "createdAt"`)).rows,
          team: Number((await db.query(`select count(*)::int as n from fs_orders where source <> 'website'`)).rows[0].n),
          all: Number((await db.query(`select count(*)::int as n from fs_orders`)).rows[0].n),
          files: [...files.keys()],
        }));
        return json(res, 200, out);
      }
      if (url.pathname === "/__dev/file" && req.method === "GET") {
        const f = files.get(url.searchParams.get("path") || "");
        if (!f) return json(res, 404, { error: "no such file" });
        res.writeHead(200, { "Content-Type": f.type, "Access-Control-Allow-Origin": "*" });
        return res.end(f.bytes);
      }
      if (url.pathname === "/__dev/reset" && req.method === "POST") { await reset(); return json(res, 200, { ok: true }); }
      if (url.pathname === "/__dev/chaos" && req.method === "POST") {
        const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
        chaos.rpc = Number(body.times) || 0;
        chaos.status = Number(body.rpc) || 503;
        return json(res, 200, { ok: true, ...chaos });
      }
      if (url.pathname === "/api/website-orders" || url.pathname.startsWith("/api/website-orders/")) {
        const body = req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS" ? undefined : await readBody(req);
        const headers = { ...req.headers, "cf-connecting-ip": req.headers["x-test-ip"] || req.socket.remoteAddress || "127.0.0.1" };
        const request = new Request(`http://127.0.0.1:${server.address().port}${req.url}`, { method: req.method, headers, body });
        const env = {
          SUPABASE_URL: `http://127.0.0.1:${server.address().port}/__supabase`,
          SUPABASE_SERVICE_KEY: "dev-service-key",
          WEBSITE_ALLOW_LOCALHOST: "1",
          LOGO_INSTAGRAM_DIRECT: process.env.LOGO_INSTAGRAM_DIRECT,
          ...extraEnv,
        };
        const out = await handleWebsiteOrders(request, env);
        const headersOut = Object.fromEntries(out.headers.entries());
        res.writeHead(out.status, headersOut);
        return res.end(Buffer.from(await out.arrayBuffer()));
      }
      return json(res, 404, { error: "not here", hint: "/api/website-orders, /__dev/orders" });
    } catch (err) {
      console.error("dev server error:", err);
      return json(res, 500, { error: String(err.message || err) });
    }
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  const actual = server.address().port;
  return {
    port: actual,
    base: `http://127.0.0.1:${actual}`,
    reset,
    files,
    chaos,
    db: () => db,
    close: () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(() => resolve()); }),
  };
}

// run from the command line
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf("--port");
  const dev = await startDevServer({ port: i > 0 ? Number(process.argv[i + 1]) : 8787 });
  console.log(`\nWebsite orders, running locally (nothing live is touched; everything is lost when this stops).\n`);
  console.log(`  Worker routes   ${dev.base}/api/website-orders   (POST orders, GET /logo, GET /health)`);
  console.log(`  What arrived    ${dev.base}/__dev/orders`);
  console.log(`  Reset           curl -X POST ${dev.base}/__dev/reset`);
  console.log(`\n  Website:  NEXT_PUBLIC_DASHBOARD_API_URL=${dev.base}\n  (a build of the website with that variable placed orders here; its pages must be served from localhost: CORS allows localhost only here)\n`);
  process.on("SIGINT", async () => { await dev.close(); process.exit(0); });
}
