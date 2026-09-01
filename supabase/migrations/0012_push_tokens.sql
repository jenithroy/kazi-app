-- ============================================================================
-- 0012_push_tokens.sql
--
-- The FCM device token used to live on the Firestore users/{uid} document,
-- which the client wrote to itself on every sign-in. `people` had nowhere to
-- put it, so push registration had nowhere to land after the move.
--
-- Push delivery stays on Firebase Cloud Messaging -- only the token's home
-- moves. Reading someone else's token is not useful and mildly identifying, so
-- it is not exposed through fs_employees or people_directory.
-- ============================================================================

alter table people add column if not exists fcm_token text;

-- A person must be able to file their own token even though `employees` is a
-- section most positions cannot edit -- otherwise only HR could receive push.
-- Scoped to their own row and, via the column list, to this column alone.
create policy "self_update_push_token" on people
  as permissive for update to authenticated
  using (id = app_person_id())
  with check (id = app_person_id());
