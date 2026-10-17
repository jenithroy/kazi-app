import AsyncStorage from '@react-native-async-storage/async-storage';

import { simulateLatency } from '@/data/mock/delay';

import { DEFAULT_NEPAL_ADMIN_PERMISSIONS, type PermissionOverrides } from './permissions';
import type { Role } from './roles';

// Explicitly namespaced "mock-*" key: this is a placeholder session store,
// not real credential storage. Swap for expo-secure-store + Firebase Auth
// once a real backend is wired up — nothing else in the app should need to
// change, since callers only see signIn/signOut/getSession below.
const SESSION_KEY = 'mock-auth-session';

export interface Session {
  email: string;
  name: string;
  initials: string;
  /** Legacy free-text job label kept for existing screens; RBAC uses `role`. */
  role: string;
  /** RBAC role (reference model). Drives nav filtering + edit gating. */
  appRole: Role;
  jobRole?: string;
  /** `positions.id` in Postgres — drives the per-position tab bar and dashboard. */
  positionId?: string;
  /** `people.id` in Postgres — the foreign key chat threads, members and messages are written against. */
  personId?: string;
  permissions?: PermissionOverrides;
  /** Supabase Auth user id — set on the real-auth path, absent under mock-auth. */
  uid?: string;
  /** `employees`/`users` location field — the Account screen shows Nepal / UK. */
  location?: 'nepal' | 'uk';
  /** `employees.status` — an `Inactive` account is blocked from `(app)`. */
  status?: 'Active' | 'Inactive';
  /** `users/{uid}.createdAt` as an AD ISO string — "member since" on Account. */
  createdAt?: string;
}

function deriveName(email: string): { name: string; initials: string } {
  const local = email.split('@')[0] ?? 'User';
  const parts = local.split(/[.\-_]/).filter(Boolean);
  const name = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ') || 'Sita Rai';
  const initials = parts
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('') || 'SR';
  return { name, initials };
}

/**
 * Stand-in for the reference's Auth → `employees` → `TEAM_MEMBERS` → `users/{uid}`
 * profile resolution: map a few known personas by email local-part, default the
 * rest to `nepal_staff`. Real resolution arrives with Firebase (plan §2.2).
 */
const PERSONA_ROLES: Record<string, Role> = {
  'sunam.deepa': 'nepal_admin', // accountant persona (finance overrides below)
  sunam: 'nepal_admin',
  admin: 'super_admin',
  director: 'uk_admin',
  uk: 'uk_admin',
  ops: 'nepal_admin',
  staff: 'nepal_staff',
};

function deriveRole(email: string): Role {
  const local = (email.split('@')[0] ?? '').toLowerCase();
  return PERSONA_ROLES[local] ?? 'nepal_staff';
}

/**
 * Mirrors the reference migration's one-time backfill: only a tier-4 super
 * admin starts with Leads granted, every other role stays locked out until
 * an admin grants it in Admin Panel (a real grant only exists in Postgres —
 * mock-auth has no such table, so this is the closest stand-in for testing).
 */
const SUPER_ADMIN_MESSENGER_TABS: PermissionOverrides['messengerTabs'] = {
  leads: { canView: true, canEdit: true },
};

function defaultPermissions(role: Role, email: string): PermissionOverrides | undefined {
  const local = (email.split('@')[0] ?? '').toLowerCase();
  if (role === 'super_admin') {
    return { messengerTabs: SUPER_ADMIN_MESSENGER_TABS };
  }
  if (role === 'nepal_admin' && (local.startsWith('sunam') || local === 'acct' || local === 'accounts')) {
    return DEFAULT_NEPAL_ADMIN_PERMISSIONS;
  }
  return undefined;
}

const JOB_LABEL: Record<Role, string> = {
  super_admin: 'Systems admin',
  uk_admin: 'Director · UK',
  nepal_admin: 'Nepal operations',
  nepal_staff: 'Floor supervisor · Line 3',
  employee: 'Line operator',
};

export async function getSession(): Promise<Session | null> {
  const raw = await AsyncStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as Partial<Session> & { email: string; name: string; initials: string; role: string };
  // Back-fill RBAC fields for sessions saved before this field existed.
  if (!parsed.appRole) {
    parsed.appRole = deriveRole(parsed.email);
    parsed.jobRole = parsed.role;
    parsed.permissions = defaultPermissions(parsed.appRole, parsed.email);
  }
  return parsed as Session;
}

export async function signIn(email: string, _password: string): Promise<Session> {
  await simulateLatency(1200);
  const clean = email.trim() || 'sita@kazi.com.np';
  const { name, initials } = deriveName(clean);
  const appRole = deriveRole(clean);
  const session: Session = {
    email: clean,
    name,
    initials,
    role: JOB_LABEL[appRole],
    appRole,
    jobRole: JOB_LABEL[appRole],
    permissions: defaultPermissions(appRole, clean),
  };
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export async function requestPasswordReset(_email: string): Promise<void> {
  await simulateLatency(1200);
}

export async function signOut(): Promise<void> {
  await AsyncStorage.removeItem(SESSION_KEY);
}

/** Dev-only: switch the signed-in session's RBAC role so the app is testable without real auth. */
export async function setDevRole(appRole: Role): Promise<Session | null> {
  const current = await getSession();
  if (!current) return null;
  const next: Session = {
    ...current,
    appRole,
    role: JOB_LABEL[appRole],
    jobRole: JOB_LABEL[appRole],
    permissions: defaultPermissions(appRole, current.email),
  };
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(next));
  return next;
}
