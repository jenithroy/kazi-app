/**
 * Roles & permissions, shaped exactly like the tables the database enforces.
 *
 * Access is a property of the job, not the person: a role is a row in
 * `positions`, every switch on the screen is a row in `position_permissions`,
 * and that is the same table RLS consults when it decides whether a query may
 * return a row. There is no second copy of this anywhere, and nothing here is
 * a mobile-only notion of access.
 */

/**
 * `can_view` / `can_edit` are two booleans, but only three of the four
 * combinations mean anything — edit without view is not a thing. One three-way
 * value removes a state nobody wants.
 */
export type AccessLevel = 'none' | 'view' | 'edit';

/** Tier 4. The database treats it as unreducible and a trigger grants it everything. */
export const SUPER_ADMIN_TIER = 4;

/**
 * The one other thing tier still decides: attendance and employee rows are
 * filtered by `app_tier() >= 2`, so a role either sees its own records or
 * everyone's. A scope question, not a rank.
 */
export const RECORDS_TIER = 2;

export const LEVELS: { key: AccessLevel; label: string; hint: string }[] = [
  { key: 'none', label: 'None', hint: 'Hidden from the app; the screen refuses to open.' },
  { key: 'view', label: 'View', hint: 'Can open the screen and read it, but not change anything.' },
  { key: 'edit', label: 'Edit', hint: 'Full access — can add, change and delete.' },
];

export const SCOPES: { tier: number; label: string; hint: string }[] = [
  { tier: 0, label: 'Own records', hint: 'On Attendance and Employees, sees only their own rows.' },
  { tier: RECORDS_TIER, label: 'All records', hint: "Sees everyone's attendance and employee records, on the screens they're granted." },
];

/** A row of `positions`. */
export interface RoleRow {
  id: string;
  label: string;
  description: string | null;
  tier: number;
}

/** A row of `sections` — one app screen. */
export interface SectionRow {
  id: string;
  label: string;
  /** A note on the screen itself, the same for every role: it only ever shows a person their own records. */
  isPersonal: boolean;
  sortOrder: number;
}

/**
 * The two chat-group capabilities, as rows of `chat_group_permissions`.
 *
 * Not a `sections` row on purpose. `sections` is shared with the web ERP and
 * drives its permission matrix too; adding a line there would put "Chat
 * groups" in front of every web admin for a feature the web app does not
 * have. These live in their own mobile-owned table instead, and the database
 * enforces them through `app_can_create_group()` / `app_can_manage_group()`
 * exactly as it enforces the section grants.
 */
export type GroupCapability = 'create' | 'manage';

export const GROUP_CAPABILITIES: { key: GroupCapability; label: string; hint: string }[] = [
  { key: 'create', label: 'Start groups', hint: 'Can gather two or more colleagues into a new group conversation.' },
  { key: 'manage', label: 'Manage groups', hint: 'Can rename a group they are in, and add or remove its members.' },
];

export type GroupRightsRow = Record<GroupCapability, boolean>;

/** A row of `finance_tabs` — one tab inside Finance. */
export interface FinanceTabRow {
  id: string;
  label: string;
  sortOrder: number;
}

/**
 * A row of `notification_categories` — one admin-toggleable notification
 * group (see `src/data/notifications/routing.ts`'s `category` tags). Not a
 * `sections` row, same reasoning as `GroupCapability`: this is mobile-owned,
 * the web ERP has no notion of it.
 */
export interface NotificationCategoryRow {
  id: string;
  label: string;
  hint: string;
  sortOrder: number;
}

/** Whoever might hold a role. Comes from `employees`, which has its own RLS. */
export interface PersonRow {
  id: string;
  name: string;
  email: string;
  department: string;
  positionId: string | null;
  active: boolean;
}

/** Everything the screen reads, in one shot — mirroring the web page's own `load()`. */
export interface AdminMatrix {
  roles: RoleRow[];
  sections: SectionRow[];
  financeTabs: FinanceTabRow[];
  /** positionId → sectionId → level. A missing entry is `none`. */
  perms: Record<string, Record<string, AccessLevel>>;
  /** positionId → tabId → level. */
  tabPerms: Record<string, Record<string, AccessLevel>>;
  /** positionId → the two chat-group capabilities. A missing entry is both false. */
  groupRights: Record<string, GroupRightsRow>;
  notificationCategories: NotificationCategoryRow[];
  /** positionId → categoryId → enabled. A missing entry is enabled (opt-out model — see 0114's own header). */
  notificationPerms: Record<string, Record<string, boolean>>;
  people: PersonRow[];
}

/**
 * An untouched draft. Only entries that differ from what is saved live here,
 * so putting a switch back where it was makes the screen clean again.
 */
export interface RoleDraft {
  levels: Record<string, AccessLevel>;
  tabs: Record<string, AccessLevel>;
  /** sectionId → `is_personal`. A property of the screen, not of this role. */
  personal: Record<string, boolean>;
  /** The chat-group capabilities this role is staged to gain or lose. */
  groups: Partial<Record<GroupCapability, boolean>>;
  /** categoryId → staged enabled value. Only entries that differ from saved (or from the opt-out default) live here. */
  notifications: Record<string, boolean>;
  /** null = untouched; true/false = staged tier change. */
  superAdmin: boolean | null;
}

export const EMPTY_DRAFT: RoleDraft = { levels: {}, tabs: {}, personal: {}, groups: {}, notifications: {}, superAdmin: null };

/** One line of the review sheet. */
export interface DiffRow {
  key: string;
  kind: 'page' | 'tab' | 'personal' | 'group' | 'notification' | 'super';
  name: string;
  group: string;
  from: string;
  to: string;
  /** Takes something away — the review sheet warns about these. */
  removal: boolean;
}

/** What a role's switches add up to, for the meter and the role cards. */
export interface AccessCounts {
  edit: number;
  view: number;
  none: number;
}

export interface RoleFields {
  id: string;
  label: string;
  description: string | null;
  tier: number;
}
