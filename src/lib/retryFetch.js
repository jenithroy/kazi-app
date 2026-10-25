/**
 * `fetch` that asks again, once, for a READ whose connection dropped.
 *
 * On a link that comes and goes (a Wi-Fi that stalls, a phone tether, two connections merged into one) the connection a page is using is
 * sometimes reset in the middle of its reads. Every read that was on it fails together, and the page says "did not load" although the next try
 * would have worked. A read changes nothing, so asking again is always safe. A write is never repeated: it may already have reached the database.
 *
 * Asked again: a GET or HEAD that threw (the network failed before any answer came) or was answered 502, 503 or 504 (the gateway in front of
 * the database had a moment); and `me`, the one read the app cannot start without, which has to be a POST (it only reads who is signed in).
 * Not asked again: every other request (numbering functions use up a number each time they are called), one the caller gave up on, an answer
 * with any other status.
 *
 * Used by the data client in src/supabase.js; the sign-in client is not wrapped.
 */
const READ_BY_POST = /\/rest\/v1\/rpc\/me(\?|$)/;
const GATEWAY_MOMENT = new Set([502, 503, 504]);

const urlOf = (input) => (typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url || ""));
const methodOf = (input, init) => String(init?.method || (typeof input === "object" && input?.method) || "GET").toUpperCase();

/** `base` is the fetch to wrap (default: the browser's); `waitMs` is the pause before the second try. */
export function readsAgain(base = (...args) => fetch(...args), waitMs = 400) {
  return async function fetchReadsAgain(input, init) {
    const method = methodOf(input, init);
    const isRead = method === "GET" || method === "HEAD" || (method === "POST" && READ_BY_POST.test(urlOf(input)));
    if (!isRead) return base(input, init);

    let first;                                                          // the answer, or the error that came instead of one
    try {
      first = await base(input, init);
      if (!GATEWAY_MOMENT.has(first.status)) return first;
    } catch (err) {
      if (init?.signal?.aborted) throw err;                             // the caller gave up on purpose
      first = err;
    }
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    try {
      const again = await base(input, init);
      if (!(first instanceof Error)) first.body?.cancel?.()?.catch?.(() => {});      // the gateway's answer is not used: let go of its body
      return again;
    } catch (err) {
      if (first instanceof Error) throw err;                            // twice with nothing back: say so
      return first;                                                     // the gateway's own answer is more use than a dropped second try
    }
  };
}
