/**
 * Long words on a generated sheet. The PDF's line breaker only breaks at spaces (pdfKit turns hyphenation off, so "accessories" is never
 * "acces-sories"), so a word that is longer than its line, a pasted web link or map address, runs off the right edge of the page and the
 * part past the edge is simply not there. `softWrap` puts a space into such a word every so often (after a "/", "," and the like when there
 * is one in range) so that all of it shows. A word that fits is left exactly as it was, so ordinary text is never touched.
 *
 * Used by the adapters whose sheets carry free text (a customer's address and notes, a request's reason...). If pdfKit's hyphenation
 * callback ever splits very long words itself, this file can go.
 *
 *   softWrap(value, max)          every run of non-space characters longer than `max` is cut into pieces of at most `max`
 *   fitSections(sections)         the same for a CardDoc's sections: values of `rows` (about 60 characters wide) and `text` (about 84)
 */

// where a link or an address reads well when it is cut
const NICE = "/?&=,;:-_.+@%)]";

function pieces(word, max) {
  const out = [];
  let rest = word;
  while (rest.length > max) {
    let cut = -1;
    for (let i = max - 1; i >= Math.floor(max / 2); i--) {
      if (NICE.includes(rest[i])) { cut = i + 1; break; }
    }
    if (cut < 0) cut = max;
    const last = rest.charCodeAt(cut - 1);
    if (last >= 0xd800 && last <= 0xdbff) cut -= 1;                    // never between the two halves of one character
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest) out.push(rest);
  return out;
}

export function softWrap(value, max = 60) {
  const text = value === undefined || value === null ? "" : String(value);
  if (text.length <= max) return text;
  return text.replace(new RegExp(`\\S{${max + 1},}`, "g"), (word) => pieces(word, max).join(" "));
}

const ROW_MAX = 60;
const TEXT_MAX = 84;

export function fitSections(sections) {
  return sections.map((s) => ({
    ...s,
    ...(s.rows ? { rows: s.rows.map(([k, v]) => [k, typeof v === "string" ? softWrap(v, ROW_MAX) : v]) } : {}),
    ...(typeof s.text === "string" ? { text: softWrap(s.text, TEXT_MAX) } : {}),
  }));
}
