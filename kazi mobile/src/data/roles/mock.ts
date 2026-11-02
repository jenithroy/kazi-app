/**
 * Local-dev fallback, used only when `EXPO_PUBLIC_SUPABASE_URL` isn't set. A small spread of roles and people that exercises what the
 * screen does: a UK group and a Nepal group, a role that logs nothing by design, a role with no duties written up, the two
 * roles that are not jobs (left off the screen), and somebody who has left (not counted). Not real staff data.
 */
import { simulateLatency } from '@/data/mock/delay';

import type { Position, RolesPageData, StaffPerson } from './types';

const POSITIONS: Position[] = [
  { id: 'director', label: 'Director', tier: 4, description: 'Owns the business, sets strategy and reads what Kathmandu records.' },
  { id: 'operations-head', label: 'Operations Head', tier: 3, description: 'Oversees production, billing and the Kathmandu team.' },
  { id: 'operations-manager', label: 'Operations Manager', tier: 3, description: 'Runs the order pipeline day to day.' },
  { id: 'accountant', label: 'Accountant', tier: 3, description: 'Books, bills, payroll and VAT.' },
  { id: 'marketing-co-ordinator', label: 'Marketing Co-ordinator', tier: 2, description: null },
  { id: 'fashion-designer', label: 'Fashion Designer', tier: 2, description: 'Materials, tech packs and samples.' },
  { id: 'content-co-ordinator', label: 'Content Co-ordinator', tier: 2, description: null },
  { id: 'qc-inspector', label: 'QC Inspector', tier: 2, description: null },
  { id: 'system-admin', label: 'System Admin', tier: 4, description: 'Keeps the app running.' },
  { id: 'developer', label: 'Developer', tier: 4, description: 'Builds the app.' },
];

const person = (id: string, name: string, positionId: string, location: 'uk' | 'nepal', status = 'Active', hours: string | null = null): StaffPerson => ({
  id,
  name,
  positionId,
  status,
  location,
  email: `${name.split(' ')[0].toLowerCase()}@kazi.example`,
  hours,
});

const STAFF: StaffPerson[] = [
  person('p-finn', 'Finn', 'director', 'uk'),
  person('p-zen', 'Zen', 'director', 'uk'),
  person('p-wilson', 'Wilson Shah', 'operations-head', 'nepal', 'Active', '11:00–21:00'),
  person('p-anmol', 'Anmol Basnet', 'operations-manager', 'nepal', 'Active', '10:30–18:00'),
  person('p-deepa', 'Sunam Deepa', 'accountant', 'nepal'),
  person('p-monika', 'Monika Bhusal', 'marketing-co-ordinator', 'nepal', 'Active', '12:30–19:00'),
  person('p-sarbagya', 'Sarbagya Karki', 'content-co-ordinator', 'nepal'),
  person('p-priya', 'Priya Gurung', 'fashion-designer', 'nepal'),
  person('p-old', 'Hari Thapa', 'fashion-designer', 'nepal', 'Inactive'),
  person('p-admin', 'Admin', 'system-admin', 'nepal'),
  person('p-rishav', 'Rishav', 'developer', 'nepal'),
];

export async function fetchRolesPage(): Promise<RolesPageData> {
  await simulateLatency();
  return { positions: POSITIONS, staff: STAFF };
}
