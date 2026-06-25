// Default permissions granted to nepal_admin users on first login
export const DEFAULT_NEPAL_ADMIN_PERMISSIONS = {
  tasks:      true,
  attendance: true,
  production: true,
  inventory:  true,
  library:    true,
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
    orderPl:      true,
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

  // Explicitly grant tasks edit/add access to Anusha
  if (section === "tasks") {
    const nameLower = profile.name?.toLowerCase();
    const emailLower = profile.email?.toLowerCase();
    if (
      nameLower === "anusha" ||
      emailLower === "anushapantaa@gmail.com"
    ) {
      return true;
    }
  }

  // Check explicit override first (e.g. for employee overrides like Monika)
  let perm = profile.permissions?.[section];
  if (perm === false) return false;
  if (perm === true || (typeof perm === "object" && perm !== null)) {
    return true;
  }

  const role = appRole(profile);
  if (role === "super_admin") return true;
  if (role === "employee" || role === "nepal_staff") return false;
  
  if (perm === undefined && role === "nepal_admin") {
    perm = DEFAULT_NEPAL_ADMIN_PERMISSIONS[section];
  }
  const hasPerm = perm === true || (typeof perm === "object" && perm !== null);

  // uk_admin — read-only by default, but can edit tasks and library
  if (role === "uk_admin") {
    if (section === "tasks" || section === "library") return true;
    return hasPerm;
  }
  // nepal_admin — check granted permissions
  return hasPerm;
}

// Can the user see this nav section at all?
export function sectionVisible(profile, sectionKey) {
  if (!profile) return false;

  // Explicit override takes precedence
  let perm = profile.permissions?.[sectionKey];
  if (perm === false) return false;
  if (perm === true || (typeof perm === "object" && perm !== null)) return true;

  // Otherwise fall back to role default
  const role = appRole(profile);
  const NAV_BY_ROLE = {
    nepal_admin: ["dashboard","tasks","attendance","production","qc","inventory","finance","billing","content","employees","customers","messenger","library","sales"],
    uk_admin:    ["dashboard","finance","production","billing","content","tasks","directors","customers","admin","messenger","library","sales"],
    employee:    ["dashboard","tasks","attendance","library"],
    nepal_staff: ["dashboard","tasks","attendance","library","production","qc","inventory","content"],
    super_admin: ["dashboard","tasks","attendance","production","qc","inventory","finance","billing","content","employees","admin","directors","customers","messenger","library"],
  };
  const base = new Set(NAV_BY_ROLE[role] || []);
  return base.has(sectionKey);
}

// Is a Finance tab visible (and editable) for this user?
export function financeTabAllowed(profile, tabKey) {
  if (!profile) return false;

  // Explicit finance override takes precedence
  let val = profile.permissions?.finance?.[tabKey];
  if (val === false) return false;
  if (val === true) return true;

  const role = appRole(profile);
  if (role === "super_admin") return true;
  if (role === "uk_admin") return true;   // UK admins see all finance tabs (read-only)
  
  if (role === "employee" || role === "nepal_staff") return false;
  // nepal_admin
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
  "order p&l":     "orderPl",
};
