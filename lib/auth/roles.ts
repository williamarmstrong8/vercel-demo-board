// Canonical RBAC model shared by the server (authoritative) and the UI
// (presentation only). There is exactly one role hierarchy in the app and it
// lives here — do not redefine role ordering anywhere else.

export const ROLES = ["viewer", "editor", "admin"] as const
export type Role = (typeof ROLES)[number]

export const DEFAULT_ROLE: Role = "viewer"

// Hierarchical rank. admin ⊇ editor ⊇ viewer, so a numeric rank lets us express
// "at least this role" with a single comparison.
const RANK: Record<Role, number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value)
}

// Coerce an unknown/legacy value into a valid role, defaulting to viewer. Used
// when reading role off a session where the type is widened to string.
export function normalizeRole(value: unknown): Role {
  return isRole(value) ? value : DEFAULT_ROLE
}

// True when `role` satisfies the `min` requirement (equal or higher rank).
export function roleAtLeast(role: Role, min: Role): boolean {
  return RANK[role] >= RANK[min]
}

// --- Capability helpers (single source of truth for the UI + actions) -----
// Prefer these named checks over scattering roleAtLeast() calls, so intent is
// obvious at every call site.
export const can = {
  // Create / edit / delete their own boards, publish to the library.
  editBoards: (role: Role) => roleAtLeast(role, "editor"),
  // Manage the allowlist: view all users and change roles.
  manageUsers: (role: Role) => roleAtLeast(role, "admin"),
}

export const ROLE_LABELS: Record<Role, string> = {
  viewer: "Viewer",
  editor: "Editor",
  admin: "Admin",
}

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  viewer: "Read-only. Can browse boards and the public library.",
  editor: "Can create, edit, and delete their own boards.",
  admin: "Full access, including managing user roles.",
}
