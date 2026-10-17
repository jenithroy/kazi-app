#!/usr/bin/env node
/**
 * End-to-end check of the chat schema AS A REAL SIGNED-IN USER.
 *
 * Everything in `0105`/`0106` is enforced by RLS, and RLS is exactly what a
 * superuser connection does not exercise — so this impersonates two staff in
 * turn by setting `role authenticated` and a `request.jwt.claims` matching
 * what Supabase Auth would issue. What passes here is what the app will get.
 *
 *   node scripts/verify-chat.cjs
 *
 * It creates a dm and a group between two real people, posts, reacts, reads,
 * edits the group, checks a third person is shut out, and then removes
 * everything it made.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..');

function connectionString() {
  const txt = fs.readFileSync(path.join(ROOT, 'mentions', 'supabase.txt'), 'utf8');
  const uri = (txt.match(/postgresql:\/\/\S+pooler\.supabase\.com:\d+\/postgres/g) || []).pop();
  if (!uri) throw new Error('no session-pooler URI in mentions/supabase.txt');
  return uri;
}

let failures = 0;
function check(label, ok, detail) {
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

/**
 * Run a query that is SUPPOSED to be refused, inside a savepoint.
 *
 * Without one, the expected error aborts the whole surrounding transaction
 * and the `commit` that follows silently becomes a rollback — which quietly
 * undoes everything the block did before it, and makes the next assertion
 * fail for a reason that has nothing to do with what it is testing.
 */
async function refuses(pg, sql, params) {
  await pg.query('savepoint probe');
  try {
    await pg.query(sql, params);
    await pg.query('release savepoint probe');
    return false;
  } catch {
    await pg.query('rollback to savepoint probe');
    return true;
  }
}

/** Run `fn` as this person, the way PostgREST would. */
async function as(pg, authUid, fn) {
  await pg.query('begin');
  await pg.query(`set local role authenticated`);
  await pg.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: authUid, role: 'authenticated', iss: 'https://ydaoyjacqcmxpgpwrgwt.supabase.co/auth/v1' }),
  ]);
  try {
    return await fn();
  } finally {
    await pg.query('commit');
    await pg.query('reset role');
  }
}

async function main() {
  const pg = new Client({ connectionString: connectionString(), ssl: { rejectUnauthorized: false } });
  await pg.connect();

  const { rows: staff } = await pg.query(
    `select p.id, p.full_name, p.auth_uid, p.position_id, po.tier
       from people p join positions po on po.id = p.position_id
      where p.status = 'Active' and p.auth_uid is not null
      order by po.tier desc, p.full_name limit 4`,
  );
  if (staff.length < 3) throw new Error('need at least three active staff with auth uids to test with');

  const [alice, bob, carol] = staff;
  console.log(`acting as: ${alice.full_name} (${alice.position_id}), ${bob.full_name}, ${carol.full_name}\n`);

  let dmId;
  let groupId;
  /** Anything else a probe managed to create, so the cleanup can take it too. */
  const extra = [];

  try {
    // ---- identity resolves at all -------------------------------------
    await as(pg, alice.auth_uid, async () => {
      const { rows } = await pg.query('select app_person_id() as id, app_tier() as tier');
      check('token resolves to a person', rows[0].id === alice.id, `got ${rows[0].id}`);
    });

    // ---- dm -----------------------------------------------------------
    await as(pg, alice.auth_uid, async () => {
      const { rows } = await pg.query('select chat_start_dm($1) as id', [bob.id]);
      dmId = rows[0].id;
      check('chat_start_dm creates a dm', !!dmId);

      const again = await pg.query('select chat_start_dm($1) as id', [bob.id]);
      check('a second call reuses the same dm', again.rows[0].id === dmId);

      await pg.query(
        `insert into chat_messages (thread_id, author_id, body) values ($1, $2, 'from alice')`,
        [dmId, alice.id],
      );
      const seen = await pg.query('select count(*)::int as n from chat_messages where thread_id = $1', [dmId]);
      check('author can post and read back', seen.rows[0].n === 1);
    });

    await as(pg, bob.auth_uid, async () => {
      const { rows } = await pg.query('select body from chat_messages where thread_id = $1', [dmId]);
      check('the other side sees the message', rows.length === 1 && rows[0].body === 'from alice');

      await pg.query(`insert into chat_reactions (message_id, person_id, emoji)
                      select id, $1, '🧵' from chat_messages where thread_id = $2`, [bob.id, dmId]);
      const r = await pg.query('select count(*)::int as n from chat_reactions');
      check('a member can react with any emoji', r.rows[0].n >= 1);
    });

    await as(pg, carol.auth_uid, async () => {
      const { rows } = await pg.query('select count(*)::int as n from chat_messages where thread_id = $1', [dmId]);
      check("a non-member sees none of the dm's messages", rows[0].n === 0);
      const t = await pg.query('select count(*)::int as n from chat_threads where id = $1', [dmId]);
      check('a non-member cannot see the thread either', t.rows[0].n === 0);
    });

    // impersonation
    await as(pg, bob.auth_uid, async () => {
      const refused = await refuses(
        pg,
        `insert into chat_messages (thread_id, author_id, body) values ($1, $2, 'forged')`,
        [dmId, alice.id],
      );
      check('cannot post as somebody else', refused);
    });

    // ---- group ---------------------------------------------------------
    await as(pg, alice.auth_uid, async () => {
      const { rows } = await pg.query('select chat_create_group($1, $2) as id', [
        'Verify group',
        [bob.id, carol.id],
      ]);
      groupId = rows[0].id;
      check('chat_create_group creates a group', !!groupId);

      const refused = await refuses(pg, 'select chat_create_group($1, $2)', ['Too small', [bob.id]]);
      check('a group of one other person is refused', refused);
    });

    await as(pg, carol.auth_uid, async () => {
      const { rows } = await pg.query('select name from chat_threads where id = $1', [groupId]);
      check('an added member sees the group', rows.length === 1 && rows[0].name === 'Verify group');
    });

    await as(pg, alice.auth_uid, async () => {
      await pg.query('select chat_update_group($1, $2, $3)', [groupId, 'Verify group renamed', [bob.id, carol.id]]);
      const { rows } = await pg.query('select name from chat_threads where id = $1', [groupId]);
      check('chat_update_group renames', rows[0].name === 'Verify group renamed');
    });

    // ---- unread / read line --------------------------------------------
    await as(pg, bob.auth_uid, async () => {
      const before = await pg.query(
        `select count(*)::int as n from chat_messages m
           join chat_members me on me.thread_id = m.thread_id and me.person_id = $1
          where m.thread_id = $2 and m.author_id <> $1 and m.sent_at > me.last_read_at`,
        [bob.id, dmId],
      );
      check('the dm reads as unread before it is opened', before.rows[0].n === 1);

      await pg.query('update chat_members set last_read_at = now() where thread_id = $1 and person_id = $2', [dmId, bob.id]);
      const after = await pg.query(
        `select count(*)::int as n from chat_messages m
           join chat_members me on me.thread_id = m.thread_id and me.person_id = $1
          where m.thread_id = $2 and m.author_id <> $1 and m.sent_at > me.last_read_at`,
        [bob.id, dmId],
      );
      check('marking read clears it', after.rows[0].n === 0);
    });

    // ---- leaving --------------------------------------------------------
    await as(pg, carol.auth_uid, async () => {
      await pg.query('update chat_members set left_at = now() where thread_id = $1 and person_id = $2', [groupId, carol.id]);
      const { rows } = await pg.query('select count(*)::int as n from chat_threads where id = $1', [groupId]);
      check('leaving hides the group from the leaver', rows[0].n === 0);
    });

    await as(pg, bob.auth_uid, async () => {
      const { rows } = await pg.query('select count(*)::int as n from chat_threads where id = $1', [groupId]);
      check('everyone else keeps the group', rows[0].n === 1);
    });

    // ---- the capability itself -------------------------------------------
    await as(pg, alice.auth_uid, async () => {
      const { rows } = await pg.query('select * from my_chat_group_permissions');
      check('my_chat_group_permissions answers', rows.length === 1, JSON.stringify(rows[0]));
    });

    // Take the grant away and confirm the database, not the app, refuses.
    await pg.query('reset role');
    const saved = await pg.query('select can_create from chat_group_permissions where position_id = $1', [alice.position_id]);
    await pg.query('update chat_group_permissions set can_create = false where position_id = $1', [alice.position_id]);
    await as(pg, alice.auth_uid, async () => {
      // A super admin is expected through — tier 4 short-circuits the grant —
      // so the group it makes has to be cleaned up like the others.
      const refused = await refuses(pg, 'select chat_create_group($1, $2) as id', ['Grant-off probe', [bob.id, carol.id]]);
      if (!refused) {
        const made = await pg.query(`select id from chat_threads where name = 'Grant-off probe'`);
        extra.push(...made.rows.map((r) => r.id));
      }
      check(
        alice.tier >= 4 ? 'a super admin still creates groups with the grant off' : 'without can_create the database refuses',
        alice.tier >= 4 ? !refused : refused,
      );
    });
    await pg.query('reset role');
    await pg.query('update chat_group_permissions set can_create = $2 where position_id = $1', [
      alice.position_id,
      saved.rows[0]?.can_create ?? true,
    ]);
  } finally {
    await pg.query('reset role');
    for (const id of [dmId, groupId, ...extra].filter(Boolean)) {
      await pg.query('delete from chat_threads where id = $1', [id]);
    }
    console.log('\ncleaned up test threads');
    await pg.end();
  }

  console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error('ERR', e.message);
  process.exitCode = 1;
});
