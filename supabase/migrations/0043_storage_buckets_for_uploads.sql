-- File uploads (VAT bills, production order attachments) have been going to a
-- Firebase Storage bucket that requires a Firebase Auth session. Login tries
-- Supabase first and only falls back to Firebase when that fails, so anyone
-- signed in through Supabase (everyone active today -- see people.auth_uid)
-- never has a Firebase session, and Firebase Storage's `request.auth != null`
-- rule silently denies every upload. vat_bills has been empty since the
-- Firestore-to-Supabase migration as a result.
--
-- This adds the two buckets those features need, following the same pattern
-- already in production use for product-media and chat-media (see
-- src/lib/chat.js): a bucket per section, `app_can_edit(section)` gating
-- writes the same way every other table in this app is gated, so Storage's
-- security finally matches the rest of the database instead of being a
-- separate all-or-nothing "signed in" check.
--
-- Both are public buckets, matching how these files actually behaved under
-- Firebase: `getDownloadURL()` returns a durable, unauthenticated link once
-- generated (the storage rule only gates *creating* that link, not fetching
-- it afterwards), and both fs_vat_bills-style rows and order notes store that
-- link as a plain string, expected to keep working indefinitely. A private
-- bucket would need every list/view that shows one of these files to mint a
-- fresh signed URL on the way out (see chat.js's signedUrlFor) -- worth doing
-- for direct messages, not for what is otherwise a same-shape swap of one
-- storage backend for another.

insert into storage.buckets (id, name, public)
values
  ('finance-attachments',     'finance-attachments',     true),
  ('production-attachments',  'production-attachments',  true)
on conflict (id) do nothing;

create policy "finance_attachments_read" on storage.objects
  for select
  using (bucket_id = 'finance-attachments');

create policy "finance_attachments_insert" on storage.objects
  for insert
  with check (bucket_id = 'finance-attachments' and app_can_edit('finance'));

create policy "finance_attachments_update" on storage.objects
  for update
  using (bucket_id = 'finance-attachments' and app_can_edit('finance'))
  with check (bucket_id = 'finance-attachments' and app_can_edit('finance'));

create policy "finance_attachments_delete" on storage.objects
  for delete
  using (bucket_id = 'finance-attachments' and app_can_edit('finance'));

create policy "production_attachments_read" on storage.objects
  for select
  using (bucket_id = 'production-attachments');

create policy "production_attachments_insert" on storage.objects
  for insert
  with check (bucket_id = 'production-attachments' and app_can_edit('production'));

create policy "production_attachments_update" on storage.objects
  for update
  using (bucket_id = 'production-attachments' and app_can_edit('production'))
  with check (bucket_id = 'production-attachments' and app_can_edit('production'));

create policy "production_attachments_delete" on storage.objects
  for delete
  using (bucket_id = 'production-attachments' and app_can_edit('production'));
