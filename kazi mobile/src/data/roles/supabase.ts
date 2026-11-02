/**
 * Live reader for Roles & Duties: the `positions` table and the staff directory (`fs_employees`).
 *
 * Both are readable by anyone signed in (`positions` through the `read_all` policy; the directory returns the whole roster and masks
 * only pay and contact details), and neither is written from here. The roles are needed, so a failed read of them throws. The
 * directory is read on its own and allowed to fail: the roles and their duties still draw, and the people are left out (`staff` is
 * null), the same as on the website.
 */
import { num, str } from '@/lib/data/normalise';
import { getSupabase } from '@/lib/supabase';

import type { Position, RolesPageData, StaffPerson } from './types';

type Row = Record<string, unknown>;

export async function fetchRolesPage(): Promise<RolesPageData> {
  const sb = getSupabase();
  const positionsRes = await sb.from('positions').select('id, label, tier, description');
  if (positionsRes.error) {
    const { message, code } = positionsRes.error;
    throw new Error(`positions: ${message}${code ? ` [${code}]` : ''}`);
  }
  const positions: Position[] = ((positionsRes.data ?? []) as Row[])
    .map((r) => ({
      id: str(r.id).trim(),
      label: str(r.label).trim(),
      tier: num(r.tier),
      description: str(r.description).trim() || null,
    }))
    .filter((p) => p.id && p.label);

  let staff: StaffPerson[] | null = null;
  const staffRes = await sb.from('fs_employees').select('*');
  if (!staffRes.error) {
    staff = ((staffRes.data ?? []) as Row[])
      .map((r) => ({
        id: str(r.id).trim(),
        name: str(r.name).trim(),
        positionId: str(r.positionId).trim() || null,
        status: str(r.status).trim(),
        location: str(r.location).trim().toLowerCase(),
        email: str(r.email).trim(),
        hours: str(r.scheduleStart).trim() && str(r.scheduleEnd).trim() ? `${str(r.scheduleStart).trim()}–${str(r.scheduleEnd).trim()}` : null,
      }))
      .filter((p) => p.id && p.name);
  }
  return { positions, staff };
}
