/**
 * Which web address in a Reddit post is the POSTER'S OWN (their brand, shop or business), or "".
 *
 * Why it is strict: a lead's website is read for contact emails by itself (worker/lib/redditLeads.js), with nobody checking, and a post is full of
 * other people's links: the supplier somebody found, an article, a competitor, a picture host, the page somebody was asking about. The first link
 * in a post is not the poster's site. A link counts only when the words around it say it is THEIRS:
 *
 *   "my brand is Acme (acme.com)"      "our website: https://acme.com"      "check out my store https://acme.com"      "Website - acme.com"
 *
 * and not when something in between says it is somebody else's or only an example ("my brand is inspired by https://other.com",
 * "I found this supplier on https://…"). When the words do not say, there is no website: a lead without one is still a lead, only nothing reads
 * anything for it, and the team can look at the post themselves. Comments are never read (the check reads posts only).
 *
 * Pure (no imports, no network), so the rules can be tested on their own. `accept(url)` is the caller's own test of an address (a public host, a
 * shape the database takes, not a picture host or a social network).
 */

// A few endings that a bare "brand.com" with no "https://" may have. Short and common ones only: "e.g." and "v1.0" are not addresses.
const TLDS = "com|co\\.uk|co|net|org|shop|store|io|uk|us|ca|au|in|np|de|fr|eu|studio|clothing|apparel|fashion|online|site|xyz|design|boutique|wear|life|club|ltd|nz|ie|nl|se|es|it|pk|bd|ae|sg|my|ph|za|ng|ke|mx|br|me";

// something that looks like an address: with a scheme, with "www.", or a bare name with one of the endings above. Never the part of an email address.
const CANDIDATE = new RegExp(
  String.raw`(?<![\w@./-])(?:https?:\/\/[^\s)\]>"'<]{3,}|www\.[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s)\]>"'<]*)?|[a-z0-9][a-z0-9-]{1,40}(?:\.[a-z0-9-]{2,40})*\.(?:${TLDS})(?![a-z0-9-])(?:\/[^\s)\]>"'<]*)?)`,
  "gi",
);

// "my brand", "our new online store", "my website", "my clothing line" …
const POSSESSIVE = /\b(?:my|our)\s+(?:(?:own|new|little|small|online|official|first|current|latest)\s+)*(?:(?:clothing|apparel|fashion|streetwear|merch|jewelry|jewellery|accessories|swimwear|activewear)\s+)?(?:brand|label|line|company|business|store|shop|site|website|web\s?site|web\s?shop|webstore|web\s?page|page|portfolio|lookbook|collection|startup|start-up|studio|boutique|project|venture)\b/gi;

// a label right before the address: "Website: …", "Store - …"
const LABEL = /(?:^|[\s(\[])(?:website|web\s?site|site|store|shop|webshop|web\s?shop|brand|portfolio|lookbook)\s*[:=\-–—>]+\s*(?:\[[^\]]*\]\(\s*)?[\[(]?\s*$/i;

// "I'm starting a clothing brand called Acme Wear (acme.com)": a brand or company word, a capitalised name of up to four words, then the bracket the address is in
const NAME_THEN_BRACKET = /\b(?:[Bb]rand|[Ll]abel|[Cc]ompany|[Bb]usiness|[Ss]tore|[Ss]hop|[Ll]ine|[Ss]tartup|[Ss]tudio|[Bb]outique)(?:\s+(?:called|named|is|are))?[\s:]*[A-Z0-9][\w&'’.-]*(?:\s+[A-Z0-9][\w&'’.-]*){0,3}\s*[(\[]\s*$/;
const FIRST_PERSON = /\b(?:i|i'm|im|i've|ive|i'd|we|we're|we've|we'd|my|our|me|us)\b/i;

// between "my brand" and the address, a word that makes it somebody else's, or only an example
const OTHER = /\b(?:found|saw|seen|looked at|looking at|checked out|recommended|recommend|suggested|suggest|inspired|inspiration|similar|competitor|competitors|compared|comparison|example|examples|e\.g|such as|like this|reference|alibaba|article|source|according|quote|quoted|supplier|suppliers|factory|factories|manufacturer|manufacturers|vendor|vendors)\b/i;

/**
 * The sentence an address is in, up to the address: back to the last full stop, "!" or "?" followed by a space, or to a blank line (and at most 160
 * characters). A single line break does not end it: Reddit posts put a link on a line of its own right after "please visit".
 */
function clauseBefore(text, start) {
  const s = text.slice(Math.max(0, start - 160), start);
  const parts = s.split(/(?<=[.!?])\s+|\n[ \t]*\n/);
  return (parts[parts.length - 1] ?? "").replace(/\s+/g, " ");
}

/** Whether the words just before an address say it is the poster's own. */
export function saysItIsTheirs(before) {
  const b = String(before ?? "");
  if (LABEL.test(b)) return true;
  let end = -1;
  for (const m of b.matchAll(POSSESSIVE)) end = m.index + m[0].length;      // the LAST "my brand" before the address
  if (end >= 0 && !OTHER.test(b.slice(end))) return true;
  if (FIRST_PERSON.test(b) && NAME_THEN_BRACKET.test(b)) return true;
  return false;
}

/** Every address-like thing in a text with where it sits: [{ url, start, end }], `url` with a scheme and without a trailing full stop or bracket. */
export function addressesIn(text) {
  const out = [];
  const t = String(text ?? "");
  for (const m of t.matchAll(CANDIDATE)) {
    const raw = m[0].replace(/[.,;:!?)\]*_]+$/g, "");
    if (raw.length < 4) continue;
    out.push({ url: /^https?:\/\//i.test(raw) ? raw : `https://${raw}`, start: m.index, end: m.index + raw.length });
  }
  return out;
}

/**
 * The poster's own website in `text` (a post's title and body), or "". `accept(url)` is the caller's test of an address; the first address that passes
 * it AND that the words around it call the poster's own is the answer.
 */
export function ownSiteIn(text, accept = () => true) {
  const t = String(text ?? "");
  for (const a of addressesIn(t)) {
    if (!accept(a.url)) continue;
    if (saysItIsTheirs(clauseBefore(t, a.start))) return a.url;
  }
  return "";
}
