import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BookOpenCheck,
  Boxes,
  Calendar,
  Clock,
  CreditCard,
  FileText,
  Image,
  LayoutDashboard,
  ListTodo,
  MessageCircle,
  Package,
  ScrollText,
  Settings,
  Sparkles,
  Star,
  Tag,
  Users,
  Wand2,
} from "lucide-react";

export type DashboardNavItem = {
  label: string;
  href: string;
  permission?: string;
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
        label: "Slots",
        href: "/dashboard/slots",
        permission: "slots.read",
        icon: Clock,
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
        icon: ListTodo,
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
        label: "Service Enhancements",
        href: "/dashboard/service-enhancements",
        permission: "service_enhancements.read",
        icon: Wand2,
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
        label: "Payments",
        href: "/dashboard/payments",
        permission: "payments.read",
        icon: CreditCard,
      },
      {
        label: "Invoices",
        href: "/dashboard/invoices",
        permission: "invoices.read",
        icon: FileText,
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
        permission: "whatsapp.send",
        icon: MessageCircle,
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
        label: "Reports",
        href: "/dashboard/reports",
        permission: "reports.view",
        icon: BarChart3,
      },
      {
        label: "Audit Logs",
        href: "/dashboard/audit-logs",
        permission: "audit.read",
        icon: ScrollText,
      },
    ],
  },
];

/** Flat list for resolving active label (same order as groups). */
export const DASHBOARD_NAV_ITEMS: DashboardNavItem[] = DASHBOARD_NAV_GROUPS.flatMap(
  (g) => g.items,
);
