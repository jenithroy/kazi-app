/**
 * What the bottom bar holds, per position.
 *
 * The bar used to be a fixed five (Dashboard / Tasks / Inventory / Finance /
 * More) filtered by `canView`, which meant a Fashion Designer and an Accountant
 * got the same buttons and both had to dig through More for the one screen they
 * actually live in. Now each `positions.id` in Postgres names the two modules
 * that person works in all day; everything else is reached from the dashboard's
 * quick links or the More hub.
 *
 * Chat is the middle slot for everybody — it is the team's main channel, so it
 * gets the centre position on every layout regardless of role.
 *
 * These lists are a UI *hint*, never a grant: `custom-tab-bar` still runs every
 * slot through `canView`, and Postgres RLS refuses the underlying reads either
 * way. A layout that names a section the position can't see simply loses that
 * button.
 */

import type { SectionId } from './permissions';
import { ROLE_RANK, type Role } from './roles';

/** A tab slot: a section to gate on, plus where it lives. */
export interface TabSlot {
  /** Route name inside `app/(app)/(tabs)/`. */
  name: string;
  section: SectionId;
}

const SLOTS = {
  dashboard: { name: 'index', section: 'dashboard' },
  chat: { name: 'chat', section: 'messenger' },
  tasks: { name: 'tasks', section: 'tasks' },
  inventory: { name: 'inventory', section: 'inventory' },
  finance: { name: 'finance', section: 'finance' },
  // One screen, two names: the floor calls it Production, the directors call
  // it the order book. The route is `production`; the *section* stays
  // `order-management`, because `orders` is the table RLS gates the read on
  // and `sections.id` in Postgres is that same string.
  production: { name: 'production', section: 'order-management' },
  billing: { name: 'billing', section: 'billing' },
  marketing: { name: 'marketing', section: 'marketing' },
} satisfies Record<string, TabSlot>;

/** Always last, never gated — it is the overflow that reaches everything else. */
export const MORE_SLOT = { name: 'more', section: 'dashboard' } as const;

/**
 * Live `positions.id` → bar, in order. Chat is index 2 (the centre) in every
 * five-slot layout; Content Coordinator is the one four-slot bar, because
 * Marketing is genuinely the only module they work in.
 */
const BY_POSITION: Record<string, TabSlot[]> = {
  // Tier 4 — the owners and the admins. Overview, not floor work: the order
  // book on one side, the money on the other.
  director: [SLOTS.dashboard, SLOTS.production, SLOTS.chat, SLOTS.finance],
  developer: [SLOTS.dashboard, SLOTS.production, SLOTS.chat, SLOTS.finance],
  'system-admin': [SLOTS.dashboard, SLOTS.production, SLOTS.chat, SLOTS.finance],

  // The floor: production and what feeds it.
  'operations-head': [SLOTS.dashboard, SLOTS.production, SLOTS.chat, SLOTS.inventory],
  // `operations-intern` is labelled "Operations Manager" live — Anmol.
  'operations-intern': [SLOTS.dashboard, SLOTS.production, SLOTS.chat, SLOTS.inventory],
  'fashion-designer': [SLOTS.dashboard, SLOTS.production, SLOTS.chat, SLOTS.inventory],

  // Marketing Co-ordinator / Client Service — the only person outside the
  // content coordinators who edits Marketing, so it takes the slot the floor
  // roles give to Inventory. She holds no `orders` grant, so since the merge
  // the Production slot drops out of her bar — see `tabLayoutFor`.
  'marketing-coordinator': [SLOTS.dashboard, SLOTS.production, SLOTS.chat, SLOTS.marketing],

  // Money in, money out.
  accountant: [SLOTS.dashboard, SLOTS.finance, SLOTS.chat, SLOTS.billing],

  // Four slots: Marketing is the whole job, so nothing earns the second one.
  'content-coordinator': [SLOTS.dashboard, SLOTS.chat, SLOTS.marketing],
};

/**
 * No position on the session — the legacy Firebase path, or the dev role
 * switcher under mock auth. Fall back to the coarse role so the bar is still
 * sensible rather than empty.
 */
function byRole(role: Role | null): TabSlot[] {
  if (!role) return [SLOTS.dashboard, SLOTS.chat];
  if (ROLE_RANK[role] >= ROLE_RANK.uk_admin) {
    return [SLOTS.dashboard, SLOTS.production, SLOTS.chat, SLOTS.finance];
  }
  if (role === 'nepal_admin') return [SLOTS.dashboard, SLOTS.production, SLOTS.chat, SLOTS.inventory];
  return [SLOTS.dashboard, SLOTS.tasks, SLOTS.chat];
}

/**
 * The bar for this person, More appended. Callers still have to drop any slot
 * the profile can't view — see `custom-tab-bar`.
 *
 * Since Production and the order book merged onto one `order-management`
 * screen, a position holding `production` but not `orders` (fashion-designer,
 * marketing-coordinator, content-coordinator in the live matrix) loses that
 * button with nothing in its place — RLS would refuse the `orders` read
 * anyway. Granting those positions the `orders` section restores it.
 */
export function tabLayoutFor(positionId: string | undefined, role: Role | null): TabSlot[] {
  const slots = (positionId && BY_POSITION[positionId]) || byRole(role);
  return [...slots, MORE_SLOT];
}

/** Every section that appears in some layout — used to build the dashboard's quick links. */
export const TAB_SECTIONS: SectionId[] = Object.values(SLOTS).map((s) => s.section);
