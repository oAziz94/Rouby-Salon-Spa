export type DashboardNavItem = {
  label: string;
  href: string;
  permission?: string;
};

export const DASHBOARD_NAV_ITEMS: DashboardNavItem[] = [
  { label: "Overview", href: "/dashboard" },
  {
    label: "Calendar",
    href: "/dashboard/calendar",
    permission: "bookings.read",
  },
  {
    label: "Slots",
    href: "/dashboard/slots",
    permission: "slots.read",
  },
  {
    label: "Bookings",
    href: "/dashboard/bookings",
    permission: "bookings.read",
  },
  {
    label: "Change Requests",
    href: "/dashboard/booking-change-requests",
    permission: "bookings.read",
  },
  {
    label: "Clients",
    href: "/dashboard/clients",
    permission: "clients.read",
  },
  {
    label: "Services",
    href: "/dashboard/services",
    permission: "services.read",
  },
  {
    label: "Packages",
    href: "/dashboard/packages",
    permission: "packages.read",
  },
  {
    label: "Bundles",
    href: "/dashboard/bundles",
    permission: "bundles.read",
  },
  {
    label: "Offers",
    href: "/dashboard/offers",
    permission: "offers.read",
  },
  {
    label: "Payments",
    href: "/dashboard/payments",
    permission: "payments.read",
  },
  {
    label: "Invoices",
    href: "/dashboard/invoices",
    permission: "invoices.read",
  },
  {
    label: "Settings",
    href: "/dashboard/settings",
    permission: "settings.system.read",
  },
  {
    label: "WhatsApp Templates",
    href: "/dashboard/whatsapp-templates",
    permission: "whatsapp.send",
  },
  {
    label: "Gallery",
    href: "/dashboard/gallery",
    permission: "gallery.read",
  },
  {
    label: "Reviews",
    href: "/dashboard/reviews",
    permission: "reviews.read",
  },
  {
    label: "Reports",
    href: "/dashboard/reports",
    permission: "reports.view",
  },
  {
    label: "Audit Logs",
    href: "/dashboard/audit-logs",
    permission: "audit.read",
  },
];
