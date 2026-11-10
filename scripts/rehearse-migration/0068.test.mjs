// Rehearsal of 0068_comm_record.sql and its undo on a scratch Postgres. Nothing here touches the live database.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { buildEnv, as, snapshot } from "./env.mjs";

const REPO = fileURLToPath(new URL("../../supabase/", import.meta.url));
const MIGRATION = fs.readFileSync(REPO + "migrations/0068_comm_record.sql", "utf8");
const UNDO = fs.readFileSync(REPO + "undo/0068_comm_record.undo.sql", "utf8");

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name, detail ? `-> ${detail}` : ""); }
};
const group = (t) => console.log("\n" + t);

async function raises(promise, re) {
  try { await promise; return { raised: false, message: "" }; }
  catch (e) { return { raised: true, message: String(e.message), match: re.test(String(e.message)) }; }
}
const expectError = async (name, promise, re) => {
  const r = await raises(promise, re);
  ok(name, r.raised && r.match, r.raised ? `wrong error: ${r.message}` : "no error was raised");
};

const DIRECTOR = { sub: "uid-director" }, ADMIN = { sub: "uid-admin" }, STAFF = { sub: "uid-staff" };
const INACTIVE = { sub: "uid-gone" }, STRANGER = { sub: "uid-nobody" };
// Supabase's own service key is a token whose issuer is the bare word "supabase", not a URL
const SERVICE = { sub: "service", role: "service_role", iss: "supabase", aud: "authenticated" }, ANON = { sub: "anon", role: "anon", claimRole: "anon" };
const count = async (db, sql = "select count(*)::int as n from comm_events") => (await db.query(sql)).rows[0].n;

const db = await buildEnv();

group("A. Applying the migration");
const S0 = await snapshot(db);
await db.exec(MIGRATION);
ok("applies cleanly to a database that has never seen it", true);
const S1 = await snapshot(db);
await db.exec(MIGRATION);
const S2 = await snapshot(db);
ok("applying it a second time changes nothing (idempotent)", S1 === S2);

const before = JSON.parse(S0), after = JSON.parse(S1);
const added = (k) => after[k].filter((x) => !before[k].includes(x));
const removed = (k) => before[k].filter((x) => !after[k].includes(x));
ok("adds exactly one table: comm_events", JSON.stringify(added("tables")) === JSON.stringify(["comm_events"]), JSON.stringify(added("tables")));
ok("adds exactly five functions",
  added("functions").length === 5 && ["comm_channel_origin(p_channel text)", "comm_events_before_insert()", "comm_events_guard_update()", "comm_events_no_delete()", "redact_comm_event(p_id uuid, p_reason text)"].every((f) => added("functions").includes(f)),
  JSON.stringify(added("functions")));
ok("removes nothing and changes no existing policy, trigger, index", ["tables", "functions", "policies", "triggers", "indexes"].every((k) => removed(k).length === 0));
ok("existing data (people, positions, sections, permissions) is byte-identical", JSON.stringify(before.data) === JSON.stringify(after.data));

group("B. Source tags are kept right by the database");
const ins = async (cols) => {
  const keys = Object.keys(cols), vals = Object.values(cols);
  const r = await db.query(`insert into comm_events (${keys.join(",")}) values (${keys.map((_, i) => "$" + (i + 1)).join(",")}) returning *`, vals);
  return r.rows[0];
};
const e1 = await ins({ occurred_at: "2026-11-01T10:00:00+05:45", channel: "whatsapp_call", direction: "in", kind: "call", external_id: "wamid.1", recorded_at: "2020-01-01T00:00:00Z" });
ok("a WhatsApp row gets the whatsapp tag with no help from the writer", JSON.stringify(e1.lineage) === '["whatsapp"]', JSON.stringify(e1.lineage));
ok("recorded_at is the database's clock, not the writer's", new Date(e1.recorded_at).getFullYear() >= 2026);
const e2 = await ins({ occurred_at: "2026-11-01T10:05:00+05:45", channel: "whatsapp_call", direction: "in", kind: "transcript", parent_id: e1.id, body: "namaste, order ko barema" });
ok("a transcript of a WhatsApp call is tagged whatsapp", JSON.stringify(e2.lineage) === '["whatsapp"]');
const e3 = await ins({ occurred_at: "2026-11-02T09:00:00+05:45", channel: "team_chat", direction: "internal", kind: "text", staff_person_id: "00000000-0000-0000-0000-0000000000b1", body: "cutting done", thread_ref: "t-1" });
ok("a team chat row is tagged internal", JSON.stringify(e3.lineage) === '["internal"]');
ok("staff_name is filled in from the staff record", e3.staff_name === "Sita Staff", e3.staff_name);
const e4 = await ins({ occurred_at: "2026-11-02T10:00:00+05:45", channel: "team_chat", direction: "internal", kind: "transcript", parent_id: e1.id, body: "summary of the call" });
ok("a row in ANOTHER channel derived from a WhatsApp row inherits the tag", JSON.stringify(e4.lineage) === '["internal","whatsapp"]', JSON.stringify(e4.lineage));
const e5 = await ins({ occurred_at: "2026-11-03T10:00:00+05:45", channel: "instagram", direction: "in", kind: "text", lineage: ["internal"], external_id: "ig.1", body: "price?" });
ok("a writer's own tags are kept and the channel's origin is added", JSON.stringify(e5.lineage) === '["internal","meta_messaging"]', JSON.stringify(e5.lineage));
const e6 = await ins({ occurred_at: "2026-11-03T11:00:00+05:45", channel: "whatsapp_chat", direction: "in", kind: "text", lineage: ["internal"], body: "a writer that forgot the tag" });
ok("a WhatsApp row cannot be passed off as internal-only", JSON.stringify(e6.lineage) === '["internal","whatsapp"]');

group("C. Constraints");
await expectError("an unknown channel is refused", db.query(`insert into comm_events (occurred_at, channel, direction, kind) values (now(), 'telegram', 'in', 'text')`), /check constraint/i);
await expectError("a transcript without its audio row is refused", db.query(`insert into comm_events (occurred_at, channel, direction, kind) values (now(), 'team_call', 'internal', 'transcript')`), /transcript_has_parent/);
await expectError("an unknown origin tag is refused", db.query(`insert into comm_events (occurred_at, channel, direction, kind, lineage) values (now(), 'team_chat', 'internal', 'text', array['bogus'])`), /lineage_ok/);
await expectError("a resent message (same channel + external id) is refused as a duplicate", db.query(`insert into comm_events (occurred_at, channel, direction, kind, external_id) values (now(), 'whatsapp_call', 'in', 'call', 'wamid.1')`), /duplicate key|comm_events_dedupe/);
await db.query(`insert into comm_events (occurred_at, channel, direction, kind) values (now(), 'team_chat', 'internal', 'text'), (now(), 'team_chat', 'internal', 'text')`);
ok("rows without an external id never collide", true);
await expectError("a negative duration is refused", db.query(`insert into comm_events (occurred_at, channel, direction, kind, media_seconds) values (now(), 'team_call', 'internal', 'call', -5)`), /check constraint/i);

group("D. Append-only, and erasure");
await expectError("editing a row is refused", db.query(`update comm_events set body = 'edited' where id = $1`, [e2.id]), /append-only/);
await expectError("re-pointing a row to another staff member is refused", db.query(`update comm_events set staff_person_id = '00000000-0000-0000-0000-0000000000d1' where id = $1`, [e3.id]), /append-only/);
await expectError("deleting a row is refused", db.query(`delete from comm_events where id = $1`, [e2.id]), /cannot be deleted/);
await expectError("truncating is blocked for signed-in roles (no privilege)", as(db, DIRECTOR, () => db.exec("truncate comm_events")), /permission denied/);

// erasure, as a director
await as(db, DIRECTOR, async () => {
  await db.query(`select redact_comm_event($1, 'requested by the customer')`, [e5.id]);
  const r = (await db.query(`select * from comm_events where id = $1`, [e5.id])).rows[0];
  // NB: as director with no comms_record section the select above returns nothing, so read via a definer-free check below
  ok("a director can erase an event (no error)", true);
});
// verify the effect from the superuser side (inside the same committed state)
await db.query(`select redact_comm_event($1, 'requested by the customer')`, [e5.id]); // operator path: session_user postgres
const red = (await db.query(`select * from comm_events where id = $1`, [e5.id])).rows[0];
ok("erasure blanks the text and the contact handle and stamps redacted_at", red.body === null && red.counterparty_ref === null && red.redacted_at !== null);
ok("erasure keeps the stub: channel, time and tags remain", red.channel === "instagram" && red.occurred_at && JSON.stringify(red.lineage) === '["internal","meta_messaging"]');
ok("erasure records that it happened", red.detail.erased === true && red.detail.reason === "requested by the customer");
await expectError("erasing twice is refused", db.query(`select redact_comm_event($1)`, [e5.id]), /already been erased|No such event/);
await expectError("an erased row can never change again", db.query(`update comm_events set body = 'back' where id = $1`, [e5.id]), /erased and cannot change/);

// who may erase
await expectError("regular staff cannot erase", as(db, STAFF, () => db.query(`select redact_comm_event($1)`, [e1.id])), /Only a system administrator/);
await expectError("a mid-tier admin cannot erase", as(db, ADMIN, () => db.query(`select redact_comm_event($1)`, [e1.id])), /Only a system administrator/);
await expectError("a token that matches no person cannot erase", as(db, STRANGER, () => db.query(`select redact_comm_event($1)`, [e1.id])), /Only a system administrator/);
await expectError("an inactive person cannot erase", as(db, INACTIVE, () => db.query(`select redact_comm_event($1)`, [e1.id])), /Only a system administrator/);
await expectError("a token from the wrong issuer cannot erase", as(db, { sub: "uid-director", iss: "https://evil.example/", aud: "x" }, () => db.query(`select redact_comm_event($1)`, [e1.id])), /Only a system administrator|Only a system/);
await expectError("anonymous visitors cannot call it at all", as(db, ANON, () => db.query(`select redact_comm_event($1)`, [e1.id])), /permission denied/);
await as(db, SERVICE, async () => {
  await db.query(`select redact_comm_event($1, 'by the worker')`, [e1.id]);
  ok("the service role (the Worker) can erase", true);
});

// deleting a staff record must not be blocked by the guard (the trap behind migration 0060)
const del = await (async () => {
  await db.exec("begin");
  try {
    await db.query(`delete from people where id = '00000000-0000-0000-0000-0000000000b1'`);
    const r = (await db.query(`select staff_person_id, staff_name from comm_events where id = $1`, [e3.id])).rows[0];
    return r;
  } finally { await db.exec("rollback"); }
})();
ok("deleting a staff record still works, leaves their rows unlinked and keeps the snapshot name", del.staff_person_id === null && del.staff_name === "Sita Staff", JSON.stringify(del));

group("E. Who can read and write (Supabase-style roles)");
const N = await count(db);
ok(`there are ${N} rows to look at`, N >= 6);
await as(db, STAFF, async () => ok("regular staff see 0 rows", (await count(db)) === 0));
await as(db, DIRECTOR, async () => ok("a director sees 0 rows before the comms_record section exists", (await count(db)) === 0));
await expectError("anonymous visitors are refused outright", as(db, ANON, () => db.query("select count(*) from comm_events")), /permission denied/);
await expectError("a signed-in user cannot insert", as(db, DIRECTOR, () => db.query(`insert into comm_events (occurred_at, channel, direction, kind) values (now(), 'team_chat', 'internal', 'text')`)), /permission denied/);
await expectError("a signed-in user cannot update", as(db, DIRECTOR, () => db.query(`update comm_events set body = 'x'`)), /permission denied/);
await expectError("a signed-in user cannot delete", as(db, DIRECTOR, () => db.query(`delete from comm_events`)), /permission denied/);
await as(db, SERVICE, async () => {
  await db.query(`insert into comm_events (occurred_at, channel, direction, kind, external_id) values (now(), 'whatsapp_chat', 'in', 'text', 'wamid.svc')`);
  ok("the service role can insert", true);
  ok("the service role can read everything", (await count(db)) >= N + 1);
});
await expectError("the service role cannot update directly (only through redact_comm_event)", as(db, SERVICE, () => db.query(`update comm_events set body = 'x'`)), /permission denied/);
await expectError("the service role cannot delete", as(db, SERVICE, () => db.query(`delete from comm_events`)), /permission denied/);
await expectError("the service role cannot truncate", as(db, SERVICE, () => db.exec(`truncate comm_events`)), /permission denied/);
await expectError("anonymous visitors cannot truncate", as(db, ANON, () => db.exec(`truncate comm_events`)), /permission denied/);

// simulate the future step: the permission section arrives (superuser, cleaned up afterwards)
await db.exec(`insert into sections (id, label, sort_order) values ('comms_record', 'Conversation Record', 25)`);
try {
  await as(db, DIRECTOR, async () => ok("once the section exists, a director (super admin) reads every row", (await count(db)) === N));
  await as(db, STAFF, async () => ok("...regular staff still see nothing", (await count(db)) === 0));
  await as(db, ADMIN, async () => ok("...a mid-tier admin still sees nothing", (await count(db)) === 0));
  await as(db, { sub: "uid-director", iss: "https://evil.example/", aud: "x" }, async () => ok("...a director's token from the wrong issuer sees nothing", (await count(db)) === 0));
  await as(db, INACTIVE, async () => ok("...an inactive person sees nothing", (await count(db)) === 0));
  await db.exec(`insert into person_permission_overrides (person_id, section_id, can_view) values ('00000000-0000-0000-0000-0000000000b1', 'comms_record', true)`);
  await as(db, STAFF, async () => ok("...an explicit grant to one person lets them read", (await count(db)) === N));
  await as(db, DIRECTOR, async () => {
    const r = await db.query(`select count(*)::int as n from comm_events where 'whatsapp' = any(lineage)`);
    ok("...and the whatsapp-tagged rows can be told apart for the sellable-dataset rule", r.rows[0].n >= 3, String(r.rows[0].n));
  });
} finally {
  await db.exec(`delete from sections where id = 'comms_record'`);
}

group("F. Undo");
const Nrows = await count(db);
await expectError("the undo refuses to drop a table that holds conversations", db.exec(UNDO), /comm_events holds recorded conversations/);
await db.exec("rollback"); // the file opens its own transaction; a real session would roll back the same way
ok("...and after the refusal everything is still there", (await count(db)) === Nrows && JSON.stringify(await snapshot(db)) === JSON.stringify(S1));
await db.exec(`set kazi.confirm_drop_comm_events = 'yes'`);
await db.exec(UNDO);
ok("with explicit confirmation the undo runs", true);
const S3 = await snapshot(db);
ok("after the undo the database is identical to how it was before the migration", S3 === S0, "snapshots differ");
await db.exec(UNDO);
ok("running the undo again (nothing to undo) is harmless", true);

// fresh database: apply, then undo with an empty table, no confirmation needed
const db2 = await buildEnv();
const T0 = await snapshot(db2);
await db2.exec(MIGRATION);
await db2.exec(UNDO);
ok("on a fresh database: apply then undo (empty table) leaves no trace", (await snapshot(db2)) === T0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
