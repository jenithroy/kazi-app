/**
 * The 5 roles from the reference app (`src/context/AuthContext.jsx`,
 * `PERMISSIONS.md`). Ordered by privilege — `ROLE_RANK` lets callers do
 * "at least a Nepal admin" checks without enumerating every role.
 */

export type Role = 'super_admin' | 'uk_admin' | 'nepal_admin' | 'nepal_staff' | 'employee';

export const ROLES: Role[] = ['super_admin', 'uk_admin', 'nepal_admin', 'nepal_staff', 'employee'];

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: 'Super admin',
  uk_admin: 'UK admin / director',
  nepal_admin: 'Nepal admin',
  nepal_staff: 'Nepal staff',
  employee: 'Employee',
};

/** Higher = more access. `>=` comparisons drive the coarse "admin or above" gates. */
export const ROLE_RANK: Record<Role, number> = {
  super_admin: 4,
  uk_admin: 3,
  nepal_admin: 2,
  nepal_staff: 1,
  employee: 0,
};

export function isAtLeast(role: Role, min: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}
