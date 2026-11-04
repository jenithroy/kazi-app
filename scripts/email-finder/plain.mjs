/**
 * A plain page read made from this computer's own internet connection, with no browser in it: the other half of what this program can do for the
 * Contact Finder (the browser is browser.mjs). It is the function `findContacts` and `findWebsiteFor` (worker/lib/) fetch with, the same way the
 * Worker hands them its own `fetch`, so every rule they keep (robots.txt, three pages at most, one site, every redirect judged, an honest name) holds
 * here unchanged. Reading from this computer rather than from the Worker matters for two reasons: a site that turns a server's request away
 * (a data-centre address) often lets a home connection in, and a run of a hundred companies is not held to a server's limits.
 *
 * What is added is only what being on someone's own network needs. The Worker cannot reach anything inside a network; this program can, so a
 * web address that names a machine on the network must never be followed. A host NAME is not enough to tell (any name can point at 192.168.0.1,
 * and can be changed between two looks), so the address the connection is really made to is checked, at the moment it is made: only a public
 * address is connected to (a `lookup` handed to the connection itself, so there is no gap between checking and connecting).
 */
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { Readable, pipeline } from "node:stream";
import zlib from "node:zlib";

const NO_BODY = new Set([101, 204, 205, 304]);

// Addresses that are not on the public internet: this machine, its network, link-local, carrier-grade NAT, documentation and test ranges, multicast.
const NOT_PUBLIC = new net.BlockList();
for (const [start, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
]) NOT_PUBLIC.addSubnet(start, bits, "ipv4");
for (const [start, bits] of [["::", 128], ["::1", 128], ["64:ff9b::", 96], ["100::", 64], ["2001:db8::", 32], ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8]]) NOT_PUBLIC.addSubnet(start, bits, "ipv6");

/** Whether an IP address (text) is a public one that may be connected to. */
export function isPublicAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return !NOT_PUBLIC.check(address, "ipv4");
  if (family === 6) {
    const first = parseInt(address.split(":")[0] || "0", 16);
    return (first & 0xe000) === 0x2000 && !NOT_PUBLIC.check(address, "ipv6");        // only global unicast (2000::/3) is the public internet
  }
  return false;
}

/** The `lookup` for a connection: the name's addresses, the public ones only. A name with none is refused, and so nothing is connected to. */
export function publicOnlyLookup(hostname, options, callback) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    const ok = addresses.filter((a) => isPublicAddress(a.address));
    if (ok.length === 0) return callback(Object.assign(new Error(`${hostname} is not a public address.`), { code: "ENOTPUBLIC" }));
    return options?.all ? callback(null, ok) : callback(null, ok[0].address, ok[0].family);
  });
}

const DECODERS = { gzip: zlib.createGunzip, "x-gzip": zlib.createGunzip, deflate: zlib.createInflate, br: zlib.createBrotliDecompress };

/**
 * `fetch`, for one GET: resolves to a standard Response, never follows a redirect (the finder judges each stop itself) and rejects when nothing
 * could be read (no such site, a refused or non-public address, a timeout through `init.signal`).
 */
export function plainFetch(url, init = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const lib = target.protocol === "https:" ? https : http;
    const req = lib.request(target, {
      method: init.method || "GET", signal: init.signal, lookup: publicOnlyLookup,
      headers: { ...init.headers, "Accept-Encoding": "gzip, deflate, br" },
    }, (res) => {
      res.on("error", () => {});                                                      // an answer cut off after it began is the reader's to notice, not a crash
      if (NO_BODY.has(res.statusCode)) res.resume();
      const decoder = DECODERS[String(res.headers["content-encoding"] || "").toLowerCase()];
      const body = decoder ? pipeline(res, decoder(), () => {}) : res;               // a broken connection destroys both ends, and the reader sees the error
      const headers = new Headers();
      for (const [name, value] of Object.entries(res.headers)) {
        if (decoder && (name === "content-encoding" || name === "content-length")) continue;
        headers.set(name, Array.isArray(value) ? value.join(", ") : value);
      }
      resolve(new Response(NO_BODY.has(res.statusCode) ? null : Readable.toWeb(body), { status: res.statusCode, headers }));
    });
    req.on("error", reject);
    req.end();
  });
}
