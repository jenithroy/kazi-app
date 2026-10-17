/**
 * In-memory stand-in for the five permission tables, used only when Supabase
 * is unconfigured. It applies the same rules the database does — a tier-4 role
 * is granted everything, and its rows cannot be reduced while it is tier 4 —
 * so the screen behaves the same either way.
 */

import { simulateLatency } from '../mock/delay';

import { FINANCE_TABS, GROUP_RIGHTS, NOTIFICATION_CATEGORIES, PEOPLE, PERMS, ROLES, SECTIONS, TAB_PERMS } from './mock';
import {
  SUPER_ADMIN_TIER,
  type AccessLevel,
  type AdminMatrix,
  type GroupRightsRow,
  type PersonRow,
  type RoleDraft,
  type RoleFields,
  type RoleRow,
  type SectionRow,
} from './types';

let roles: RoleRow[] = ROLES.map((r) => ({ ...r }));
let sections: SectionRow[] = SECTIONS.map((s) => ({ ...s }));
let perms: Record<string, Record<string, AccessLevel>> = clone(PERMS);
let tabPerms: Record<string, Record<string, AccessLevel>> = clone(TAB_PERMS);
let people: PersonRow[] = PEOPLE.map((p) => ({ ...p }));
let groupRights: Record<string, GroupRightsRow> = cloneRights(GROUP_RIGHTS);
let notificationPerms: Record<string, Record<string, boolean>> = {};

function cloneBoolMap(m: Record<string, Record<string, boolean>>): Record<string, Record<string, boolean>> {
  const out: Record<string, Record<string, boolean>> = {};
  for (const [k, v] of Object.entries(m)) out[k] = { ...v };
  return out;
}

function cloneRights(m: Record<string, GroupRightsRow>): Record<string, GroupRightsRow> {
  return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { ...v }]));
}

function clone(m: Record<string, Record<string, AccessLevel>>): Record<string, Record<string, AccessLevel>> {
  const out: Record<string, Record<string, AccessLevel>> = {};
  for (const [k, v] of Object.entries(m)) out[k] = { ...v };
  return out;
}

export async function fetchAdminMatrix(): Promise<AdminMatrix> {
  await simulateLatency();
  return {
    roles: roles.map((r) => ({ ...r })).sort((a, b) => a.label.localeCompare(b.label)),
    sections: sections.map((s) => ({ ...s })),
    financeTabs: FINANCE_TABS.map((t) => ({ ...t })),
    perms: clone(perms),
    tabPerms: clone(tabPerms),
    groupRights: cloneRights(groupRights),
    notificationCategories: NOTIFICATION_CATEGORIES.map((c) => ({ ...c })),
    notificationPerms: cloneBoolMap(notificationPerms),
    people: people.map((p) => ({ ...p })),
  };
}

export async function saveRoleDraft({ roleId, draft }: { roleId: string; draft: RoleDraft }): Promise<void> {
  await simulateLatency(300);
  if (draft.superAdmin === false) {
    roles = roles.map((r) => (r.id === roleId ? { ...r, tier: 0 } : r));
  }
  perms[roleId] = { ...perms[roleId], ...draft.levels };
  tabPerms[roleId] = { ...tabPerms[roleId], ...draft.tabs };
  sections = sections.map((s) => (draft.personal[s.id] === undefined ? s : { ...s, isPersonal: draft.personal[s.id] }));
  groupRights = {
    ...groupRights,
    [roleId]: { ...(groupRights[roleId] ?? { create: false, manage: false }), ...draft.groups },
  };
  notificationPerms[roleId] = { ...notificationPerms[roleId], ...draft.notifications };
  if (draft.superAdmin === true) {
    roles = roles.map((r) => (r.id === roleId ? { ...r, tier: SUPER_ADMIN_TIER } : r));
    groupRights = { ...groupRights, [roleId]: { create: true, manage: true } };
    // The database does this with a trigger; the mock has to do it by hand.
    perms[roleId] = Object.fromEntries(sections.map((s) => [s.id, 'edit' as AccessLevel]));
    tabPerms[roleId] = Object.fromEntries(FINANCE_TABS.map((t) => [t.id, 'edit' as AccessLevel]));
  }
}

export async function createRole(fields: RoleFields): Promise<void> {
  await simulateLatency(250);
  roles = [...roles, { ...fields }];
  perms[fields.id] = {};
  tabPerms[fields.id] = {};
  groupRights[fields.id] = { create: false, manage: false };
}

export async function updateRole(fields: RoleFields): Promise<void> {
  await simulateLatency(250);
  roles = roles.map((r) => (r.id === fields.id ? { ...r, ...fields } : r));
}

export async function deleteRole(roleId: string): Promise<void> {
  await simulateLatency(250);
  roles = roles.filter((r) => r.id !== roleId);
  delete perms[roleId];
  delete tabPerms[roleId];
  delete groupRights[roleId];
  delete notificationPerms[roleId];
}

export async function setPersonRole({ personId, positionId }: { personId: string; positionId: string | null }): Promise<void> {
  await simulateLatency(250);
  people = people.map((p) => (p.id === personId ? { ...p, positionId } : p));
}
