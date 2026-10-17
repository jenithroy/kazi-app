/**
 * Turning an identity into the `Session` the app renders.
 *
 * Lives on its own because both entry points need it: `sessionFromIdentity`
 * builds a Session straight from `me()`, and `minimalSession` — the degraded
 * one used when the identity lookup cannot be reached — reuses the same
 * initials and role derivation so the two can never drift apart.
 */

import type { Session } from './mock-auth';
import type { Role } from './roles';
import type { SupabaseIdentity } from './supabase-profile';

export function initialsFrom(name: string, email: string): string {
  const src = name.trim() || email.split('@')[0] || 'User';
  const parts = src.split(/[.\-_\s]+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
  return letters || src.slice(0, 2).toUpperCase();
}

/**
 * The coarse legacy role, derived from the position's tier. Nothing gates on
 * it any more — RLS and the position matrix do — but a few screens still read
 * `appRole`, so it is kept consistent rather than left stale.
 */
export function roleFromTier(tier: number, location: 'nepal' | 'uk'): Role {
  if (tier >= 4) return 'super_admin';
  if (tier === 3) return location === 'uk' ? 'uk_admin' : 'nepal_admin';
  if (tier === 2) return 'nepal_admin';
  if (tier === 1) return 'nepal_staff';
  return 'employee';
}

/**
 * The barest session that still renders: a name, and no permission overrides —
 * which means the `employee` role default, not literally nothing. It is the
 * floor, used only when the database could not be reached to say who this is
 * AND no profile has ever resolved for this account (`real-auth.ts` otherwise
 * reuses the last one). Never for when it answered "nobody", which is a
 * sign-out, not a degraded profile.
 */
export function minimalSession(input: {
  uid: string;
  email?: string | null;
  displayName?: string | null;
}): Session {
  const email = (input.email ?? '').toLowerCase();
  const name = input.displayName || email || 'User';
  return {
    email,
    name,
    initials: initialsFrom(name, email),
    role: '',
    appRole: 'employee',
    jobRole: '',
    uid: input.uid,
    location: 'nepal',
    status: 'Active',
  };
}

/**
 * The preferred path: Postgres knows who this is and what their position
 * grants. `uid` is the Supabase auth user id — the
 * one when both sessions exist (older rows reference it), otherwise the
 * Supabase user id.
 */
export function sessionFromIdentity(
  identity: SupabaseIdentity,
  fallback: { uid: string; email?: string | null; displayName?: string | null },
): Session {
  const email = (identity.email || fallback.email || '').toLowerCase();
  const location = identity.location ?? 'nepal';
  const name = identity.fullName || fallback.displayName || email || 'User';
  return {
    email,
    name,
    initials: initialsFrom(name, email),
    role: identity.positionLabel ?? '',
    // admin@kazi.com is always super_admin (lock-out failsafe, ported from reference).
    appRole: email === 'admin@kazi.com' ? 'super_admin' : roleFromTier(identity.tier, location),
    jobRole: identity.positionLabel ?? '',
    positionId: identity.positionId ?? undefined,
    personId: identity.personId,
    permissions: identity.permissions,
    uid: fallback.uid,
    location,
    // An Inactive person resolves to no row at all, so we never get here.
    status: 'Active',
  };
}
