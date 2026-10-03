import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BookOpenCheck,
  Boxes,
  Calendar,
  CalendarClock,
  CalendarX,
  ClipboardCheck,
  Clock,
  CreditCard,
  Bell,
  FileSearch,
  FileText,
  Image,
  LayoutDashboard,
  LayoutTemplate,
  ListChecks,
  ListOrdered,
  MessageCircle,
  Package,
  Plus,
  Settings,
  Shield,
  Sparkles,
  Star,
  Tag,
  Users,
  Wallet,
} from "lucide-react";

export type DashboardNavItem = {
  label: string;
  href: string;
  /** Single permission, or any one of these (OR). */
  permission?: string | string[];
  icon: LucideIcon;
};

export type DashboardNavGroup = {
  id: string;
  label: string;
  items: DashboardNavItem[];
};

export const DASHBOARD_NAV_GROUPS: DashboardNavGroup[] = [
  {
    id: "main",
    label: "Main",
    items: [{ label: "Overview", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    id: "operations",
    label: "Operations",
    items: [
      {
        label: "Calendar",
        href: "/dashboard/calendar",
        permission: "bookings.read",
        icon: Calendar,
      },
      {
        label: "Queue",
        href: "/dashboard/queue",
        permission: "queue.read",
        icon: ListOrdered,
      },
      {
        label: "Bookings",
        href: "/dashboard/bookings",
        permission: "bookings.read",
        icon: BookOpenCheck,
      },
      {
        label: "Change Requests",
        href: "/dashboard/booking-change-requests",
        permission: "bookings.read",
        icon: ListChecks,
      },
    ],
  },
  {
    id: "scheduling_setup",
    label: "Scheduling setup",
    items: [
      {
        label: "Slots",
        href: "/dashboard/slots",
        permission: "slots.read",
        icon: Clock,
      },
      {
        label: "Staff Schedule",
        href: "/dashboard/staff-schedule",
        permission: "staff.read",
        icon: CalendarClock,
      },
      {
        label: "Holidays & Closures",
        href: "/dashboard/holidays-closures",
        permission: "slots.read",
        icon: CalendarX,
      },
    ],
  },
  {
    id: "customers",
    label: "Customers",
    items: [
      {
        label: "Clients",
        href: "/dashboard/clients",
        permission: "clients.read",
        icon: Users,
      },
      {
        label: "Loyalty",
        href: "/dashboard/loyalty",
        permission: "loyalty.read",
        icon: Star,
      },
    ],
  },
  {
    id: "catalog",
    label: "Catalog",
    items: [
      {
        label: "Services",
        href: "/dashboard/services",
        permission: "services.read",
        icon: Sparkles,
      },
      {
        label: "Add-ons",
        href: "/dashboard/service-enhancements",
        permission: "service_enhancements.read",
        icon: Plus,
      },
      {
        label: "Packages",
        href: "/dashboard/packages",
        permission: "packages.read",
        icon: Package,
      },
      {
        label: "Bundles",
        href: "/dashboard/bundles",
        permission: "bundles.read",
        icon: Boxes,
      },
      {
        label: "Offers",
        href: "/dashboard/offers",
        permission: "offers.read",
        icon: Tag,
      },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    items: [
      {
        label: "Invoices",
        href: "/dashboard/invoices",
        permission: "invoices.read",
        icon: FileText,
      },
      {
        label: "Payments",
        href: "/dashboard/payments",
        permission: "payments.read",
        icon: CreditCard,
      },
      {
        label: "Cash Drawer",
        href: "/dashboard/cash-drawer",
        permission: "cashDrawer.read",
        icon: Wallet,
      },
      {
        label: "Daily Closing",
        href: "/dashboard/daily-closing",
        permission: "dailyClosing.read",
        icon: ClipboardCheck,
      },
    ],
  },
  {
    id: "content",
    label: "Content",
    items: [
      {
        label: "Gallery",
        href: "/dashboard/gallery",
        permission: "gallery.read",
        icon: Image,
      },
      {
        label: "Reviews",
        href: "/dashboard/reviews",
        permission: "reviews.read",
        icon: Star,
      },
      {
        label: "WhatsApp Templates",
        href: "/dashboard/whatsapp-templates",
        permission: [
          "whatsapp.templates.read",
          "whatsapp.templates.manage",
          "whatsapp.send",
        ],
        icon: MessageCircle,
      },
      {
        label: "Website Content",
        href: "/dashboard/website-content",
        permission: "websiteContent.read",
        icon: LayoutTemplate,
      },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    items: [
      {
        label: "Reports",
        href: "/dashboard/reports",
        permission: "reports.view",
        icon: BarChart3,
      },
      {
        label: "Staff Services & Revenue",
        href: "/dashboard/reports/staff-services-revenue",
        permission: "reports.view",
        icon: Users,
      },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    items: [
      {
        label: "Settings",
        href: "/dashboard/settings",
        permission: "settings.system.read",
        icon: Settings,
      },
      {
        label: "Users & Roles",
        href: "/dashboard/users-roles",
        permission: "users.read",
        icon: Shield,
      },
      {
        label: "Notification Logs",
        href: "/dashboard/notification-logs",
        permission: "notifications.read",
        icon: Bell,
      },
      {
        label: "Audit Logs",
        href: "/dashboard/audit-logs",
        permission: "audit.read",
        icon: FileSearch,
      },
    ],
  },
];

/** Flat list for resolving active label (same order as groups). */
export const DASHBOARD_NAV_ITEMS: DashboardNavItem[] = DASHBOARD_NAV_GROUPS.flatMap(
  (g) => g.items,
);
