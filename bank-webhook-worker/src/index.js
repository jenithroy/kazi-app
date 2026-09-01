/**
 * Cloudflare Worker: Bank Webhook Receiver
 *
 * Takes webhook POSTs from Nabil Bank (via Google Apps Script) and writes them
 * to Supabase.
 *
 * Considerably shorter than the Firestore version it replaces. That one had to
 * build and sign a service-account JWT, exchange it with Google for an OAuth2
 * access token, and then hand-encode every field into Firestore's typed REST
 * format ({ stringValue }, { doubleValue }, …). PostgREST accepts a plain JSON
 * row with a static key, so all of that — roughly a hundred lines of crypto and
 * encoding — is gone, along with the private key that had to live in the
 * worker's environment.
 */

export default {
  async fetch(request, env) {
    // 1. Only accept POST requests
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "POST" },
      });
    }

    // 2. Validate Authorization header Bearer token
    const authHeader = request.headers.get("authorization");
    const secretKey = env.WEBHOOK_SECRET_KEY;
    if (!secretKey) {
      console.error("WEBHOOK_SECRET_KEY is not configured.");
      return new Response("Internal Server Error: Missing server credentials", { status: 500 });
    }
    if (!authHeader || authHeader !== `Bearer ${secretKey}`) {
      console.warn("Unauthorized webhook access attempt");
      return new Response("Unauthorized", { status: 401 });
    }

    try {
      // 3. Parse incoming JSON payload
      const payload = await request.json();
      const { date, type, amount, balance, remarks, timestamp } = payload || {};

      if (!date || !type || amount === undefined || balance === undefined || !timestamp) {
        console.warn("Webhook request body missing required fields", payload);
        return new Response("Bad Request: Missing required fields", { status: 400 });
      }

      const supabaseUrl = env.SUPABASE_URL;
      const serviceKey = env.SUPABASE_SERVICE_KEY;
      if (!supabaseUrl || !serviceKey) {
        console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY bindings.");
        return new Response("Internal Server Error: Missing server credentials", { status: 500 });
      }

      // 4. Build the row.
      //
      // `date` is kept verbatim in txn_date_text because the bank sends it in
      // its own format, and txn_at carries the machine-readable instant. The
      // app's view prefers the bank's own wording when showing a transaction
      // and falls back to formatting txn_at.
      // `type` is constrained to exactly 'Credit' or 'Debit'. The bank's own
      // casing varies, and the old Firestore write stored whatever arrived
      // because nothing checked — so normalise here rather than let a lowercase
      // "credit" be rejected and the transaction lost.
      const normalisedType = /^cr/i.test(String(type)) ? "Credit" : "Debit";

      const row = {
        txn_date_text: String(date),
        txn_at: new Date(timestamp).toISOString(),
        type: normalisedType,
        amount: Number(amount),
        balance: Number(balance),
        remarks: String(remarks || ""),
        description: String(remarks || ""),
      };

      const dbResponse = await fetch(`${supabaseUrl}/rest/v1/bank_transactions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          // Nothing reads the response; asking for none keeps the reply small.
          Prefer: "return=minimal",
        },
        body: JSON.stringify(row),
      });

      if (!dbResponse.ok) {
        const errorText = await dbResponse.text();
        console.error("Supabase REST error:", dbResponse.status, errorText);
        return new Response("Internal Server Error: Database write failed", { status: 500 });
      }

      console.log(`Saved bank transaction. Balance: NPR ${balance}`);
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("Failed to process webhook:", err.message);
      return new Response("Internal Server Error", { status: 500 });
    }
  },
};
