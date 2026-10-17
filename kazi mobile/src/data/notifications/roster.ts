import { useQuery } from '@tanstack/react-query';
import { collection, getDocs , getDb } from '@/lib/supabase/collections';

import { ROLES, type Role } from '@/auth/roles';
import { roleFromTier } from '@/auth/session-shape';
import { TEAM_MEMBERS } from '@/auth/team-members';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { str } from '@/lib/data/normalise';

import { notificationKeys } from './keys';
import type { RosterMember } from './types';

const ROLE_SET = new Set<string>(ROLES);
function asRole(v: unknown, fallback: Role = 'employee'): Role {
  return typeof v === 'string' && ROLE_SET.has(v) ? (v as Role) : fallback;
}

interface RawEmployee {
  id?: unknown;
  code?: unknown;
  name?: unknown;
  email?: unknown;
  role?: unknown;
  appRole?: unknown;
  positionId?: unknown;
  location?: unknown;
  status?: unknown;
  reportsTo?: unknown;
}

/**
 * Everyone who could receive a notification: the live `employees` collection
 * (read-only, already used by the auth resolver) merged with the hard-coded
 * `TEAM_MEMBERS`. Deduped by email, inactive employees dropped. On any read
 * failure (rules, offline) it degrades to `TEAM_MEMBERS` alone.
 */
export async function fetchRoster(): Promise<RosterMember[]> {
  const byEmail = new Map<string, RosterMember>();

  if (isSupabaseConfigured) {
    try {
      // The live view has no `appRole`, and its `role` is the position LABEL
      // ("Director", "System Admin") — not one of `ROLES` — so the coarse role
      // has to be derived from the position's tier, exactly as the session does.
      const [snap, positions, leadsTab] = await Promise.all([
        getDocs(collection(getDb(), 'employees')),
        getSupabase().from('positions').select('id, tier'),
        getSupabase().from('position_messenger_tabs').select('position_id').eq('tab_id', 'leads').eq('can_view', true),
      ]);
      if (positions.error) throw positions.error;
      const tierByPosition = new Map<string, number>(
        ((positions.data ?? []) as { id: string; tier: number | null }[]).map((p) => [p.id, p.tier ?? 0]),
      );
      // Best-effort: this table lives in the web app's migration set, not
      // ours — if the read fails for any reason, nobody gets lead access
      // rather than the roster read failing outright.
      const leadPositions = new Set<string>(
        (leadsTab.error ? [] : ((leadsTab.data ?? []) as { position_id: string }[])).map((r) => r.position_id),
      );

      const raws: (RawEmployee & { _key: string })[] = snap.docs.map((d) => ({
        ...(d.data() as RawEmployee),
        _key: d.id,
      }));

      // reportsTo can be an employee id/code or already a name — resolve to a name.
      const nameByKey = new Map<string, string>();
      for (const r of raws) {
        const nm = str(r.name).trim();
        if (!nm) continue;
        nameByKey.set(r._key, nm);
        if (r.id != null) nameByKey.set(String(r.id), nm);
        if (r.code != null) nameByKey.set(String(r.code), nm);
      }

      for (const r of raws) {
        const email = str(r.email).trim().toLowerCase();
        const name = str(r.name).trim();
        if (!email || !name) continue;
        if (str(r.status).toLowerCase() === 'inactive') continue;
        const reports = r.reportsTo == null ? '' : String(r.reportsTo);
        const location = str(r.location).toLowerCase() === 'uk' ? 'uk' : 'nepal';
        const positionId = str(r.positionId).trim() || undefined;
        const tier = tierByPosition.get(str(r.positionId).trim());
        byEmail.set(email, {
          email,
          name,
          role: asRole(r.appRole, tier == null ? 'employee' : roleFromTier(tier, location)),
          location,
          managerName: nameByKey.get(reports) ?? (reports && !/^\d+$/.test(reports) ? reports : undefined),
          positionId,
          leadsAccess: !!positionId && leadPositions.has(positionId),
        });
      }
    } catch (err) {
      console.warn('[notifications] employees roster read failed — using TEAM_MEMBERS only', err);
    }
  }

  for (const m of TEAM_MEMBERS) {
    const email = m.email.toLowerCase();
    const live = byEmail.get(email);
    // The live position tier is the source of truth; this list only covers people
    // the roster read didn't return, so a stale pin can't drop someone from a rule.
    if (live) continue;
    byEmail.set(email, { email, name: m.name, role: m.appRole, location: m.location });
  }

  return [...byEmail.values()];
}

export function useRecipientRoster() {
  return useQuery({
    queryKey: notificationKeys.roster(),
    queryFn: fetchRoster,
    staleTime: 10 * 60 * 1000,
  });
}
