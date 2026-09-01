-- ============================================================================
-- 0017_message_threads.sql
--
-- Messenger groups messages into conversations by `threadId` -- the customer's
-- page-scoped id from Meta -- and writes it on every message it sends. The
-- messages table has no such column, so those writes would have been dropped
-- and every message would have collapsed into one undifferentiated list.
--
-- Also widens senderId. The column is a uuid pointing at `people`, which is
-- right for a message from a member of staff but cannot hold "page" or a
-- customer's Meta psid, and those are exactly what a Messenger thread is made
-- of. legacy_sender_id already exists as free text for senders who are not
-- staff, so the view now prefers it and Messenger writes there.
-- ============================================================================

alter table messages add column if not exists thread_id text;

create index if not exists messages_thread_idx on messages(thread_id, sent_at);

create or replace view fs_messages as
  select m.id::text as id,
         coalesce(pe.legacy_firebase_uid, m.legacy_sender_id) as "senderId",
         m.text,
         m.sent_at   as "timestamp",
         m.sender_id,
         m.thread_id as "threadId"
    from messages m
    left join people pe on pe.id = m.sender_id;
