// Default permissions granted to nepal_admin users on first login
export const DEFAULT_NEPAL_ADMIN_PERMISSIONS = {
  tasks:      true,
  attendance: true,
  production: true,
  inventory:  true,
  qc:         true,
  billing:    true,
  employees:  true,
  budget:     true,
  finance: {
    expenses:     true,
    payroll:      true,
    purchases:    true,
    vatBills:     true,
    journal:      true,
    ledger:       true,
    pl:           true,
    balanceSheet: true,
    bank:         true,
  },
};

// Resolve the app role — always use appRole first, fall back to role
// (profile.role stores the job title e.g. "Director"; appRole stores "uk_admin")
function appRole(profile) {
  return profile?.appRole || profile?.role || "employee";
}

// Can the user edit the given section (tasks, attendance, production, etc.)
export function sectionCanEdit(profile, section) {
  if (!profile) return false;

  // Explicitly grant production edit access to Wilson, Anmol, and Anusha
  if (section === "production") {
    const nameLower = profile.name?.toLowerCase();
    const emailLower = profile.email?.toLowerCase();
    if (
      ["wilson", "anmol", "anusha"].includes(nameLower) ||
      ["wilsonshah98765@gmail.com", "basnetanamol21@gmail.com", "anushapantaa@gmail.com"].includes(emailLower)
    ) {
      return true;
    }
  }

  const role = appRole(profile);
  if (role === "super_admin") return true;
  if (role === "employee") return false;
  
  let perm = profile.permissions?.[section];
  if (perm === undefined && role === "nepal_admin") {
    perm = DEFAULT_NEPAL_ADMIN_PERMISSIONS[section];
  }
  const hasPerm = perm === true || (typeof perm === "object" && perm !== null);

  // uk_admin — read-only by default, but can edit tasks
  if (role === "uk_admin") {
    if (section === "tasks") return true;
    return hasPerm;
  }
  // nepal_admin — check granted permissions
  return hasPerm;
}

// Can the user see this nav section at all?
export function sectionVisible(profile, sectionKey) {
  if (!profile) return false;
  const role = appRole(profile);
  const NAV_BY_ROLE = {
    nepal_admin: ["dashboard","tasks","attendance","production","qc","inventory","finance","billing","content","employees","customers","messenger"],
    uk_admin:    ["dashboard","finance","production","billing","content","tasks","directors","customers","admin","messenger"],
    employee:    ["dashboard","tasks","attendance"],
    super_admin: ["dashboard","tasks","attendance","production","qc","inventory","finance","billing","content","employees","admin","directors","customers","messenger"],
  };
  const base = new Set(NAV_BY_ROLE[role] || []);
  if (base.has(sectionKey)) return true;
  // Per-user permission override (e.g. a uk_admin granted tasks access)
  let perm = profile.permissions?.[sectionKey];
  if (perm === undefined && role === "nepal_admin") {
    perm = DEFAULT_NEPAL_ADMIN_PERMISSIONS[sectionKey];
  }
  return perm === true || (typeof perm === "object" && perm !== null);
}

// Is a Finance tab visible (and editable) for this user?
export function financeTabAllowed(profile, tabKey) {
  if (!profile) return false;
  const role = appRole(profile);
  if (role === "super_admin") return true;
  if (role === "uk_admin") return true;   // UK admins see all finance tabs (read-only)
  if (role === "employee") return false;
  // nepal_admin
  let val = profile.permissions?.finance?.[tabKey];
  if (val === undefined) {
    val = DEFAULT_NEPAL_ADMIN_PERMISSIONS.finance?.[tabKey];
  }
  return val === true;
}

// Map Finance tab labels → permission keys
export const FINANCE_TAB_KEYS = {
  "expenses":      "expenses",
  "payroll":       "payroll",
  "purchases":     "purchases",
  "vat bills":     "vatBills",
  "journal":       "journal",
  "ledger":        "ledger",
  "p&l":           "pl",
  "balance sheet": "balanceSheet",
  "bank":          "bank",
};
