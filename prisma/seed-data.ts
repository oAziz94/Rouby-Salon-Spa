/**
 * Permission keys and role grants aligned with /docs/RBAC_MATRIX.md (dashboard).
 * Module = stable prefix for grouping (first path segment of key, except dotted sub-keys stay under parent module).
 */

export const PERMISSION_SEED_ROWS: Array<{
  key: string;
  module: string;
  description: string;
}> = [
  { key: "overview.read", module: "overview", description: "View dashboard overview widgets" },

  { key: "bookings.read", module: "bookings", description: "List/filter/view bookings" },
  { key: "bookings.create", module: "bookings", description: "Create manual booking" },
  { key: "bookings.update", module: "bookings", description: "Edit booking fields" },
  { key: "bookings.confirm", module: "bookings", description: "Confirm pending booking" },
  { key: "bookings.reject", module: "bookings", description: "Reject pending booking" },
  { key: "bookings.cancel", module: "bookings", description: "Cancel booking" },
  { key: "bookings.reschedule", module: "bookings", description: "Reschedule booking" },
  {
    key: "bookings.status.progress",
    module: "bookings",
    description: "Mark arrived / in progress / completed / no-show / follow-up",
  },
  { key: "bookings.discount.apply", module: "bookings", description: "Apply manual discount" },

  { key: "slots.read", module: "slots", description: "View slots / calendar slot layer" },
  { key: "slots.create", module: "slots", description: "Create slots" },
  { key: "slots.update", module: "slots", description: "Edit slot times, notes, online bookable" },
  { key: "slots.capacity.configure", module: "slots", description: "Configure slot capacity" },
  { key: "slots.status.manage", module: "slots", description: "Manage slot status" },
  { key: "slots.delete", module: "slots", description: "Remove slot row" },

  { key: "clients.read", module: "clients", description: "View client list/profile" },
  { key: "clients.create", module: "clients", description: "Create client record" },
  { key: "clients.update", module: "clients", description: "Edit client demographics" },
  { key: "clients.contact.view", module: "clients", description: "View phone/email" },
  { key: "clients.notes.sensitive", module: "clients", description: "View/edit sensitive notes" },

  { key: "services.categories.manage", module: "services", description: "CRUD service categories" },
  { key: "services.manage", module: "services", description: "CRUD services" },
  { key: "services.read", module: "services", description: "View catalog for operations" },

  { key: "service_variants.manage", module: "service_variants", description: "CRUD variants" },
  { key: "service_variants.read", module: "service_variants", description: "View variants" },

  { key: "packages.manage", module: "packages", description: "CRUD packages" },
  { key: "packages.read", module: "packages", description: "View packages" },

  { key: "bundles.manage", module: "bundles", description: "CRUD bundles" },
  { key: "bundles.read", module: "bundles", description: "View bundles" },

  { key: "offers.read", module: "offers", description: "View offers" },
  { key: "offers.manage", module: "offers", description: "CRUD offers" },

  { key: "staff.manage", module: "staff", description: "CRUD staff" },
  { key: "staff.schedules.read", module: "staff", description: "View staff schedules" },
  { key: "staff.schedules.manage", module: "staff", description: "Manage branch staff schedules" },

  { key: "branches.manage", module: "branches", description: "CRUD branches" },
  { key: "branches.read", module: "branches", description: "View branch directory" },

  { key: "payments.read", module: "payments", description: "View payments" },
  { key: "payments.record", module: "payments", description: "Record payments" },
  { key: "payments.record_simple", module: "payments", description: "Simple payment status" },
  { key: "payments.refund", module: "payments", description: "Refund / adjust" },

  { key: "invoices.read", module: "invoices", description: "View invoices" },
  { key: "invoices.create_finalize", module: "invoices", description: "Create/finalize invoices" },
  { key: "invoices.edit", module: "invoices", description: "Edit invoice" },

  { key: "vat.settings.manage", module: "vat", description: "Manage VAT settings" },
  { key: "vat.settings.read", module: "vat", description: "View VAT settings" },

  { key: "payments.policy.manage", module: "payments", description: "Manage payment/deposit policy" },
  { key: "payments.policy.read", module: "payments", description: "View payment policy" },

  { key: "whatsapp.templates.manage", module: "whatsapp", description: "CRUD WhatsApp templates" },
  { key: "whatsapp.send", module: "whatsapp", description: "Generate WhatsApp deep links" },

  { key: "gallery.manage", module: "gallery", description: "CRUD gallery" },
  { key: "gallery.read", module: "gallery", description: "View gallery admin" },

  { key: "reviews.manage", module: "reviews", description: "Manage reviews" },
  { key: "reviews.read", module: "reviews", description: "View review queue" },

  { key: "content.manage", module: "content", description: "Manage CMS site content" },
  { key: "content.read", module: "content", description: "View CMS" },

  { key: "reports.view", module: "reports", description: "Operational reports" },
  { key: "reports.view_financial", module: "reports", description: "Financial reports" },

  { key: "users.manage", module: "users", description: "Manage dashboard users" },
  { key: "users.read", module: "users", description: "List users" },

  { key: "roles.manage", module: "roles", description: "Assign roles/permissions" },
  { key: "roles.read", module: "roles", description: "View roles" },

  { key: "audit.read", module: "audit", description: "View audit logs" },

  { key: "settings.system.manage", module: "settings", description: "Manage global system settings" },
  { key: "settings.system.read", module: "settings", description: "Read global settings" },
  { key: "settings.branch.manage", module: "settings", description: "Manage branch operational settings" },
];

const ALL_KEYS = PERMISSION_SEED_ROWS.map((p) => p.key);

/** Owner: full matrix (all keys). */
export const OWNER_PERMISSION_KEYS = [...ALL_KEYS];

/** Admin: matrix §3 — no users/roles/audit; no branches.manage; no staff.schedules.manage; no settings.system.manage / settings.branch.manage */
const ADMIN_EXCLUDED = new Set([
  "users.manage",
  "users.read",
  "roles.manage",
  "roles.read",
  "audit.read",
  "settings.system.manage",
  "settings.branch.manage",
  "branches.manage",
  "staff.schedules.manage",
]);

export const ADMIN_PERMISSION_KEYS = ALL_KEYS.filter((k) => !ADMIN_EXCLUDED.has(k));

/** Branch Manager: branch-scoped operations per RBAC_MATRIX (Full/Branch/Read as documented). */
export const BRANCH_MANAGER_PERMISSION_KEYS = [
  "overview.read",
  "bookings.read",
  "bookings.create",
  "bookings.update",
  "bookings.confirm",
  "bookings.reject",
  "bookings.cancel",
  "bookings.reschedule",
  "bookings.status.progress",
  "bookings.discount.apply",
  "slots.read",
  "slots.create",
  "slots.update",
  "slots.capacity.configure",
  "slots.status.manage",
  "slots.delete",
  "clients.read",
  "clients.contact.view",
  "clients.notes.sensitive",
  "services.read",
  "service_variants.read",
  "packages.read",
  "bundles.read",
  "offers.read",
  "staff.schedules.read",
  "staff.schedules.manage",
  "branches.read",
  "payments.read",
  "payments.record",
  "payments.record_simple",
  "invoices.read",
  "whatsapp.send",
  "reports.view",
  "reports.view_financial",
  "settings.branch.manage",
];

/** Receptionist: daily ops; no client create/update; no sensitive notes; no discount; schedules read only. */
export const RECEPTIONIST_PERMISSION_KEYS = [
  "overview.read",
  "bookings.read",
  "bookings.create",
  "bookings.update",
  "bookings.confirm",
  "bookings.reject",
  "bookings.cancel",
  "bookings.reschedule",
  "bookings.status.progress",
  "slots.read",
  "slots.create",
  "slots.update",
  "slots.capacity.configure",
  "slots.status.manage",
  "slots.delete",
  "clients.read",
  "clients.contact.view",
  "services.read",
  "service_variants.read",
  "packages.read",
  "bundles.read",
  "offers.read",
  "staff.schedules.read",
  "branches.read",
  "payments.read",
  "payments.record_simple",
  "invoices.read",
  "whatsapp.send",
];

/** Specialist: limited Own-style keys for future booking assignment scope. */
export const SPECIALIST_PERMISSION_KEYS = [
  "overview.read",
  "bookings.read",
  "bookings.status.progress",
  "slots.read",
  "clients.read",
  "services.read",
  "service_variants.read",
  "packages.read",
  "bundles.read",
  "offers.read",
  "staff.schedules.read",
  "branches.read",
];

export const ROLE_SEEDS: Array<{
  name: string;
  description: string;
  level: number;
  permissionKeys: readonly string[];
}> = [
  { name: "Owner", description: "Full system access", level: 100, permissionKeys: OWNER_PERMISSION_KEYS },
  { name: "Admin", description: "Salon administrator", level: 80, permissionKeys: ADMIN_PERMISSION_KEYS },
  {
    name: "Branch Manager",
    description: "Branch operations and reports",
    level: 60,
    permissionKeys: BRANCH_MANAGER_PERMISSION_KEYS,
  },
  {
    name: "Receptionist",
    description: "Bookings, slots, front desk",
    level: 40,
    permissionKeys: RECEPTIONIST_PERMISSION_KEYS,
  },
  {
    name: "Specialist",
    description: "Assigned work, limited dashboard",
    level: 20,
    permissionKeys: SPECIALIST_PERMISSION_KEYS,
  },
];
