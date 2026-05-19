export const ROLES = {
  UK_ADMIN: "uk_admin",
  NEPAL_ADMIN: "nepal_admin",
  EMPLOYEE: "employee",
};

export const isAdmin = (role) => role === "uk_admin" || role === "nepal_admin";
export const canEdit = (role) => role === "nepal_admin";
export const isUKAdmin = (role) => role === "uk_admin";
export const isNepalAdmin = (role) => role === "nepal_admin";
export const isEmployee = (role) => role === "employee";
