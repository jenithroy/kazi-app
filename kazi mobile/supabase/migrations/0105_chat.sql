-- =====================================================================
-- 0105 — Chat: real threads, messages, reactions, attachments.
--
-- Numbered in the mobile-only 01xx range (see 0100). Everything here is
-- ADDITIVE: new `chat_*` tables, new helper functions, one new private
-- storage bucket. Nothing the web app reads is touched —
--
--   * `messages` / `fs_messages` (the abandoned Firestore-era chat, one test
--     row) are left exactly as they are. The web ERP still owns them.
--   * `sections` gains no row, so the web admin panel's permission matrix is
--     unchanged. The two new chat-group capabilities live in their own table
--     (`chat_group_permissions`) that only the mobile admin panel reads.
--   * `storage.objects` gains policies scoped `bucket_id = 'chat-media'`, so
--     the existing public `product-media` bucket behaves as before.
--
-- Shape notes:
--   * A thread's membership is a table, not an array, because pin / mute /
--     "read up to here" / "I left" are all per-person facts about a shared
--     conversation, and an array would need rewriting on every one of them.
--   * `left_at` is a soft leave: "delete conversation" only removes it from
--     YOUR list. The other side keeps the history, which is what every
--     messenger does and what stops one person erasing a shared record.
--   * Unread is derived from `last_read_at` rather than stored as a counter,
--     so it can never drift from the messages that actually exist.
-- =====================================================================

-- ---------------------------------------------------------------- tables

create table if not exists chat_threads (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('dm', 'group')),
  -- Groups only; a dm takes its title from the other member.
  name        text,
  avatar_tint text,
  -- The two member ids, sorted and joined — a unique key that makes a second
  -- dm between the same pair impossible. Null for groups.
  dm_key      text unique,
  created_by  uuid references people(id) on delete set null,
  created_at  timestamptz not null default now(),
  -- Bumped by the message trigger below. The thread list orders on this, so
  -- an empty new conversation still sorts sensibly by its creation time.
  updated_at  timestamptz not null default now(),
  constraint chat_threads_group_named check (kind <> 'group' or coalesce(name, '') <> ''),
  constraint chat_threads_dm_keyed    check (kind <> 'dm' or dm_key is not null)
);

create table if not exists chat_members (
  thread_id    uuid not null references chat_threads(id) on delete cascade,
  person_id    uuid not null references people(id) on delete cascade,
  -- 'owner' is whoever created the group; it grants nothing on its own (the
  -- position's `can_manage` does), it is only shown in the members list.
  member_role  text not null default 'member' check (member_role in ('owner', 'member')),
  pinned       boolean not null default false,
  muted        boolean not null default false,
  last_read_at timestamptz not null default 'epoch',
  joined_at    timestamptz not null default now(),
  left_at      timestamptz,
  primary key (thread_id, person_id)
);
create index if not exists chat_members_person_idx on chat_members (person_id) where left_at is null;

create table if not exists chat_messages (
  id        uuid primary key default gen_random_uuid(),
  thread_id uuid not null references chat_threads(id) on delete cascade,
  author_id uuid not null references people(id) on delete cascade,
  body      text not null default '',
  reply_to  uuid references chat_messages(id) on delete set null,
  -- One attachment per message, mirroring how the composer sends them. The
  -- path is an object in the private `chat-media` bucket; the app asks for a
  -- signed URL when it needs to show it.
  attachment_path     text,
  attachment_kind     text check (attachment_kind in ('image', 'video', 'file')),
  attachment_name     text,
  attachment_mime     text,
  attachment_size     bigint,
  attachment_width    integer,
  attachment_height   integer,
  attachment_duration integer,          -- milliseconds, video only
  -- A tombstone, not a delete: a reply pointing at a removed message still
  -- has something to resolve to.
  deleted   boolean not null default false,
  sent_at   timestamptz not null default now(),
  edited_at timestamptz,
  constraint chat_messages_not_empty
    check (deleted or coalesce(body, '') <> '' or attachment_path is not null)
);
create index if not exists chat_messages_thread_idx on chat_messages (thread_id, sent_at);

create table if not exists chat_reactions (
  message_id uuid not null references chat_messages(id) on delete cascade,
  person_id  uuid not null references people(id) on delete cascade,
  -- Free text, not an enum: the picker offers presets but anybody may send
  -- any emoji, so the column has to accept one.
  emoji      text not null,
  reacted_at timestamptz not null default now(),
  primary key (message_id, person_id, emoji)
);
create index if not exists chat_reactions_message_idx on chat_reactions (message_id);

-- Who may start a group, and who may rename one / add / remove members /
-- delete it. A property of the position, exactly like `position_permissions`
-- — but a separate table, because adding a `sections` row would put a
-- meaningless extra line in the WEB app's permission matrix.
create table if not exists chat_group_permissions (
  position_id text primary key references positions(id) on delete cascade,
  can_create  boolean not null default false,
  can_manage  boolean not null default false
);

-- ------------------------------------------------------------- functions

-- Membership, as a SECURITY DEFINER lookup. Asking it inside the policy on
-- `chat_members` itself would recurse; this reads the table with RLS off and
-- answers the one question the policies need.
create or replace function app_in_thread(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from chat_members m
     where m.thread_id = t
       and m.person_id = app_person_id()
       and m.left_at is null);
$$;

-- The same question asked about a message, for the reactions policies.
create or replace function app_in_message_thread(m uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select app_in_thread((select thread_id from chat_messages where id = m));
$$;

-- Super admins always may; everyone else needs the row. A position with no
-- row at all can do neither, which is the safe default for a new role.
create or replace function app_can_create_group()
returns boolean language sql stable security definer set search_path = public as $$
  select app_tier() >= 4
      or coalesce((select g.can_create from people pe
                     join chat_group_permissions g on g.position_id = pe.position_id
                    where pe.id = app_person_id()), false);
$$;

create or replace function app_can_manage_group(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select app_in_thread(t)
     and (app_tier() >= 4
          or coalesce((select g.can_manage from people pe
                         join chat_group_permissions g on g.position_id = pe.position_id
                        where pe.id = app_person_id()), false));
$$;

-- A new message is what makes a thread recent.
create or replace function chat_touch_thread()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update chat_threads set updated_at = new.sent_at where id = new.thread_id;
  return new;
end $$;
drop trigger if exists chat_messages_touch on chat_messages;
create trigger chat_messages_touch after insert on chat_messages
  for each row execute function chat_touch_thread();

-- ------------------------------------------------------------------ RLS

alter table chat_threads           enable row level security;
alter table chat_members           enable row level security;
alter table chat_messages          enable row level security;
alter table chat_reactions         enable row level security;
alter table chat_group_permissions enable row level security;

-- the issuer pin every other table carries (see 0009)
drop policy if exists require_known_issuer on chat_threads;
create policy require_known_issuer on chat_threads
  as restrictive to authenticated using (app_issuer_ok());
drop policy if exists require_known_issuer on chat_members;
create policy require_known_issuer on chat_members
  as restrictive to authenticated using (app_issuer_ok());
drop policy if exists require_known_issuer on chat_messages;
create policy require_known_issuer on chat_messages
  as restrictive to authenticated using (app_issuer_ok());
drop policy if exists require_known_issuer on chat_reactions;
create policy require_known_issuer on chat_reactions
  as restrictive to authenticated using (app_issuer_ok());
drop policy if exists require_known_issuer on chat_group_permissions;
create policy require_known_issuer on chat_group_permissions
  as restrictive to authenticated using (app_issuer_ok());

-- Threads: you see the ones you are in. Anyone with Messenger may start one;
-- only a role with `can_create` may make it a group.
drop policy if exists chat_threads_read on chat_threads;
create policy chat_threads_read on chat_threads for select to authenticated
  using (app_in_thread(id));
drop policy if exists chat_threads_insert on chat_threads;
create policy chat_threads_insert on chat_threads for insert to authenticated
  with check (created_by = app_person_id()
              and app_can_edit('messenger')
              and (kind = 'dm' or app_can_create_group()));
drop policy if exists chat_threads_update on chat_threads;
create policy chat_threads_update on chat_threads for update to authenticated
  using (app_can_manage_group(id)) with check (app_can_manage_group(id));
drop policy if exists chat_threads_delete on chat_threads;
create policy chat_threads_delete on chat_threads for delete to authenticated
  using (app_can_manage_group(id));

-- Membership: everyone in a thread sees who else is in it. You may always
-- write your OWN row (pin, mute, mark read, leave); adding or removing other
-- people needs `can_manage`. The insert policy's escape hatch is the moment
-- of creation, when there is not yet a membership to check.
drop policy if exists chat_members_read on chat_members;
create policy chat_members_read on chat_members for select to authenticated
  using (app_in_thread(thread_id) or person_id = app_person_id());
drop policy if exists chat_members_insert on chat_members;
create policy chat_members_insert on chat_members for insert to authenticated
  with check (app_can_manage_group(thread_id)
              or exists (select 1 from chat_threads t
                          where t.id = thread_id and t.created_by = app_person_id()));
drop policy if exists chat_members_update on chat_members;
create policy chat_members_update on chat_members for update to authenticated
  using (person_id = app_person_id() or app_can_manage_group(thread_id))
  with check (person_id = app_person_id() or app_can_manage_group(thread_id));
drop policy if exists chat_members_delete on chat_members;
create policy chat_members_delete on chat_members for delete to authenticated
  using (person_id = app_person_id() or app_can_manage_group(thread_id));

-- Messages: read what is in your threads, post as yourself, and edit or
-- tombstone only your own. Nothing is ever hard-deleted through the app.
drop policy if exists chat_messages_read on chat_messages;
create policy chat_messages_read on chat_messages for select to authenticated
  using (app_in_thread(thread_id));
drop policy if exists chat_messages_insert on chat_messages;
create policy chat_messages_insert on chat_messages for insert to authenticated
  with check (author_id = app_person_id()
              and app_in_thread(thread_id)
              and app_can_edit('messenger'));
drop policy if exists chat_messages_update on chat_messages;
create policy chat_messages_update on chat_messages for update to authenticated
  using (author_id = app_person_id()) with check (author_id = app_person_id());

-- Reactions: yours to add and remove, everyone in the thread sees the count.
drop policy if exists chat_reactions_read on chat_reactions;
create policy chat_reactions_read on chat_reactions for select to authenticated
  using (app_in_message_thread(message_id));
drop policy if exists chat_reactions_insert on chat_reactions;
create policy chat_reactions_insert on chat_reactions for insert to authenticated
  with check (person_id = app_person_id() and app_in_message_thread(message_id));
drop policy if exists chat_reactions_delete on chat_reactions;
create policy chat_reactions_delete on chat_reactions for delete to authenticated
  using (person_id = app_person_id());

-- The capability matrix is readable by anyone signed in (the app needs to
-- know whether to offer "New group") and writable only from the Admin Panel.
drop policy if exists chat_group_perms_read on chat_group_permissions;
create policy chat_group_perms_read on chat_group_permissions for select to authenticated
  using (true);
drop policy if exists chat_group_perms_write on chat_group_permissions;
create policy chat_group_perms_write on chat_group_permissions for all to authenticated
  using (app_can_edit('admin')) with check (app_can_edit('admin'));

grant select, insert, update, delete on chat_threads   to authenticated;
grant select, insert, update, delete on chat_members   to authenticated;
grant select, insert, update           on chat_messages to authenticated;
grant select, insert,         delete   on chat_reactions to authenticated;
grant select, insert, update, delete on chat_group_permissions to authenticated;

-- What the current person's own position grants, ready to read in one go —
-- the same shape as `my_permissions`.
create or replace view my_chat_group_permissions with (security_invoker = on) as
  select app_can_create_group() as can_create,
         (app_tier() >= 4
          or coalesce((select g.can_manage from people pe
                         join chat_group_permissions g on g.position_id = pe.position_id
                        where pe.id = app_person_id()), false)) as can_manage;
grant select on my_chat_group_permissions to authenticated;

-- ------------------------------------------------------------- seed

-- Every position that exists today gets a row so the Admin Panel has
-- something to show. Tier 2 and up may both create and manage; everyone else
-- may create a group but not restructure one — a deliberately permissive
-- starting point that the Admin Panel exists to narrow.
insert into chat_group_permissions (position_id, can_create, can_manage)
  select p.id, true, p.tier >= 2 from positions p
  on conflict (position_id) do nothing;

-- ---------------------------------------------------------- attachments

-- Private, 50 MB ceiling. The app compresses images and asks the OS for a
-- lower-quality video export before it ever gets here, so this limit is the
-- backstop rather than the thing users hit.
insert into storage.buckets (id, name, public, file_size_limit)
  values ('chat-media', 'chat-media', false, 52428800)
  on conflict (id) do update set file_size_limit = excluded.file_size_limit,
                                 public = excluded.public;

-- Object paths are `<thread_id>/<uuid>.<ext>`, so the first path segment is
-- the membership check. Scoped to this bucket alone — `product-media` has no
-- policies today and keeps none.
drop policy if exists chat_media_read on storage.objects;
create policy chat_media_read on storage.objects for select to authenticated
  using (bucket_id = 'chat-media' and app_in_thread(nullif(split_part(name, '/', 1), '')::uuid));
drop policy if exists chat_media_insert on storage.objects;
create policy chat_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-media'
              and app_can_edit('messenger')
              and app_in_thread(nullif(split_part(name, '/', 1), '')::uuid));
drop policy if exists chat_media_delete on storage.objects;
create policy chat_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'chat-media' and owner = auth.uid());

-- ------------------------------------------------------------ realtime

-- Live threads without polling. `add table` errors if it is already there,
-- so each is guarded.
do $$
declare t text;
begin
  foreach t in array array['chat_threads', 'chat_members', 'chat_messages', 'chat_reactions'] loop
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
