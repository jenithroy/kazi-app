// Rehearsal of 0070_kazi.sql and its undo on a scratch Postgres. Nothing here touches the live database.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { buildEnv, as, snapshot } from "./env.mjs";

const REPO = fileURLToPath(new URL("../../supabase/", import.meta.url));
const MIGRATION = fs.readFileSync(REPO + "migrations/0070_kazi.sql", "utf8");
const UNDO = fs.readFileSync(REPO + "undo/0070_kazi.undo.sql", "utf8");

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
const WRONG_ISSUER = { sub: "uid-director", iss: "https://evil.example/", aud: "x" };
const SERVICE = { sub: "service", role: "service_role", iss: "supabase", aud: "authenticated" }, ANON = { sub: "anon", role: "anon", claimRole: "anon" };
const D1 = "00000000-0000-0000-0000-0000000000d1", A1 = "00000000-0000-0000-0000-0000000000a1", B1 = "00000000-0000-0000-0000-0000000000b1";
const count = async (db, sql = "select count(*)::int as n from kazi_messages") => (await db.query(sql)).rows[0].n;
const say = (db, person, role = "user", content = "how many orders are late?") =>
  db.query(`insert into kazi_messages (person_id, role, content) values ($1, $2, $3)`, [person, role, content]);

// The live database has the permission-matrix guard from 0028 (it refuses to delete or reduce a super admin's permission row) and the undo
// has to pause it. The shared scratch database leaves it out (0068's cleanup would trip on it), so this test installs it, from the
// migration's own text, to prove the undo really works with it in place.
const M0028 = fs.readFileSync(REPO + "migrations/0028_protect_permission_matrix.sql", "utf8").replace(/\r\n/g, "\n");
const GUARD = M0028.match(/create or replace function public\.guard_permission_matrix\(\)[\s\S]*?for each row execute function public\.guard_permission_matrix\(\);/i)[0];
const fresh = async () => { const d = await buildEnv(); await d.exec(GUARD); return d; };

const db = await fresh();

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
ok("adds exactly one table: kazi_messages", JSON.stringify(added("tables")) === JSON.stringify(["kazi_messages"]), JSON.stringify(added("tables")));
ok("adds exactly one function and one trigger (the created_at stamp)", JSON.stringify(added("functions")) === JSON.stringify(["kazi_messages_stamp()"]) && JSON.stringify(added("triggers")) === JSON.stringify(["kazi_messages.kazi_messages_stamp"]), JSON.stringify([added("functions"), added("triggers")]));
ok("adds exactly three policies (known issuer, read own, insert own)", added("policies").length === 3 && added("policies").some((p) => p.startsWith("kazi_messages.kazi_read_own")) && added("policies").some((p) => p.startsWith("kazi_messages.require_known_issuer")), JSON.stringify(added("policies")));
ok("removes nothing and changes no existing policy, trigger, function or index", ["tables", "functions", "policies", "triggers", "indexes"].every((k) => removed(k).length === 0));
const rowOf = (s, name) => s.data.find((r) => r.startsWith(name + "|"));
ok("people and positions are byte-identical", rowOf(before, "people") === rowOf(after, "people") && rowOf(before, "positions") === rowOf(after, "positions"));
ok("exactly one section is added (kazi) and exactly one permission row (the director's)", Number(rowOf(after, "sections").split("|")[1]) === Number(rowOf(before, "sections").split("|")[1]) + 1 && Number(rowOf(after, "pp").split("|")[1]) === Number(rowOf(before, "pp").split("|")[1]) + 1);

group("B. Who gets the permission");
const can = async (who) => as(db, who, async () => (await db.query(`select app_can_view('kazi') as v`)).rows[0].v);
ok("a director (tier 4) has it at once, because a new section goes to the super admins", (await can(DIRECTOR)) === true);
ok("a mid-tier admin does not", (await can(ADMIN)) === false);
ok("regular staff do not", (await can(STAFF)) === false);
ok("an inactive person does not", (await can(INACTIVE)) === false);
ok("a token that matches no person does not", (await can(STRANGER)) === false);
// (the wrong-issuer check is the table's restrictive policy, not app_can_view(): see "wrong issuer" in D, which proves it on the table itself)
const sec = (await db.query(`select label, sort_order from sections where id = 'kazi'`)).rows[0];
ok("the section has a plain label for the permission screens", sec.label === "Kazi (AI assistant)");

group("C. The table's own rules");
{
  await db.query(`insert into kazi_messages (person_id, role, content) values (null, 'user', 'first'), (null, 'assistant', 'second'), (null, 'user', 'third')`);
  const order = (await db.query(`select content from kazi_messages where content in ('first','second','third') order by seq`)).rows.map((r) => r.content);
  ok("rows stored by one statement keep the order they were sent in (seq), even though created_at is the same for all three", JSON.stringify(order) === JSON.stringify(["first", "second", "third"]), JSON.stringify(order));
  await db.exec(`delete from kazi_messages`);
}
await expectError("an unknown role is refused", db.query(`insert into kazi_messages (person_id, role, content) values (null, 'system', 'x')`), /check constraint/i);
await expectError("an empty message is refused", db.query(`insert into kazi_messages (person_id, role, content) values (null, 'user', '')`), /check constraint/i);
await expectError("a negative cost is refused", db.query(`insert into kazi_messages (person_id, role, content, cost_usd) values (null, 'assistant', 'x', -1)`), /check constraint/i);
const stamp = (await db.query(`insert into kazi_messages (person_id, role, content, created_at) values (null, 'user', 'old', '2020-01-01') returning created_at`)).rows[0];
ok("created_at is the database's clock even when the writer (here the owner of the database) sends 2020-01-01", new Date(stamp.created_at).getFullYear() >= 2026, String(stamp.created_at));
await db.exec(`delete from kazi_messages`);

group("D. Who can read and write (Supabase-style roles)");
await as(db, DIRECTOR, async () => {
  await say(db, D1, "user", "how many orders are late?");
  await db.query(`insert into kazi_messages (person_id, role, content, lookups, model, usage, cost_usd) values ($1, 'assistant', 'One.', $2, 'claude-opus-5-5', $3, 0.0123)`,
    [D1, JSON.stringify([{ tool: "orders_overview", input: {} }]), JSON.stringify({ input: 100, output: 40 })]);
  ok("a director can write their own question and Kazi's answer (with lookups, model, usage, cost)", true);
  ok("...and read both back", (await count(db)) === 2);
});
const forged = await as(db, DIRECTOR, async () => (await db.query(`insert into kazi_messages (person_id, role, content, created_at) values ($1, 'user', 'backdated?', '2020-01-01') returning created_at`, [D1])).rows[0]);
ok("a person cannot backdate their own row: the database's clock wins", new Date(forged.created_at).getFullYear() >= 2026, String(forged.created_at));
await as(db, DIRECTOR, async () => {
  await db.query(`insert into kazi_messages (person_id, role, content, model, cost_usd) values ($1, 'assistant', 'Kazi says every invoice is paid.', 'claude-opus-5-5', 0)`, [D1]);
  ok("(known, written down in the migration's header) a person with the permission CAN write an 'assistant' row into their own history", true);
});
// keep a committed pair of rows for the checks below (the harness rolls back what runs as a role)
await db.query(`insert into kazi_messages (person_id, role, content) values ($1, 'user', 'a director question'), ($1, 'assistant', 'a director answer')`, [D1]);
await expectError("a director cannot write a row in someone else's name", as(db, DIRECTOR, () => say(db, B1)), /row-level security/i);
await expectError("...nor a row with nobody's name", as(db, DIRECTOR, () => say(db, null)), /row-level security/i);
await expectError("a director cannot edit a row", as(db, DIRECTOR, () => db.query(`update kazi_messages set content = 'changed'`)), /permission denied/);
await expectError("a director cannot delete a row", as(db, DIRECTOR, () => db.query(`delete from kazi_messages`)), /permission denied/);
await expectError("a director cannot truncate the table", as(db, DIRECTOR, () => db.exec(`truncate kazi_messages`)), /permission denied/);
await expectError("regular staff (no permission) cannot write", as(db, STAFF, () => say(db, B1)), /row-level security/i);
await as(db, STAFF, async () => ok("...and see nothing", (await count(db)) === 0));
await expectError("a mid-tier admin cannot write", as(db, ADMIN, () => say(db, A1)), /row-level security/i);
await expectError("an inactive person cannot write", as(db, INACTIVE, () => say(db, "00000000-0000-0000-0000-0000000000c1")), /row-level security/i);
await expectError("a token that matches no person cannot write", as(db, STRANGER, () => say(db, D1)), /row-level security/i);
await expectError("a director's token from the wrong issuer cannot write", as(db, WRONG_ISSUER, () => say(db, D1)), /row-level security|violates/i);
await as(db, WRONG_ISSUER, async () => ok("...and sees nothing", (await count(db)) === 0));
await expectError("anonymous visitors are refused outright", as(db, ANON, () => db.query("select count(*) from kazi_messages")), /permission denied/);
await expectError("the service role has no access at all (the Worker writes as the person)", as(db, SERVICE, () => db.query("select count(*) from kazi_messages")), /permission denied/);
await expectError("...not even to insert", as(db, SERVICE, () => say(db, D1)), /permission denied/);

// an explicit grant to one person lets them use Kazi, and they still see only their own
await db.exec(`insert into person_permission_overrides (person_id, section_id, can_view) values ('${B1}', 'kazi', true)`);
await as(db, STAFF, async () => {
  await say(db, B1, "user", "what is in stock?");
  ok("once granted, a member of staff can write their own question", true);
  ok("...and sees only their own row, never the director's", (await count(db)) === 1 && (await count(db, "select count(*)::int as n from kazi_messages where person_id <> '" + B1 + "'")) === 0);
});
await as(db, DIRECTOR, async () => ok("a director sees only their own rows, not the staff member's (the table is private to the person)", (await count(db)) === 2 && (await count(db, "select count(*)::int as n from kazi_messages where person_id = '" + B1 + "'")) === 0));
await db.exec(`delete from person_permission_overrides where person_id = '${B1}' and section_id = 'kazi'`);
await as(db, STAFF, async () => ok("when the grant is taken away their own old rows stop being readable too", (await count(db)) === 0));

// deleting a staff record is never blocked by it (the trap behind migration 0060)
await db.query(`insert into kazi_messages (person_id, role, content) values ($1, 'user', 'a question')`, [B1]);
const del = await (async () => {
  await db.exec("begin");
  try {
    await db.query(`delete from people where id = '${B1}'`);
    return (await db.query(`select count(*)::int as n, count(person_id)::int as linked from kazi_messages where content = 'a question'`)).rows[0];
  } finally { await db.exec("rollback"); }
})();
ok("deleting a staff record still works, and leaves their rows in place, unlinked", del.n === 1 && del.linked === 0, JSON.stringify(del));

group("E. Undo");
await expectError("the matrix guard is really on in this rehearsal: a super admin's permission row cannot be deleted by hand", db.exec(`delete from position_permissions where section_id = 'kazi'`), /Super admin roles keep full access/);
const N = await count(db);
await expectError("the undo refuses to drop a table that holds what people asked", db.exec(UNDO), /kazi_messages holds what people asked/);
await db.exec("rollback"); // the file opens its own transaction; a real session would roll back the same way
ok("...and after the refusal everything is still there", (await count(db)) === N && JSON.stringify(await snapshot(db)) === JSON.stringify(S1));
await db.exec(`set kazi.confirm_drop_kazi_messages = 'yes'`);
await db.exec(UNDO);
ok("with explicit confirmation the undo runs", true);
const S3 = await snapshot(db);
ok("after the undo the database is identical to how it was before the migration", S3 === S0, "snapshots differ");
ok("the guard that protects the permission matrix is switched back on", (await db.query(`select tgenabled from pg_trigger where tgname = 'guard_permission_matrix'`)).rows.every((r) => r.tgenabled !== "D"));
await db.exec(UNDO);
ok("running the undo again (nothing to undo) is harmless", true);

// fresh database: apply, then undo with an empty table, no confirmation needed
const db2 = await fresh();
const T0 = await snapshot(db2);
await db2.exec(MIGRATION);
await db2.exec(UNDO);
ok("on a fresh database: apply then undo (empty table) leaves no trace", (await snapshot(db2)) === T0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
