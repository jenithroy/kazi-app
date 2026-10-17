/**
 * Live writer for Roles & permissions.
 *
 * Every one of these hits the tables RLS itself reads, gated by
 * `app_can_edit('admin')` — so a role without admin edit rights gets a refusal
 * from the database, not just a greyed-out button. Unlike the rest of the app
 * these are NOT wrapped in `liveWrite`: a permission change that silently fell
 * back to a mock would show access the database never granted, which is the
 * one place this app cannot afford to lie. A failure throws and the draft
 * stays put so it can be retried.
 */

import { getSupabase } from '@/lib/supabase';
import { logActivity } from '@/lib/supabase/activity-log';

import { SUPER_ADMIN_TIER, type RoleDraft, type RoleFields } from './types';
import { flagsFor } from './utils';

function check(where: string, error: { message: string; code?: string } | null): void {
  if (error) throw new Error(`${where}: ${error.message}${error.code ? ` [${error.code}]` : ''}`);
}

/**
 * Commit a whole draft as one batch — a half-made change is never live.
 *
 * Order matters. While the role is still tier 4 the database refuses to reduce
 * any of its rows, so a demotion has to land first; the promotion goes last
 * because the trigger behind it fills in every page and finance tab itself.
 */
export async function saveRoleDraft({ roleId, draft }: { roleId: string; draft: RoleDraft }): Promise<void> {
  const sb = getSupabase();

  if (draft.superAdmin === false) {
    const { error } = await sb.from('positions').update({ tier: 0 }).eq('id', roleId);
    check('demote super admin', error);
  }

  const permRows = Object.entries(draft.levels).map(([sectionId, level]) => ({
    position_id: roleId,
    section_id: sectionId,
    ...flagsFor(level),
  }));
  if (permRows.length) {
    const { error } = await sb
      .from('position_permissions')
      .upsert(permRows, { onConflict: 'position_id,section_id' });
    check('position_permissions', error);
  }

  const tabRows = Object.entries(draft.tabs).map(([tabId, level]) => ({
    position_id: roleId,
    tab_id: tabId,
    ...flagsFor(level),
  }));
  if (tabRows.length) {
    const { error } = await sb
      .from('position_finance_tabs')
      .upsert(tabRows, { onConflict: 'position_id,tab_id' });
    check('position_finance_tabs', error);
  }

  // Chat groups. Its own table (see 0105) rather than a `sections` row, so
  // this is a separate upsert rather than another `position_permissions` row.
  // Upsert, not update: a role created before the table existed has none.
  if (Object.keys(draft.groups).length) {
    // Only the staged half is sent, so an untouched capability keeps whatever
    // it already had rather than being reset to the column default.
    const saved = await sb
      .from('chat_group_permissions')
      .select('can_create, can_manage')
      .eq('position_id', roleId)
      .maybeSingle();
    check('read chat group rights', saved.error);
    const current = (saved.data ?? { can_create: false, can_manage: false }) as {
      can_create: boolean;
      can_manage: boolean;
    };

    const { error } = await sb.from('chat_group_permissions').upsert(
      {
        position_id: roleId,
        can_create: draft.groups.create ?? current.can_create,
        can_manage: draft.groups.manage ?? current.can_manage,
      },
      { onConflict: 'position_id' },
    );
    check('chat_group_permissions', error);
  }

  // Notification categories — same upsert-over-entries shape as Finance tabs,
  // since a category is naturally binary (on/off) rather than view/edit.
  const notifRows = Object.entries(draft.notifications).map(([categoryId, enabled]) => ({
    position_id: roleId,
    category_id: categoryId,
    enabled,
  }));
  if (notifRows.length) {
    const { error } = await sb
      .from('position_notification_categories')
      .upsert(notifRows, { onConflict: 'position_id,category_id' });
    check('position_notification_categories', error);
  }

  // Page annotations are a property of the page, not of this role.
  for (const [sectionId, value] of Object.entries(draft.personal)) {
    const { error } = await sb.from('sections').update({ is_personal: value }).eq('id', sectionId);
    check(`sections/${sectionId}`, error);
  }

  if (draft.superAdmin === true) {
    const { error } = await sb.from('positions').update({ tier: SUPER_ADMIN_TIER }).eq('id', roleId);
    check('grant super admin', error);
  }

  // One row for the whole commit rather than one per table touched above —
  // from the person's own perspective this was a single save, and a draft
  // routinely touches several tables (permissions, tabs, groups) in one go.
  void logActivity({ section: 'admin', action: 'update', target: 'Permission', detail: { roleId } });
}

export async function createRole(fields: RoleFields): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from('positions').insert({
    id: fields.id,
    label: fields.label,
    description: fields.description,
    tier: fields.tier,
  });
  check('create role', error);

  // A row of its own, granted nothing. Without it the new role would read as
  // "no chat-group rights" anyway, but with no switch on screen to change —
  // the card would have nothing to write to.
  const rights = await sb
    .from('chat_group_permissions')
    .insert({ position_id: fields.id, can_create: false, can_manage: false });
  check('create chat group rights', rights.error);
  void logActivity({ section: 'admin', action: 'create', target: 'Role', detail: { roleId: fields.id } });
}

export async function updateRole(fields: RoleFields): Promise<void> {
  const { error } = await getSupabase()
    .from('positions')
    .update({ label: fields.label, description: fields.description, tier: fields.tier })
    .eq('id', fields.id);
  check('save role', error);
  void logActivity({ section: 'admin', action: 'update', target: 'Role', detail: { roleId: fields.id } });
}

export async function deleteRole(roleId: string): Promise<void> {
  const { error } = await getSupabase().from('positions').delete().eq('id', roleId);
  check('delete role', error);
  void logActivity({ section: 'admin', action: 'delete', target: 'Role', detail: { roleId } });
}

/**
 * Move somebody into a role, or out of every role (`positionId: null`).
 *
 * This writes to `people`, which RLS gates on `employees` edit — not on
 * `admin`. Someone can be allowed to shape a role without being allowed to
 * decide who holds it.
 */
export async function setPersonRole({ personId, positionId }: { personId: string; positionId: string | null }): Promise<void> {
  const { error } = await getSupabase()
    .from('people')
    .update({ position_id: positionId })
    .eq('id', personId);
  check('assign role', error);
  // Same [section, target] the generic write layer would log an `employees`
  // collection change under — this is that same change, made from the matrix
  // screen instead of the Employees one.
  void logActivity({ section: 'employees', action: 'update', target: 'Employee', detail: { collection: 'people', id: personId } });
}
