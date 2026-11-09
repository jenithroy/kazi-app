/**
 * Self-test of the finder program's search (search.mjs): `node selftest.mjs` in this folder. The pure helpers are checked on their own; the searcher is
 * checked in this computer's real browser against stand-in search engines served from this computer (nothing is sent to Bing or DuckDuckGo). Without a
 * browser the second half is skipped and says so. Exit code 0 when every check passes.
 */
import http from "node:http";
import { startBrowser } from "./browser.mjs";
import {
  createSearcher, findSocialsBySearch, findWebsiteBySearch, looksBlocked, nameMatch, nameTokens, profileOf, searchSites, socialsFrom, unwrapResultUrl, websiteFrom,
} from "./search.mjs";

let failed = 0;
let total = 0;
const check = (name, ok, detail = "") => {
  total += 1;
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || !detail ? "" : `  (${detail})`}`);
};
const b64 = (s) => Buffer.from(s).toString("base64url");
const bingLink = (url) => `https://www.bing.com/ck/a?!&&p=abc&ptn=3&ver=2&u=a1${b64(url)}&ntb=1`;
const ddgLink = (url) => `//duckduckgo.com/l/?uddg=${encodeURIComponent(url)}&rut=abc`;

console.log("unwrapResultUrl");
check("a Bing result link is the address it wraps", unwrapResultUrl(bingLink("https://forum.lowyat.net/topic/5362442/all")) === "https://forum.lowyat.net/topic/5362442/all");
check("a DuckDuckGo result link is too (protocol-relative)", unwrapResultUrl(ddgLink("https://example-shop.com/about?x=1")) === "https://example-shop.com/about?x=1");
check("a plain address stays as it is", unwrapResultUrl("https://www.sulis.co.uk/") === "https://www.sulis.co.uk/");
check("a link back into a search engine, or a script, is nothing", unwrapResultUrl("https://www.bing.com/images/search?q=x") === "" && unwrapResultUrl("https://html.duckduckgo.com/html/?q=x") === "" && unwrapResultUrl("javascript:void(0)") === "" && unwrapResultUrl("") === "");
check("a Bing link that does not carry an address is nothing", unwrapResultUrl("https://www.bing.com/ck/a?!&&p=abc&u=zzzz") === "");

console.log("looksBlocked");
check("DuckDuckGo's 202 with no results is a block", looksBlocked({ status: 202, title: "DuckDuckGo", text: "x" }) === true);
check("the words of its challenge page are a block", looksBlocked({ title: "DuckDuckGo", text: "Unfortunately, bots use DuckDuckGo too. Please complete the following challenge to confirm this search was made by a human." }) === true);
check("a Bing check is a block", looksBlocked({ title: "Bing", text: "One last step. Please solve the challenge below to continue" }) === true);
check("results on the page are never a block, whatever their snippets say", looksBlocked({ status: 200, text: "how to solve a captcha", results: 3 }) === false);
check("a search with no results is not a block", looksBlocked({ status: 200, title: "x - Search", text: "There are no results for x" }) === false);
check("a bare page with nothing on it, not even no results, is (Bing's frame with no results)", looksBlocked({ status: 200, title: "x - Search", text: "Skip to content Accessibility Feedback ALL AI MODE IMAGES VIDEOS MAPS NEWS MORE Privacy Terms" }) === true);
check("a long page that happens to show no result links is not taken for one", looksBlocked({ status: 200, title: "x", text: "word ".repeat(200) }) === false);

console.log("nameTokens, nameMatch");
check("the words of a name leave out Ltd, The and and", nameTokens("The Hunter & Sons Apparel Ltd.").join(" ") === "hunter sons apparel");
check("three words, two in the title: a match", nameMatch("Hunter Apparel Solutions Ltd", "Hunter Apparel | Custom workwear") >= 0.66);
check("three words, one in the title: not", nameMatch("Hunter Apparel Solutions Ltd", "Hunter Gardens") === 0);
check("one or two words must be there whole", nameMatch("Sulis Silks", "Sulis fabrics") === 0 && nameMatch("Sulis Silks", "Sulis Silks Ltd - fabrics") === 1);
check("a title never matches a name run together in a longer word", nameMatch("Acme", "Acmeville council") === 0);
check("a host or handle may carry the words run together", nameMatch("Hunter Apparel Solutions Ltd", "hunterapparelsolutions", { joined: true }) === 1 && nameMatch("Sulis Silks", "sulissilks", { joined: true }) === 1);

console.log("profileOf");
check("a Facebook page, cut down to the page", profileOf("https://www.facebook.com/sulissilks/posts/123?x=1")?.url === "https://www.facebook.com/sulissilks");
check("an old-style Facebook page keeps its id", profileOf("https://m.facebook.com/pages/Sulis-Silks/1234567")?.url === "https://www.facebook.com/pages/Sulis-Silks/1234567");
check("a group, a share link and a photo are not pages", profileOf("https://www.facebook.com/groups/knitters") === null && profileOf("https://www.facebook.com/sharer/sharer.php?u=x") === null && profileOf("https://www.facebook.com/photo?fbid=1") === null);
check("an Instagram page, with its tail and a leading @ cut off", profileOf("https://www.instagram.com/sulissilks/?hl=en")?.url === "https://www.instagram.com/sulissilks/" && profileOf("https://instagram.com/@sulissilks")?.handle === "sulissilks");
check("an Instagram post, reel or the explore page is not a page", profileOf("https://www.instagram.com/p/ABC123/") === null && profileOf("https://www.instagram.com/reel/ABC/") === null && profileOf("https://www.instagram.com/explore/tags/x/") === null);
check("another site is not one", profileOf("https://twitter.com/sulissilks") === null);

console.log("websiteFrom");
{
  const r = (title, url) => ({ query: "q", title, url });
  const found = websiteFrom("Sulis Silks Ltd", [
    r("Sulis Silks - Companies House", "https://find-and-update.company-information.service.gov.uk/company/1"),
    r("Sulis Silks | Facebook", "https://www.facebook.com/sulissilks"),
    r("Top 10 silk shops in the UK", "https://www.example-blog.com/silk"),
    r("Sulis Silks Ltd | Pure silk fabrics", "https://www.sulis.co.uk/"),
  ]);
  check("the company's own site among directories, a social page and a list", found.site === "https://sulis.co.uk/" && found.confidence >= 0.9 && found.via === "search", JSON.stringify(found));
  check("nothing that says it is theirs: no website", websiteFrom("Sulis Silks Ltd", [r("Silk shops near you", "https://www.somewhere.com/")]).site === null);
  check("a title with only part of a long name is shown, not used (under 0.9)", websiteFrom("Hunter Apparel Solutions Ltd", [r("Hunter Apparel", "https://www.example-wear.com/")]).confidence < 0.9);
}

console.log("socialsFrom");
{
  const r = (title, url) => ({ query: "q", title, url });
  const s = socialsFrom("Sulis Silks Ltd", [
    r("Other Silks - Home | Facebook", "https://www.facebook.com/othersilks"),
    r("Sulis Silks - Home | Facebook", "https://www.facebook.com/sulissilks/"),
    r("Sulis Silks (@sulissilks) • Instagram photos and videos", "https://www.instagram.com/sulissilks/"),
    r("Sulis Silks reel", "https://www.instagram.com/reel/XYZ/"),
  ]);
  check("each network's page of that name, and not another business's", s.facebook === "https://www.facebook.com/sulissilks" && s.instagram === "https://www.instagram.com/sulissilks/" && Object.keys(s).length === 2, JSON.stringify(s));
  check("no page that carries the name: none", Object.keys(socialsFrom("Sulis Silks Ltd", [r("Pretty Things | Facebook", "https://www.facebook.com/prettythings")])).length === 0);
}

{
  // a job that runs out of time keeps what it has (a stand-in searcher: no browser needed)
  let asked = 0;
  const stub = { search: async (q) => {
    asked += 1;
    if (q === "c") return { results: [], engine: null, blocked: true, limited: false, helped: false, timeUp: true };
    return { results: [{ title: `${q} Ltd`, url: `https://www.${q}company.co.uk/`, snippet: "" }], engine: "Bing", blocked: false, limited: false, helped: false };
  } };
  const out = await searchSites(stub, ["alpha", "beta", "c", "delta"], { until: 1 });
  check("a job that runs out of time returns the websites it has, and asks for no more", out.searched === 2 && out.sites.length === 2 && out.blocked === true && out.timeUp === true && asked === 3, JSON.stringify(out));
}

/* ── The searcher, in the real browser, against stand-in engines ───────────────────────────────────────────────────── */

let session = null;
try { session = await startBrowser(); } catch (err) { console.log(`\nno browser here (${String(err.message).split("\n")[0]}): the searcher is not tested`); }

if (session) {
  console.log("\nthe searcher (a stand-in Bing and DuckDuckGo on this computer)");
  const mode = { bing: "ok", ddg: "ok" };            // "ok" | "block" (HTTP 202, DuckDuckGo's way) | "human" (a check that clears once a person answers it) | "empty"
  const hits = { bing: 0, ddg: 0, windows: 0 };
  const answered = { bing: false, ddg: false };
  const resultsFor = (q) => (/hunter/i.test(q) ? [["Hunter Apparel | Custom workwear", "https://www.hunterapparel.com/"], ["Hunter Apparel - Yell", "https://www.yell.com/biz/hunter-apparel"]] : [["Sulis Silks | Fabrics", "https://www.sulis.co.uk/"], ["Sulis Silks - Home | Facebook", "https://www.facebook.com/sulissilks"]]);
  const page = (body) => `<!doctype html><html><head><title>results</title></head><body>${body}</body></html>`;
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    const q = u.searchParams.get("q") || "";
    const which = u.pathname.startsWith("/bing") ? "bing" : "ddg";
    if (u.pathname === "/answer") { answered[u.searchParams.get("e")] = true; res.end("ok"); return; }
    if (u.pathname === "/state") { res.end(answered[u.searchParams.get("e")] ? "ok" : "wait"); return; }
    if (!u.pathname.startsWith("/bing") && !u.pathname.startsWith("/ddg")) { res.writeHead(404); res.end(); return; }      // the browser's own request for a favicon is no search
    hits[which] += 1;
    const m = mode[which];
    const challenge = `<p>Please complete the following challenge to confirm this search was made by a human.</p><script>setInterval(() => fetch("/state?e=${which}").then((r) => r.text()).then((t) => { if (t === "ok") location.reload(); }), 300)</script>`;
    if (m === "block") { res.writeHead(202, { "content-type": "text/html" }); res.end(page("<p>Unfortunately, bots use DuckDuckGo too.</p>")); return; }
    if (m === "human" && !answered[which]) { res.writeHead(200, { "content-type": "text/html" }); res.end(page(challenge)); return; }
    res.writeHead(200, { "content-type": "text/html" });
    if (m === "empty") { res.end(page("<p>There are no results for that.</p>")); return; }
    if (m === "shell") { res.end(page(`<p>${"Menu item. ".repeat(60)}</p>`)); return; }
    const list = resultsFor(q);
    res.end(page(which === "bing"
      ? `<ol>${list.map(([t, url]) => `<li class="b_algo"><h2><a href="${bingLink(url)}">${t}</a></h2><div class="b_caption"><p>About ${t}</p></div></li>`).join("")}</ol>`
      : list.map(([t, url]) => `<div class="result"><a class="result__a" href="${ddgLink(url)}">${t}</a><a class="result__snippet">About ${t}</a></div>`).join("")));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const engines = [
    { name: "Bing", kind: "bing", url: (q) => `${base}/bing?${new URLSearchParams({ q })}` },
    { name: "DuckDuckGo", kind: "ddg", url: (q) => `${base}/ddg?${new URLSearchParams({ q })}` },
  ];
  const context = await session.browser.newContext({ userAgent: session.userAgent });
  const reset = () => { mode.bing = "ok"; mode.ddg = "ok"; hits.bing = hits.ddg = hits.windows = 0; answered.bing = answered.ddg = false; };
  const searcherWith = (extra = {}) => createSearcher({ getContext: async () => context, engines, gapMs: 0, resultsMs: 1200, ...extra });
  const openWindow = async () => { hits.windows += 1; const c = await session.browser.newContext({ userAgent: session.userAgent }); return { context: c, close: () => c.close() }; };

  reset();
  {
    const s = searcherWith();
    const out = await s.search("Hunter Apparel Solutions Ltd");
    check("a search on the first engine reads its results, with the links unwrapped", out.engine === "Bing" && out.results.length === 2 && out.results[0].url === "https://www.hunterapparel.com/" && out.results[0].title.startsWith("Hunter Apparel"), JSON.stringify(out));
    const ddg = searcherWith({ engines: [engines[1]] });
    const out2 = await ddg.search("Hunter Apparel Solutions Ltd");
    check("DuckDuckGo's markup too", out2.engine === "DuckDuckGo" && out2.results[0].url === "https://www.hunterapparel.com/", JSON.stringify(out2));
    const w = await findWebsiteBySearch(searcherWith(), "Hunter Apparel Solutions Ltd");
    check("a company's website from a search for its name (the directory result is passed over)", w.site === "https://hunterapparel.com/" && w.confidence >= 0.9 && w.via === "search", JSON.stringify(w));
    const soc = await findSocialsBySearch(searcherWith(), "Sulis Silks Ltd");
    check("its Facebook page from a search for its name", soc.facebook === "https://www.facebook.com/sulissilks" && !soc.instagram, JSON.stringify(soc));
    const sites = await searchSites(searcherWith(), ["hunter apparel", "sulis silks"]);
    check("the Web search source: websites of businesses from each phrase", sites.searched === 2 && sites.sites.map((x) => x.website).join() === "https://hunterapparel.com/,https://sulis.co.uk/", JSON.stringify(sites));
  }

  reset(); mode.bing = "block";
  {
    const s = searcherWith();
    const a = await s.search("Hunter Apparel");
    const b = await s.search("Hunter Apparel");
    check("an engine that turns the search away: the next engine answers", a.engine === "DuckDuckGo" && a.results.length === 2 && !a.blocked, JSON.stringify(a));
    check("and the engine that turned it away is left alone for a while (asked once)", hits.bing === 1 && b.engine === "DuckDuckGo" && s.state().blocked.includes("Bing"), `${hits.bing} asks`);
  }

  reset(); mode.bing = "block"; mode.ddg = "block";
  {
    const s = searcherWith({ openWindow });
    const out = await s.search("Hunter Apparel", { help: false });
    check("both engines turn it away and help is not allowed: blocked, and no window", out.blocked === true && out.results.length === 0 && hits.windows === 0, JSON.stringify(out));
    check("no help asked of a person after that either: the engines are left alone", s.available(false) === false);
  }

  reset(); mode.bing = "human"; mode.ddg = "block";
  {
    const s = searcherWith({ openWindow, helpMs: 20000 });
    setTimeout(() => { answered.bing = true; }, 4500);                      // a person answers the check, after the headless tries have given up
    const out = await s.search("Hunter Apparel");
    check("both turn it away: one window opens, the person answers, and the results come from it", out.helped === true && out.results.length === 2 && hits.windows === 1, JSON.stringify(out));
    const again = await s.search("Sulis Silks");
    check("the next search goes on in that window, with no second window", again.helped === true && again.results.length === 2 && hits.windows === 1, JSON.stringify(again));
    answered.bing = false;                                                  // the engine asks again ...
    setTimeout(() => { answered.bing = true; }, 2500);                      // ... and the person answers again, in the same window
    const third = await s.search("Hunter Apparel");
    check("asked again, the person answers again in the same window: still one window", third.helped === true && third.results.length === 2 && hits.windows === 1, JSON.stringify(third));
    await s.close();
  }

  reset(); mode.bing = "human"; mode.ddg = "block";
  {
    const s = searcherWith({ openWindow, helpMs: 3000 });
    const out = await s.search("Hunter Apparel");
    const next = await s.search("Hunter Apparel");
    check("nobody answers in time: blocked, and the run goes on without searching", out.blocked === true && out.results.length === 0, JSON.stringify(out));
    check("a window is opened once only: the next search does not open another", next.blocked === true && hits.windows === 1 && s.available(true) === false, `${hits.windows} windows`);
  }

  reset();
  {
    const s = searcherWith();
    const none = await s.search("Hunter Apparel", { until: Date.now() + 5_000 });
    check("a job with no room left makes no search, says it ran out of time, and the hour's count is not used", none.timeUp === true && none.blocked === true && none.results.length === 0 && hits.bing === 0 && s.state().searches === 0, JSON.stringify(none));
    const room = await s.search("Hunter Apparel", { until: Date.now() + 120_000 });
    check("with room left it searches as usual", room.results.length === 2 && !room.timeUp && !room.blocked, JSON.stringify(room));
  }

  reset(); mode.bing = "human"; mode.ddg = "block";
  {
    const s = searcherWith({ openWindow, helpMs: 60_000, queryMs: 1000, askMinMs: 1000 });
    const t0 = Date.now();
    const out = await s.search("Hunter Apparel", { until: t0 + 9_000 });          // nobody answers: a person would be waited for 60 s, the deadline is 9 s away
    const took = Date.now() - t0;
    check("a person is not waited for past the job's deadline", out.blocked === true && out.results.length === 0 && took < 12_000 && hits.windows === 1, `${took} ms, ${hits.windows} windows`);
  }

  reset(); mode.bing = "human"; mode.ddg = "block";
  {
    const s = searcherWith({ openWindow, queryMs: 1000, askMinMs: 15_000 });
    const out = await s.search("Hunter Apparel", { until: Date.now() + 8_000 });
    check("with too little time left a person is not even asked: no window opens", out.blocked === true && hits.windows === 0, `${hits.windows} windows ${JSON.stringify(out)}`);
  }

  reset(); mode.bing = "empty";
  {
    const out = await searcherWith().search("zzzz no such company");
    check("a search with no results is no results, not a block", out.blocked === false && out.results.length === 0 && out.engine === "Bing", JSON.stringify(out));
  }
  reset(); mode.bing = "shell";
  {
    const s = searcherWith();
    const out = await s.search("Hunter Apparel");
    check("a long page with no results and no word about it is doubted: the next engine is asked and answers", out.engine === "DuckDuckGo" && out.results.length === 2 && hits.bing === 1 && hits.ddg === 1 && s.state().blocked.length === 0, `${JSON.stringify(hits)} ${JSON.stringify(s.state())}`);
  }

  reset();
  {
    const s = searcherWith({ maxPerHour: 2 });
    await s.search("one one"); await s.search("two two");
    const out = await s.search("three three");
    check("no more searches than the hour allows", out.limited === true && out.results.length === 0 && hits.bing === 2, JSON.stringify(out));
    const gap = createSearcher({ getContext: async () => context, engines, gapMs: 700, resultsMs: 1200 });
    const t0 = Date.now();
    await gap.search("one one"); await gap.search("two two");
    check("searches are paced (here 0.7 s apart)", Date.now() - t0 >= 650, `${Date.now() - t0} ms`);
  }

  await context.close();
  server.close();
  await session.browser.close();
}

console.log(failed ? `\n${failed} of ${total} checks FAILED` : `\nall ${total} checks passed`);
process.exit(failed ? 1 : 0);
