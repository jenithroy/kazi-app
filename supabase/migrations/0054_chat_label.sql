-- ============================================================================
-- 0054_chat_label.sql
--
-- The Messenger page is now called Chat. The menu, the page text and the Roles &
-- Duties links changed in code; this changes the one place the name lives in the
-- database: the label that the Admin Panel's permission matrix and the Usage &
-- Activity page read from `sections`.
--
-- Label only. The section id stays `messenger` because everything keys on it
-- (position_permissions, activity_events.section_id, the app_can_view('messenger')
-- policies, the /messenger address that push notifications deep-link to).
--
-- Safe to run more than once. Nothing here runs by itself: paste it into the
-- Supabase SQL editor.
-- ============================================================================

update sections set label = 'Chat' where id = 'messenger';
