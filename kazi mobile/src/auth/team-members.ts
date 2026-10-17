/**
 * Known-staff identity table, ported verbatim from the reference app
 * (`src/constants.js` `TEAM_MEMBERS`).
 *
 * It no longer resolves profiles — identity comes from `me()` in Postgres. The
 * one live use left is `data/notifications/roster.ts`, which needs a name for a
 * recipient the notification rules mention but the roster read did not return.
 *
 * `role` is the free-text job title (reference stores it there); `appRole` is
 * the RBAC role. Match is case-insensitive on `email`.
 */

import type { Role } from './roles';

export interface TeamMember {
  name: string;
  /** Job title (display-only). */
  role: string;
  location: 'nepal' | 'uk';
  email: string;
  appRole: Role;
}

export const TEAM_MEMBERS: TeamMember[] = [
  // UK admins
  { name: 'Finn', role: 'Director', location: 'uk', email: 'finnqrk@gmail.com', appRole: 'uk_admin' },
  { name: 'Zen', role: 'Director', location: 'uk', email: 'hi.zenuk@gmail.com', appRole: 'uk_admin' },
  // Nepal admins / staff
  { name: 'Wilson', role: 'Operations Head', location: 'nepal', email: 'wilsonshah98765@gmail.com', appRole: 'nepal_admin' },
  { name: 'Anmol', role: 'Operations Intern', location: 'nepal', email: 'basnetanamol21@gmail.com', appRole: 'nepal_staff' },
  { name: 'Monika', role: 'Marketing Co-ordinator', location: 'nepal', email: 'bhusal.monika14@gmail.com', appRole: 'nepal_staff' },
  { name: 'Sunam Deepa', role: 'Accountant', location: 'nepal', email: 'deepasunam581@gmail.com', appRole: 'nepal_staff' },
  { name: 'Admin', role: 'System Admin', location: 'nepal', email: 'admin@kazi.com', appRole: 'super_admin' },
  { name: 'Rishav', role: 'Developer', location: 'nepal', email: 'crrishav.business@gmail.com', appRole: 'super_admin' },
  { name: 'Sarbagya Karki', role: 'Content Editor', location: 'nepal', email: 'sarbagyakarkig8@gmail.com', appRole: 'nepal_staff' },
];
