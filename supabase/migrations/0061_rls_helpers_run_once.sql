-- ============================================================================
-- 0061_rls_helpers_run_once.sql
--
-- Every page of the app waits on the database, and the database spends most of
-- that time repeating work it has already done.
--
-- Every table's row-level-security policies ask small helper functions who is
-- asking and what they may do: app_person_id(), app_can_view('x'),
-- app_can_edit('x'), app_tier(), app_issuer_ok(). Written as a bare call,
-- Postgres runs the helper ONCE FOR EVERY ROW IT CHECKS, and every run is a
-- small query of its own. Read as a director, on the live database:
--
--   attendance (704 rows, the Dashboard reads it all)   ~620 ms
--   line_items                                          ~500 ms
--   order_stage_history                                 ~180 ms
--   tasks                                               ~115 ms
--   ... and 128 ms for the 15 rows of fs_employees, which asked three helpers
--   once per person.
--
-- Written as ( SELECT app_person_id() ), Postgres runs the helper once for the
-- whole statement and reuses the answer. It is the same function with the same
-- arguments, so every person sees exactly the same rows and may do exactly the
-- same writes: only how often the answer is looked up changes. The same
-- reads take about 2-3 ms each afterwards (all ten of the tables above: 1,575 ms
-- to 20 ms; fs_employees: 127 ms to 20 ms).
--
-- What this does
--   1. Wraps every helper call whose arguments are constants in ( SELECT ... ),
--      in 233 policies on 79 tables (344 calls). A call that takes a column
--      (app_in_thread(thread_id), app_can_manage_group(thread_id), 14 of them,
--      all in the chat policies) cannot be shared and is left exactly as it was.
--   2. Does the same inside the fs_employees view.
--
-- Safety
--   * The first step compares every policy it is about to touch with a checksum
--     of how it read when this file was written, and stops, changing nothing, if
--     any has since been edited.
--   * Everything is one transaction: it all happens or none of it does.
--   * Rehearsed on temporary copies of 78 of the 79 tables inside a transaction that was rolled
--     back (the 5 policies on chat_members cannot be copied, because they name
--     the table inside their own text; they are the same kind of change). For
--     11 identities (one person of every position, a person who is no longer
--     active, a stranger and a director with a token from the wrong issuer)
--     the rows each could read and whether an insert, an update and a delete of
--     a sample row was allowed or refused were recorded before and after:
--     858 of 858 outcomes were identical (418 reads that return rows, 860 writes
--     allowed, 422 refused). The old and new fs_employees gave byte-identical
--     output to all 11.
--   * ALTER POLICY takes only a lock that lets reads and writes carry on; the
--     view is replaced in one statement, so a query on fs_employees may wait a
--     moment while this commits.
--   * To undo: supabase/undo/0061_rls_helpers_run_once.undo.sql restores the exact original text.
-- ============================================================================

begin;

do $guard$
declare
  drifted text;
begin
  select string_agg(e.tbl || '.' || e.pol, ', ' order by e.tbl, e.pol)
    into drifted
    from (values
    ('accounts', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('accounts', 'sect_read', '04420b30bfe46113b7d9884f3c964b1d', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('accounts', 'sect_write', '681f7d1c6e5e2f305a772ce79fd53bb8', '681f7d1c6e5e2f305a772ce79fd53bb8'),
    ('activity_events', 'activity_close_own_view', 'c0f260e3a9a812e4f8be63304d99c033', '84f997cda70d87fe1a88f768955b7da6'),
    ('activity_events', 'activity_log_own', 'd41d8cd98f00b204e9800998ecf8427e', '84f997cda70d87fe1a88f768955b7da6'),
    ('attendance', 'attendance_grant', '962ab8d4ee87bbb2b2ef269311c1a214', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('attendance', 'attendance_manage', '78ea72fd5efdf3e96f2499b22780a700', '78ea72fd5efdf3e96f2499b22780a700'),
    ('attendance', 'attendance_self', '84f997cda70d87fe1a88f768955b7da6', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('attendance', 'attendance_self_update', '84f997cda70d87fe1a88f768955b7da6', '84f997cda70d87fe1a88f768955b7da6'),
    ('attendance', 'attendance_self_write', 'd41d8cd98f00b204e9800998ecf8427e', '84f997cda70d87fe1a88f768955b7da6'),
    ('attendance', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('bank_transactions', 'bank_read', '1cfe8018e754cbbeffb4a107e373fe27', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('bank_transactions', 'bank_write', 'b472dbe5091446b3e8b7c01398804a7a', 'b472dbe5091446b3e8b7c01398804a7a'),
    ('bank_transactions', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('budget_requests', 'budget_manage', '19719be12fcbb2082e5abf99699a7782', '19719be12fcbb2082e5abf99699a7782'),
    ('budget_requests', 'budget_own', '3a44b0a7260e1779991dc20c4728beaa', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('budget_requests', 'budget_own_create', 'd41d8cd98f00b204e9800998ecf8427e', '3a44b0a7260e1779991dc20c4728beaa'),
    ('budget_requests', 'budget_read', 'e148389d82f828ad4cbf87c151dc406a', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('budget_requests', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('challans', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('challans', 'sect_read', '3aa3230290a7efd71754ab6b417aaeb1', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('challans', 'sect_write', 'ee21c68300f0d24e10b5357e9d63616d', 'ee21c68300f0d24e10b5357e9d63616d'),
    ('chat_group_permissions', 'chat_group_perms_write', '6b4ce5cf2167b2cce4b142bd35a66a5b', '6b4ce5cf2167b2cce4b142bd35a66a5b'),
    ('chat_group_permissions', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('chat_members', 'chat_members_delete', '67d6a6cb19a3c18920ce534724882137', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('chat_members', 'chat_members_insert', 'd41d8cd98f00b204e9800998ecf8427e', '5587c3e618d19ee91f230bffbe2bdeed'),
    ('chat_members', 'chat_members_read', 'f65e1780344063092e94354ee830f261', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('chat_members', 'chat_members_update', '67d6a6cb19a3c18920ce534724882137', '67d6a6cb19a3c18920ce534724882137'),
    ('chat_members', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('chat_messages', 'chat_messages_insert', 'd41d8cd98f00b204e9800998ecf8427e', '285660745dfc9fc0463ded48d2b295da'),
    ('chat_messages', 'chat_messages_update', 'd3273b1baa7656fc7026e35b92260f8d', 'd3273b1baa7656fc7026e35b92260f8d'),
    ('chat_messages', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('chat_reactions', 'chat_reactions_delete', '84f997cda70d87fe1a88f768955b7da6', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('chat_reactions', 'chat_reactions_insert', 'd41d8cd98f00b204e9800998ecf8427e', '36371ec2bdf7b2fa5976b240faa32edd'),
    ('chat_reactions', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('chat_threads', 'chat_threads_insert', 'd41d8cd98f00b204e9800998ecf8427e', '0e5f7eeb03a221f18beed8a3f6222660'),
    ('chat_threads', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('clock_ins', 'clockins_grant', '962ab8d4ee87bbb2b2ef269311c1a214', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('clock_ins', 'clockins_manage', '78ea72fd5efdf3e96f2499b22780a700', '78ea72fd5efdf3e96f2499b22780a700'),
    ('clock_ins', 'clockins_self', '84f997cda70d87fe1a88f768955b7da6', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('clock_ins', 'clockins_self_update', '84f997cda70d87fe1a88f768955b7da6', '84f997cda70d87fe1a88f768955b7da6'),
    ('clock_ins', 'clockins_self_write', 'd41d8cd98f00b204e9800998ecf8427e', '84f997cda70d87fe1a88f768955b7da6'),
    ('clock_ins', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('content_calendar', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('content_calendar', 'sect_read', '890bd4c43ee6a00e88f38f247cffd39a', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('content_calendar', 'sect_write', 'f771d998842a7d85679b90ab93c7e795', 'f771d998842a7d85679b90ab93c7e795'),
    ('content_posts', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('content_posts', 'sect_read', '890bd4c43ee6a00e88f38f247cffd39a', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('content_posts', 'sect_write', 'f771d998842a7d85679b90ab93c7e795', 'f771d998842a7d85679b90ab93c7e795'),
    ('counters', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('counters', 'sect_read', '3aa3230290a7efd71754ab6b417aaeb1', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('counters', 'sect_write', 'ee21c68300f0d24e10b5357e9d63616d', 'ee21c68300f0d24e10b5357e9d63616d'),
    ('customers', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('customers', 'sect_read', '1e0b9a0774417edd9e9eacc5592591c7', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('customers', 'sect_write', '79d52a2731944c4df8e23036d84d91ad', '79d52a2731944c4df8e23036d84d91ad'),
    ('expenses', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('expenses', 'sect_read', '8803633a6699d6f7a10fdc62bf526232', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('expenses', 'sect_write', '457919642a15f1f4d7cf7cbf06b5f5ce', '457919642a15f1f4d7cf7cbf06b5f5ce'),
    ('fabrics', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('fabrics', 'sect_read', 'd5afdf0ee20c240bcafbaf5f56376c53', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('fabrics', 'sect_write', 'ad47a8aa65dea57550fffa22d25121e3', 'ad47a8aa65dea57550fffa22d25121e3'),
    ('finance_tabs', 'admin_write', '6b4ce5cf2167b2cce4b142bd35a66a5b', '6b4ce5cf2167b2cce4b142bd35a66a5b'),
    ('finance_tabs', 'read_all', 'b76d4c69c6fe568733bbe09cafd40596', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('finance_tabs', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('holidays', 'manage', '78ea72fd5efdf3e96f2499b22780a700', '78ea72fd5efdf3e96f2499b22780a700'),
    ('holidays', 'read_all', '4fe12e09ae5fcb6376a3914b971990be', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('holidays', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('inventory_items', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('inventory_items', 'sect_read', 'b5a189d565168ade560171db4a21b10c', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('inventory_items', 'sect_write', '0f500cfbc4463e4dc3f0647c9c6d6726', '0f500cfbc4463e4dc3f0647c9c6d6726'),
    ('invoices', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('invoices', 'sect_read', '3aa3230290a7efd71754ab6b417aaeb1', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('invoices', 'sect_write', 'ee21c68300f0d24e10b5357e9d63616d', 'ee21c68300f0d24e10b5357e9d63616d'),
    ('journal_entries', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('journal_entries', 'sect_read', '04420b30bfe46113b7d9884f3c964b1d', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('journal_entries', 'sect_write', '681f7d1c6e5e2f305a772ce79fd53bb8', '681f7d1c6e5e2f305a772ce79fd53bb8'),
    ('lead_notification_mutes', 'lead_mutes_write', '84f997cda70d87fe1a88f768955b7da6', '84f997cda70d87fe1a88f768955b7da6'),
    ('lead_notification_mutes', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('leaderboard', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('line_items', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('line_items', 'sect_read', '3aa3230290a7efd71754ab6b417aaeb1', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('line_items', 'sect_write', 'ee21c68300f0d24e10b5357e9d63616d', 'ee21c68300f0d24e10b5357e9d63616d'),
    ('marketing_tabs', 'admin_write', '6b4ce5cf2167b2cce4b142bd35a66a5b', '6b4ce5cf2167b2cce4b142bd35a66a5b'),
    ('marketing_tabs', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('measurement_templates', 'production_read', '29115e24f356a4ffa101c2ece3fcc20b', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('measurement_templates', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('measurement_templates', 'sect_read', 'd5afdf0ee20c240bcafbaf5f56376c53', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('measurement_templates', 'sect_write', 'ad47a8aa65dea57550fffa22d25121e3', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('messages', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('messages', 'sect_read', 'ed238e30aa9a472d8f112d2d51bb4114', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('messages', 'sect_write', '7dbba01fc3498580df9335d7fdaa6440', '7dbba01fc3498580df9335d7fdaa6440'),
    ('messenger_tabs', 'admin_write', '6b4ce5cf2167b2cce4b142bd35a66a5b', '6b4ce5cf2167b2cce4b142bd35a66a5b'),
    ('messenger_tabs', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('meta_ad_accounts', 'meta_ads_insert', 'd41d8cd98f00b204e9800998ecf8427e', 'b6f45ed7e7777fd328e76b179bc376d8'),
    ('meta_ad_accounts', 'meta_ads_read', '48107d562b7d79a559866b506dd6a438', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('meta_ad_accounts', 'meta_ads_write', 'b6f45ed7e7777fd328e76b179bc376d8', 'b6f45ed7e7777fd328e76b179bc376d8'),
    ('meta_ad_accounts', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('meta_ad_insights', 'meta_ads_read', '48107d562b7d79a559866b506dd6a438', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('meta_ad_insights', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('meta_ads', 'meta_ads_read', '48107d562b7d79a559866b506dd6a438', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('meta_ads', 'meta_ads_write', 'b6f45ed7e7777fd328e76b179bc376d8', 'b6f45ed7e7777fd328e76b179bc376d8'),
    ('meta_ads', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('meta_ads_actions', 'meta_ads_read', '48107d562b7d79a559866b506dd6a438', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('meta_ads_actions', 'meta_ads_write', 'd41d8cd98f00b204e9800998ecf8427e', 'b6f45ed7e7777fd328e76b179bc376d8'),
    ('meta_ads_actions', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('meta_ads_settings', 'meta_ads_read', '48107d562b7d79a559866b506dd6a438', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('meta_ads_settings', 'meta_ads_write', 'b6f45ed7e7777fd328e76b179bc376d8', 'b6f45ed7e7777fd328e76b179bc376d8'),
    ('meta_ads_settings', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('meta_adsets', 'meta_ads_read', '48107d562b7d79a559866b506dd6a438', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('meta_adsets', 'meta_ads_write', 'b6f45ed7e7777fd328e76b179bc376d8', 'b6f45ed7e7777fd328e76b179bc376d8'),
    ('meta_adsets', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('meta_campaigns', 'meta_ads_read', '48107d562b7d79a559866b506dd6a438', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('meta_campaigns', 'meta_ads_write', 'b6f45ed7e7777fd328e76b179bc376d8', 'b6f45ed7e7777fd328e76b179bc376d8'),
    ('meta_campaigns', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('meta_sync_runs', 'meta_ads_read', '48107d562b7d79a559866b506dd6a438', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('meta_sync_runs', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('mobile_notifications', 'notif_insert', 'd41d8cd98f00b204e9800998ecf8427e', '33a8aa3a13b37d826cf98f1c07d598ba'),
    ('mobile_notifications', 'notif_own_read', '08a222e7cdaebb1827647af855746ab8', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('mobile_notifications', 'notif_own_update', '08a222e7cdaebb1827647af855746ab8', '08a222e7cdaebb1827647af855746ab8'),
    ('mobile_notifications', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('notification_categories', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('order_assignments', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('order_assignments', 'sect_read', '29115e24f356a4ffa101c2ece3fcc20b', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('order_assignments', 'sect_write', '52af51f90924ccc83e1b3588023ccb82', '52af51f90924ccc83e1b3588023ccb82'),
    ('order_costs', 'finance_read', '8803633a6699d6f7a10fdc62bf526232', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('order_costs', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('order_costs', 'sect_read', 'c48846bbd97ead3be3506864abe795cd', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('order_costs', 'sect_write', 'bfa79df79e712445925b425f8f8e5af5', 'bfa79df79e712445925b425f8f8e5af5'),
    ('order_notes', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('order_notes', 'sect_read', 'c48846bbd97ead3be3506864abe795cd', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('order_notes', 'sect_write', 'bfa79df79e712445925b425f8f8e5af5', 'bfa79df79e712445925b425f8f8e5af5'),
    ('order_stage_history', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('order_stage_history', 'sect_read', 'c48846bbd97ead3be3506864abe795cd', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('order_stage_history', 'sect_write', 'bfa79df79e712445925b425f8f8e5af5', 'bfa79df79e712445925b425f8f8e5af5'),
    ('orders', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('orders', 'sect_read', 'c48846bbd97ead3be3506864abe795cd', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('orders', 'sect_write', 'bfa79df79e712445925b425f8f8e5af5', 'bfa79df79e712445925b425f8f8e5af5'),
    ('patterns', 'production_read', '29115e24f356a4ffa101c2ece3fcc20b', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('patterns', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('patterns', 'sect_read', 'd5afdf0ee20c240bcafbaf5f56376c53', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('patterns', 'sect_write', 'ad47a8aa65dea57550fffa22d25121e3', 'ad47a8aa65dea57550fffa22d25121e3'),
    ('payments', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('payments', 'sect_read', '3aa3230290a7efd71754ab6b417aaeb1', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('payments', 'sect_write', 'ee21c68300f0d24e10b5357e9d63616d', 'ee21c68300f0d24e10b5357e9d63616d'),
    ('payroll', 'payroll_grant', '57fd3eddaf6a7cc81dbcfe9c96f17dc7', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('payroll', 'payroll_manage', 'bfac63b22f8e61cd83bb36ab115c228e', 'bfac63b22f8e61cd83bb36ab115c228e'),
    ('payroll', 'payroll_self', '84f997cda70d87fe1a88f768955b7da6', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('payroll', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('people', 'people_hr_read', 'bd5b807b101f145fc3aaf00a85f49c61', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('people', 'people_hr_write', '8505c2b7239135d6f5602c5304b21c1d', '8505c2b7239135d6f5602c5304b21c1d'),
    ('people', 'people_self_read', 'c3445336b309f0f31c2c80cf7c563a31', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('people', 'people_self_update', 'c3445336b309f0f31c2c80cf7c563a31', 'c3445336b309f0f31c2c80cf7c563a31'),
    ('people', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('people', 'self_update_push_token', 'c3445336b309f0f31c2c80cf7c563a31', 'c3445336b309f0f31c2c80cf7c563a31'),
    ('permission_drift_log', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('person_avatars', 'hr_write', '8505c2b7239135d6f5602c5304b21c1d', '8505c2b7239135d6f5602c5304b21c1d'),
    ('person_avatars', 'own_write', '84f997cda70d87fe1a88f768955b7da6', '84f997cda70d87fe1a88f768955b7da6'),
    ('person_avatars', 'read_all', '4fe12e09ae5fcb6376a3914b971990be', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('person_avatars', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('person_permission_overrides', 'overrides_admin', '6b4ce5cf2167b2cce4b142bd35a66a5b', '6b4ce5cf2167b2cce4b142bd35a66a5b'),
    ('person_permission_overrides', 'overrides_read_self', '0c474f59ff98231321f7ef79a24208e4', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('person_permission_overrides', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('point_transactions', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('position_finance_tabs', 'admin_write', '6b4ce5cf2167b2cce4b142bd35a66a5b', '6b4ce5cf2167b2cce4b142bd35a66a5b'),
    ('position_finance_tabs', 'read_all', 'b76d4c69c6fe568733bbe09cafd40596', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('position_finance_tabs', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('position_marketing_tabs', 'admin_write', '6b4ce5cf2167b2cce4b142bd35a66a5b', '6b4ce5cf2167b2cce4b142bd35a66a5b'),
    ('position_marketing_tabs', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('position_messenger_tabs', 'admin_write', '6b4ce5cf2167b2cce4b142bd35a66a5b', '6b4ce5cf2167b2cce4b142bd35a66a5b'),
    ('position_messenger_tabs', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('position_notification_categories', 'position_notification_categories_write', '6b4ce5cf2167b2cce4b142bd35a66a5b', '6b4ce5cf2167b2cce4b142bd35a66a5b'),
    ('position_notification_categories', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('position_permissions', 'admin_write', '6b4ce5cf2167b2cce4b142bd35a66a5b', '6b4ce5cf2167b2cce4b142bd35a66a5b'),
    ('position_permissions', 'read_all', 'b76d4c69c6fe568733bbe09cafd40596', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('position_permissions', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('positions', 'admin_write', '6b4ce5cf2167b2cce4b142bd35a66a5b', '6b4ce5cf2167b2cce4b142bd35a66a5b'),
    ('positions', 'read_all', 'b76d4c69c6fe568733bbe09cafd40596', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('positions', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('processes', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('processes', 'sect_read', 'd5afdf0ee20c240bcafbaf5f56376c53', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('processes', 'sect_write', 'ad47a8aa65dea57550fffa22d25121e3', 'ad47a8aa65dea57550fffa22d25121e3'),
    ('product_costs', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('product_costs', 'sect_read', '8803633a6699d6f7a10fdc62bf526232', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('product_costs', 'sect_write', '457919642a15f1f4d7cf7cbf06b5f5ce', '457919642a15f1f4d7cf7cbf06b5f5ce'),
    ('product_recipes', 'production_read', '29115e24f356a4ffa101c2ece3fcc20b', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('product_recipes', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('product_recipes', 'sect_read', 'b5a189d565168ade560171db4a21b10c', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('product_recipes', 'sect_write', '0f500cfbc4463e4dc3f0647c9c6d6726', '0f500cfbc4463e4dc3f0647c9c6d6726'),
    ('production_batches', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('production_batches', 'sect_read', '29115e24f356a4ffa101c2ece3fcc20b', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('production_batches', 'sect_write', '52af51f90924ccc83e1b3588023ccb82', '52af51f90924ccc83e1b3588023ccb82'),
    ('purchases', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('purchases', 'sect_read', 'f7dc74b25a360752a35b81dc78ffebc5', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('purchases', 'sect_write', 'ae5955f9d1e6b8db8c98bf4bab7f21b6', 'ae5955f9d1e6b8db8c98bf4bab7f21b6'),
    ('push_tokens', 'push_tokens_own_read', '84f997cda70d87fe1a88f768955b7da6', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('push_tokens', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('qc_logs', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('qc_logs', 'sect_read', '4623009be5c4c06bbfa94e3d60e30fd1', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('qc_logs', 'sect_write', 'b677a5c58438bbebdbf6d371486f20ca', 'b677a5c58438bbebdbf6d371486f20ca'),
    ('quotations', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('quotations', 'sect_read', '3aa3230290a7efd71754ab6b417aaeb1', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('quotations', 'sect_write', 'ee21c68300f0d24e10b5357e9d63616d', 'ee21c68300f0d24e10b5357e9d63616d'),
    ('samples', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('samples', 'sect_read', 'b5a189d565168ade560171db4a21b10c', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('samples', 'sect_write', '0f500cfbc4463e4dc3f0647c9c6d6726', '0f500cfbc4463e4dc3f0647c9c6d6726'),
    ('schema_migrations', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('sections', 'admin_write', '6b4ce5cf2167b2cce4b142bd35a66a5b', '6b4ce5cf2167b2cce4b142bd35a66a5b'),
    ('sections', 'read_all', 'b76d4c69c6fe568733bbe09cafd40596', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('sections', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('shift_logs', 'own_or_attendance', 'c50c18aa336e990ca0f52f47fea8e8cf', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('shift_logs', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('stage_config', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('stage_config', 'sect_read', '29115e24f356a4ffa101c2ece3fcc20b', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('stage_config', 'sect_write', '52af51f90924ccc83e1b3588023ccb82', '52af51f90924ccc83e1b3588023ccb82'),
    ('stock_movements', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('stock_movements', 'sect_read', 'b5a189d565168ade560171db4a21b10c', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('stock_movements', 'sect_write', '0f500cfbc4463e4dc3f0647c9c6d6726', '0f500cfbc4463e4dc3f0647c9c6d6726'),
    ('task_columns', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('task_columns', 'sect_read', '93bd1db47fbb3e022fb604cdd6ce703e', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('task_columns', 'sect_write', 'b9736910b5dac5dfa1b70fe91865f1ee', 'b9736910b5dac5dfa1b70fe91865f1ee'),
    ('tasks', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('tasks', 'sect_read', '93bd1db47fbb3e022fb604cdd6ce703e', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('tasks', 'sect_write', 'b9736910b5dac5dfa1b70fe91865f1ee', 'b9736910b5dac5dfa1b70fe91865f1ee'),
    ('unit_economics', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('unit_economics', 'sect_read', '8803633a6699d6f7a10fdc62bf526232', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('unit_economics', 'sect_write', '457919642a15f1f4d7cf7cbf06b5f5ce', '457919642a15f1f4d7cf7cbf06b5f5ce'),
    ('user_points', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('user_points', 'sect_read', '89b32a0cbf68b6d953c8247f702345e1', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('vat_bills', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('vat_bills', 'sect_read', '8803633a6699d6f7a10fdc62bf526232', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('vat_bills', 'sect_write', '457919642a15f1f4d7cf7cbf06b5f5ce', '457919642a15f1f4d7cf7cbf06b5f5ce'),
    ('worker_sessions', 'own_or_attendance', 'c50c18aa336e990ca0f52f47fea8e8cf', 'd41d8cd98f00b204e9800998ecf8427e'),
    ('worker_sessions', 'require_known_issuer', '555b3c92cca511392134b9b089f44660', 'd41d8cd98f00b204e9800998ecf8427e')
    ) as e(tbl, pol, qual_md5, check_md5)
    left join pg_policies pp
      on pp.schemaname = 'public' and pp.tablename = e.tbl and pp.policyname = e.pol
   where pp.policyname is null
      or md5(coalesce(pp.qual, '')) <> e.qual_md5
      or md5(coalesce(pp.with_check, '')) <> e.check_md5;

  if drifted is not null then
    raise exception '0061_rls_helpers_run_once: these policies are not as they were when this file was written, so nothing was changed: %', drifted;
  end if;
end
$guard$;

-- 1. The policies

alter policy "require_known_issuer" on public."accounts"
  using (( SELECT app_issuer_ok()));

alter policy "sect_read" on public."accounts"
  using (( SELECT app_can_view('accounting'::text)));

alter policy "sect_write" on public."accounts"
  using (( SELECT app_can_edit('accounting'::text)))
  with check (( SELECT app_can_edit('accounting'::text)));

alter policy "activity_close_own_view" on public."activity_events"
  using (((person_id = ( SELECT app_person_id())) AND (created_at > (now() - '12:00:00'::interval))))
  with check ((person_id = ( SELECT app_person_id())));

alter policy "activity_log_own" on public."activity_events"
  with check ((person_id = ( SELECT app_person_id())));

alter policy "attendance_grant" on public."attendance"
  using ((( SELECT app_can_view('attendance'::text)) AND (( SELECT app_tier()) >= 2)));

alter policy "attendance_manage" on public."attendance"
  using ((( SELECT app_can_edit('attendance'::text)) AND (( SELECT app_tier()) >= 2)))
  with check ((( SELECT app_can_edit('attendance'::text)) AND (( SELECT app_tier()) >= 2)));

alter policy "attendance_self" on public."attendance"
  using ((person_id = ( SELECT app_person_id())));

alter policy "attendance_self_update" on public."attendance"
  using ((person_id = ( SELECT app_person_id())))
  with check ((person_id = ( SELECT app_person_id())));

alter policy "attendance_self_write" on public."attendance"
  with check ((person_id = ( SELECT app_person_id())));

alter policy "require_known_issuer" on public."attendance"
  using (( SELECT app_issuer_ok()));

alter policy "bank_read" on public."bank_transactions"
  using ((( SELECT app_can_view('finance'::text)) AND ( SELECT app_can_view_finance_tab('bank'::text))));

alter policy "bank_write" on public."bank_transactions"
  using ((( SELECT app_can_edit('finance'::text)) AND ( SELECT app_can_view_finance_tab('bank'::text))))
  with check ((( SELECT app_can_edit('finance'::text)) AND ( SELECT app_can_view_finance_tab('bank'::text))));

alter policy "require_known_issuer" on public."bank_transactions"
  using (( SELECT app_issuer_ok()));

alter policy "budget_manage" on public."budget_requests"
  using (( SELECT app_can_edit('budget'::text)))
  with check (( SELECT app_can_edit('budget'::text)));

alter policy "budget_own" on public."budget_requests"
  using ((requested_by_id = ( SELECT app_person_id())));

alter policy "budget_own_create" on public."budget_requests"
  with check ((requested_by_id = ( SELECT app_person_id())));

alter policy "budget_read" on public."budget_requests"
  using (( SELECT app_can_view('budget'::text)));

alter policy "require_known_issuer" on public."budget_requests"
  using (( SELECT app_issuer_ok()));

alter policy "require_known_issuer" on public."challans"
  using (( SELECT app_issuer_ok()));

alter policy "sect_read" on public."challans"
  using (( SELECT app_can_view('billing'::text)));

alter policy "sect_write" on public."challans"
  using (( SELECT app_can_edit('billing'::text)))
  with check (( SELECT app_can_edit('billing'::text)));

alter policy "chat_group_perms_write" on public."chat_group_permissions"
  using (( SELECT app_can_edit('admin'::text)))
  with check (( SELECT app_can_edit('admin'::text)));

alter policy "require_known_issuer" on public."chat_group_permissions"
  using (( SELECT app_issuer_ok()));

alter policy "chat_members_delete" on public."chat_members"
  using (((person_id = ( SELECT app_person_id())) OR app_can_manage_group(thread_id)));

alter policy "chat_members_insert" on public."chat_members"
  with check ((app_can_manage_group(thread_id) OR (EXISTS ( SELECT 1
   FROM chat_threads t
  WHERE ((t.id = chat_members.thread_id) AND (t.created_by = ( SELECT app_person_id())))))));

alter policy "chat_members_read" on public."chat_members"
  using ((app_in_thread(thread_id) OR (person_id = ( SELECT app_person_id()))));

alter policy "chat_members_update" on public."chat_members"
  using (((person_id = ( SELECT app_person_id())) OR app_can_manage_group(thread_id)))
  with check (((person_id = ( SELECT app_person_id())) OR app_can_manage_group(thread_id)));

alter policy "require_known_issuer" on public."chat_members"
  using (( SELECT app_issuer_ok()));

alter policy "chat_messages_insert" on public."chat_messages"
  with check (((author_id = ( SELECT app_person_id())) AND app_in_thread(thread_id) AND ( SELECT app_can_edit('messenger'::text))));

alter policy "chat_messages_update" on public."chat_messages"
  using ((author_id = ( SELECT app_person_id())))
  with check ((author_id = ( SELECT app_person_id())));

alter policy "require_known_issuer" on public."chat_messages"
  using (( SELECT app_issuer_ok()));

alter policy "chat_reactions_delete" on public."chat_reactions"
  using ((person_id = ( SELECT app_person_id())));

alter policy "chat_reactions_insert" on public."chat_reactions"
  with check (((person_id = ( SELECT app_person_id())) AND app_in_message_thread(message_id)));

alter policy "require_known_issuer" on public."chat_reactions"
  using (( SELECT app_issuer_ok()));

alter policy "chat_threads_insert" on public."chat_threads"
  with check (((created_by = ( SELECT app_person_id())) AND ( SELECT app_can_edit('messenger'::text)) AND ((kind = 'dm'::text) OR ( SELECT app_can_create_group()))));

alter policy "require_known_issuer" on public."chat_threads"
  using (( SELECT app_issuer_ok()));

alter policy "clockins_grant" on public."clock_ins"
  using ((( SELECT app_can_view('attendance'::text)) AND (( SELECT app_tier()) >= 2)));

alter policy "clockins_manage" on public."clock_ins"
  using ((( SELECT app_can_edit('attendance'::text)) AND (( SELECT app_tier()) >= 2)))
  with check ((( SELECT app_can_edit('attendance'::text)) AND (( SELECT app_tier()) >= 2)));

alter policy "clockins_self" on public."clock_ins"
  using ((person_id = ( SELECT app_person_id())));

alter policy "clockins_self_update" on public."clock_ins"
  using ((person_id = ( SELECT app_person_id())))
  with check ((person_id = ( SELECT app_person_id())));

alter policy "clockins_self_write" on public."clock_ins"
  with check ((person_id = ( SELECT app_person_id())));

alter policy "require_known_issuer" on public."clock_ins"
  using (( SELECT app_issuer_ok()));

alter policy "require_known_issuer" on public."content_calendar"
  using (( SELECT app_issuer_ok()));

alter policy "sect_read" on public."content_calendar"
  using (( SELECT app_can_view('content'::text)));

alter policy "sect_write" on public."content_calendar"
  using (( SELECT app_can_edit('content'::text)))
  with check (( SELECT app_can_edit('content'::text)));

alter policy "require_known_issuer" on public."content_posts"
  using (( SELECT app_issuer_ok()));

alter policy "sect_read" on public."content_posts"
  using (( SELECT app_can_view('content'::text)));

alter policy "sect_write" on public."content_posts"
  using (( SELECT app_can_edit('content'::text)))
  with check (( SELECT app_can_edit('content'::text)));

alter policy "require_known_issuer" on public."counters"
  using (( SELECT app_issuer_ok()));

alter policy "sect_read" on public."counters"
  using (( SELECT app_can_view('billing'::text)));

alter policy "sect_write" on public."counters"
  using (( SELECT app_can_edit('billing'::text)))
  with check (( SELECT app_can_edit('billing'::text)));

alter policy "require_known_issuer" on public."customers"
  using (( SELECT app_issuer_ok()));

alter policy "sect_read" on public."customers"
  using (( SELECT app_can_view('customers'::text)));

alter policy "sect_write" on public."customers"
  using (( SELECT app_can_edit('customers'::text)))
  with check (( SELECT app_can_edit('customers'::text)));

alter policy "require_known_issuer" on public."expenses"
  using (( SELECT app_issuer_ok()));

alter policy "sect_read" on public."expenses"
  using (( SELECT app_can_view('finance'::text)));

alter policy "sect_write" on public."expenses"
  using (( SELECT app_can_edit('finance'::text)))
  with check (( SELECT app_can_edit('finance'::text)));

alter policy "require_known_issuer" on public."fabrics"
  using (( SELECT app_issuer_ok()));

alter policy "sect_read" on public."fabrics"
  using (( SELECT app_can_view('library'::text)));

alter policy "sect_write" on public."fabrics"
  using (( SELECT app_can_edit('library'::text)))
  with check (( SELECT app_can_edit('library'::text)));

alter policy "admin_write" on public."finance_tabs"
  using (( SELECT app_can_edit('admin'::text)))
  with check (( SELECT app_can_edit('admin'::text)));

alter policy "read_all" on public."finance_tabs"
  using ((( SELECT app_jwt_sub()) <> ''::text));

alter policy "require_known_issuer" on public."finance_tabs"
  using (( SELECT app_issuer_ok()));

alter policy "manage" on public."holidays"
  using ((( SELECT app_can_edit('attendance'::text)) AND (( SELECT app_tier()) >= 2)))
  with check ((( SELECT app_can_edit('attendance'::text)) AND (( SELECT app_tier()) >= 2)));

alter policy "read_all" on public."holidays"
  using ((( SELECT app_person_id()) IS NOT NULL));

alter policy "require_known_issuer" on public."holidays"
  using (( SELECT app_issuer_ok()));

alter policy "require_known_issuer" on public."inventory_items"
  using (( SELECT app_issuer_ok()));

alter policy "sect_read" on public."inventory_items"
  using (( SELECT app_can_view('inventory'::text)));

alter policy "sect_write" on public."inventory_items"
  using (( SELECT app_can_edit('inventory'::text)))
  with check (( SELECT app_can_edit('inventory'::text)));

alter policy "require_known_issuer" on public."invoices"
  using (( SELECT app_issuer_ok()));

alter policy "sect_read" on public."invoices"
  using (( SELECT app_can_view('billing'::text)));

alter policy "sect_write" on public."invoices"
  using (( SELECT app_can_edit('billing'::text)))
  with check (( SELECT app_can_edit('billing'::text)));

alter policy "require_known_issuer" on public."journal_entries"
  using (( SELECT app_issuer_ok()));

alter policy "sect_read" on public."journal_entries"
  using (( SELECT app_can_view('accounting'::text)));

alter policy "sect_write" on public."journal_entries"
  using (( SELECT app_can_edit('accounting'::text)))
  with check (( SELECT app_can_edit('accounting'::text)));

alter policy "lead_mutes_write" on public."lead_notification_mutes"
  using ((person_id = ( SELECT app_person_id())))
  with check ((person_id = ( SELECT app_person_id())));

alter policy "require_known_issuer" on public."lead_notification_mutes"
  using (( SELECT app_issuer_ok()));

alter policy "require_known_issuer" on public."leaderboard"
  using (( SELECT app_issuer_ok()));

alter policy "require_known_issuer" on public."line_items"
  using (( SELECT app_issuer_ok()));

alter policy "sect_read" on public."line_items"
  using (( SELECT app_can_view('billing'::text)));

alter policy "sect_write" on public."line_items"
  using (( SELECT app_can_edit('billing'::text)))
  with check (( SELECT app_can_edit('billing'::text)));

alter policy "admin_write" on public."marketing_tabs"
  using (( SELECT app_can_edit('admin'::text)))
  with check (( SELECT app_can_edit('admin'::text)));

alter policy "require_known_issuer" on public."marketing_tabs"
  using (( SELECT app_issuer_ok()));

alter policy "production_read" on public."measurement_templates"
  using (( SELECT app_can_view('production'::text)));

alter policy "require_known_issuer" on public."measurement_templates"
  using (( SELECT app_issuer_ok()));

alter policy "sect_read" on public."measurement_templates"
  using (( SELECT app_can_view('library'::text)));

alter policy "sect_write" on public."measurement_templates"
  using (( SELECT app_can_edit('library'::text)));

alter policy "require_known_issuer" on public."messages"
  using (( SELECT app_issuer_ok()));

alter policy "sect_read" on public."messages"
  using (( SELECT app_can_view('messenger'::text)));

alter policy "sect_write" on public."messages"
  using (( SELECT app_can_edit('messenger'::text)))
  with check (( SELECT app_can_edit('messenger'::text)));

alter policy "admin_write" on public."messenger_tabs"
  using (( SELECT app_can_edit('admin'::text)))
  with check (( SELECT app_can_edit('admin'::text)));

alter policy "require_known_issuer" on public."messenger_tabs"
  using (( SELECT app_issuer_ok()));

alter policy "meta_ads_insert" on public."meta_ad_accounts"
  with check ((( SELECT app_can_edit('marketing'::text)) AND ( SELECT app_can_edit_marketing_tab('meta_ads'::text))));

alter policy "meta_ads_read" on public."meta_ad_accounts"
  using ((( SELECT app_can_view('marketing'::text)) AND ( SELECT app_can_view_marketing_tab('meta_ads'::text))));

alter policy "meta_ads_write" on public."meta_ad_accounts"
  using ((( SELECT app_can_edit('marketing'::text)) AND ( SELECT app_can_edit_marketing_tab('meta_ads'::text))))
  with check ((( SELECT app_can_edit('marketing'::text)) AND ( SELECT app_can_edit_marketing_tab('meta_ads'::text))));

alter policy "require_known_issuer" on public."meta_ad_accounts"
  using (( SELECT app_issuer_ok()));

alter policy "meta_ads_read" on public."meta_ad_insights"
  using ((( SELECT app_can_view('marketing'::text)) AND ( SELECT app_can_view_marketing_tab('meta_ads'::text))));

alter policy "require_known_issuer" on public."meta_ad_insights"
  using (( SELECT app_issuer_ok()));

alter policy "meta_ads_read" on public."meta_ads"
  using ((( SELECT app_can_view('marketing'::text)) AND ( SELECT app_can_view_marketing_tab('meta_ads'::text))));

alter policy "meta_ads_write" on public."meta_ads"
  using ((( SELECT app_can_edit('marketing'::text)) AND ( SELECT app_can_edit_marketing_tab('meta_ads'::text))))
  with check ((( SELECT app_can_edit('marketing'::text)) AND ( SELECT app_can_edit_marketing_tab('meta_ads'::text))));

alter policy "require_known_issuer" on public."meta_ads"
  using (( SELECT app_issuer_ok()));

alter policy "meta_ads_read" on public."meta_ads_actions"
  using ((( SELECT app_can_view('marketing'::text)) AND ( SELECT app_can_view_marketing_tab('meta_ads'::text))));

alter policy "meta_ads_write" on public."meta_ads_actions"
  with check ((( SELECT app_can_edit('marketing'::text)) AND ( SELECT app_can_edit_marketing_tab('meta_ads'::text))));

alter policy "require_known_issuer" on public."meta_ads_actions"
  using (( SELECT app_issuer_ok()));

alter policy "meta_ads_read" on public."meta_ads_settings"
  using ((( SELECT app_can_view('marketing'::text)) AND ( SELECT app_can_view_marketing_tab('meta_ads'::text))));

alter policy "meta_ads_write" on public."meta_ads_settings"
  using ((( SELECT app_can_edit('marketing'::text)) AND ( SELECT app_can_edit_marketing_tab('meta_ads'::text))))
  with check ((( SELECT app_can_edit('marketing'::text)) AND ( SELECT app_can_edit_marketing_tab('meta_ads'::text))));

alter policy "require_known_issuer" on public."meta_ads_settings"
  using (( SELECT app_issuer_ok()));

alter policy "meta_ads_read" on public."meta_adsets"
  using ((( SELECT app_can_view('marketing'::text)) AND ( SELECT app_can_view_marketing_tab('meta_ads'::text))));

alter policy "meta_ads_write" on public."meta_adsets"
  using ((( SELECT app_can_edit('marketing'::text)) AND ( SELECT app_can_edit_marketing_tab('meta_ads'::text))))
  with check ((( SELECT app_can_edit('marketing'::text)) AND ( SELECT app_can_edit_marketing_tab('meta_ads'::text))));

alter policy "require_known_issuer" on public."meta_adsets"
  using (( SELECT app_issuer_ok()));

alter policy "meta_ads_read" on public."meta_campaigns"
  using ((( SELECT app_can_view('marketing'::text)) AND ( SELECT app_can_view_marketing_tab('meta_ads'::text))));

alter policy "meta_ads_write" on public."meta_campaigns"
  using ((( SELECT app_can_edit('marketing'::text)) AND ( SELECT app_can_edit_marketing_tab('meta_ads'::text))))
  with check ((( SELECT app_can_edit('marketing'::text)) AND ( SELECT app_can_edit_marketing_tab('meta_ads'::text))));

alter policy "require_known_issuer" on public."meta_campaigns"
  using (( SELECT app_issuer_ok()));

alter policy "meta_ads_read" on public."meta_sync_runs"
  using ((( SELECT app_can_view('marketing'::text)) AND ( SELECT app_can_view_marketing_tab('meta_ads'::text))));

alter policy "require_known_issuer" on public."meta_sync_runs"
  using (( SELECT app_issuer_ok()));

alter policy "notif_insert" on public."mobile_notifications"
  with check (((( SELECT app_person_id()) IS NOT NULL) AND app_person_known(recipient_email)));

alter policy "notif_own_read" on public."mobile_notifications"
  using (((recipient_id = ( SELECT app_person_id())) OR (recipient_email = ( SELECT people.email
   FROM people
  WHERE (people.id = ( SELECT app_person_id()))))));

alter policy "notif_own_update" on public."mobile_notifications"
  using (((recipient_id = ( SELECT app_person_id())) OR (recipient_email = ( SELECT people.email
   FROM people
  WHERE (people.id = ( SELECT app_person_id()))))))
  with check (((recipient_id = ( SELECT app_person_id())) OR (recipient_email = ( SELECT people.email
   FROM people
  WHERE (people.id = ( SELECT app_person_id()))))));

alter policy "require_known_issuer" on public."mobile_notifications"
  using (( SELECT app_issuer_ok()));

alter policy "require_known_issuer" on public."notification_categories"
  using (( SELECT app_issuer_ok()));

alter policy "require_known_issuer" on public."order_assignments"
  using (( SELECT app_issuer_ok()));

alter policy "sect_read" on public."order_assignments"
  using (( SELECT app_can_view('production'::text)));

alter policy "sect_write" on public."order_assignments"
  using (( SELECT app_can_edit('production'::text)))
  with check (( SELECT app_can_edit('production'::text)));

alter policy "finance_read" on public."order_costs"
  using (( SELECT app_can_view('finance'::text)));

alter policy "require_known_issuer" on public."order_costs"
  using (( SELECT app_issuer_ok()));

alter policy "sect_read" on public."order_costs"
  using (( SELECT app_can_view('orders'::text)));

alter policy "sect_write" on public."order_costs"
  using (( SELECT app_can_edit('orders'::text)))
  with check (( SELECT app_can_edit('orders'::text)));

alter policy "require_known_issuer" on public."order_notes"
  using (( SELECT app_issuer_ok()));

alter policy "sect_read" on public."order_notes"
  using (( SELECT app_can_view('orders'::text)));

alter policy "sect_write" on public."order_notes"
  using (( SELECT app_can_edit('orders'::text)))
  with check (( SELECT app_can_edit('orders'::text)));

alter policy "require_known_issuer" on public."order_stage_history"
  using (( SELECT app_issuer_ok()));

alter policy "sect_read" on public."order_stage_history"
  using (( SELECT app_can_view('orders'::text)));

alter policy "sect_write" on public."order_stage_history"
  using (( SELECT app_can_edit('orders'::text)))
  with check (( SELECT app_can_edit('orders'::text)));

alter policy "require_known_issuer" on public."orders"
  using (( SELECT app_issuer_ok()));

alter policy "sect_read" on public."orders"
  using (( SELECT app_can_view('orders'::text)));

alter policy "sect_write" on public."orders"
  using (( SELECT app_can_edit('orders'::text)))
  with check (( SELECT app_can_edit('orders'::text)));

alter policy "production_read" on public."patterns"
  using (( SELECT app_can_view('production'::text)));

alter policy "require_known_issuer" on public."patterns"
  using (( SELECT app_issuer_ok()));

alter policy "sect_read" on public."patterns"
  using (( SELECT app_can_view('library'::text)));

alter policy "sect_write" on public."patterns"
  using (( SELECT app_can_edit('library'::text)))
  with check (( SELECT app_can_edit('library'::text)));

alter policy "require_known_issuer" on public."payments"
  using (( SELECT app_issuer_ok()));

alter policy "sect_read" on public."payments"
  using (( SELECT app_can_view('billing'::text)));

alter policy "sect_write" on public."payments"
  using (( SELECT app_can_edit('billing'::text)))
  with check (( SELECT app_can_edit('billing'::text)));

alter policy "payroll_grant" on public."payroll"
  using ((( SELECT app_can_view('payroll'::text)) AND ( SELECT app_can_view_finance_tab('payroll'::text))));

alter policy "payroll_manage" on public."payroll"
  using (( SELECT app_can_edit('payroll'::text)))
  with check (( SELECT app_can_edit('payroll'::text)));

alter policy "payroll_self" on public."payroll"
  using ((person_id = ( SELECT app_person_id())));

alter policy "require_known_issuer" on public."payroll"
  using (( SELECT app_issuer_ok()));

alter policy "people_hr_read" on public."people"
  using ((( SELECT app_can_view('employees'::text)) AND (( SELECT app_tier()) >= 2)));

alter policy "people_hr_write" on public."people"
  using (( SELECT app_can_edit('employees'::text)))
  with check (( SELECT app_can_edit('employees'::text)));

alter policy "people_self_read" on public."people"
  using ((id = ( SELECT app_person_id())));

alter policy "people_self_update" on public."people"
  using ((id = ( SELECT app_person_id())))
  with check ((id = ( SELECT app_person_id())));

alter policy "require_known_issuer" on public."people"
  using (( SELECT app_issuer_ok()));

alter policy "self_update_push_token" on public."people"
  using ((id = ( SELECT app_person_id())))
  with check ((id = ( SELECT app_person_id())));

alter policy "require_known_issuer" on public."permission_drift_log"
  using (( SELECT app_issuer_ok()));

alter policy "hr_write" on public."person_avatars"
  using (( SELECT app_can_edit('employees'::text)))
  with check (( SELECT app_can_edit('employees'::text)));

alter policy "own_write" on public."person_avatars"
  using ((person_id = ( SELECT app_person_id())))
  with check ((person_id = ( SELECT app_person_id())));

alter policy "read_all" on public."person_avatars"
  using ((( SELECT app_person_id()) IS NOT NULL));

alter policy "require_known_issuer" on public."person_avatars"
  using (( SELECT app_issuer_ok()));

alter policy "overrides_admin" on public."person_permission_overrides"
  using (( SELECT app_can_edit('admin'::text)))
  with check (( SELECT app_can_edit('admin'::text)));

alter policy "overrides_read_self" on public."person_permission_overrides"
  using (((person_id = ( SELECT app_person_id())) OR ( SELECT app_can_view('admin'::text))));

alter policy "require_known_issuer" on public."person_permission_overrides"
  using (( SELECT app_issuer_ok()));

alter policy "require_known_issuer" on public."point_transactions"
  using (( SELECT app_issuer_ok()));

alter policy "admin_write" on public."position_finance_tabs"
  using (( SELECT app_can_edit('admin'::text)))
  with check (( SELECT app_can_edit('admin'::text)));

alter policy "read_all" on public."position_finance_tabs"
  using ((( SELECT app_jwt_sub()) <> ''::text));

alter policy "require_known_issuer" on public."position_finance_tabs"
  using (( SELECT app_issuer_ok()));

alter policy "admin_write" on public."position_marketing_tabs"
  using (( SELECT app_can_edit('admin'::text)))
  with check (( SELECT app_can_edit('admin'::text)));

alter policy "require_known_issuer" on public."position_marketing_tabs"
  using (( SELECT app_issuer_ok()));

alter policy "admin_write" on public."position_messenger_tabs"
  using (( SELECT app_can_edit('admin'::text)))
  with check (( SELECT app_can_edit('admin'::text)));

alter policy "require_known_issuer" on public."position_messenger_tabs"
  using (( SELECT app_issuer_ok()));

alter policy "position_notification_categories_write" on public."position_notification_categories"
  using (( SELECT app_can_edit('admin'::text)))
  with check (( SELECT app_can_edit('admin'::text)));

alter policy "require_known_issuer" on public."position_notification_categories"
  using (( SELECT app_issuer_ok()));

alter policy "admin_write" on public."position_permissions"
  using (( SELECT app_can_edit('admin'::text)))
  with check (( SELECT app_can_edit('admin'::text)));

alter policy "read_all" on public."position_permissions"
  using ((( SELECT app_jwt_sub()) <> ''::text));

alter policy "require_known_issuer" on public."position_permissions"
  using (( SELECT app_issuer_ok()));

alter policy "admin_write" on public."positions"
  using (( SELECT app_can_edit('admin'::text)))
  with check (( SELECT app_can_edit('admin'::text)));

alter policy "read_all" on public."positions"
  using ((( SELECT app_jwt_sub()) <> ''::text));

alter policy "require_known_issuer" on public."positions"
  using (( SELECT app_issuer_ok()));

alter policy "require_known_issuer" on public."processes"
  using (( SELECT app_issuer_ok()));

alter policy "sect_read" on public."processes"
  using (( SELECT app_can_view('library'::text)));

alter policy "sect_write" on public."processes"
  using (( SELECT app_can_edit('library'::text)))
  with check (( SELECT app_can_edit('library'::text)));

alter policy "require_known_issuer" on public."product_costs"
  using (( SELECT app_issuer_ok()));

alter policy "sect_read" on public."product_costs"
  using (( SELECT app_can_view('finance'::text)));

alter policy "sect_write" on public."product_costs"
  using (( SELECT app_can_edit('finance'::text)))
  with check (( SELECT app_can_edit('finance'::text)));

alter policy "production_read" on public."product_recipes"
  using (( SELECT app_can_view('production'::text)));

alter policy "require_known_issuer" on public."product_recipes"
  using (( SELECT app_issuer_ok()));

alter policy "sect_read" on public."product_recipes"
  using (( SELECT app_can_view('inventory'::text)));

alter policy "sect_write" on public."product_recipes"
  using (( SELECT app_can_edit('inventory'::text)))
  with check (( SELECT app_can_edit('inventory'::text)));

alter policy "require_known_issuer" on public."production_batches"
  using (( SELECT app_issuer_ok()));

alter policy "sect_read" on public."production_batches"
  using (( SELECT app_can_view('production'::text)));

alter policy "sect_write" on public."production_batches"
  using (( SELECT app_can_edit('production'::text)))
  with check (( SELECT app_can_edit('production'::text)));

alter policy "require_known_issuer" on public."purchases"
  using (( SELECT app_issuer_ok()));

alter policy "sect_read" on public."purchases"
  using (( SELECT app_can_view('purchases'::text)));

alter policy "sect_write" on public."purchases"
  using (( SELECT app_can_edit('purchases'::text)))
  with check (( SELECT app_can_edit('purchases'::text)));

alter policy "push_tokens_own_read" on public."push_tokens"
  using ((person_id = ( SELECT app_person_id())));

alter policy "require_known_issuer" on public."push_tokens"
  using (( SELECT app_issuer_ok()));

alter policy "require_known_issuer" on public."qc_logs"
  using (( SELECT app_issuer_ok()));

alter policy "sect_read" on public."qc_logs"
  using (( SELECT app_can_view('quality_control'::text)));

alter policy "sect_write" on public."qc_logs"
  using (( SELECT app_can_edit('quality_control'::text)))
  with check (( SELECT app_can_edit('quality_control'::text)));

alter policy "require_known_issuer" on public."quotations"
  using (( SELECT app_issuer_ok()));

alter policy "sect_read" on public."quotations"
  using (( SELECT app_can_view('billing'::text)));

alter policy "sect_write" on public."quotations"
  using (( SELECT app_can_edit('billing'::text)))
  with check (( SELECT app_can_edit('billing'::text)));

alter policy "require_known_issuer" on public."samples"
  using (( SELECT app_issuer_ok()));

alter policy "sect_read" on public."samples"
  using (( SELECT app_can_view('inventory'::text)));

alter policy "sect_write" on public."samples"
  using (( SELECT app_can_edit('inventory'::text)))
  with check (( SELECT app_can_edit('inventory'::text)));

alter policy "require_known_issuer" on public."schema_migrations"
  using (( SELECT app_issuer_ok()));

alter policy "admin_write" on public."sections"
  using (( SELECT app_can_edit('admin'::text)))
  with check (( SELECT app_can_edit('admin'::text)));

alter policy "read_all" on public."sections"
  using ((( SELECT app_jwt_sub()) <> ''::text));

alter policy "require_known_issuer" on public."sections"
  using (( SELECT app_issuer_ok()));

alter policy "own_or_attendance" on public."shift_logs"
  using (((person_id = ( SELECT app_person_id())) OR ( SELECT app_can_view('attendance'::text))));

alter policy "require_known_issuer" on public."shift_logs"
  using (( SELECT app_issuer_ok()));

alter policy "require_known_issuer" on public."stage_config"
  using (( SELECT app_issuer_ok()));

alter policy "sect_read" on public."stage_config"
  using (( SELECT app_can_view('production'::text)));

alter policy "sect_write" on public."stage_config"
  using (( SELECT app_can_edit('production'::text)))
  with check (( SELECT app_can_edit('production'::text)));

alter policy "require_known_issuer" on public."stock_movements"
  using (( SELECT app_issuer_ok()));

alter policy "sect_read" on public."stock_movements"
  using (( SELECT app_can_view('inventory'::text)));

alter policy "sect_write" on public."stock_movements"
  using (( SELECT app_can_edit('inventory'::text)))
  with check (( SELECT app_can_edit('inventory'::text)));

alter policy "require_known_issuer" on public."task_columns"
  using (( SELECT app_issuer_ok()));

alter policy "sect_read" on public."task_columns"
  using (( SELECT app_can_view('tasks'::text)));

alter policy "sect_write" on public."task_columns"
  using (( SELECT app_can_edit('tasks'::text)))
  with check (( SELECT app_can_edit('tasks'::text)));

alter policy "require_known_issuer" on public."tasks"
  using (( SELECT app_issuer_ok()));

alter policy "sect_read" on public."tasks"
  using (( SELECT app_can_view('tasks'::text)));

alter policy "sect_write" on public."tasks"
  using (( SELECT app_can_edit('tasks'::text)))
  with check (( SELECT app_can_edit('tasks'::text)));

alter policy "require_known_issuer" on public."unit_economics"
  using (( SELECT app_issuer_ok()));

alter policy "sect_read" on public."unit_economics"
  using (( SELECT app_can_view('finance'::text)));

alter policy "sect_write" on public."unit_economics"
  using (( SELECT app_can_edit('finance'::text)))
  with check (( SELECT app_can_edit('finance'::text)));

alter policy "require_known_issuer" on public."user_points"
  using (( SELECT app_issuer_ok()));

alter policy "sect_read" on public."user_points"
  using (( SELECT app_can_view('dashboard'::text)));

alter policy "require_known_issuer" on public."vat_bills"
  using (( SELECT app_issuer_ok()));

alter policy "sect_read" on public."vat_bills"
  using (( SELECT app_can_view('finance'::text)));

alter policy "sect_write" on public."vat_bills"
  using (( SELECT app_can_edit('finance'::text)))
  with check (( SELECT app_can_edit('finance'::text)));

alter policy "own_or_attendance" on public."worker_sessions"
  using (((person_id = ( SELECT app_person_id())) OR ( SELECT app_can_view('attendance'::text))));

alter policy "require_known_issuer" on public."worker_sessions"
  using (( SELECT app_issuer_ok()));

-- 2. The fs_employees view (same columns, same options; only the helper calls are shared)

create or replace view public.fs_employees with (security_invoker = off) as
SELECT pe.id::text AS id,
    pe.full_name AS name,
    pe.email::text AS email,
    COALESCE(po.label, ''::text) AS role,
    pe.position_id AS "positionId",
    pe.status,
    pe.location,
    pe.department,
    pe.reports_to::text AS "reportsTo",
    pe.is_production_worker AS "isProductionWorker",
    to_char(pe.schedule_start::interval, 'HH24:MI'::text) AS "scheduleStart",
    to_char(pe.schedule_end::interval, 'HH24:MI'::text) AS "scheduleEnd",
    pe.schedule_working_days AS "scheduleWorkingDays",
    pe.schedule_day_overrides AS "scheduleDayOverrides",
    pe.schedule_note AS "scheduleNote",
    pe.legacy_firebase_uid AS uid,
    pe.created_at AS "createdAt",
    pe.updated_at AS "updatedAt",
        CASE
            WHEN vis.sensitive THEN pe.phone
            ELSE NULL::text
        END AS phone,
        CASE
            WHEN vis.sensitive THEN pe.address
            ELSE NULL::text
        END AS address,
        CASE
            WHEN vis.sensitive THEN pe.basic_salary_npr
            ELSE NULL::numeric
        END AS "basicSalaryNPR",
        CASE
            WHEN vis.sensitive THEN pe.bank_name
            ELSE NULL::text
        END AS "bankName",
        CASE
            WHEN vis.sensitive THEN pe.bank_branch
            ELSE NULL::text
        END AS "bankBranch",
        CASE
            WHEN vis.sensitive THEN pe.bank_account
            ELSE NULL::text
        END AS "bankAccount",
        CASE
            WHEN vis.sensitive THEN pe.pan_number
            ELSE NULL::text
        END AS "panNumber",
        CASE
            WHEN vis.sensitive THEN pe.join_date
            ELSE NULL::date
        END AS "joinDate",
        CASE
            WHEN vis.sensitive THEN pe.telegram_id
            ELSE NULL::bigint
        END AS "telegramId",
    pe.location AS region
   FROM people pe
     LEFT JOIN positions po ON po.id = pe.position_id
     CROSS JOIN LATERAL ( SELECT pe.id = ( SELECT app_person_id()) OR ( SELECT app_can_view('employees'::text)) AND ( SELECT app_tier()) >= 2 AS sensitive) vis;

commit;
