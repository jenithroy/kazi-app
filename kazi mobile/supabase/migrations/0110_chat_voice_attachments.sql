-- Team chat gets voice-note replies, same as the Leads inbox already has.
-- Purely additive: widens the attachment_kind check so 'voice' is a legal
-- value alongside 'image'/'video'/'file'. No new table, no bucket change —
-- chat_messages already carries attachment_duration (ms) for exactly this,
-- and the chat-media bucket has no mime restriction.

alter table chat_messages drop constraint chat_messages_attachment_kind_check;

alter table chat_messages
  add constraint chat_messages_attachment_kind_check
  check (attachment_kind = any (array['image'::text, 'video'::text, 'file'::text, 'voice'::text]));
