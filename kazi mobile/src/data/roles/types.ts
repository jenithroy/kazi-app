/**
 * What Roles & Duties reads: the roles (`positions`) and, when the staff directory can be read, the people in them.
 * Ported from the website's page (`src/pages/Roles.jsx`, `src/lib/rolesPage.js`).
 */

export interface Position {
  id: string;
  label: string;
  tier: number;
  description: string | null;
}

export interface StaffPerson {
  id: string;
  name: string;
  positionId: string | null;
  /** The directory's own word ("Active", "Inactive", …). */
  status: string;
  /** "uk" or "nepal" as the directory spells it, lower-cased; '' when it is not known. */
  location: string;
  /** The directory masks contact details for positions that may not see them: '' then. */
  email: string;
  /** "10:00–18:00" when the person has working hours saved, else null. */
  hours: string | null;
}

export interface RolesPageData {
  positions: Position[];
  /**
   * null when the directory could not be read: the roles and their duties still draw and the people are left out, the same
   * as on the website. (An empty list is a readable directory with nobody in it.)
   */
  staff: StaffPerson[] | null;
}

/** One thing a role is expected to log. */
export interface Duty {
  what: string;
  cadence: string;
  /** The website's id for the page where it is done; `DUTY_LINKS` says where that page is in this app. */
  section: string;
  detail: string;
}

export interface RoleGroup {
  key: 'uk' | 'nepal' | 'all';
  label: string;
  roles: Position[];
}
