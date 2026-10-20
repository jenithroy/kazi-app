-- ============================================================================
-- 0061_rls_helpers_run_once.undo.sql
--
-- Puts every policy and fs_employees back to exactly the text they had before
-- 0061_rls_helpers_run_once.sql. Run it only if that migration has been applied and has to be taken back.
-- ============================================================================

begin;

alter policy "require_known_issuer" on public."accounts"
  using (app_issuer_ok());

alter policy "sect_read" on public."accounts"
  using (app_can_view('accounting'::text));

alter policy "sect_write" on public."accounts"
  using (app_can_edit('accounting'::text))
  with check (app_can_edit('accounting'::text));

alter policy "activity_close_own_view" on public."activity_events"
  using (((person_id = app_person_id()) AND (created_at > (now() - '12:00:00'::interval))))
  with check ((person_id = app_person_id()));

alter policy "activity_log_own" on public."activity_events"
  with check ((person_id = app_person_id()));

alter policy "attendance_grant" on public."attendance"
  using ((app_can_view('attendance'::text) AND (app_tier() >= 2)));

alter policy "attendance_manage" on public."attendance"
  using ((app_can_edit('attendance'::text) AND (app_tier() >= 2)))
  with check ((app_can_edit('attendance'::text) AND (app_tier() >= 2)));

alter policy "attendance_self" on public."attendance"
  using ((person_id = app_person_id()));

alter policy "attendance_self_update" on public."attendance"
  using ((person_id = app_person_id()))
  with check ((person_id = app_person_id()));

alter policy "attendance_self_write" on public."attendance"
  with check ((person_id = app_person_id()));

alter policy "require_known_issuer" on public."attendance"
  using (app_issuer_ok());

alter policy "bank_read" on public."bank_transactions"
  using ((app_can_view('finance'::text) AND app_can_view_finance_tab('bank'::text)));

alter policy "bank_write" on public."bank_transactions"
  using ((app_can_edit('finance'::text) AND app_can_view_finance_tab('bank'::text)))
  with check ((app_can_edit('finance'::text) AND app_can_view_finance_tab('bank'::text)));

alter policy "require_known_issuer" on public."bank_transactions"
  using (app_issuer_ok());

alter policy "budget_manage" on public."budget_requests"
  using (app_can_edit('budget'::text))
  with check (app_can_edit('budget'::text));

alter policy "budget_own" on public."budget_requests"
  using ((requested_by_id = app_person_id()));

alter policy "budget_own_create" on public."budget_requests"
  with check ((requested_by_id = app_person_id()));

alter policy "budget_read" on public."budget_requests"
  using (app_can_view('budget'::text));

alter policy "require_known_issuer" on public."budget_requests"
  using (app_issuer_ok());

alter policy "require_known_issuer" on public."challans"
  using (app_issuer_ok());

alter policy "sect_read" on public."challans"
  using (app_can_view('billing'::text));

alter policy "sect_write" on public."challans"
  using (app_can_edit('billing'::text))
  with check (app_can_edit('billing'::text));

alter policy "chat_group_perms_write" on public."chat_group_permissions"
  using (app_can_edit('admin'::text))
  with check (app_can_edit('admin'::text));

alter policy "require_known_issuer" on public."chat_group_permissions"
  using (app_issuer_ok());

alter policy "chat_members_delete" on public."chat_members"
  using (((person_id = app_person_id()) OR app_can_manage_group(thread_id)));

alter policy "chat_members_insert" on public."chat_members"
  with check ((app_can_manage_group(thread_id) OR (EXISTS ( SELECT 1
   FROM chat_threads t
  WHERE ((t.id = chat_members.thread_id) AND (t.created_by = app_person_id()))))));

alter policy "chat_members_read" on public."chat_members"
  using ((app_in_thread(thread_id) OR (person_id = app_person_id())));

alter policy "chat_members_update" on public."chat_members"
  using (((person_id = app_person_id()) OR app_can_manage_group(thread_id)))
  with check (((person_id = app_person_id()) OR app_can_manage_group(thread_id)));

alter policy "require_known_issuer" on public."chat_members"
  using (app_issuer_ok());

alter policy "chat_messages_insert" on public."chat_messages"
  with check (((author_id = app_person_id()) AND app_in_thread(thread_id) AND app_can_edit('messenger'::text)));

alter policy "chat_messages_update" on public."chat_messages"
  using ((author_id = app_person_id()))
  with check ((author_id = app_person_id()));

alter policy "require_known_issuer" on public."chat_messages"
  using (app_issuer_ok());

alter policy "chat_reactions_delete" on public."chat_reactions"
  using ((person_id = app_person_id()));

alter policy "chat_reactions_insert" on public."chat_reactions"
  with check (((person_id = app_person_id()) AND app_in_message_thread(message_id)));

alter policy "require_known_issuer" on public."chat_reactions"
  using (app_issuer_ok());

alter policy "chat_threads_insert" on public."chat_threads"
  with check (((created_by = app_person_id()) AND app_can_edit('messenger'::text) AND ((kind = 'dm'::text) OR app_can_create_group())));

alter policy "require_known_issuer" on public."chat_threads"
  using (app_issuer_ok());

alter policy "clockins_grant" on public."clock_ins"
  using ((app_can_view('attendance'::text) AND (app_tier() >= 2)));

alter policy "clockins_manage" on public."clock_ins"
  using ((app_can_edit('attendance'::text) AND (app_tier() >= 2)))
  with check ((app_can_edit('attendance'::text) AND (app_tier() >= 2)));

alter policy "clockins_self" on public."clock_ins"
  using ((person_id = app_person_id()));

alter policy "clockins_self_update" on public."clock_ins"
  using ((person_id = app_person_id()))
  with check ((person_id = app_person_id()));

alter policy "clockins_self_write" on public."clock_ins"
  with check ((person_id = app_person_id()));

alter policy "require_known_issuer" on public."clock_ins"
  using (app_issuer_ok());

alter policy "require_known_issuer" on public."content_calendar"
  using (app_issuer_ok());

alter policy "sect_read" on public."content_calendar"
  using (app_can_view('content'::text));

alter policy "sect_write" on public."content_calendar"
  using (app_can_edit('content'::text))
  with check (app_can_edit('content'::text));

alter policy "require_known_issuer" on public."content_posts"
  using (app_issuer_ok());

alter policy "sect_read" on public."content_posts"
  using (app_can_view('content'::text));

alter policy "sect_write" on public."content_posts"
  using (app_can_edit('content'::text))
  with check (app_can_edit('content'::text));

alter policy "require_known_issuer" on public."counters"
  using (app_issuer_ok());

alter policy "sect_read" on public."counters"
  using (app_can_view('billing'::text));

alter policy "sect_write" on public."counters"
  using (app_can_edit('billing'::text))
  with check (app_can_edit('billing'::text));

alter policy "require_known_issuer" on public."customers"
  using (app_issuer_ok());

alter policy "sect_read" on public."customers"
  using (app_can_view('customers'::text));

alter policy "sect_write" on public."customers"
  using (app_can_edit('customers'::text))
  with check (app_can_edit('customers'::text));

alter policy "require_known_issuer" on public."expenses"
  using (app_issuer_ok());

alter policy "sect_read" on public."expenses"
  using (app_can_view('finance'::text));

alter policy "sect_write" on public."expenses"
  using (app_can_edit('finance'::text))
  with check (app_can_edit('finance'::text));

alter policy "require_known_issuer" on public."fabrics"
  using (app_issuer_ok());

alter policy "sect_read" on public."fabrics"
  using (app_can_view('library'::text));

alter policy "sect_write" on public."fabrics"
  using (app_can_edit('library'::text))
  with check (app_can_edit('library'::text));

alter policy "admin_write" on public."finance_tabs"
  using (app_can_edit('admin'::text))
  with check (app_can_edit('admin'::text));

alter policy "read_all" on public."finance_tabs"
  using ((app_jwt_sub() <> ''::text));

alter policy "require_known_issuer" on public."finance_tabs"
  using (app_issuer_ok());

alter policy "manage" on public."holidays"
  using ((app_can_edit('attendance'::text) AND (app_tier() >= 2)))
  with check ((app_can_edit('attendance'::text) AND (app_tier() >= 2)));

alter policy "read_all" on public."holidays"
  using ((app_person_id() IS NOT NULL));

alter policy "require_known_issuer" on public."holidays"
  using (app_issuer_ok());

alter policy "require_known_issuer" on public."inventory_items"
  using (app_issuer_ok());

alter policy "sect_read" on public."inventory_items"
  using (app_can_view('inventory'::text));

alter policy "sect_write" on public."inventory_items"
  using (app_can_edit('inventory'::text))
  with check (app_can_edit('inventory'::text));

alter policy "require_known_issuer" on public."invoices"
  using (app_issuer_ok());

alter policy "sect_read" on public."invoices"
  using (app_can_view('billing'::text));

alter policy "sect_write" on public."invoices"
  using (app_can_edit('billing'::text))
  with check (app_can_edit('billing'::text));

alter policy "require_known_issuer" on public."journal_entries"
  using (app_issuer_ok());

alter policy "sect_read" on public."journal_entries"
  using (app_can_view('accounting'::text));

alter policy "sect_write" on public."journal_entries"
  using (app_can_edit('accounting'::text))
  with check (app_can_edit('accounting'::text));

alter policy "lead_mutes_write" on public."lead_notification_mutes"
  using ((person_id = app_person_id()))
  with check ((person_id = app_person_id()));

alter policy "require_known_issuer" on public."lead_notification_mutes"
  using (app_issuer_ok());

alter policy "require_known_issuer" on public."leaderboard"
  using (app_issuer_ok());

alter policy "require_known_issuer" on public."line_items"
  using (app_issuer_ok());

alter policy "sect_read" on public."line_items"
  using (app_can_view('billing'::text));

alter policy "sect_write" on public."line_items"
  using (app_can_edit('billing'::text))
  with check (app_can_edit('billing'::text));

alter policy "admin_write" on public."marketing_tabs"
  using (app_can_edit('admin'::text))
  with check (app_can_edit('admin'::text));

alter policy "require_known_issuer" on public."marketing_tabs"
  using (app_issuer_ok());

alter policy "production_read" on public."measurement_templates"
  using (app_can_view('production'::text));

alter policy "require_known_issuer" on public."measurement_templates"
  using (app_issuer_ok());

alter policy "sect_read" on public."measurement_templates"
  using (app_can_view('library'::text));

alter policy "sect_write" on public."measurement_templates"
  using (app_can_edit('library'::text));

alter policy "require_known_issuer" on public."messages"
  using (app_issuer_ok());

alter policy "sect_read" on public."messages"
  using (app_can_view('messenger'::text));

alter policy "sect_write" on public."messages"
  using (app_can_edit('messenger'::text))
  with check (app_can_edit('messenger'::text));

alter policy "admin_write" on public."messenger_tabs"
  using (app_can_edit('admin'::text))
  with check (app_can_edit('admin'::text));

alter policy "require_known_issuer" on public."messenger_tabs"
  using (app_issuer_ok());

alter policy "meta_ads_insert" on public."meta_ad_accounts"
  with check ((app_can_edit('marketing'::text) AND app_can_edit_marketing_tab('meta_ads'::text)));

alter policy "meta_ads_read" on public."meta_ad_accounts"
  using ((app_can_view('marketing'::text) AND app_can_view_marketing_tab('meta_ads'::text)));

alter policy "meta_ads_write" on public."meta_ad_accounts"
  using ((app_can_edit('marketing'::text) AND app_can_edit_marketing_tab('meta_ads'::text)))
  with check ((app_can_edit('marketing'::text) AND app_can_edit_marketing_tab('meta_ads'::text)));

alter policy "require_known_issuer" on public."meta_ad_accounts"
  using (app_issuer_ok());

alter policy "meta_ads_read" on public."meta_ad_insights"
  using ((app_can_view('marketing'::text) AND app_can_view_marketing_tab('meta_ads'::text)));

alter policy "require_known_issuer" on public."meta_ad_insights"
  using (app_issuer_ok());

alter policy "meta_ads_read" on public."meta_ads"
  using ((app_can_view('marketing'::text) AND app_can_view_marketing_tab('meta_ads'::text)));

alter policy "meta_ads_write" on public."meta_ads"
  using ((app_can_edit('marketing'::text) AND app_can_edit_marketing_tab('meta_ads'::text)))
  with check ((app_can_edit('marketing'::text) AND app_can_edit_marketing_tab('meta_ads'::text)));

alter policy "require_known_issuer" on public."meta_ads"
  using (app_issuer_ok());

alter policy "meta_ads_read" on public."meta_ads_actions"
  using ((app_can_view('marketing'::text) AND app_can_view_marketing_tab('meta_ads'::text)));

alter policy "meta_ads_write" on public."meta_ads_actions"
  with check ((app_can_edit('marketing'::text) AND app_can_edit_marketing_tab('meta_ads'::text)));

alter policy "require_known_issuer" on public."meta_ads_actions"
  using (app_issuer_ok());

alter policy "meta_ads_read" on public."meta_ads_settings"
  using ((app_can_view('marketing'::text) AND app_can_view_marketing_tab('meta_ads'::text)));

alter policy "meta_ads_write" on public."meta_ads_settings"
  using ((app_can_edit('marketing'::text) AND app_can_edit_marketing_tab('meta_ads'::text)))
  with check ((app_can_edit('marketing'::text) AND app_can_edit_marketing_tab('meta_ads'::text)));

alter policy "require_known_issuer" on public."meta_ads_settings"
  using (app_issuer_ok());

alter policy "meta_ads_read" on public."meta_adsets"
  using ((app_can_view('marketing'::text) AND app_can_view_marketing_tab('meta_ads'::text)));

alter policy "meta_ads_write" on public."meta_adsets"
  using ((app_can_edit('marketing'::text) AND app_can_edit_marketing_tab('meta_ads'::text)))
  with check ((app_can_edit('marketing'::text) AND app_can_edit_marketing_tab('meta_ads'::text)));

alter policy "require_known_issuer" on public."meta_adsets"
  using (app_issuer_ok());

alter policy "meta_ads_read" on public."meta_campaigns"
  using ((app_can_view('marketing'::text) AND app_can_view_marketing_tab('meta_ads'::text)));

alter policy "meta_ads_write" on public."meta_campaigns"
  using ((app_can_edit('marketing'::text) AND app_can_edit_marketing_tab('meta_ads'::text)))
  with check ((app_can_edit('marketing'::text) AND app_can_edit_marketing_tab('meta_ads'::text)));

alter policy "require_known_issuer" on public."meta_campaigns"
  using (app_issuer_ok());

alter policy "meta_ads_read" on public."meta_sync_runs"
  using ((app_can_view('marketing'::text) AND app_can_view_marketing_tab('meta_ads'::text)));

alter policy "require_known_issuer" on public."meta_sync_runs"
  using (app_issuer_ok());

alter policy "notif_insert" on public."mobile_notifications"
  with check (((app_person_id() IS NOT NULL) AND app_person_known(recipient_email)));

alter policy "notif_own_read" on public."mobile_notifications"
  using (((recipient_id = app_person_id()) OR (recipient_email = ( SELECT people.email
   FROM people
  WHERE (people.id = app_person_id())))));

alter policy "notif_own_update" on public."mobile_notifications"
  using (((recipient_id = app_person_id()) OR (recipient_email = ( SELECT people.email
   FROM people
  WHERE (people.id = app_person_id())))))
  with check (((recipient_id = app_person_id()) OR (recipient_email = ( SELECT people.email
   FROM people
  WHERE (people.id = app_person_id())))));

alter policy "require_known_issuer" on public."mobile_notifications"
  using (app_issuer_ok());

alter policy "require_known_issuer" on public."notification_categories"
  using (app_issuer_ok());

alter policy "require_known_issuer" on public."order_assignments"
  using (app_issuer_ok());

alter policy "sect_read" on public."order_assignments"
  using (app_can_view('production'::text));

alter policy "sect_write" on public."order_assignments"
  using (app_can_edit('production'::text))
  with check (app_can_edit('production'::text));

alter policy "finance_read" on public."order_costs"
  using (app_can_view('finance'::text));

alter policy "require_known_issuer" on public."order_costs"
  using (app_issuer_ok());

alter policy "sect_read" on public."order_costs"
  using (app_can_view('orders'::text));

alter policy "sect_write" on public."order_costs"
  using (app_can_edit('orders'::text))
  with check (app_can_edit('orders'::text));

alter policy "require_known_issuer" on public."order_notes"
  using (app_issuer_ok());

alter policy "sect_read" on public."order_notes"
  using (app_can_view('orders'::text));

alter policy "sect_write" on public."order_notes"
  using (app_can_edit('orders'::text))
  with check (app_can_edit('orders'::text));

alter policy "require_known_issuer" on public."order_stage_history"
  using (app_issuer_ok());

alter policy "sect_read" on public."order_stage_history"
  using (app_can_view('orders'::text));

alter policy "sect_write" on public."order_stage_history"
  using (app_can_edit('orders'::text))
  with check (app_can_edit('orders'::text));

alter policy "require_known_issuer" on public."orders"
  using (app_issuer_ok());

alter policy "sect_read" on public."orders"
  using (app_can_view('orders'::text));

alter policy "sect_write" on public."orders"
  using (app_can_edit('orders'::text))
  with check (app_can_edit('orders'::text));

alter policy "production_read" on public."patterns"
  using (app_can_view('production'::text));

alter policy "require_known_issuer" on public."patterns"
  using (app_issuer_ok());

alter policy "sect_read" on public."patterns"
  using (app_can_view('library'::text));

alter policy "sect_write" on public."patterns"
  using (app_can_edit('library'::text))
  with check (app_can_edit('library'::text));

alter policy "require_known_issuer" on public."payments"
  using (app_issuer_ok());

alter policy "sect_read" on public."payments"
  using (app_can_view('billing'::text));

alter policy "sect_write" on public."payments"
  using (app_can_edit('billing'::text))
  with check (app_can_edit('billing'::text));

alter policy "payroll_grant" on public."payroll"
  using ((app_can_view('payroll'::text) AND app_can_view_finance_tab('payroll'::text)));

alter policy "payroll_manage" on public."payroll"
  using (app_can_edit('payroll'::text))
  with check (app_can_edit('payroll'::text));

alter policy "payroll_self" on public."payroll"
  using ((person_id = app_person_id()));

alter policy "require_known_issuer" on public."payroll"
  using (app_issuer_ok());

alter policy "people_hr_read" on public."people"
  using ((app_can_view('employees'::text) AND (app_tier() >= 2)));

alter policy "people_hr_write" on public."people"
  using (app_can_edit('employees'::text))
  with check (app_can_edit('employees'::text));

alter policy "people_self_read" on public."people"
  using ((id = app_person_id()));

alter policy "people_self_update" on public."people"
  using ((id = app_person_id()))
  with check ((id = app_person_id()));

alter policy "require_known_issuer" on public."people"
  using (app_issuer_ok());

alter policy "self_update_push_token" on public."people"
  using ((id = app_person_id()))
  with check ((id = app_person_id()));

alter policy "require_known_issuer" on public."permission_drift_log"
  using (app_issuer_ok());

alter policy "hr_write" on public."person_avatars"
  using (app_can_edit('employees'::text))
  with check (app_can_edit('employees'::text));

alter policy "own_write" on public."person_avatars"
  using ((person_id = app_person_id()))
  with check ((person_id = app_person_id()));

alter policy "read_all" on public."person_avatars"
  using ((app_person_id() IS NOT NULL));

alter policy "require_known_issuer" on public."person_avatars"
  using (app_issuer_ok());

alter policy "overrides_admin" on public."person_permission_overrides"
  using (app_can_edit('admin'::text))
  with check (app_can_edit('admin'::text));

alter policy "overrides_read_self" on public."person_permission_overrides"
  using (((person_id = app_person_id()) OR app_can_view('admin'::text)));

alter policy "require_known_issuer" on public."person_permission_overrides"
  using (app_issuer_ok());

alter policy "require_known_issuer" on public."point_transactions"
  using (app_issuer_ok());

alter policy "admin_write" on public."position_finance_tabs"
  using (app_can_edit('admin'::text))
  with check (app_can_edit('admin'::text));

alter policy "read_all" on public."position_finance_tabs"
  using ((app_jwt_sub() <> ''::text));

alter policy "require_known_issuer" on public."position_finance_tabs"
  using (app_issuer_ok());

alter policy "admin_write" on public."position_marketing_tabs"
  using (app_can_edit('admin'::text))
  with check (app_can_edit('admin'::text));

alter policy "require_known_issuer" on public."position_marketing_tabs"
  using (app_issuer_ok());

alter policy "admin_write" on public."position_messenger_tabs"
  using (app_can_edit('admin'::text))
  with check (app_can_edit('admin'::text));

alter policy "require_known_issuer" on public."position_messenger_tabs"
  using (app_issuer_ok());

alter policy "position_notification_categories_write" on public."position_notification_categories"
  using (app_can_edit('admin'::text))
  with check (app_can_edit('admin'::text));

alter policy "require_known_issuer" on public."position_notification_categories"
  using (app_issuer_ok());

alter policy "admin_write" on public."position_permissions"
  using (app_can_edit('admin'::text))
  with check (app_can_edit('admin'::text));

alter policy "read_all" on public."position_permissions"
  using ((app_jwt_sub() <> ''::text));

alter policy "require_known_issuer" on public."position_permissions"
  using (app_issuer_ok());

alter policy "admin_write" on public."positions"
  using (app_can_edit('admin'::text))
  with check (app_can_edit('admin'::text));

alter policy "read_all" on public."positions"
  using ((app_jwt_sub() <> ''::text));

alter policy "require_known_issuer" on public."positions"
  using (app_issuer_ok());

alter policy "require_known_issuer" on public."processes"
  using (app_issuer_ok());

alter policy "sect_read" on public."processes"
  using (app_can_view('library'::text));

alter policy "sect_write" on public."processes"
  using (app_can_edit('library'::text))
  with check (app_can_edit('library'::text));

alter policy "require_known_issuer" on public."product_costs"
  using (app_issuer_ok());

alter policy "sect_read" on public."product_costs"
  using (app_can_view('finance'::text));

alter policy "sect_write" on public."product_costs"
  using (app_can_edit('finance'::text))
  with check (app_can_edit('finance'::text));

alter policy "production_read" on public."product_recipes"
  using (app_can_view('production'::text));

alter policy "require_known_issuer" on public."product_recipes"
  using (app_issuer_ok());

alter policy "sect_read" on public."product_recipes"
  using (app_can_view('inventory'::text));

alter policy "sect_write" on public."product_recipes"
  using (app_can_edit('inventory'::text))
  with check (app_can_edit('inventory'::text));

alter policy "require_known_issuer" on public."production_batches"
  using (app_issuer_ok());

alter policy "sect_read" on public."production_batches"
  using (app_can_view('production'::text));

alter policy "sect_write" on public."production_batches"
  using (app_can_edit('production'::text))
  with check (app_can_edit('production'::text));

alter policy "require_known_issuer" on public."purchases"
  using (app_issuer_ok());

alter policy "sect_read" on public."purchases"
  using (app_can_view('purchases'::text));

alter policy "sect_write" on public."purchases"
  using (app_can_edit('purchases'::text))
  with check (app_can_edit('purchases'::text));

alter policy "push_tokens_own_read" on public."push_tokens"
  using ((person_id = app_person_id()));

alter policy "require_known_issuer" on public."push_tokens"
  using (app_issuer_ok());

alter policy "require_known_issuer" on public."qc_logs"
  using (app_issuer_ok());

alter policy "sect_read" on public."qc_logs"
  using (app_can_view('quality_control'::text));

alter policy "sect_write" on public."qc_logs"
  using (app_can_edit('quality_control'::text))
  with check (app_can_edit('quality_control'::text));

alter policy "require_known_issuer" on public."quotations"
  using (app_issuer_ok());

alter policy "sect_read" on public."quotations"
  using (app_can_view('billing'::text));

alter policy "sect_write" on public."quotations"
  using (app_can_edit('billing'::text))
  with check (app_can_edit('billing'::text));

alter policy "require_known_issuer" on public."samples"
  using (app_issuer_ok());

alter policy "sect_read" on public."samples"
  using (app_can_view('inventory'::text));

alter policy "sect_write" on public."samples"
  using (app_can_edit('inventory'::text))
  with check (app_can_edit('inventory'::text));

alter policy "require_known_issuer" on public."schema_migrations"
  using (app_issuer_ok());

alter policy "admin_write" on public."sections"
  using (app_can_edit('admin'::text))
  with check (app_can_edit('admin'::text));

alter policy "read_all" on public."sections"
  using ((app_jwt_sub() <> ''::text));

alter policy "require_known_issuer" on public."sections"
  using (app_issuer_ok());

alter policy "own_or_attendance" on public."shift_logs"
  using (((person_id = app_person_id()) OR app_can_view('attendance'::text)));

alter policy "require_known_issuer" on public."shift_logs"
  using (app_issuer_ok());

alter policy "require_known_issuer" on public."stage_config"
  using (app_issuer_ok());

alter policy "sect_read" on public."stage_config"
  using (app_can_view('production'::text));

alter policy "sect_write" on public."stage_config"
  using (app_can_edit('production'::text))
  with check (app_can_edit('production'::text));

alter policy "require_known_issuer" on public."stock_movements"
  using (app_issuer_ok());

alter policy "sect_read" on public."stock_movements"
  using (app_can_view('inventory'::text));

alter policy "sect_write" on public."stock_movements"
  using (app_can_edit('inventory'::text))
  with check (app_can_edit('inventory'::text));

alter policy "require_known_issuer" on public."task_columns"
  using (app_issuer_ok());

alter policy "sect_read" on public."task_columns"
  using (app_can_view('tasks'::text));

alter policy "sect_write" on public."task_columns"
  using (app_can_edit('tasks'::text))
  with check (app_can_edit('tasks'::text));

alter policy "require_known_issuer" on public."tasks"
  using (app_issuer_ok());

alter policy "sect_read" on public."tasks"
  using (app_can_view('tasks'::text));

alter policy "sect_write" on public."tasks"
  using (app_can_edit('tasks'::text))
  with check (app_can_edit('tasks'::text));

alter policy "require_known_issuer" on public."unit_economics"
  using (app_issuer_ok());

alter policy "sect_read" on public."unit_economics"
  using (app_can_view('finance'::text));

alter policy "sect_write" on public."unit_economics"
  using (app_can_edit('finance'::text))
  with check (app_can_edit('finance'::text));

alter policy "require_known_issuer" on public."user_points"
  using (app_issuer_ok());

alter policy "sect_read" on public."user_points"
  using (app_can_view('dashboard'::text));

alter policy "require_known_issuer" on public."vat_bills"
  using (app_issuer_ok());

alter policy "sect_read" on public."vat_bills"
  using (app_can_view('finance'::text));

alter policy "sect_write" on public."vat_bills"
  using (app_can_edit('finance'::text))
  with check (app_can_edit('finance'::text));

alter policy "own_or_attendance" on public."worker_sessions"
  using (((person_id = app_person_id()) OR app_can_view('attendance'::text)));

alter policy "require_known_issuer" on public."worker_sessions"
  using (app_issuer_ok());

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
     CROSS JOIN LATERAL ( SELECT pe.id = app_person_id() OR app_can_view('employees'::text) AND app_tier() >= 2 AS sensitive) vis;

commit;
