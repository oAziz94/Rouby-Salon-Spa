export type DashboardLoginUser = {
  id: string;
  name: string;
  email: string;
  roleId: string;
  branchId: string | null;
};

export type DashboardLoginResponse = {
  accessToken: string;
  /** Access-token lifetime in seconds. */
  expiresIn: number;
  /** Opaque, rotated on every refresh. Older API builds may omit it. */
  refreshToken?: string;
  refreshExpiresIn?: number;
  user: DashboardLoginUser;
};

export type DashboardAuthMeResponse = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  roleId: string;
  roleName: string;
  branchId: string | null;
  staffId?: string | null;
};

export type PatchDashboardAuthProfileInput = {
  fullName?: string;
  phone?: string | null;
};

export type DashboardPermissionsResponse = {
  permissions: string[];
};

export type DashboardOverviewAppointment = {
  id: string;
  status: string;
  slot?: {
    date?: string;
    startTime?: string;
    endTime?: string;
  } | null;
  client?: {
    id: string;
    fullName: string;
  } | null;
};

export type DashboardOverviewActivity = {
  id?: string;
  action?: string;
  module?: string;
  entityId?: string;
  createdAt?: string;
  user?: {
    id?: string;
    name?: string;
    email?: string;
  } | null;
};

export type DashboardOverviewAttentionItem = {
  severity: "critical" | "warning" | "info";
  title: string;
  detail?: string;
  count?: number;
  href: string;
};

export type DashboardOverviewSchedulePreviewItem = {
  bookingId: string;
  slotId: string;
  slotDate: string;
  startTime: string;
  endTime: string;
  clientName: string | null;
  clientId: string | null;
  serviceSummary: string;
  status: string;
  source: string;
  paymentStatus: "UNPAID" | "PARTIALLY_PAID" | "PAID" | null;
};

export type DashboardOverviewTrendDay = {
  date: string;
  total: number;
  completed: number;
  cancelled: number;
  noShow: number;
};

export type DashboardOverviewRecentBookingRow = {
  bookingId: string;
  slotDate: string;
  startTime: string;
  clientName: string | null;
  serviceSummary: string;
  status: string;
  source: string;
  paymentStatus: string | null;
};

export type DashboardOverviewRecentClientRow = {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  createdAt: string;
  totalVisits: number;
  lastVisitDate: string | null;
  lastBookingAt: string | null;
};

export type DashboardOverviewRevenue = {
  paidToday: number;
  paidThisWeek: number;
  paidThisMonth: number;
  unpaidInvoicesTotal: number;
  unpaidToday: number;
  refundsToday: number;
  averageBookingValueMonth: number;
  paidShareMonth: number | null;
};

export type DashboardOverviewQueue = {
  waitingNow: number;
  inServiceNow: number;
  walkInsToday: number;
  servedToday: number;
  avgWaitMinutes: number | null;
  longestWaitMinutes: number | null;
  longestWaitingClientName: string | null;
  waitingOver20Minutes: number;
};

export type DashboardReportsOverviewResponse = {
  range?: { from: string | null; to: string | null };
  branchId?: string | null;
  meta?: {
    timezone?: string;
    todayYmd?: string;
    quickWeekStartYmd?: string;
    generatedAt?: string;
  };
  todayBookings?: number;
  pendingBookings?: number;
  confirmedBookings?: number;
  completedBookings?: number;
  cancelledBookings?: number;
  noShowBookings?: number;
  todayRevenue?: number;
  upcomingAppointments?: DashboardOverviewAppointment[];
  recentActivity?: DashboardOverviewActivity[];
  attention?: DashboardOverviewAttentionItem[];
  schedulePreview?: DashboardOverviewSchedulePreviewItem[];
  trends?: {
    last7Days: DashboardOverviewTrendDay[];
    last30Days: DashboardOverviewTrendDay[];
    monthToDate: DashboardOverviewTrendDay[];
  };
  revenue?: DashboardOverviewRevenue | null;
  queue?: DashboardOverviewQueue | null;
  recentBookings?: DashboardOverviewRecentBookingRow[];
  recentClients?: {
    newClientsThisWeek: number;
    returningClientsToday: number;
    rows: DashboardOverviewRecentClientRow[];
  } | null;
  websiteHealth?: {
    activeTestimonials: number | null;
    galleryImageCount: number | null;
    servicesMissingImages: number | null;
    packagesMissingImages: number | null;
    publishedWebsiteSections: number | null;
    draftWebsiteSections: number | null;
  };
  today?: {
    ymd: string;
    bookings: {
      total: number;
      pending: number;
      confirmed: number;
      completed: number;
      cancelled: number;
      noShow: number;
      rejected: number;
      completionRate: number;
    };
  };
  staffToday?: {
    supported: boolean;
    scheduledStaffToday?: number;
    availableNow?: number;
    busyNow?: number;
    offToday?: number;
    staffToday?: Array<{
      staffProfileId: string;
      displayName: string;
      status: "available" | "busy" | "off";
      /** In-progress lines currently in their processing window (stylist is free meanwhile). */
      processingNow?: number;
      scheduledStart?: string | null;
      scheduledEnd?: string | null;
      bookingsCountToday?: number;
      servicesCompletedToday?: number;
      servicesInProgressNow?: number;
      bookedMinutesToday?: number;
      scheduledMinutesToday?: number;
      workloadPercent?: number | null;
    }>;
    /** @deprecated legacy shape */
    items?: Array<Record<string, unknown>>;
  };
  [key: string]: unknown;
};

export type DashboardReportSectionResponse = {
  range?: { from: string | null; to: string | null };
  branchId?: string | null;
  currency?: "EGP" | string;
  [key: string]: unknown;
};

export type DashboardReportsQuery = {
  branchId?: string;
  dateFrom?: string;
  dateTo?: string;
  groupBy?: string;
};

export type FinancialReportAlert = {
  severity: "critical" | "warning" | "info";
  code: string;
  message: string;
  count?: number;
  amount?: number;
  actionHref?: string;
  actionLabel?: string;
};

export type RevenueTrendPoint = {
  date: string;
  invoiced: number;
  collected: number;
  outstanding: number;
};

export type PaymentMethodBreakdown = {
  method: string;
  amount: number;
  count: number;
  percentage: number;
};

export type OutstandingInvoiceSummary = {
  invoiceId: string;
  invoiceNumber: string;
  clientName: string;
  phone: string | null;
  total: number;
  paid: number;
  remaining: number;
  ageDays: number;
  status: "UNPAID" | "PARTIALLY_PAID" | "PAID";
};

export type SalesByItemSummary = {
  itemName: string;
  itemType: string;
  quantity: number;
  grossRevenue: number;
  discountAmount: number;
  netRevenue: number;
  averagePrice: number;
  revenueShare: number;
};

export type BranchPerformanceSummary = {
  branchId: string;
  branchName: string;
  grossInvoiced: number;
  collected: number;
  outstanding: number;
  invoiceCount: number;
  averageInvoiceValue: number;
  cashDifference: number;
  completedBookings: number;
  queueVisits: number;
};

export type DailyClosingStatusSummary = {
  date: string;
  branchId: string;
  branchName: string;
  status: "NOT_STARTED" | "DRAFT" | "CLOSED";
  grossSales: number;
  totalCollected: number;
  expectedCash: number;
  countedCash: number | null;
  cashDifference: number;
  closedBy: string | null;
  closedAt: string | null;
  dailyClosingId: string | null;
  cashDrawerId: string | null;
  drawerOpen: boolean;
};

export type CashDrawerReportSummary = {
  openingCashTotal: number;
  cashPayments: number;
  cashIn: number;
  cashOut: number;
  expectedCash: number;
  countedCash: number;
  cashDifference: number;
  openDrawersCount: number;
  closedDrawersCount: number;
  rows: Array<{
    date: string;
    branchName: string;
    status: string;
    openedBy: string;
    closedBy: string | null;
    expectedCash: number;
    countedCash: number;
    difference: number;
    cashDrawerId: string;
  }>;
};

export type ClientFinancialInsight = {
  clientId: string;
  clientName: string;
  phone: string | null;
  invoiceCount: number;
  totalSpent: number;
  outstanding: number;
  lastVisit: string | null;
  isNewClient: boolean;
};

export type CashierCollectionSummary = {
  userId: string;
  name: string;
  totalCollected: number;
  cashCollected: number;
  digitalCollected: number;
  paymentCount: number;
  averagePayment: number;
};

export type FinancialReportKpis = {
  grossInvoiced: number;
  totalCollected: number;
  outstandingBalance: number;
  paidInvoices: number;
  paidInvoicesRate: number;
  invoiceCount: number;
  averageInvoiceValue: number;
  cashDifference: number;
  previousPeriodGrossInvoiced: number;
};

export type DashboardFinancialReport = {
  range: { from: string; to: string };
  branchId: string | null;
  currency: string;
  kpis: FinancialReportKpis;
  alerts: FinancialReportAlert[];
  revenueTrend: RevenueTrendPoint[];
  paymentBreakdown: {
    methods: PaymentMethodBreakdown[];
    topPaymentMethod: string | null;
    cashTotal: number;
    nonCashTotal: number;
  };
  outstanding: {
    totalUnpaidAmount: number;
    unpaidInvoicesCount: number;
    partiallyPaidInvoicesCount: number;
    oldestUnpaidInvoice: OutstandingInvoiceSummary | null;
    largestUnpaidInvoice: OutstandingInvoiceSummary | null;
    invoices: OutstandingInvoiceSummary[];
  };
  salesByItem: SalesByItemSummary[];
  branchPerformance: BranchPerformanceSummary[];
  dailyClosingStatus: DailyClosingStatusSummary[];
  cashDrawerSummary: CashDrawerReportSummary;
  clientInsights: {
    topClientsByRevenue: ClientFinancialInsight[];
    clientsWithOutstanding: ClientFinancialInsight[];
    newClientsRevenue: number;
    repeatClientsRevenue: number;
  };
  cashierCollections: CashierCollectionSummary[];
  hasData: boolean;
};

export type StaffServicesRevenueSourceFilter = "all" | "booking" | "walkin";

export type StaffServicesRevenueQuery = DashboardReportsQuery & {
  staffId?: string;
  serviceId?: string;
  categoryId?: string;
  source?: StaffServicesRevenueSourceFilter;
  paymentStatus?: "UNPAID" | "PARTIALLY_PAID" | "PAID" | "REFUNDED" | "CANCELLED";
  invoiceStatus?: "FINALIZED" | "CANCELLED";
};

export type StaffServicesRevenueStaffRow = {
  staffId: string;
  staffName: string;
  servicesDone: number;
  totalRevenue: number;
  paidRevenue: number;
  pendingRevenue: number;
  averageServiceValue: number;
  topServiceName: string | null;
  bookingsCount: number;
  walkinsCount: number;
};

export type StaffServicesRevenueReport = {
  range: { from: string; to: string; timeZone: string };
  branchId: string | null;
  hasData: boolean;
  excludedCancelled: { servicesDone: number; totalRevenue: number };
  summary: {
    totalServicesDone: number;
    totalRevenue: number;
    paidRevenue: number;
    pendingRevenue: number;
    averageRevenuePerService: number;
    activeStaffCount: number;
    topStaffByRevenue: StaffServicesRevenueStaffRow | null;
    topStaffByServiceCount: StaffServicesRevenueStaffRow | null;
    highestAverageTicketStaff: StaffServicesRevenueStaffRow | null;
  };
  staffRows: StaffServicesRevenueStaffRow[];
  charts: {
    revenueByStaff: Array<{ staffId: string; staffName: string; revenue: number }>;
    servicesCountByStaff: Array<{ staffId: string; staffName: string; count: number }>;
    revenueTrendByDay: Array<{ date: string; revenue: number }>;
    serviceMixByStaff: Array<{
      staffId: string;
      staffName: string;
      services: Array<{ serviceName: string; count: number }>;
    }>;
  };
};

export type StaffServicesRevenueDetailReport = {
  staff: { staffId: string; staffName: string; branchId: string } | null;
  range: { from: string; to: string; timeZone: string };
  branchId: string | null;
  hasData: boolean;
  kpis: {
    servicesDone: number;
    totalRevenue: number;
    paidRevenue: number;
    pendingRevenue: number;
    averageServiceValue: number;
    mostPerformedService: string | null;
    bestRevenueService: string | null;
    totalClientsServed: number;
    repeatClientsInPeriod: number;
    repeatClientsFromHistory: number;
  };
  serviceBreakdown: Array<{
    serviceId: string | null;
    serviceName: string;
    count: number;
    totalRevenue: number;
    paidRevenue: number;
    averageValue: number;
  }>;
  dailyBreakdown: Array<{
    date: string;
    servicesDone: number;
    totalRevenue: number;
    paidRevenue: number;
  }>;
  charts: StaffServicesRevenueReport["charts"];
};

export type DashboardAuditLogSeverity = "INFO" | "WARNING" | "CRITICAL";

export type DashboardAuditLogActor = {
  id: string | null;
  name: string;
  email: string | null;
  isSystem: boolean;
};

export type DashboardAuditLogBranch = {
  id: string;
  name: string | null;
};

export type DashboardAuditLogTarget = {
  entityType: string | null;
  entityId: string | null;
  entityLabel: string | null;
};

export type DashboardAuditLogChange = {
  /** Human field name, e.g. "Payment method". */
  field: string;
  /** Formatted for reading ("EGP 300.00", "Yes"); empty when there was no value. */
  before: string;
  after: string;
};

export type DashboardAuditLogCategory =
  | "money"
  | "overrides"
  | "bookings"
  | "staff_users"
  | "settings";

export type DashboardAuditLogLinks = {
  bookingId: string | null;
  clientId: string | null;
  invoiceId: string | null;
};

export type DashboardAuditLogItem = {
  id: string;
  action: string;
  module: string;
  entityType?: string | null;
  entityId?: string | null;
  entityLabel?: string | null;
  branch?: DashboardAuditLogBranch | null;
  actor: DashboardAuditLogActor;
  severity: DashboardAuditLogSeverity;
  /** Short plain-language name, e.g. "Payment voided". */
  title: string;
  /** One sentence: who did what, to whom, with amounts and the reason. */
  summary: string;
  category: DashboardAuditLogCategory;
  /** A rule was bypassed (shown as an "Override" tag). */
  isOverride: boolean;
  reason: string | null;
  links: DashboardAuditLogLinks;
  previousValue?: unknown;
  newValue?: unknown;
  metadata?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
};

export type DashboardAuditLogsQuery = {
  search?: string;
  module?: string;
  action?: string;
  entityType?: string;
  userId?: string;
  branchId?: string;
  severity?: DashboardAuditLogSeverity;
  entityId?: string;
  category?: DashboardAuditLogCategory;
  overridesOnly?: boolean;
  bookingId?: string;
  clientId?: string;
  /** YYYY-MM-DD (a Cairo calendar day) or an ISO instant. */
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
};

export type DashboardAuditLogsResponse = {
  data: DashboardAuditLogItem[];
  meta: DashboardListMeta;
};

export type DashboardAuditLogDetail = DashboardAuditLogItem & {
  changes: DashboardAuditLogChange[];
  technical: {
    auditLogId: string;
    action: string;
    entityId: string | null;
    userId: string | null;
    branchId: string | null;
    bookingId: string | null;
    clientId: string | null;
    invoiceId: string | null;
  };
};

export type DashboardAuditLogFacets = {
  modules: string[];
  actions: string[];
  users: Array<{ id: string; name: string; email: string }>;
  branches: Array<{ id: string; name: string }>;
  severities: DashboardAuditLogSeverity[];
};

export type DashboardBranch = {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  whatsapp?: string;
  mapUrl?: string;
  isActive?: boolean;
};

export type DashboardBranchSummary = {
  id: string;
  name: string;
  address?: string;
};

export type DashboardUserBranchAccess = {
  branchId: string;
  branchName: string;
  address?: string;
  isDefault: boolean;
};

export type DashboardRole = {
  id: string;
  name: string;
  description: string | null;
  level: number;
  userCount?: number;
  isSystemRole: boolean;
};

export type DashboardPermissionGroup = {
  key: string;
  modules: Array<{
    moduleKey: string;
    operations: Partial<
      Record<
        | "read"
        | "create"
        | "update"
        | "deleteDeactivate"
        | "print"
        | "export"
        | "closeFinalize",
        boolean
      >
    >;
  }>;
};

export type DashboardRbacMatrix = {
  note: string;
  roles: Array<
    DashboardRole & {
      groups: DashboardPermissionGroup[];
      permissionKeys: string[];
    }
  >;
};

export type DashboardUser = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  role: Pick<DashboardRole, "id" | "name" | "description">;
  branchAccess: DashboardUserBranchAccess[];
  branchAccessCount?: number;
  branchAccessLabel?: string;
  defaultBranch: { branchId: string; branchName: string } | null;
  /**
   * Admin or Owner: login password if the user still uses the standard initial password;
   * otherwise null (password was changed and is not stored in readable form).
   */
  ownerPasswordPlaintext?: string | null;
};

export type DashboardUserDetail = DashboardUser & {
  permissions: string[];
  safetyWarning: string | null;
};

export type CreateDashboardUserInput = {
  fullName: string;
  email: string;
  phone?: string | null;
  roleId: string;
  branchIds: string[];
  defaultBranchId: string;
  isActive?: boolean;
};

export type UpdateDashboardUserInput = Partial<
  Omit<CreateDashboardUserInput, "branchIds" | "defaultBranchId">
> & {
  branchIds?: string[];
  defaultBranchId?: string;
};

export type DashboardUsersListResponse = {
  data: DashboardUser[];
  summary: {
    totalUsers: number;
    activeUsers: number;
    inactiveUsers: number;
    adminManagerUsers: number;
  };
  meta: DashboardListMeta;
};

export type DashboardSlotStatus =
  | "AVAILABLE"
  | "PENDING"
  | "FILLED"
  | "BLOCKED"
  | "CLOSED";

export type DashboardSlot = {
  id: string;
  branchId: string;
  date: string;
  startTime: string;
  endTime: string;
  capacity: number;
  bookedCount: number;
  /** Active bookings on this slot (excludes cancelled / rejected / completed / no-show). */
  liveBookingsCount: number;
  status: DashboardSlotStatus;
  isOnlineBookable: boolean;
  notes: string | null;
  createdByUserId: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DashboardListMeta = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  /** Present on `GET /dashboard/clients` when the API computes directory-wide booking coverage. */
  clientsWithBookingsCount?: number;
  /** Present on `GET /dashboard/service-enhancements` for Add-ons summary cards. */
  serviceEnhancementStats?: {
    totalMatchingFilters: number;
    activeMatchingFilters: number;
    avgPrice: number | null;
    avgDurationMinutes: number | null;
  };
  /** Present on `GET /dashboard/invoices` for finance summary cards. */
  invoiceSummary?: {
    totalInvoices: number;
    paidInvoices: number;
    partiallyPaidInvoices: number;
    unpaidInvoices: number;
    totalRevenue: number;
    totalPaid: number;
    totalOutstanding: number;
  };
};

export type DashboardSlotsListResponse = {
  data: DashboardSlot[];
  meta: DashboardListMeta;
};

export type DashboardBookingsListItem = {
  id: string;
  status: string;
  branchId: string;
  /** Branch display name when relation is loaded (dashboard list). */
  branchName?: string | null;
  slotId: string | null;
  slot?: {
    date: string;
    startTime: string;
    endTime: string;
  } | null;
  clientId: string;
  client?: {
    id: string;
    fullName: string;
    phone: string;
    email: string | null;
  } | null;
  source: string;
  totalAmount: number;
  currency: "EGP" | string;
  createdAt: string;
  itemsPreview?: Array<{ nameSnapshot: string; quantity: number }>;
  /** Short human-readable summary of line items for list rows. */
  servicesSummary?: string;
  /** Upcoming bookings only: services with no staff linked / working that day or time. */
  staffWarnings?: string[];
};

export type DashboardBookingsListResponse = {
  data: DashboardBookingsListItem[];
  meta: DashboardListMeta;
};

export type DashboardBookingDetail = {
  id: string;
  status: string;
  /** Upcoming bookings only: services with no staff linked / working that day or time. */
  staffWarnings?: string[];
  branchId: string;
  slotId: string;
  source: string;
  /** Present when API returns booking promo snapshot fields. */
  appliedPromoCode?: string | null;
  subtotal: number;
  discountAmount: number;
  discountReason?: string | null;
  vatRate: number;
  vatAmount: number;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  currency: "EGP" | string;
  clientNotes: string | null;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
  slot?: {
    date: string;
    startTime: string;
    endTime: string;
  };
  client?: {
    id: string;
    fullName: string;
    phone: string;
    email: string | null;
  };
  items: Array<{
    id: string;
    itemType: string;
    serviceId: string | null;
    serviceVariantId: string | null;
    packageId: string | null;
    bundleId: string | null;
    serviceEnhancementId: string | null;
    nameSnapshot: string;
    priceSnapshot: number;
    /** Discount on this line only (EGP for the whole line). */
    discountAmount?: number;
    discountReason?: string | null;
    durationMinutesSnapshot: number;
    quantity: number;
    lineMetadata: unknown;
    /** Resolved catalog service id for staff capability / availability (includes variant → parent service). */
    catalogServiceId?: string | null;
    lineStatus?: string;
    staffProfileId?: string | null;
    startedAt?: string | null;
    completedAt?: string | null;
    staffDisplayName?: string | null;
  }>;
  payments: Array<{
    id: string;
    bookingId: string;
    clientId: string;
    amount: number;
    method: string;
    status: string;
    reference: string | null;
    paidAt: string | null;
    createdByUserId: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  finalizedInvoice: {
    id: string;
    invoiceNumber: string;
    totalAmount: number;
    paidAmount: number;
    remainingAmount: number;
    status: string;
    paymentStatus: "UNPAID" | "PARTIALLY_PAID" | "PAID";
  } | null;
  /** Present when an operational queue row is WAITING or IN_SERVICE for this booking. */
  activeQueueEntryId?: string | null;
  linkedQueueEntry?: { id: string; status: string; source: string } | null;
};

export type DashboardQueueEntry = {
  id: string;
  branchId: string;
  bookingId: string | null;
  clientId: string | null;
  source: "BOOKING" | "WALK_IN";
  status: "WAITING" | "IN_SERVICE" | "COMPLETED" | "CANCELLED";
  clientNameSnapshot: string;
  clientPhoneSnapshot: string | null;
  serviceSummarySnapshot: string | null;
  itemsSnapshot: unknown;
  notes: string | null;
  checkedInAt: string;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdByUserId: string;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  waitingDurationSeconds: number | null;
  inServiceDurationSeconds: number | null;
  bookingSummary: {
    totalAmount: number | null;
  } | null;
  hasFinalizedInvoice: boolean;
  invoiceSummary: {
    invoiceId: string;
    invoiceNumber: string;
    status: string;
    totalAmount: number;
    paidAmount: number;
    remainingAmount: number;
    paymentStatus: "UNPAID" | "PARTIALLY_PAID" | "PAID";
    finalizedAt: string;
  } | null;
  paymentSummary: {
    isPaid: boolean;
    remainingAmount: number;
    lastPaymentMethod: string | null;
    lastPaymentAt: string | null;
  } | null;
  /** Service work lines of the linked booking (SERVICE / SERVICE_VARIANT only). */
  lines: Array<{
    id: string;
    name: string;
    lineStatus: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
    staffDisplayName: string | null;
  }>;
  assignedStaffNames: string[];
  serviceLineCounts: {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
  };
  allServiceLinesDone: boolean;
};

export type DashboardOverviewTodayResponse = {
  todayYmd: string;
  branchId: string | null;
  generatedAt: string;
  queue: {
    expected: number;
    waiting: number;
    inService: number;
    completed: number;
  };
  unpaidInvoicesToday: number;
  /** How far ahead bookable slots exist; `low` when under 7 days. */
  slotHorizon?: { lastSlotDate: string | null; daysAhead: number; low: boolean };
  /** WhatsApp delivery over the last 24 h; `down` = failures and no successes. */
  notifications?: {
    failed24h: number;
    sent24h: number;
    lastSentAt: string | null;
    lastFailedAt: string | null;
    down: boolean;
  };
  upcomingAppointments: DashboardOverviewAppointment[];
};

export type DashboardQueueListResponse = {
  data: DashboardQueueEntry[];
  meta: { date: string };
};

export type DashboardQueueListQuery = {
  date?: string;
  branchId?: string;
  status?: string;
};

export type DashboardBookingLineInput = {
  itemType:
    | "SERVICE"
    | "SERVICE_VARIANT"
    | "PACKAGE"
    | "BUNDLE"
    | "ADD_ON"
    | "SERVICE_ENHANCEMENT";
  serviceId?: string;
  serviceVariantId?: string;
  packageId?: string;
  bundleId?: string;
  serviceEnhancementId?: string;
  quantity?: number;
  selectedServiceIds?: string[];
  /** Dashboard / walk-in: required for contact/hidden/range-without-variant (and similar) when pricing from staff. */
  staffOverrideUnitPrice?: number;
  staffOverrideDurationMinutes?: number;
};

export type DashboardWalkInQueueInput = {
  branchId: string;
  /** When set, links a CRM client; snapshots come from that row (requires `clients.read`). */
  clientId?: string;
  /** Required when `clientId` is omitted. */
  clientName?: string;
  phone?: string;
  notes?: string;
  /** At least one catalog line (same shape as dashboard booking creation). */
  items: DashboardBookingLineInput[];
};

export type DashboardQueueAppendBookingItemsResponse = {
  queueEntry: DashboardQueueEntry;
  booking: {
    id: string;
    subtotal: number;
    totalAmount: number;
    itemCount: number;
  };
};

export type DashboardCreateBookingInput = {
  clientId: string;
  branchId: string;
  slotId: string;
  source:
    | "WEBSITE"
    | "DASHBOARD"
    | "WALK_IN"
    | "PHONE"
    | "WHATSAPP"
    | "INSTAGRAM"
    | "FACEBOOK";
  initialStatus?: string;
  clientNotes?: string;
  adminNotes?: string;
  /** Needed to book a slot that already started today, or a client already in this slot (SOFT). */
  overrideReason?: string;
  items: DashboardBookingLineInput[];
};

export type DashboardCreateBookingChangeRequestInput = {
  requestType: "CANCEL" | "RESCHEDULE";
  requestedSlotId?: string;
  reason?: string;
};

export type DashboardBookingChangeRequestCreated = {
  id: string;
  bookingId: string;
  clientId: string;
  requestType: string;
  requestedSlotId: string | null;
  reason: string | null;
  status: string;
  createdAt: string;
};

export type DashboardPayment = {
  id: string;
  bookingId: string;
  clientId: string;
  amount: number;
  method: string;
  status: string;
  reference: string | null;
  paidAt: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DashboardBookingPaymentsResponse = {
  bookingId: string;
  payments: DashboardPayment[];
};

/** Aggregates for the finance payments workspace (see GET /dashboard/payments). */
export type DashboardPaymentsListSummary = {
  totalCollected: number;
  cashCollected: number;
  cardDigitalCollected: number;
  outstandingBalance: number;
  paymentsTodayCount: number;
  paymentsTodayTotal: number;
  outstandingScope: "branch_finalized_invoices";
};

export type DashboardPaymentListRow = {
  paymentId: string;
  paymentReference: string;
  shortPaymentId: string;
  amount: number;
  method: string;
  status: string;
  notes: string | null;
  paidAt: string | null;
  recordedAt: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  invoiceTotal: number | null;
  invoicePaymentStatus: "UNPAID" | "PARTIALLY_PAID" | "PAID" | null;
  clientName: string;
  clientPhone: string;
  bookingId: string;
  bookingReference: string;
  bookingSource: string;
  bookingCreatedAt: string;
  bookingSlot: {
    date: string;
    startTime: string;
    endTime: string;
  } | null;
  branchName: string | null;
  branchId: string;
  cashierName: string | null;
};

export type DashboardPaymentsListResponse = {
  data: DashboardPaymentListRow[];
  meta: DashboardListMeta;
  summary: DashboardPaymentsListSummary;
};

export type DashboardPaymentsListQuery = {
  search?: string;
  method?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  branchId?: string;
  page?: number;
  pageSize?: number;
};

export type DashboardPaymentDetailResponse = {
  payment: {
    id: string;
    shortReference: string;
    amount: number;
    method: string;
    status: string;
    reference: string | null;
    notes: string | null;
    paidAt: string | null;
    createdAt: string;
    createdByUserId: string | null;
    cashierName: string | null;
  };
  invoice: {
    id: string;
    invoiceNumber: string;
    status: string;
    paymentStatus: "UNPAID" | "PARTIALLY_PAID" | "PAID";
    totalAmount: number;
    paidAmount: number;
    remainingAmount: number;
  } | null;
  client: {
    id: string;
    fullName: string;
    phone: string;
    email: string | null;
  };
  booking: {
    id: string;
    reference: string;
    source: string;
    createdAt: string;
    servicesSummary: string;
    slot: {
      date: string;
      startTime: string;
      endTime: string;
    } | null;
  };
  branch: {
    id: string;
    name: string | null;
  };
};

export type SimplePaymentAggregateStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID";

export type DashboardSimplePaymentStatusResponse = {
  bookingId: string;
  paymentStatus: SimplePaymentAggregateStatus;
  payments: DashboardPayment[];
};

export type CreateDashboardPaymentInput = {
  amount: number;
  method: string;
  status: string;
  reference?: string | null;
  paidAt?: string | null;
};

export type CreateDashboardInvoicePaymentInput = {
  amount: number;
  method: string;
  referenceNumber?: string;
  notes?: string;
};

export type UpdateDashboardPaymentInput = {
  amount?: number;
  method?: string;
  status?: string;
  reference?: string | null;
  paidAt?: string | null;
};

export type DashboardInvoiceLine = {
  id: string;
  sortOrder: number;
  itemType: string;
  serviceId: string | null;
  serviceVariantId: string | null;
  packageId: string | null;
  bundleId: string | null;
  serviceEnhancementId: string | null;
  nameSnapshot: string;
  priceSnapshot: number;
  /** Discount on this line only. */
  discountAmount?: number;
  durationMinutesSnapshot: number;
  quantity: number;
  lineMetadata: unknown;
};

export type DashboardInvoicePaymentStatus =
  | "UNPAID"
  | "PARTIALLY_PAID"
  | "PAID";

export type DashboardInvoiceBookingSummary = {
  id: string;
  reference: string;
  source: string;
  branchId: string;
  branchName: string | null;
  slot: {
    date: string;
    startTime: string;
    endTime: string;
  } | null;
};

export type DashboardInvoiceListItem = {
  id: string;
  invoiceNumber: string;
  bookingId: string;
  /** Short human-friendly booking reference (RB-XXXXXXXX). */
  bookingReference?: string;
  clientId: string;
  subtotal: number;
  discountAmount: number;
  discountReason?: string | null;
  vatRate: number;
  vatAmount: number;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: string;
  /** Derived payment aggregate status: UNPAID / PARTIALLY_PAID / PAID. */
  paymentStatus?: DashboardInvoicePaymentStatus;
  paymentMethod: string | null;
  currency: "EGP" | string;
  createdAt: string;
  updatedAt: string;
  /** Present on enriched list responses (preferred). */
  client?: {
    id: string;
    fullName: string;
    phone: string | null;
  };
  /** Present on enriched list responses (preferred). */
  booking?: DashboardInvoiceBookingSummary;
};

export type DashboardInvoicePaymentEntry = {
  id: string;
  method: string;
  amount: number;
  status: string;
  referenceNumber: string | null;
  paidAt: string;
  createdAt: string;
  cashierName: string | null;
};

export type DashboardInvoiceDetail = DashboardInvoiceListItem & {
  lines: DashboardInvoiceLine[];
  client?: {
    id: string;
    fullName: string;
    phone: string | null;
    email: string | null;
  };
  booking?: DashboardInvoiceBookingSummary & {
    createdAt: string;
    servicesSummary: string;
    itemCount: number;
  };
  branch?: {
    id: string;
    name: string | null;
  };
  payments?: DashboardInvoicePaymentEntry[];
  finalizedAt?: string;
  cashierName?: string | null;
};

export type DashboardInvoiceReceiptLine = {
  id: string;
  sortOrder: number;
  name: string;
  quantity: number;
  unitPrice: number;
  /** Discount on this line only; `lineTotal` is already net of it. */
  discountAmount?: number;
  lineTotal: number;
};

export type DashboardInvoiceReceiptPayment = {
  id: string;
  method: string;
  amount: number;
  referenceNumber: string | null;
  paidAt: string;
};

export type DashboardInvoiceReceipt = {
  invoice: {
    id: string;
    invoiceNumber: string;
    finalizedAt: string;
    paymentStatus: "UNPAID" | "PARTIALLY_PAID" | "PAID";
    status: string;
    cashierName: string | null;
  };
  branch: {
    id: string;
    salonName: string;
    name: string;
    address: string | null;
    phone: string | null;
  };
  booking: {
    id: string;
    reference: string;
    source: string;
  };
  queueEntry: {
    id: string;
    source: string;
  } | null;
  client: {
    id: string;
    name: string;
    phone: string | null;
  };
  lines: DashboardInvoiceReceiptLine[];
  payments: DashboardInvoiceReceiptPayment[];
  totals: {
    subtotal: number;
    discountAmount: number;
    vatAmount: number;
    totalAmount: number;
    paidAmount: number;
    remainingAmount: number;
  };
  taxLabel?: string;
  showVatOnInvoice?: boolean;
  showVatBreakdown?: boolean;
  showPaymentBreakdown?: boolean;
  /** Present only while the loyalty program is running. */
  loyalty?: {
    pointsEarnedThisVisit: number;
    pointsBalance: number;
    redeemBlockPoints: number;
    redeemBlockValue: number;
    visits: number;
    visitsForReward: number;
    visitsToNextReward: number;
    rewardsAvailable: number;
    rewardServiceName: string | null;
  } | null;
  receiptTitle?: string;
  receiptWidth?: "58mm" | "80mm" | string;
  footerMessage: string;
};

export type DashboardInvoicesListResponse = {
  data: DashboardInvoiceListItem[];
  meta: DashboardListMeta;
};

export type DashboardInvoicesListQuery = {
  branchId?: string;
  bookingId?: string;
  clientId?: string;
  dateFrom?: string;
  dateTo?: string;
  /** Free-text search across invoice number, client name/phone, and booking reference. */
  search?: string;
  /** Filter by derived payment status. */
  paymentStatus?: DashboardInvoicePaymentStatus;
  /** Filter by invoice status (FINALIZED / CANCELLED). */
  status?: "FINALIZED" | "CANCELLED";
  page?: number;
  pageSize?: number;
};

export type PatchDashboardInvoiceInput = {
  status?: "CANCELLED";
  paymentMethod?: string | null;
};

export type DashboardBookingsListQuery = {
  branchId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  clientId?: string;
  slotId?: string;
  /** Trimmed server-side; searches name, email, phone, booking id / reference fragment. */
  search?: string;
  page?: number;
  pageSize?: number;
};

export type DashboardSlotsListQuery = {
  page?: number;
  pageSize?: number;
  dateFrom?: string;
  dateTo?: string;
  status?: DashboardSlotStatus;
};

export type CreateDashboardSlotInput = {
  date: string;
  startTime: string;
  endTime: string;
  capacity: number;
  isOnlineBookable?: boolean;
  status?: DashboardSlotStatus;
  notes?: string;
};

export type PatchDashboardSlotInput = {
  date?: string;
  startTime?: string;
  endTime?: string;
  notes?: string;
};

export type DashboardWhatsappDeepLinkResponse = {
  url: string;
  displayText: string;
};

export type DashboardVatSettingsResponse = {
  vatEnabled: boolean;
  vatRatePercent?: number;
  taxLabel?: string;
  defaultVatRate: number;
  pricesIncludeVat: boolean;
  showVatOnInvoice: boolean;
  taxRegistrationNumber: string | null;
  defaultTimezone: string;
  defaultCurrency: string;
};

export type PatchDashboardVatSettingsInput = Partial<{
  vatEnabled: boolean;
  vatRatePercent: number;
  taxLabel: string;
  defaultVatRate: number;
  pricesIncludeVat: boolean;
  showVatOnInvoice: boolean;
  taxRegistrationNumber: string | null;
}>;

export type DashboardPaymentPolicyResponse = {
  paymentDepositPolicy: string;
  defaultTimezone: string;
  defaultCurrency: string;
};

export type PatchDashboardPaymentPolicyInput = {
  paymentDepositPolicy: string;
};

export type SlotGenerationBreakPeriodInput = {
  startTime: string;
  endTime: string;
};

/** Global slot generation defaults (SystemSettings.slot_generation_defaults). */
export type SlotGenerationDefaults = {
  schemaVersion: 1;
  /** 0 = Sunday … 6 = Saturday (UTC calendar day, same as slot `date` storage). */
  workingDays: number[];
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
  defaultCapacity: number;
  defaultOnlineBookable: boolean;
  breakPeriods: SlotGenerationBreakPeriodInput[];
};

export type BusinessIdentitySettings = {
  salonName: string;
  legalName: string | null;
  phone: string | null;
  whatsappNumber: string | null;
  email: string | null;
  address: string | null;
  instagramHandle: string | null;
  facebookPage: string | null;
};

export type VatSettings = {
  vatEnabled: boolean;
  vatRatePercent: number;
  taxLabel: string;
  showVatOnInvoice: boolean;
};

export type ReceiptSettings = {
  receiptTitle: string;
  receiptFooterMessage: string | null;
  receiptWidth: "58mm" | "80mm" | string;
  showSalonPhoneOnReceipt: boolean;
  showBranchAddressOnReceipt: boolean;
  showVatBreakdown: boolean;
  showPaymentBreakdown: boolean;
  showCashierName: boolean;
};

export type BranchSlotGenerationSettings = SlotGenerationDefaults;

export type DayCloseOpenItemsPolicy = "ALERT" | "BLOCK";

export type OperationsSettings = {
  /** ALERT: day can close with open visits/unpaid invoices if a reason is given. BLOCK: it cannot. */
  dayCloseOpenItemsPolicy: DayCloseOpenItemsPolicy;
  /** Largest discount (% of subtotal) reception may apply without a manager. */
  discountLimitPercentWithoutApproval: number;
};

export type DashboardSettings = {
  businessIdentity: BusinessIdentitySettings;
  defaultBranchId: string | null;
  vatSettings: VatSettings;
  receiptSettings: ReceiptSettings;
  operationsSettings?: OperationsSettings;
  branches: DashboardBranch[];
};

export type GenerateSlotsPayload = GenerateWeekSlotsInput & {
  branchId: string;
};

export type PatchSlotGenerationSettingsInput = Partial<{
  workingDays: number[];
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
  defaultCapacity: number;
  defaultOnlineBookable: boolean;
  breakPeriods: SlotGenerationBreakPeriodInput[];
}>;

export type GenerateWeekSlotsInput = PatchSlotGenerationSettingsInput & {
  weekStartDate: string;
};

export type GenerateWeekSlotsResponse = {
  createdCount: number;
  skippedCount: number;
  /** Existing empty `AVAILABLE` slots on the same grid had capacity / online flag refreshed from effective defaults. */
  alignedDefaultsCount: number;
  dateFrom: string;
  dateTo: string;
};

export type WhatsAppTemplateCategory =
  | "booking_confirmation"
  | "booking_reminder"
  | "booking_rescheduled"
  | "booking_cancelled"
  | "walk_in_created"
  | "queue_turn_reminder"
  | "visit_completed"
  | "invoice_created"
  | "payment_received"
  | "receipt_ready"
  | "appointment_follow_up"
  | "birthday_greeting"
  | "promotion_message"
  | "custom"
  | string;

export type WhatsAppTemplateLanguage = "ar" | "en";

export type DashboardWhatsAppTemplate = {
  id: string;
  name: string;
  templateKey: string;
  body: string;
  category: WhatsAppTemplateCategory;
  language: WhatsAppTemplateLanguage;
  description: string | null;
  sampleData: unknown;
  variables: unknown;
  isActive: boolean;
  metaTemplateName: string | null;
  metaTemplateStatus: string | null;
  requiresMetaApproval: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: { name: string } | null;
  updatedBy: { name: string } | null;
};

export type DashboardWhatsAppTemplateDetail = DashboardWhatsAppTemplate;

/** @deprecated Use DashboardWhatsAppTemplate */
export type DashboardWhatsappTemplate = DashboardWhatsAppTemplate;

export type DashboardWhatsAppTemplatesListMeta = {
  page: number;
  limit: number;
  total: number;
  stats: {
    total: number;
    active: number;
    arabic: number;
    inactive: number;
  };
  whatsappConfigured: boolean;
};

export type DashboardWhatsAppTemplatesResponse = {
  data: DashboardWhatsAppTemplate[];
  meta: DashboardWhatsAppTemplatesListMeta;
};

/** @deprecated Use DashboardWhatsAppTemplatesResponse */
export type DashboardWhatsappTemplatesResponse = DashboardWhatsAppTemplatesResponse;

export type DashboardWhatsAppTemplatePreview = {
  previewText: string;
  unknownVariables: string[];
  warnings: string[];
};

export type CreateWhatsAppTemplateInput = {
  name: string;
  templateKey: string;
  body: string;
  category: WhatsAppTemplateCategory;
  language: WhatsAppTemplateLanguage;
  description?: string | null;
  sampleData?: Record<string, string>;
  variables?: string[];
  isActive?: boolean;
  metaTemplateName?: string | null;
  metaTemplateStatus?: string | null;
  requiresMetaApproval?: boolean;
};

export type UpdateWhatsAppTemplateInput = Partial<{
  name: string;
  body: string;
  category: WhatsAppTemplateCategory;
  language: WhatsAppTemplateLanguage;
  description: string | null;
  sampleData: Record<string, string> | null;
  variables: string[];
  isActive: boolean;
  metaTemplateName: string | null;
  metaTemplateStatus: string | null;
  requiresMetaApproval: boolean;
}>;

export type ListDashboardWhatsAppTemplatesParams = {
  search?: string;
  category?: string;
  language?: "ar" | "en" | "all";
  isActive?: "all" | "true" | "false";
  page?: number;
  limit?: number;
};

export type DashboardBookingChangeRequestListItem = {
  id: string;
  bookingId: string;
  clientId: string;
  requestType: "CANCEL" | "RESCHEDULE" | string;
  requestedSlotId: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | string;
  reason: string | null;
  createdAt: string;
  booking: {
    id: string;
    branchId: string;
    status: string;
    slotId: string;
  };
  clientName: string;
  clientPhone: string;
  /** Cairo wall clock: date YYYY-MM-DD, times HH:mm. */
  currentSlot: DashboardChangeRequestSlotView | null;
  requestedSlot: DashboardChangeRequestSlotView | null;
};

export type DashboardChangeRequestSlotView = {
  date: string;
  startTime: string;
  endTime: string;
};

export type DashboardBookingChangeRequestsResponse = {
  data: DashboardBookingChangeRequestListItem[];
  meta: DashboardListMeta;
};

export type DashboardBookingChangeRequestDetail = {
  id: string;
  bookingId: string;
  clientId: string;
  requestType: "CANCEL" | "RESCHEDULE" | string;
  requestedSlotId: string | null;
  reason: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | string;
  handledByUserId: string | null;
  handledAt: string | null;
  createdAt: string;
  updatedAt: string;
  booking: {
    id: string;
    branchId: string;
    status: string;
    slotId: string;
    slot: {
      id: string;
      date: string;
      startTime: string;
      endTime: string;
    } | null;
    client: {
      id: string;
      fullName: string;
      phone: string;
      email: string | null;
    } | null;
  };
  requestedSlot: {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
  } | null;
};

export type DashboardClient = {
  id: string;
  fullName: string;
  phone?: string | null;
  email?: string | null;
  preferredBranchId?: string | null;
  /** Display name from `preferredBranch` relation (list/detail/create/update). */
  preferredBranchName?: string | null;
  /** Dashboard client list: booking stats scoped like the bookings list (per-user branch when applicable). */
  bookingCount?: number;
  completedBookingCount?: number;
  totalSpentCompleted?: number;
  lastBookingSlotDate?: string | null;
  lastBookingSlotStartTime?: string | null;
  notes?: string | null;
  allergiesOrWarnings?: string | null;
  tags?: string[] | null;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
};

export type DashboardClientsListResponse = {
  data: DashboardClient[];
  meta?: DashboardListMeta;
};

export type DashboardServiceCategory = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  currency: "EGP" | string;
};

export type DashboardService = {
  id: string;
  categoryId: string;
  name: string;
  nameAr?: string | null;
  searchAliases?: string[];
  description: string | null;
  shortDescription: string | null;
  imageMediaId: string | null;
  imageMedia: {
    id: string;
    url: string;
    title: string | null;
    altText: string | null;
  } | null;
  imageUrl: string | null;
  imageKey: string | null;
  imageAlt: string | null;
  displayOrder: number;
  isFeatured: boolean;
  badgeLabel: string | null;
  priceDisplayType: "FIXED" | "STARTS_FROM" | "RANGE" | "CONTACT" | string;
  basePrice: number | null;
  basePriceMax: number | null;
  durationMinutes: number | null;
  /** Minutes during which the stylist is free (colour developing); 0 = hands-on throughout. */
  processingMinutes?: number;
  processingStartsAfterMinutes?: number;
  isTaxable: boolean;
  bookingAvailability: boolean;
  preparationNotes: string | null;
  aftercareNotes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  currency: "EGP" | string;
  branchIds: string[];
  benefits: DashboardServiceBenefit[];
};

export type DashboardServiceBenefit = {
  id: string;
  label: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DashboardServiceVariant = {
  id: string;
  serviceId: string;
  name: string;
  nameAr?: string | null;
  searchAliases?: string[];
  description: string | null;
  price: number;
  durationMinutes: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  currency: "EGP" | string;
};

export type DashboardPackageFeature = {
  id: string;
  label: string;
  displayOrder: number;
  isActive: boolean;
};

export type DashboardPackage = {
  id: string;
  name: string;
  nameAr?: string | null;
  searchAliases?: string[];
  description: string | null;
  shortDescription: string | null;
  imageUrl: string | null;
  originalPrice: number;
  packagePrice: number;
  durationMinutes: number | null;
  startDate: string | null;
  endDate: string | null;
  isTaxable: boolean;
  isActive: boolean;
  isFeatured: boolean;
  badgeLabel: string | null;
  createdAt: string;
  updatedAt: string;
  currency: "EGP" | string;
  serviceIds: string[];
  branchIds: string[];
  features: DashboardPackageFeature[];
  /** True when this package would appear on the public catalog under current rules (active, dated, priced, staffed branches, etc.). Images are not required. */
  isPublicListingReady?: boolean;
};

export type DashboardBundle = {
  id: string;
  name: string;
  description: string | null;
  bundleType: "FIXED" | "FLEXIBLE" | "QUANTITY" | string;
  price: number;
  rules: Record<string, unknown> | null;
  selectableCount: number;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  currency: "EGP" | string;
  serviceIds: string[];
};

export type DashboardOffer = {
  id: string;
  name: string;
  description: string | null;
  offerCode: string | null;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT" | string;
  discountValue: number;
  startDate: string;
  endDate: string;
  usageLimit: number | null;
  perClientUsageLimit: number | null;
  minimumSpend: number | null;
  appliesTo: "ALL" | "SERVICES" | "PACKAGES";
  isActive: boolean;
  eligibilityRules: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  currency: "EGP" | string;
};

export type DashboardServiceEnhancement = {
  id: string;
  title: string;
  nameAr?: string | null;
  searchAliases?: string[];
  shortDescription: string | null;
  price: number | null;
  durationMinutes: number | null;
  imageUrl: string | null;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  currency: "EGP" | string;
};

export type DashboardMediaUploadResponse = {
  imageUrl: string;
  imageKey: string;
  originalName: string;
  size: number;
  mimeType: string;
};

export type DashboardGalleryUsageSummary = {
  usageCount: number;
  isUsed: boolean;
  badges: string[];
  hasAltText: boolean;
};

export type DashboardGalleryListItem = {
  id: string;
  url: string;
  imageUrl: string;
  title: string | null;
  altText: string | null;
  description: string | null;
  tags: string[];
  category: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  storageKey: string | null;
  originalName: string | null;
  isFeatured: boolean;
  displayOrder: number;
  isActive: boolean;
  libraryStatus: "ACTIVE" | "ARCHIVED";
  uploadedBy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  usageSummary: DashboardGalleryUsageSummary;
};

export type DashboardGalleryUsageRow = {
  id: string;
  usageType: string;
  label: string;
  entityType: string | null;
  entityId: string | null;
  sectionKey: string | null;
  isPrimary: boolean;
  routeHint: string | null;
};

export type DashboardGalleryAssetDetail = {
  asset: DashboardGalleryListItem;
  usages: DashboardGalleryUsageRow[];
};

export type DashboardGalleryStats = {
  totalImages: number;
  usedImages: number;
  unusedImages: number;
  serviceImages: number;
  homepageImages: number;
  mediaUsageRows: number;
  serviceUsageAttachments: number;
};

export type WebsiteContentSectionType =
  | "hero"
  | "textImage"
  | "featureList"
  | "cta"
  | "contactBlock"
  | "banner"
  | "richText"
  | string;

export type DashboardWebsiteContentSection = {
  id: string;
  key: string;
  page: string;
  sectionType: WebsiteContentSectionType;
  title: string | null;
  subtitle: string | null;
  body: string | null;
  eyebrow: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  secondaryCtaLabel: string | null;
  secondaryCtaHref: string | null;
  primaryGalleryItemId: string | null;
  secondaryGalleryItemId: string | null;
  primaryImagePreviewUrl: string | null;
  secondaryImagePreviewUrl: string | null;
  primaryImageTitle: string | null;
  secondaryImageTitle: string | null;
  content: unknown;
  isVisible: boolean;
  displayOrder: number;
  isRequired: boolean;
  updatedAt: string;
  updatedByName: string | null;
};

export type DashboardWebsiteContentStats = {
  totalSections: number;
  visibleSections: number;
  hiddenSections: number;
  sectionsMissingPrimaryImage: number;
  lastUpdatedAt: string | null;
};

export type DashboardWebsiteContentListResponse = {
  grouped: Record<string, DashboardWebsiteContentSection[]>;
  sections: DashboardWebsiteContentSection[];
  stats: DashboardWebsiteContentStats;
};

export type UpdateWebsiteContentSectionInput = {
  title?: string | null;
  subtitle?: string | null;
  body?: string | null;
  eyebrow?: string | null;
  ctaLabel?: string | null;
  ctaHref?: string | null;
  secondaryCtaLabel?: string | null;
  secondaryCtaHref?: string | null;
  primaryGalleryItemId?: string | null;
  secondaryGalleryItemId?: string | null;
  content?: Record<string, unknown> | null;
  isVisible?: boolean;
  displayOrder?: number;
};

export type ReorderWebsiteContentInput = {
  items: Array<{ id: string; displayOrder: number }>;
};

/** @deprecated Use DashboardGalleryListItem — kept for older imports */
export type DashboardGalleryItem = DashboardGalleryListItem;

export type DashboardReview = {
  id: string;
  clientId: string | null;
  bookingId: string | null;
  relatedServiceId: string | null;
  clientName: string | null;
  clientTitle: string | null;
  serviceName: string | null;
  branchId: string | null;
  branchName: string | null;
  displayClientName: string;
  rating: number;
  quote: string | null;
  status: string;
  isActive: boolean;
  showOnHomepage: boolean;
  displayOrder: number;
  source: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdByName: string | null;
  updatedByName: string | null;
  client?: { id: string; fullName: string } | null;
  booking?: { id: string; status: string } | null;
};

export type DashboardReviewDetail = DashboardReview;

export type DashboardReviewStats = {
  total: number;
  active: number;
  homepage: number;
  averageRating: number | null;
};

export type CreateDashboardReviewInput = {
  clientName: string;
  clientTitle?: string;
  source?: string;
  rating: number;
  quote: string;
  serviceName?: string;
  branchId?: string;
  isActive?: boolean;
  displayOrder?: number;
};

export type UpdateDashboardReviewInput = {
  clientName?: string;
  clientTitle?: string | null;
  source?: string | null;
  rating?: number;
  quote?: string;
  serviceName?: string | null;
  branchId?: string | null;
  isActive?: boolean;
  displayOrder?: number;
  status?: string;
};

export type UpdateReviewHomepageVisibilityInput = {
  showOnHomepage: boolean;
};

export type ReorderReviewsInput = {
  items: Array<{ id: string; displayOrder: number }>;
};

export class ApiClientError extends Error {
  statusCode: number;
  code?: string;
  /** SOFT rule refusal: the same request succeeds when sent with an override reason. */
  overridable: boolean;
  details?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number,
    code?: string,
    options?: { overridable?: boolean; details?: Record<string, unknown> },
  ) {
    super(message);
    this.name = "ApiClientError";
    this.statusCode = statusCode;
    this.code = code;
    this.overridable = options?.overridable ?? false;
    this.details = options?.details;
  }
}

function defaultApiBaseUrl(): string {
  return process.env.NODE_ENV === "production"
    ? ""
    : "http://localhost:4000/api/v1";
}

/** If env is only scheme+host (no path), assume the versioned API root. */
function ensureVersionedApiBase(trimmed: string): string {
  try {
    const u = new URL(trimmed);
    const path = u.pathname.replace(/\/+$/, "") || "";
    if (!path) {
      return `${trimmed}/api/v1`.replace(/\/+$/, "");
    }
  } catch {
    /* leave as-is */
  }
  return trimmed;
}

/**
 * Base URL for the HTTP API under `/api/v1` (no trailing slash).
 * In Next.js, set `NEXT_PUBLIC_API_URL`. On the server, `API_URL` may be used instead.
 */
export function getApiBaseUrl(): string {
  const raw =
    typeof process !== "undefined"
      ? (process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL)
      : undefined;
  const base = ensureVersionedApiBase((raw ?? defaultApiBaseUrl()).replace(/\/$/, ""));
  if (!base) {
    throw new Error(
      "NEXT_PUBLIC_API_URL (or API_URL for server-side calls) must be set in production.",
    );
  }
  return base;
}

/**
 * Absolute URL for a resource path under the versioned API root.
 * Examples: `apiUrl("/public/services")`, `apiUrl("public/services")`.
 */
export function apiUrl(resourcePath: string): string {
  const base = getApiBaseUrl();
  let path = resourcePath.trim();
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  if (path.startsWith("/api/v1")) {
    path = path.slice("/api/v1".length) || "/";
  }
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  return `${base}${path}`;
}

/** How long a single request may take before we give up (Render cold starts can take ~15s). */
export const API_TIMEOUT_MS = 25_000;
const NETWORK_RETRY_DELAY_MS = 700;

export function isNetworkError(error: unknown): boolean {
  return error instanceof ApiClientError && error.statusCode === 0;
}

/**
 * Silent session renewal. The dashboard registers a function that, given the access token a
 * request just failed with, returns a fresh one (or null when the session is really over).
 * `apiFetch` then repeats the request once with the new token, so a 30-minute access token
 * never interrupts the front desk. Concurrent 401s share one refresh call.
 */
type AccessTokenRefresher = (staleAccessToken: string) => Promise<string | null>;
let accessTokenRefresher: AccessTokenRefresher | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export function setDashboardAccessTokenRefresher(fn: AccessTokenRefresher | null): void {
  accessTokenRefresher = fn;
}

function bearerFrom(init?: RequestInit): string | null {
  if (!init?.headers) return null;
  const value = new Headers(init.headers).get("authorization");
  if (!value || !/^Bearer /i.test(value)) return null;
  return value.slice(7).trim() || null;
}

function withBearer(init: RequestInit | undefined, token: string): RequestInit {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return { ...init, headers };
}

async function refreshSharedAccessToken(stale: string): Promise<string | null> {
  if (!accessTokenRefresher) return null;
  if (!refreshInFlight) {
    refreshInFlight = accessTokenRefresher(stale).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

const AUTH_ENDPOINT_RE = /\/dashboard\/auth\/(login|refresh|logout)(\?|$)/;

/**
 * `fetch` for API calls with the behaviours every screen needs and none had:
 * - a timeout, so a hung request becomes an error instead of an endless spinner;
 * - network failures ("Failed to fetch", DNS, offline) become a plain-language
 *   `ApiClientError` with status 0 and code `NETWORK`;
 * - idempotent requests (GET/HEAD) are retried once after a short pause.
 */
export async function apiFetch(
  input: string,
  init?: RequestInit,
  options?: { timeoutMs?: number; retry?: boolean },
): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase();
  const retryAllowed = options?.retry ?? (method === "GET" || method === "HEAD");
  const timeoutMs = options?.timeoutMs ?? API_TIMEOUT_MS;

  const attempt = async (): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(input, { ...init, signal: init?.signal ?? controller.signal });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new ApiClientError(
          "The server took too long to answer. Please try again.",
          0,
          "TIMEOUT",
        );
      }
      throw new ApiClientError(
        "We couldn't reach the server. Check the internet connection and try again.",
        0,
        "NETWORK",
      );
    } finally {
      clearTimeout(timer);
    }
  };

  let response: Response;
  try {
    response = await attempt();
  } catch (error) {
    if (retryAllowed && isNetworkError(error) && (error as ApiClientError).code === "NETWORK") {
      await new Promise((resolve) => setTimeout(resolve, NETWORK_RETRY_DELAY_MS));
      response = await attempt();
    } else {
      throw error;
    }
  }

  if (response.status === 401 && accessTokenRefresher && !AUTH_ENDPOINT_RE.test(input)) {
    const stale = bearerFrom(init);
    if (stale) {
      const fresh = await refreshSharedAccessToken(stale);
      if (fresh && fresh !== stale) {
        const retryInit = withBearer(init, fresh);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          return await fetch(input, { ...retryInit, signal: retryInit.signal ?? controller.signal });
        } catch {
          return response;
        } finally {
          clearTimeout(timer);
        }
      }
    }
  }
  return response;
}

/**
 * POST /dashboard/auth/login (Sprint 1).
 * Caller handles token storage (e.g. sessionStorage).
 */
export async function postDashboardAuthLogin(
  email: string,
  password: string,
): Promise<DashboardLoginResponse> {
  const res = await apiFetch(apiUrl("/dashboard/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = (await res.json()) as unknown;
  if (!res.ok) {
    const msg =
      typeof body === "object" &&
      body !== null &&
      "message" in body &&
      typeof (body as { message: unknown }).message === "string"
        ? (body as { message: string }).message
        : `Login failed (${res.status})`;
    throw new Error(msg);
  }
  return body as DashboardLoginResponse;
}

/** POST /dashboard/auth/refresh — rotates the refresh token; the old one stops working. */
export async function postDashboardAuthRefresh(
  refreshToken: string,
): Promise<DashboardLoginResponse> {
  const res = await apiFetch(apiUrl("/dashboard/auth/refresh"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardLoginResponse;
}

/** POST /dashboard/auth/logout — revokes this session's refresh tokens. Best effort. */
export async function postDashboardAuthLogout(
  accessToken: string,
  refreshToken?: string | null,
): Promise<void> {
  try {
    await apiFetch(
      apiUrl("/dashboard/auth/logout"),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(refreshToken ? { refreshToken } : {}),
        // Survives the navigation to the login page that follows immediately.
        keepalive: true,
      },
      { timeoutMs: 5_000, retry: false },
    );
  } catch {
    // The client forgets the tokens regardless; the server copy expires on its own.
  }
}

/** Seconds until a JWT's `exp`, or null when it cannot be read. No signature check (display only). */
export function jwtSecondsToExpiry(token: string, now = Date.now()): number | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    if (typeof exp !== "number") return null;
    return Math.floor(exp - now / 1000);
  } catch {
    return null;
  }
}

async function parseApiError(res: Response): Promise<ApiClientError> {
  let message = `Request failed (${res.status})`;
  let code: string | undefined;
  let overridable = false;
  let details: Record<string, unknown> | undefined;

  try {
    const body = (await res.json()) as unknown;
    if (typeof body === "object" && body !== null) {
      const maybeMessage = (body as { message?: unknown }).message;
      const maybeCode = (body as { code?: unknown }).code;
      overridable = (body as { overridable?: unknown }).overridable === true;
      details = body as Record<string, unknown>;

      if (typeof maybeMessage === "string") {
        message = maybeMessage;
      } else if (Array.isArray(maybeMessage)) {
        message = maybeMessage.filter((v) => typeof v === "string").join(", ");
      }

      if (typeof maybeCode === "string") {
        code = maybeCode;
      }
    }
  } catch {
    // Ignore JSON parsing errors and keep fallback message.
  }

  const requestId =
    (details && typeof details.requestId === "string" ? details.requestId : null) ??
    res.headers.get("x-request-id");
  if (res.status >= 500 && (message === "Internal server error" || message.startsWith("Request failed"))) {
    message = `Something went wrong on our side. Please try again${requestId ? ` (reference ${requestId})` : ""}.`;
  } else if (res.status === 502 || res.status === 503 || res.status === 504) {
    if (message.startsWith("Request failed")) {
      message = "The server is starting up or busy. Please try again in a moment.";
    }
  }

  return new ApiClientError(message, res.status, code, {
    overridable,
    details: requestId ? { ...(details ?? {}), requestId } : details,
  });
}

export async function getDashboardAuthMe(
  accessToken: string,
): Promise<DashboardAuthMeResponse> {
  const res = await apiFetch(apiUrl("/dashboard/auth/me"), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw await parseApiError(res);
  }

  return (await res.json()) as DashboardAuthMeResponse;
}

export async function patchDashboardAuthProfile(
  accessToken: string,
  payload: PatchDashboardAuthProfileInput,
): Promise<DashboardAuthMeResponse> {
  return jsonMutation<DashboardAuthMeResponse>(
    accessToken,
    "/dashboard/auth/me",
    "PATCH",
    payload,
  );
}

export async function postDashboardAuthChangePassword(
  accessToken: string,
  payload: { currentPassword: string; newPassword: string },
): Promise<{ ok: true }> {
  return jsonMutation<{ ok: true }>(
    accessToken,
    "/dashboard/auth/me/password",
    "POST",
    payload,
  );
}

export async function getDashboardAuthPermissions(
  accessToken: string,
): Promise<DashboardPermissionsResponse> {
  const res = await apiFetch(apiUrl("/dashboard/auth/permissions"), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw await parseApiError(res);
  }

  return (await res.json()) as DashboardPermissionsResponse;
}

export type DashboardPickerCatalog = {
  branchId: string | null;
  generatedAt: string;
  categories: Array<{ id: string; name: string }>;
  services: Array<{
    id: string;
    categoryId: string;
    name: string;
    nameAr: string | null;
    searchAliases: string[];
    priceDisplayType: "FIXED" | "STARTS_FROM" | "RANGE" | "CONTACT" | "HIDDEN" | string;
    basePrice: number | null;
    basePriceMax: number | null;
    durationMinutes: number | null;
    isFeatured: boolean;
    bookingAvailability: boolean;
    branchIds: string[];
  }>;
  variants: Array<{
    id: string;
    serviceId: string;
    name: string;
    nameAr: string | null;
    searchAliases: string[];
    price: number;
    durationMinutes: number;
  }>;
  packages: Array<{
    id: string;
    name: string;
    nameAr: string | null;
    searchAliases: string[];
    price: number;
    durationMinutes: number | null;
    serviceIds: string[];
  }>;
  enhancements: Array<{
    id: string;
    name: string;
    nameAr: string | null;
    searchAliases: string[];
    price: number | null;
    durationMinutes: number | null;
  }>;
};

/** GET /dashboard/catalog/picker — one call with everything the treatment picker needs. */
export async function getDashboardPickerCatalog(
  accessToken: string,
  query: { branchId?: string } = {},
): Promise<DashboardPickerCatalog> {
  const res = await apiFetch(withQuery("/dashboard/catalog/picker", query), {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardPickerCatalog;
}

/** PATCH /dashboard/catalog/search-terms/:kind/:id — Arabic name + aliases (admin). */
export async function patchDashboardCatalogSearchTerms(
  accessToken: string,
  kind: "service" | "variant" | "package" | "enhancement",
  id: string,
  body: { nameAr?: string | null; searchAliases?: string[] },
): Promise<{ kind: string; id: string; nameAr: string | null; searchAliases: string[] }> {
  return jsonMutation(accessToken, `/dashboard/catalog/search-terms/${kind}/${id}`, "PATCH", body);
}

/** GET /dashboard/overview/today — light front-desk summary (needs `overview.read` only). */
export async function getDashboardOverviewToday(
  accessToken: string,
  query: { branchId?: string } = {},
): Promise<DashboardOverviewTodayResponse> {
  const res = await apiFetch(withQuery("/dashboard/overview/today", query), {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardOverviewTodayResponse;
}

export async function getDashboardReportsOverview(
  accessToken: string,
  query: DashboardReportsQuery = {},
): Promise<DashboardReportsOverviewResponse> {
  const res = await apiFetch(withQuery("/dashboard/reports/overview", query), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw await parseApiError(res);
  }

  return (await res.json()) as DashboardReportsOverviewResponse;
}

async function getDashboardReportSection(
  accessToken: string,
  resourcePath: string,
  query: DashboardReportsQuery = {},
): Promise<DashboardReportSectionResponse> {
  const res = await apiFetch(withQuery(resourcePath, query), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardReportSectionResponse;
}

function withQuery(
  resourcePath: string,
  query: Record<string, string | number | boolean | undefined>,
): string {
  const url = new URL(apiUrl(resourcePath));
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === "") {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export type DashboardStaffAvailabilityResponse = {
  branchId: string;
  serviceId: string;
  evaluatedAt: string;
  timezone: string;
  staff: Array<{
    staffProfileId: string;
    displayName: string;
    email: string | null;
    phone: string | null;
    status: string;
    reason?: string;
  }>;
};

export async function getDashboardStaffAvailability(
  accessToken: string,
  query: {
    branchId: string;
    serviceId: string;
    date?: string;
    startTime?: string;
    endTime?: string;
  },
): Promise<DashboardStaffAvailabilityResponse> {
  const res = await apiFetch(withQuery("/dashboard/staff/availability", query), {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardStaffAvailabilityResponse;
}

export async function postDashboardBookingServiceItemStart(
  accessToken: string,
  bookingId: string,
  itemId: string,
  body: { staffProfileId: string; overrideReason?: string },
): Promise<DashboardBookingDetail> {
  return jsonMutation<DashboardBookingDetail>(
    accessToken,
    `/dashboard/bookings/${bookingId}/service-items/${itemId}/start`,
    "POST",
    body,
  );
}

export async function postDashboardBookingServiceItemComplete(
  accessToken: string,
  bookingId: string,
  itemId: string,
): Promise<DashboardBookingDetail> {
  return jsonMutation<DashboardBookingDetail>(
    accessToken,
    `/dashboard/bookings/${bookingId}/service-items/${itemId}/complete`,
    "POST",
  );
}

export async function getDashboardStaffList(
  accessToken: string,
  branchId: string,
): Promise<{
  branchId: string;
  staffUsers: Array<{
    user: { id: string; name: string; email: string; phone: string | null; isActive: boolean };
    profile: {
      id: string;
      displayName: string;
      isBookable: boolean;
      isActive: boolean;
      servicesCount: number;
      schedulesCount: number;
    } | null;
  }>;
  profiles: Array<Record<string, unknown>>;
}> {
  const res = await apiFetch(withQuery("/dashboard/staff", { branchId }), {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as {
    branchId: string;
    staffUsers: Array<{
      user: { id: string; name: string; email: string; phone: string | null; isActive: boolean };
      profile: {
        id: string;
        displayName: string;
        isBookable: boolean;
        isActive: boolean;
        servicesCount: number;
        schedulesCount: number;
      } | null;
    }>;
    profiles: Array<Record<string, unknown>>;
  };
}

export type DashboardStaffScheduleDayInput = {
  dayOfWeek: number;
  isWorking: boolean;
  startTime?: string;
  endTime?: string;
  breakStartTime?: string | null;
  breakEndTime?: string | null;
};

export type DashboardStaffScheduleRow = {
  id: string;
  staffProfileId: string;
  branchId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  breakStartTime: string | null;
  breakEndTime: string | null;
  isWorking: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DashboardStaffExceptionType = "DAY_OFF" | "CUSTOM_HOURS" | "EXTRA_SHIFT";

export type DashboardStaffScheduleException = {
  id: string;
  staffProfileId: string;
  branchId: string;
  date: string;
  type: DashboardStaffExceptionType;
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DashboardStaffServiceCapability = {
  id: string;
  serviceId: string;
  serviceName: string;
  categoryId: string;
};

export async function postDashboardStaffProfile(
  accessToken: string,
  body: {
    userId: string;
    branchId: string;
    displayName: string;
    bio?: string;
    avatarImageId?: string;
    isBookable?: boolean;
    isActive?: boolean;
  },
): Promise<Record<string, unknown>> {
  return jsonMutation<Record<string, unknown>>(
    accessToken,
    "/dashboard/staff",
    "POST",
    body,
  );
}

export async function patchDashboardStaffProfile(
  accessToken: string,
  profileId: string,
  body: {
    displayName?: string;
    bio?: string | null;
    avatarImageId?: string | null;
    isBookable?: boolean;
    isActive?: boolean;
  },
): Promise<Record<string, unknown>> {
  return jsonMutation<Record<string, unknown>>(
    accessToken,
    `/dashboard/staff/${profileId}`,
    "PATCH",
    body,
  );
}

export async function deleteDashboardStaffProfile(
  accessToken: string,
  profileId: string,
): Promise<Record<string, unknown>> {
  return jsonMutation<Record<string, unknown>>(
    accessToken,
    `/dashboard/staff/${profileId}`,
    "DELETE",
  );
}

export async function getDashboardStaffServices(
  accessToken: string,
  profileId: string,
): Promise<DashboardStaffServiceCapability[]> {
  const res = await apiFetch(apiUrl(`/dashboard/staff/${profileId}/services`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardStaffServiceCapability[];
}

export async function putDashboardStaffServices(
  accessToken: string,
  profileId: string,
  body: { serviceIds: string[] },
): Promise<DashboardStaffServiceCapability[]> {
  return jsonPut<DashboardStaffServiceCapability[]>(
    accessToken,
    `/dashboard/staff/${profileId}/services`,
    body,
  );
}

export async function getDashboardStaffSchedule(
  accessToken: string,
  profileId: string,
): Promise<DashboardStaffScheduleRow[]> {
  const res = await apiFetch(apiUrl(`/dashboard/staff/${profileId}/schedule`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardStaffScheduleRow[];
}

export async function putDashboardStaffSchedule(
  accessToken: string,
  profileId: string,
  body: { days: DashboardStaffScheduleDayInput[] },
): Promise<DashboardStaffScheduleRow[]> {
  return jsonPut<DashboardStaffScheduleRow[]>(
    accessToken,
    `/dashboard/staff/${profileId}/schedule`,
    body,
  );
}

export async function getDashboardStaffExceptions(
  accessToken: string,
  profileId: string,
): Promise<DashboardStaffScheduleException[]> {
  const res = await apiFetch(apiUrl(`/dashboard/staff/${profileId}/exceptions`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardStaffScheduleException[];
}

export async function postDashboardStaffException(
  accessToken: string,
  profileId: string,
  body: {
    date: string;
    type: DashboardStaffExceptionType;
    startTime?: string | null;
    endTime?: string | null;
    reason?: string | null;
  },
): Promise<DashboardStaffScheduleException> {
  return jsonMutation<DashboardStaffScheduleException>(
    accessToken,
    `/dashboard/staff/${profileId}/exceptions`,
    "POST",
    body,
  );
}

export async function patchDashboardStaffException(
  accessToken: string,
  profileId: string,
  exceptionId: string,
  body: {
    date?: string;
    type?: DashboardStaffExceptionType;
    startTime?: string | null;
    endTime?: string | null;
    reason?: string | null;
  },
): Promise<DashboardStaffScheduleException> {
  return jsonMutation<DashboardStaffScheduleException>(
    accessToken,
    `/dashboard/staff/${profileId}/exceptions/${exceptionId}`,
    "PATCH",
    body,
  );
}

export async function deleteDashboardStaffException(
  accessToken: string,
  profileId: string,
  exceptionId: string,
): Promise<{ deleted: boolean }> {
  return jsonMutation<{ deleted: boolean }>(
    accessToken,
    `/dashboard/staff/${profileId}/exceptions/${exceptionId}`,
    "DELETE",
  );
}

/** Branch list changes rarely but every page asks for it; share one answer for a minute. */
const BRANCHES_CACHE_TTL_MS = 60_000;
let branchesCache: { token: string; until: number; promise: Promise<DashboardBranch[]> } | null = null;

export function invalidateDashboardBranchesCache(): void {
  branchesCache = null;
}

export async function getDashboardBranches(
  accessToken: string,
): Promise<DashboardBranch[]> {
  const now = Date.now();
  if (branchesCache && branchesCache.token === accessToken && branchesCache.until > now) {
    return branchesCache.promise;
  }
  const promise = (async () => {
    const res = await apiFetch(apiUrl("/dashboard/branches"), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw await parseApiError(res);
    }
    return (await res.json()) as DashboardBranch[];
  })();
  branchesCache = { token: accessToken, until: now + BRANCHES_CACHE_TTL_MS, promise };
  promise.catch(() => {
    branchesCache = null;
  });
  return promise;
}

export async function listDashboardBranches(
  accessToken: string,
): Promise<DashboardBranch[]> {
  return getDashboardBranches(accessToken);
}

export async function listDashboardUsers(
  accessToken: string,
  query: {
    page?: number;
    pageSize?: number;
    search?: string;
    roleId?: string;
    branchId?: string;
    status?: "all" | "active" | "inactive";
  } = {},
): Promise<DashboardUsersListResponse> {
  const res = await apiFetch(
    withQuery("/dashboard/users", {
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
      roleId: query.roleId,
      branchId: query.branchId,
      status: query.status,
    }),
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardUsersListResponse;
}

export async function getDashboardUser(
  accessToken: string,
  userId: string,
): Promise<DashboardUserDetail> {
  const res = await apiFetch(apiUrl(`/dashboard/users/${userId}`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardUserDetail;
}

export async function createDashboardUser(
  accessToken: string,
  payload: CreateDashboardUserInput,
): Promise<DashboardUser> {
  return jsonMutation<DashboardUser>(
    accessToken,
    "/dashboard/users",
    "POST",
    payload,
  );
}

export async function updateDashboardUser(
  accessToken: string,
  userId: string,
  payload: UpdateDashboardUserInput,
): Promise<DashboardUser> {
  return jsonMutation<DashboardUser>(
    accessToken,
    `/dashboard/users/${userId}`,
    "PATCH",
    payload,
  );
}

/** Owner or Admin: set a user’s dashboard password (requires `users.manage`). */
export async function postDashboardOwnerSetUserPassword(
  accessToken: string,
  userId: string,
  newPassword: string,
): Promise<{ id: string; ok: true }> {
  return jsonMutation<{ id: string; ok: true }>(
    accessToken,
    `/dashboard/users/${userId}/password`,
    "POST",
    { newPassword },
  );
}

export async function activateDashboardUser(
  accessToken: string,
  userId: string,
): Promise<{ id: string; isActive: boolean }> {
  return jsonMutation<{ id: string; isActive: boolean }>(
    accessToken,
    `/dashboard/users/${userId}/activate`,
    "POST",
  );
}

export async function deactivateDashboardUser(
  accessToken: string,
  userId: string,
): Promise<{ id: string; isActive: boolean }> {
  return jsonMutation<{ id: string; isActive: boolean }>(
    accessToken,
    `/dashboard/users/${userId}/deactivate`,
    "POST",
  );
}

export async function listDashboardRoles(
  accessToken: string,
): Promise<DashboardRole[]> {
  const res = await apiFetch(apiUrl("/dashboard/roles"), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardRole[];
}

export async function getDashboardRbacMatrix(
  accessToken: string,
): Promise<DashboardRbacMatrix> {
  const res = await apiFetch(apiUrl("/dashboard/rbac-matrix"), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardRbacMatrix;
}

export async function createDashboardBranch(
  accessToken: string,
  payload: {
    name: string;
    address?: string;
    phone?: string;
    whatsapp?: string;
    mapUrl?: string;
    isActive?: boolean;
  },
): Promise<DashboardBranch> {
  invalidateDashboardBranchesCache();
  return jsonMutation<DashboardBranch>(
    accessToken,
    "/dashboard/branches",
    "POST",
    payload,
  );
}

export async function updateDashboardBranch(
  accessToken: string,
  branchId: string,
  payload: Partial<{
    name: string;
    address: string;
    phone: string;
    whatsapp: string;
    mapUrl: string;
    isActive: boolean;
  }>,
): Promise<DashboardBranch> {
  invalidateDashboardBranchesCache();
  return jsonMutation<DashboardBranch>(
    accessToken,
    `/dashboard/branches/${branchId}`,
    "PATCH",
    payload,
  );
}

export async function getDashboardBookings(
  accessToken: string,
  query: DashboardBookingsListQuery = {},
): Promise<DashboardBookingsListResponse> {
  const res = await apiFetch(
    withQuery("/dashboard/bookings", {
      branchId: query.branchId,
      status: query.status,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      clientId: query.clientId,
      slotId: query.slotId,
      search: query.search,
      page: query.page,
      pageSize: query.pageSize,
    }),
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardBookingsListResponse;
}

export async function getDashboardBookingById(
  accessToken: string,
  bookingId: string,
): Promise<DashboardBookingDetail> {
  const res = await apiFetch(apiUrl(`/dashboard/bookings/${bookingId}`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardBookingDetail;
}

export async function getDashboardQueue(
  accessToken: string,
  query: DashboardQueueListQuery = {},
): Promise<DashboardQueueListResponse> {
  const res = await apiFetch(
    withQuery("/dashboard/queue", {
      date: query.date,
      branchId: query.branchId,
      status: query.status,
    }),
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardQueueListResponse;
}

export async function postDashboardBookingQueueCheckIn(
  accessToken: string,
  bookingId: string,
): Promise<DashboardQueueEntry> {
  return jsonMutation<DashboardQueueEntry>(
    accessToken,
    `/dashboard/bookings/${bookingId}/check-in`,
    "POST",
  );
}

export async function postDashboardWalkInQueue(
  accessToken: string,
  payload: DashboardWalkInQueueInput,
): Promise<DashboardQueueEntry> {
  return jsonMutation<DashboardQueueEntry>(
    accessToken,
    "/dashboard/queue/walk-ins",
    "POST",
    payload,
  );
}

export async function postDashboardQueueEntryAppendBookingItems(
  accessToken: string,
  queueEntryId: string,
  payload: { items: DashboardBookingLineInput[] },
): Promise<DashboardQueueAppendBookingItemsResponse> {
  return jsonMutation<DashboardQueueAppendBookingItemsResponse>(
    accessToken,
    `/dashboard/queue/${queueEntryId}/items`,
    "POST",
    payload,
  );
}

export type DashboardQueueActionBody = {
  /** start: one or more service lines to begin now. */
  starts?: { bookingItemId: string; staffProfileId: string; overrideReason?: string }[];
  /** start: reason applied to every line (SOFT staff checks). */
  overrideReason?: string;
  /** complete: reason to close the visit while a balance remains (SOFT). */
  closeWithBalanceReason?: string;
};

export async function postDashboardQueueEntryAction(
  accessToken: string,
  queueEntryId: string,
  action: "start" | "complete" | "cancel",
  body?: DashboardQueueActionBody,
): Promise<DashboardQueueEntry> {
  return jsonMutation<DashboardQueueEntry>(
    accessToken,
    `/dashboard/queue/${queueEntryId}/${action}`,
    "POST",
    action === "cancel" ? undefined : (body ?? {}),
  );
}

export async function postDashboardQueueInvoiceFinalize(
  accessToken: string,
  queueEntryId: string,
  body?: { overrideReason?: string },
): Promise<{
  queueEntry: DashboardQueueEntry;
  invoice: DashboardInvoiceDetail;
}> {
  return jsonMutation<{
    queueEntry: DashboardQueueEntry;
    invoice: DashboardInvoiceDetail;
  }>(
    accessToken,
    `/dashboard/queue/${queueEntryId}/invoice/finalize`,
    "POST",
    body,
  );
}

export async function postDashboardQueuePayment(
  accessToken: string,
  queueEntryId: string,
  payload: CreateDashboardInvoicePaymentInput,
): Promise<{
  queueEntry: DashboardQueueEntry;
  payment: DashboardPayment;
  invoice: DashboardInvoiceDetail;
}> {
  return jsonMutation<{
    queueEntry: DashboardQueueEntry;
    payment: DashboardPayment;
    invoice: DashboardInvoiceDetail;
  }>(accessToken, `/dashboard/queue/${queueEntryId}/payments`, "POST", payload);
}

export async function patchDashboardQueueEntryNotes(
  accessToken: string,
  queueEntryId: string,
  payload: { notes?: string | null },
): Promise<DashboardQueueEntry> {
  return jsonMutation<DashboardQueueEntry>(
    accessToken,
    `/dashboard/queue/${queueEntryId}`,
    "PATCH",
    payload,
  );
}

export async function postDashboardCreateBooking(
  accessToken: string,
  payload: DashboardCreateBookingInput,
): Promise<DashboardBookingDetail> {
  return jsonMutation<DashboardBookingDetail>(
    accessToken,
    "/dashboard/bookings",
    "POST",
    payload,
  );
}

export async function postDashboardCreateBookingChangeRequest(
  accessToken: string,
  bookingId: string,
  payload: DashboardCreateBookingChangeRequestInput,
): Promise<DashboardBookingChangeRequestCreated> {
  return jsonMutation<DashboardBookingChangeRequestCreated>(
    accessToken,
    `/dashboard/bookings/${bookingId}/change-requests`,
    "POST",
    payload,
  );
}

export async function getDashboardSlots(
  accessToken: string,
  branchId: string,
  query: DashboardSlotsListQuery = {},
): Promise<DashboardSlotsListResponse> {
  const res = await apiFetch(
    withQuery(`/dashboard/branches/${branchId}/slots`, {
      page: query.page,
      pageSize: query.pageSize,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      status: query.status,
    }),
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardSlotsListResponse;
}

export async function getDashboardSlotById(
  accessToken: string,
  branchId: string,
  slotId: string,
): Promise<DashboardSlot> {
  const res = await apiFetch(
    apiUrl(`/dashboard/branches/${branchId}/slots/${slotId}`),
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardSlot;
}

async function jsonMutation<T>(
  accessToken: string,
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<T> {
  const res = await apiFetch(apiUrl(path), {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as T;
}

async function jsonPut<T>(accessToken: string, path: string, body: unknown): Promise<T> {
  const res = await apiFetch(apiUrl(path), {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as T;
}

export async function createDashboardSlot(
  accessToken: string,
  branchId: string,
  input: CreateDashboardSlotInput,
): Promise<DashboardSlot> {
  return jsonMutation<DashboardSlot>(
    accessToken,
    `/dashboard/branches/${branchId}/slots`,
    "POST",
    input,
  );
}

export async function patchDashboardSlot(
  accessToken: string,
  branchId: string,
  slotId: string,
  input: PatchDashboardSlotInput,
): Promise<DashboardSlot> {
  return jsonMutation<DashboardSlot>(
    accessToken,
    `/dashboard/branches/${branchId}/slots/${slotId}`,
    "PATCH",
    input,
  );
}

export async function patchDashboardSlotCapacity(
  accessToken: string,
  branchId: string,
  slotId: string,
  capacity: number,
): Promise<DashboardSlot> {
  return jsonMutation<DashboardSlot>(
    accessToken,
    `/dashboard/branches/${branchId}/slots/${slotId}/capacity`,
    "PATCH",
    { capacity },
  );
}

export async function patchDashboardSlotOnlineBookable(
  accessToken: string,
  branchId: string,
  slotId: string,
  isOnlineBookable: boolean,
): Promise<DashboardSlot> {
  return jsonMutation<DashboardSlot>(
    accessToken,
    `/dashboard/branches/${branchId}/slots/${slotId}/online-bookable`,
    "PATCH",
    { isOnlineBookable },
  );
}

export async function patchDashboardSlotStatus(
  accessToken: string,
  branchId: string,
  slotId: string,
  status: DashboardSlotStatus,
): Promise<DashboardSlot> {
  return jsonMutation<DashboardSlot>(
    accessToken,
    `/dashboard/branches/${branchId}/slots/${slotId}/status`,
    "PATCH",
    { status },
  );
}

export async function deleteDashboardSlot(
  accessToken: string,
  branchId: string,
  slotId: string,
): Promise<DashboardSlot> {
  return jsonMutation<DashboardSlot>(
    accessToken,
    `/dashboard/branches/${branchId}/slots/${slotId}`,
    "DELETE",
  );
}

export async function postDashboardBookingAction(
  accessToken: string,
  bookingId: string,
  action:
    | "confirm"
    | "reject"
    | "reschedule"
    | "confirm-reschedule"
    | "cancel"
    | "mark-arrived"
    | "mark-in-progress"
    | "mark-completed"
    | "mark-no-show"
    | "recalculate-pricing"
    | "discount",
  body?: unknown,
): Promise<DashboardBookingDetail> {
  return jsonMutation<DashboardBookingDetail>(
    accessToken,
    `/dashboard/bookings/${bookingId}/${action}`,
    "POST",
    body,
  );
}

/**
 * Remove a line from an active booking. A PENDING line is deleted; an IN_PROGRESS
 * line answers 409 `overridable` until `reason` is supplied, then it is kept as
 * CANCELLED (not charged). COMPLETED lines cannot be removed.
 */
/** Add priced lines to a booking: before check-in from the Bookings page, after check-in while on the queue. */
export async function appendDashboardBookingServiceItems(
  accessToken: string,
  bookingId: string,
  payload: { items: DashboardBookingLineInput[] },
): Promise<DashboardBookingDetail> {
  return jsonMutation<DashboardBookingDetail>(
    accessToken,
    `/dashboard/bookings/${bookingId}/service-items`,
    "POST",
    payload,
  );
}

/** Discount one line only (0 clears it). Same reason/limit rules as the receipt discount. */
export async function patchDashboardBookingLineDiscount(
  accessToken: string,
  bookingId: string,
  itemId: string,
  payload: { discountAmount: number; reason?: string },
): Promise<DashboardBookingDetail> {
  return jsonMutation<DashboardBookingDetail>(
    accessToken,
    `/dashboard/bookings/${bookingId}/items/${itemId}/discount`,
    "PATCH",
    payload,
  );
}

export async function deleteDashboardBookingItem(
  accessToken: string,
  bookingId: string,
  itemId: string,
  opts?: { reason?: string },
): Promise<DashboardBookingDetail> {
  const qs = opts?.reason ? `?reason=${encodeURIComponent(opts.reason)}` : "";
  return jsonMutation<DashboardBookingDetail>(
    accessToken,
    `/dashboard/bookings/${bookingId}/items/${itemId}${qs}`,
    "DELETE",
  );
}

export async function getDashboardBookingPayments(
  accessToken: string,
  bookingId: string,
): Promise<DashboardBookingPaymentsResponse> {
  const res = await apiFetch(apiUrl(`/dashboard/bookings/${bookingId}/payments`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardBookingPaymentsResponse;
}

export async function getDashboardPayments(
  accessToken: string,
  query: DashboardPaymentsListQuery = {},
): Promise<DashboardPaymentsListResponse> {
  const res = await apiFetch(
    withQuery("/dashboard/payments", {
      search: query.search,
      method: query.method,
      status: query.status,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      branchId: query.branchId,
      page: query.page,
      pageSize: query.pageSize,
    }),
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardPaymentsListResponse;
}

export async function getDashboardPaymentDetail(
  accessToken: string,
  paymentId: string,
): Promise<DashboardPaymentDetailResponse> {
  const res = await apiFetch(apiUrl(`/dashboard/payments/${paymentId}`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardPaymentDetailResponse;
}

export async function postDashboardBookingPayment(
  accessToken: string,
  bookingId: string,
  payload: CreateDashboardPaymentInput,
): Promise<DashboardPayment> {
  return jsonMutation<DashboardPayment>(
    accessToken,
    `/dashboard/bookings/${bookingId}/payments`,
    "POST",
    payload,
  );
}

export async function patchDashboardPayment(
  accessToken: string,
  paymentId: string,
  payload: UpdateDashboardPaymentInput,
): Promise<DashboardPayment> {
  return jsonMutation<DashboardPayment>(
    accessToken,
    `/dashboard/payments/${paymentId}`,
    "PATCH",
    payload,
  );
}

export async function patchDashboardBookingPaymentStatus(
  accessToken: string,
  bookingId: string,
  payload: { paymentStatus: SimplePaymentAggregateStatus; amount?: number },
): Promise<DashboardSimplePaymentStatusResponse> {
  return jsonMutation<DashboardSimplePaymentStatusResponse>(
    accessToken,
    `/dashboard/bookings/${bookingId}/payment-status`,
    "PATCH",
    payload,
  );
}

export async function getDashboardInvoices(
  accessToken: string,
  query: DashboardInvoicesListQuery = {},
): Promise<DashboardInvoicesListResponse> {
  const res = await apiFetch(
    withQuery("/dashboard/invoices", {
      branchId: query.branchId,
      bookingId: query.bookingId,
      clientId: query.clientId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      search: query.search,
      paymentStatus: query.paymentStatus,
      status: query.status,
      page: query.page,
      pageSize: query.pageSize,
    }),
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardInvoicesListResponse;
}

export async function getDashboardInvoiceById(
  accessToken: string,
  invoiceId: string,
): Promise<DashboardInvoiceDetail> {
  const res = await apiFetch(apiUrl(`/dashboard/invoices/${invoiceId}`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardInvoiceDetail;
}

export async function getDashboardInvoiceReceipt(
  accessToken: string,
  invoiceId: string,
): Promise<DashboardInvoiceReceipt> {
  const res = await apiFetch(apiUrl(`/dashboard/invoices/${invoiceId}/receipt`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardInvoiceReceipt;
}

export async function postDashboardBookingInvoice(
  accessToken: string,
  bookingId: string,
  body?: { overrideReason?: string },
): Promise<DashboardInvoiceDetail> {
  return jsonMutation<DashboardInvoiceDetail>(
    accessToken,
    `/dashboard/bookings/${bookingId}/invoices`,
    "POST",
    body,
  );
}

export async function patchDashboardInvoice(
  accessToken: string,
  invoiceId: string,
  payload: PatchDashboardInvoiceInput,
): Promise<DashboardInvoiceDetail> {
  return jsonMutation<DashboardInvoiceDetail>(
    accessToken,
    `/dashboard/invoices/${invoiceId}`,
    "PATCH",
    payload,
  );
}

export async function postDashboardInvoicePayment(
  accessToken: string,
  invoiceId: string,
  payload: CreateDashboardInvoicePaymentInput,
): Promise<{ payment: DashboardPayment; invoice: DashboardInvoiceDetail }> {
  return jsonMutation<{
    payment: DashboardPayment;
    invoice: DashboardInvoiceDetail;
  }>(accessToken, `/dashboard/invoices/${invoiceId}/payments`, "POST", payload);
}

export async function postDashboardWhatsappDeepLink(
  accessToken: string,
  payload: {
    templateKey: string;
    bookingId: string;
    clientId?: string;
    language?: "ar" | "en";
  },
): Promise<DashboardWhatsappDeepLinkResponse> {
  return jsonMutation<DashboardWhatsappDeepLinkResponse>(
    accessToken,
    "/dashboard/whatsapp/deep-link",
    "POST",
    payload,
  );
}

export async function getDashboardVatSettings(
  accessToken: string,
): Promise<DashboardVatSettingsResponse> {
  const res = await apiFetch(apiUrl("/dashboard/settings/vat"), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardVatSettingsResponse;
}

export async function getDashboardSettings(
  accessToken: string,
): Promise<DashboardSettings> {
  const res = await apiFetch(apiUrl("/dashboard/settings"), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardSettings;
}

export async function getDashboardSettingsBundle(
  accessToken: string,
): Promise<DashboardSettings> {
  return getDashboardSettings(accessToken);
}

export async function updateDashboardBusinessIdentity(
  accessToken: string,
  payload: Partial<BusinessIdentitySettings>,
): Promise<DashboardSettings> {
  return jsonMutation<DashboardSettings>(
    accessToken,
    "/dashboard/settings/business-identity",
    "PATCH",
    payload,
  );
}

export async function updateDashboardDefaultBranch(
  accessToken: string,
  payload: { defaultBranchId: string | null },
): Promise<DashboardSettings> {
  return jsonMutation<DashboardSettings>(
    accessToken,
    "/dashboard/settings/default-branch",
    "PATCH",
    payload,
  );
}

export async function setDashboardDefaultBranch(
  accessToken: string,
  branchId: string,
): Promise<DashboardSettings> {
  return updateDashboardDefaultBranch(accessToken, {
    defaultBranchId: branchId,
  });
}

export async function updateDashboardVatSettings(
  accessToken: string,
  payload: Partial<VatSettings>,
): Promise<DashboardSettings> {
  return jsonMutation<DashboardSettings>(
    accessToken,
    "/dashboard/settings/vat",
    "PATCH",
    payload,
  );
}

export async function updateDashboardOperationsSettings(
  accessToken: string,
  payload: Partial<OperationsSettings>,
): Promise<DashboardSettings> {
  return jsonMutation<DashboardSettings>(
    accessToken,
    "/dashboard/settings/operations",
    "PATCH",
    payload,
  );
}

export async function updateDashboardReceiptSettings(
  accessToken: string,
  payload: Partial<ReceiptSettings>,
): Promise<DashboardSettings> {
  return jsonMutation<DashboardSettings>(
    accessToken,
    "/dashboard/settings/receipt",
    "PATCH",
    payload,
  );
}

export async function patchDashboardVatSettings(
  accessToken: string,
  payload: PatchDashboardVatSettingsInput,
): Promise<DashboardVatSettingsResponse> {
  return jsonMutation<DashboardVatSettingsResponse>(
    accessToken,
    "/dashboard/settings/vat",
    "PATCH",
    payload,
  );
}

export async function getDashboardPaymentPolicy(
  accessToken: string,
): Promise<DashboardPaymentPolicyResponse> {
  const res = await apiFetch(apiUrl("/dashboard/settings/payment-policy"), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardPaymentPolicyResponse;
}

export async function patchDashboardPaymentPolicy(
  accessToken: string,
  payload: PatchDashboardPaymentPolicyInput,
): Promise<DashboardPaymentPolicyResponse> {
  return jsonMutation<DashboardPaymentPolicyResponse>(
    accessToken,
    "/dashboard/settings/payment-policy",
    "PATCH",
    payload,
  );
}

export async function getSlotGenerationSettings(
  accessToken: string,
): Promise<SlotGenerationDefaults> {
  const res = await apiFetch(apiUrl("/dashboard/settings/slot-generation"), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as SlotGenerationDefaults;
}

export async function updateSlotGenerationSettings(
  accessToken: string,
  payload: PatchSlotGenerationSettingsInput,
): Promise<SlotGenerationDefaults> {
  return jsonMutation<SlotGenerationDefaults>(
    accessToken,
    "/dashboard/settings/slot-generation",
    "PATCH",
    payload,
  );
}

export async function generateWeekSlots(
  accessToken: string,
  branchId: string,
  payload: GenerateWeekSlotsInput,
): Promise<GenerateWeekSlotsResponse> {
  return jsonMutation<GenerateWeekSlotsResponse>(
    accessToken,
    `/dashboard/branches/${branchId}/slots/generate-week`,
    "POST",
    payload,
  );
}

export async function getDashboardBranchSlotSettings(
  accessToken: string,
  branchId: string,
): Promise<BranchSlotGenerationSettings> {
  const res = await apiFetch(
    apiUrl(`/dashboard/branches/${branchId}/slot-settings`),
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as BranchSlotGenerationSettings;
}

export async function updateDashboardBranchSlotSettings(
  accessToken: string,
  branchId: string,
  payload: PatchSlotGenerationSettingsInput,
): Promise<BranchSlotGenerationSettings> {
  return jsonMutation<BranchSlotGenerationSettings>(
    accessToken,
    `/dashboard/branches/${branchId}/slot-settings`,
    "PATCH",
    payload,
  );
}

export async function generateDashboardBranchSlots(
  accessToken: string,
  payload: GenerateSlotsPayload,
): Promise<GenerateWeekSlotsResponse> {
  return generateWeekSlots(accessToken, payload.branchId, payload);
}

export async function listDashboardWhatsAppTemplates(
  accessToken: string,
  params: ListDashboardWhatsAppTemplatesParams = {},
): Promise<DashboardWhatsAppTemplatesResponse> {
  const res = await apiFetch(
    withQuery("/dashboard/whatsapp-templates", {
      search: params.search,
      category: params.category,
      language: params.language,
      isActive: params.isActive,
      page: params.page,
      limit: params.limit,
    }),
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardWhatsAppTemplatesResponse;
}

/** @deprecated Use listDashboardWhatsAppTemplates */
export async function getDashboardWhatsappTemplates(
  accessToken: string,
): Promise<DashboardWhatsAppTemplatesResponse> {
  return listDashboardWhatsAppTemplates(accessToken, {});
}

export async function getDashboardWhatsAppTemplate(
  accessToken: string,
  id: string,
): Promise<DashboardWhatsAppTemplate> {
  const res = await apiFetch(apiUrl(`/dashboard/whatsapp-templates/${id}`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardWhatsAppTemplate;
}

export async function createDashboardWhatsAppTemplate(
  accessToken: string,
  payload: CreateWhatsAppTemplateInput,
): Promise<DashboardWhatsAppTemplate> {
  return jsonMutation<DashboardWhatsAppTemplate>(
    accessToken,
    "/dashboard/whatsapp-templates",
    "POST",
    payload,
  );
}

/** @deprecated Use createDashboardWhatsAppTemplate */
export async function postDashboardWhatsappTemplate(
  accessToken: string,
  payload: CreateWhatsAppTemplateInput,
): Promise<DashboardWhatsAppTemplate> {
  return createDashboardWhatsAppTemplate(accessToken, payload);
}

export async function updateDashboardWhatsAppTemplate(
  accessToken: string,
  templateId: string,
  payload: UpdateWhatsAppTemplateInput,
): Promise<DashboardWhatsAppTemplate> {
  return jsonMutation<DashboardWhatsAppTemplate>(
    accessToken,
    `/dashboard/whatsapp-templates/${templateId}`,
    "PATCH",
    payload,
  );
}

/** @deprecated Use updateDashboardWhatsAppTemplate */
export async function patchDashboardWhatsappTemplate(
  accessToken: string,
  templateId: string,
  payload: UpdateWhatsAppTemplateInput & { content?: string },
): Promise<DashboardWhatsAppTemplate> {
  const { content, ...rest } = payload;
  return updateDashboardWhatsAppTemplate(accessToken, templateId, {
    ...rest,
    ...(content !== undefined && payload.body === undefined ? { body: content } : {}),
  });
}

export async function activateDashboardWhatsAppTemplate(
  accessToken: string,
  templateId: string,
): Promise<DashboardWhatsAppTemplate> {
  return jsonMutation<DashboardWhatsAppTemplate>(
    accessToken,
    `/dashboard/whatsapp-templates/${templateId}/activate`,
    "POST",
    {},
  );
}

export async function deactivateDashboardWhatsAppTemplate(
  accessToken: string,
  templateId: string,
): Promise<DashboardWhatsAppTemplate> {
  return jsonMutation<DashboardWhatsAppTemplate>(
    accessToken,
    `/dashboard/whatsapp-templates/${templateId}/deactivate`,
    "POST",
    {},
  );
}

export async function previewDashboardWhatsAppTemplate(
  accessToken: string,
  templateId: string,
  payload: { sampleData?: Record<string, string> } = {},
): Promise<DashboardWhatsAppTemplatePreview> {
  return jsonMutation<DashboardWhatsAppTemplatePreview>(
    accessToken,
    `/dashboard/whatsapp-templates/${templateId}/preview`,
    "POST",
    payload,
  );
}

export async function getDashboardBookingChangeRequests(
  accessToken: string,
  query: {
    branchId?: string;
    status?: string;
    bookingId?: string;
    page?: number;
    pageSize?: number;
  } = {},
): Promise<DashboardBookingChangeRequestsResponse> {
  const res = await apiFetch(
    withQuery("/dashboard/booking-change-requests", {
      branchId: query.branchId,
      status: query.status,
      bookingId: query.bookingId,
      page: query.page,
      pageSize: query.pageSize,
    }),
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardBookingChangeRequestsResponse;
}

export async function getDashboardBookingChangeRequestById(
  accessToken: string,
  requestId: string,
): Promise<DashboardBookingChangeRequestDetail> {
  const res = await apiFetch(
    apiUrl(`/dashboard/booking-change-requests/${requestId}`),
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardBookingChangeRequestDetail;
}

export async function postDashboardBookingChangeRequestAction(
  accessToken: string,
  requestId: string,
  action: "approve" | "reject" | "cancel",
): Promise<DashboardBookingChangeRequestDetail> {
  return jsonMutation<DashboardBookingChangeRequestDetail>(
    accessToken,
    `/dashboard/booking-change-requests/${requestId}/${action}`,
    "POST",
  );
}

export async function getDashboardClients(
  accessToken: string,
  query: { page?: number; pageSize?: number; search?: string } = {},
): Promise<DashboardClientsListResponse> {
  const res = await apiFetch(
    withQuery("/dashboard/clients", {
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
    }),
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!res.ok) {
    throw await parseApiError(res);
  }
  const body = (await res.json()) as unknown;
  if (Array.isArray(body)) {
    return { data: body as DashboardClient[] };
  }
  return body as DashboardClientsListResponse;
}

export async function getDashboardClientById(
  accessToken: string,
  clientId: string,
): Promise<DashboardClient> {
  const res = await apiFetch(apiUrl(`/dashboard/clients/${clientId}`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardClient;
}

export async function createDashboardClient(
  accessToken: string,
  payload: Record<string, unknown>,
): Promise<DashboardClient> {
  return jsonMutation<DashboardClient>(
    accessToken,
    "/dashboard/clients",
    "POST",
    payload,
  );
}

export async function patchDashboardClient(
  accessToken: string,
  clientId: string,
  payload: Record<string, unknown>,
): Promise<DashboardClient> {
  return jsonMutation<DashboardClient>(
    accessToken,
    `/dashboard/clients/${clientId}`,
    "PATCH",
    payload,
  );
}

export async function getDashboardServiceCategories(
  accessToken: string,
  query: { isActive?: boolean } = {},
): Promise<{ data: DashboardServiceCategory[] }> {
  const res = await apiFetch(
    withQuery("/dashboard/service-categories", {
      isActive: query.isActive,
    }),
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as { data: DashboardServiceCategory[] };
}

export async function postDashboardServiceCategory(
  accessToken: string,
  payload: Record<string, unknown>,
): Promise<DashboardServiceCategory> {
  return jsonMutation<DashboardServiceCategory>(
    accessToken,
    "/dashboard/service-categories",
    "POST",
    payload,
  );
}

export async function patchDashboardServiceCategory(
  accessToken: string,
  id: string,
  payload: Record<string, unknown>,
): Promise<DashboardServiceCategory> {
  return jsonMutation<DashboardServiceCategory>(
    accessToken,
    `/dashboard/service-categories/${id}`,
    "PATCH",
    payload,
  );
}

export async function getDashboardServices(
  accessToken: string,
  query: {
    page?: number;
    pageSize?: number;
    categoryId?: string;
    isActive?: boolean;
  } = {},
): Promise<{ data: DashboardService[]; meta: DashboardListMeta }> {
  const res = await apiFetch(
    withQuery("/dashboard/services", {
      page: query.page,
      pageSize: query.pageSize,
      categoryId: query.categoryId,
      isActive: query.isActive,
    }),
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as {
    data: DashboardService[];
    meta: DashboardListMeta;
  };
}

export async function postDashboardMediaUpload(
  accessToken: string,
  file: File,
): Promise<DashboardMediaUploadResponse> {
  const form = new FormData();
  form.set("file", file);
  const res = await apiFetch(apiUrl("/dashboard/media/upload"), {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardMediaUploadResponse;
}

export async function postDashboardService(
  accessToken: string,
  payload: Record<string, unknown>,
): Promise<DashboardService> {
  return jsonMutation<DashboardService>(
    accessToken,
    "/dashboard/services",
    "POST",
    payload,
  );
}

export async function patchDashboardService(
  accessToken: string,
  id: string,
  payload: Record<string, unknown>,
): Promise<DashboardService> {
  return jsonMutation<DashboardService>(
    accessToken,
    `/dashboard/services/${id}`,
    "PATCH",
    payload,
  );
}

export async function patchDashboardServiceStatus(
  accessToken: string,
  id: string,
  isActive: boolean,
): Promise<DashboardService> {
  return jsonMutation<DashboardService>(
    accessToken,
    `/dashboard/services/${id}/status`,
    "PATCH",
    { isActive },
  );
}

export async function getDashboardServiceVariants(
  accessToken: string,
  serviceId: string,
): Promise<{ data: DashboardServiceVariant[] }> {
  const res = await apiFetch(apiUrl(`/dashboard/services/${serviceId}/variants`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as { data: DashboardServiceVariant[] };
}

export async function postDashboardServiceVariant(
  accessToken: string,
  serviceId: string,
  payload: Record<string, unknown>,
): Promise<DashboardServiceVariant> {
  return jsonMutation<DashboardServiceVariant>(
    accessToken,
    `/dashboard/services/${serviceId}/variants`,
    "POST",
    payload,
  );
}

export async function patchDashboardServiceVariant(
  accessToken: string,
  id: string,
  payload: Record<string, unknown>,
): Promise<DashboardServiceVariant> {
  return jsonMutation<DashboardServiceVariant>(
    accessToken,
    `/dashboard/service-variants/${id}`,
    "PATCH",
    payload,
  );
}

export async function patchDashboardServiceVariantStatus(
  accessToken: string,
  id: string,
  isActive: boolean,
): Promise<DashboardServiceVariant> {
  return jsonMutation<DashboardServiceVariant>(
    accessToken,
    `/dashboard/service-variants/${id}/status`,
    "PATCH",
    { isActive },
  );
}

export async function getDashboardPackages(
  accessToken: string,
  query: {
    page?: number;
    pageSize?: number;
    isActive?: boolean;
    search?: string;
    branchId?: string;
    publicListing?: boolean;
  } = {},
): Promise<{ data: DashboardPackage[]; meta: DashboardListMeta }> {
  const res = await apiFetch(
    withQuery("/dashboard/packages", {
      page: query.page,
      pageSize: query.pageSize,
      isActive: query.isActive,
      search: query.search,
      branchId: query.branchId,
      publicListing: query.publicListing,
    }),
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as {
    data: DashboardPackage[];
    meta: DashboardListMeta;
  };
}

export async function postDashboardPackage(
  accessToken: string,
  payload: Record<string, unknown>,
): Promise<DashboardPackage> {
  return jsonMutation<DashboardPackage>(
    accessToken,
    "/dashboard/packages",
    "POST",
    payload,
  );
}

export async function patchDashboardPackage(
  accessToken: string,
  id: string,
  payload: Record<string, unknown>,
): Promise<DashboardPackage> {
  return jsonMutation<DashboardPackage>(
    accessToken,
    `/dashboard/packages/${id}`,
    "PATCH",
    payload,
  );
}

export async function patchDashboardPackageStatus(
  accessToken: string,
  id: string,
  isActive: boolean,
): Promise<DashboardPackage> {
  return jsonMutation<DashboardPackage>(
    accessToken,
    `/dashboard/packages/${id}/status`,
    "PATCH",
    { isActive },
  );
}

export async function getDashboardBundles(
  accessToken: string,
  query: { page?: number; pageSize?: number; isActive?: boolean } = {},
): Promise<{ data: DashboardBundle[]; meta: DashboardListMeta }> {
  const res = await apiFetch(
    withQuery("/dashboard/bundles", {
      page: query.page,
      pageSize: query.pageSize,
      isActive: query.isActive,
    }),
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as {
    data: DashboardBundle[];
    meta: DashboardListMeta;
  };
}

export async function postDashboardBundle(
  accessToken: string,
  payload: Record<string, unknown>,
): Promise<DashboardBundle> {
  return jsonMutation<DashboardBundle>(
    accessToken,
    "/dashboard/bundles",
    "POST",
    payload,
  );
}

export async function patchDashboardBundle(
  accessToken: string,
  id: string,
  payload: Record<string, unknown>,
): Promise<DashboardBundle> {
  return jsonMutation<DashboardBundle>(
    accessToken,
    `/dashboard/bundles/${id}`,
    "PATCH",
    payload,
  );
}

export async function patchDashboardBundleStatus(
  accessToken: string,
  id: string,
  isActive: boolean,
): Promise<DashboardBundle> {
  return jsonMutation<DashboardBundle>(
    accessToken,
    `/dashboard/bundles/${id}/status`,
    "PATCH",
    { isActive },
  );
}

export async function getDashboardOffers(
  accessToken: string,
  query: { page?: number; pageSize?: number; isActive?: boolean } = {},
): Promise<{ data: DashboardOffer[]; meta: DashboardListMeta }> {
  const res = await apiFetch(
    withQuery("/dashboard/offers", {
      page: query.page,
      pageSize: query.pageSize,
      isActive: query.isActive,
    }),
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as {
    data: DashboardOffer[];
    meta: DashboardListMeta;
  };
}

export async function getDashboardServiceEnhancements(
  accessToken: string,
  query: {
    page?: number;
    pageSize?: number;
    isActive?: boolean;
    search?: string;
    priceMin?: number;
    priceMax?: number;
    durationMin?: number;
    durationMax?: number;
  } = {},
): Promise<{ data: DashboardServiceEnhancement[]; meta: DashboardListMeta }> {
  const res = await apiFetch(
    withQuery("/dashboard/service-enhancements", {
      page: query.page,
      pageSize: query.pageSize,
      isActive: query.isActive,
      search: query.search,
      priceMin: query.priceMin,
      priceMax: query.priceMax,
      durationMin: query.durationMin,
      durationMax: query.durationMax,
    }),
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as {
    data: DashboardServiceEnhancement[];
    meta: DashboardListMeta;
  };
}

export async function postDashboardServiceEnhancement(
  accessToken: string,
  payload: Record<string, unknown>,
): Promise<DashboardServiceEnhancement> {
  return jsonMutation<DashboardServiceEnhancement>(
    accessToken,
    "/dashboard/service-enhancements",
    "POST",
    payload,
  );
}

export async function patchDashboardServiceEnhancement(
  accessToken: string,
  id: string,
  payload: Record<string, unknown>,
): Promise<DashboardServiceEnhancement> {
  return jsonMutation<DashboardServiceEnhancement>(
    accessToken,
    `/dashboard/service-enhancements/${id}`,
    "PATCH",
    payload,
  );
}

export async function patchDashboardServiceEnhancementStatus(
  accessToken: string,
  id: string,
  isActive: boolean,
): Promise<DashboardServiceEnhancement> {
  return jsonMutation<DashboardServiceEnhancement>(
    accessToken,
    `/dashboard/service-enhancements/${id}/status`,
    "PATCH",
    { isActive },
  );
}

export async function postDashboardOffer(
  accessToken: string,
  payload: Record<string, unknown>,
): Promise<DashboardOffer> {
  return jsonMutation<DashboardOffer>(
    accessToken,
    "/dashboard/offers",
    "POST",
    payload,
  );
}

export async function patchDashboardOffer(
  accessToken: string,
  id: string,
  payload: Record<string, unknown>,
): Promise<DashboardOffer> {
  return jsonMutation<DashboardOffer>(
    accessToken,
    `/dashboard/offers/${id}`,
    "PATCH",
    payload,
  );
}

export async function patchDashboardOfferStatus(
  accessToken: string,
  id: string,
  isActive: boolean,
): Promise<DashboardOffer> {
  return jsonMutation<DashboardOffer>(
    accessToken,
    `/dashboard/offers/${id}/status`,
    "PATCH",
    { isActive },
  );
}

export async function listDashboardWebsiteContent(
  accessToken: string,
  query: { page?: string; isVisible?: boolean } = {},
): Promise<DashboardWebsiteContentListResponse> {
  const res = await apiFetch(
    withQuery("/dashboard/website-content", {
      page: query.page,
      isVisible: query.isVisible,
    }),
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardWebsiteContentListResponse;
}

export async function getDashboardWebsiteContentSection(
  accessToken: string,
  id: string,
): Promise<DashboardWebsiteContentSection> {
  const res = await apiFetch(apiUrl(`/dashboard/website-content/${id}`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardWebsiteContentSection;
}

export async function updateDashboardWebsiteContentSection(
  accessToken: string,
  id: string,
  payload: UpdateWebsiteContentSectionInput,
): Promise<DashboardWebsiteContentSection> {
  return jsonMutation<DashboardWebsiteContentSection>(
    accessToken,
    `/dashboard/website-content/${id}`,
    "PATCH",
    payload,
  );
}

export async function reorderDashboardWebsiteContent(
  accessToken: string,
  payload: ReorderWebsiteContentInput,
): Promise<{ ok: true }> {
  return jsonMutation<{ ok: true }>(
    accessToken,
    "/dashboard/website-content/reorder",
    "PATCH",
    payload,
  );
}

export async function seedDashboardWebsiteContentDefaults(
  accessToken: string,
): Promise<{ ok: true; seededKeys: string[] }> {
  return jsonMutation<{ ok: true; seededKeys: string[] }>(
    accessToken,
    "/dashboard/website-content/seed-defaults",
    "POST",
    {},
  );
}

export async function getDashboardGallery(
  accessToken: string,
  query: {
    page?: number;
    pageSize?: number;
    limit?: number;
    search?: string;
    category?: string;
    tag?: string;
    usageType?: string;
    usageBucket?: "unused" | "services" | "homepage" | "other_sections";
    libraryStatus?: "ACTIVE" | "ARCHIVED";
    isActive?: boolean;
  } = {},
): Promise<{ data: DashboardGalleryListItem[]; meta: DashboardListMeta }> {
  const res = await apiFetch(
    withQuery("/dashboard/gallery", {
      page: query.page,
      pageSize: query.pageSize,
      limit: query.limit,
      search: query.search,
      category: query.category,
      tag: query.tag,
      usageType: query.usageType,
      usageBucket: query.usageBucket,
      libraryStatus: query.libraryStatus,
      isActive: query.isActive,
    }),
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as {
    data: DashboardGalleryListItem[];
    meta: DashboardListMeta;
  };
}

export async function getDashboardGalleryStats(
  accessToken: string,
): Promise<DashboardGalleryStats> {
  const res = await apiFetch(apiUrl("/dashboard/gallery/stats"), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardGalleryStats;
}

export async function getDashboardGalleryAsset(
  accessToken: string,
  id: string,
): Promise<DashboardGalleryAssetDetail> {
  const res = await apiFetch(apiUrl(`/dashboard/gallery/${id}`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardGalleryAssetDetail;
}

export async function uploadDashboardGalleryAsset(
  accessToken: string,
  file: File,
  fields: {
    title?: string;
    altText?: string;
    description?: string;
    category?: string;
    tagsRaw?: string;
  } = {},
): Promise<DashboardGalleryListItem> {
  const form = new FormData();
  form.set("file", file);
  if (fields.title) form.set("title", fields.title);
  if (fields.altText) form.set("altText", fields.altText);
  if (fields.description) form.set("description", fields.description);
  if (fields.category) form.set("category", fields.category);
  if (fields.tagsRaw) form.set("tagsRaw", fields.tagsRaw);
  const res = await apiFetch(apiUrl("/dashboard/gallery/upload"), {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardGalleryListItem;
}

export async function updateDashboardGalleryAsset(
  accessToken: string,
  id: string,
  payload: Record<string, unknown>,
): Promise<DashboardGalleryListItem> {
  return jsonMutation<DashboardGalleryListItem>(
    accessToken,
    `/dashboard/gallery/${id}`,
    "PATCH",
    payload,
  );
}

export async function deleteDashboardGalleryAsset(
  accessToken: string,
  id: string,
): Promise<void> {
  const res = await apiFetch(apiUrl(`/dashboard/gallery/${id}`), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
}

export async function getDashboardGalleryAssetUsages(
  accessToken: string,
  id: string,
): Promise<{ data: DashboardGalleryUsageRow[] }> {
  const res = await apiFetch(apiUrl(`/dashboard/gallery/${id}/usages`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as { data: DashboardGalleryUsageRow[] };
}

export async function attachDashboardGalleryAsset(
  accessToken: string,
  id: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean }> {
  return jsonMutation<{ ok: boolean }>(
    accessToken,
    `/dashboard/gallery/${id}/attach`,
    "POST",
    payload,
  );
}

export async function detachDashboardGalleryUsage(
  accessToken: string,
  usageId: string,
): Promise<{ ok: boolean }> {
  const res = await apiFetch(apiUrl(`/dashboard/gallery/usages/${usageId}`), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as { ok: boolean };
}

export async function postDashboardGalleryItem(
  accessToken: string,
  payload: Record<string, unknown>,
): Promise<DashboardGalleryListItem> {
  return jsonMutation<DashboardGalleryListItem>(
    accessToken,
    "/dashboard/gallery",
    "POST",
    payload,
  );
}

export async function patchDashboardGalleryItem(
  accessToken: string,
  id: string,
  payload: Record<string, unknown>,
): Promise<DashboardGalleryItem> {
  return jsonMutation<DashboardGalleryItem>(
    accessToken,
    `/dashboard/gallery/${id}`,
    "PATCH",
    payload,
  );
}

export async function patchDashboardGalleryItemStatus(
  accessToken: string,
  id: string,
  isActive: boolean,
): Promise<DashboardGalleryItem> {
  return jsonMutation<DashboardGalleryItem>(
    accessToken,
    `/dashboard/gallery/${id}/status`,
    "PATCH",
    { isActive },
  );
}

export async function getDashboardReviewsStats(
  accessToken: string,
): Promise<DashboardReviewStats> {
  const res = await apiFetch(apiUrl("/dashboard/reviews/stats"), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardReviewStats;
}

export async function getDashboardReviews(
  accessToken: string,
  query: {
    page?: number;
    pageSize?: number;
    limit?: number;
    search?: string;
    isActive?: boolean;
    showOnHomepage?: boolean;
    status?: string;
    rating?: number;
    ratingLte?: number;
    branchId?: string;
    createdFrom?: string;
    createdTo?: string;
  } = {},
): Promise<{ data: DashboardReview[]; meta: DashboardListMeta }> {
  const res = await apiFetch(
    withQuery("/dashboard/reviews", {
      page: query.page,
      pageSize: query.pageSize,
      limit: query.limit,
      search: query.search,
      isActive: query.isActive,
      showOnHomepage: query.showOnHomepage,
      status: query.status,
      rating: query.rating,
      ratingLte: query.ratingLte,
      branchId: query.branchId,
      createdFrom: query.createdFrom,
      createdTo: query.createdTo,
    }),
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as {
    data: DashboardReview[];
    meta: DashboardListMeta;
  };
}

export async function getDashboardReview(
  accessToken: string,
  id: string,
): Promise<DashboardReviewDetail> {
  const res = await apiFetch(apiUrl(`/dashboard/reviews/${id}`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardReviewDetail;
}

export async function createDashboardReview(
  accessToken: string,
  payload: CreateDashboardReviewInput,
): Promise<DashboardReview> {
  return jsonMutation<DashboardReview>(
    accessToken,
    "/dashboard/reviews",
    "POST",
    payload,
  );
}

export async function updateDashboardReview(
  accessToken: string,
  id: string,
  payload: UpdateDashboardReviewInput,
): Promise<DashboardReview> {
  return jsonMutation<DashboardReview>(
    accessToken,
    `/dashboard/reviews/${id}`,
    "PATCH",
    payload,
  );
}

export async function activateDashboardReview(
  accessToken: string,
  id: string,
): Promise<DashboardReview> {
  return jsonMutation<DashboardReview>(
    accessToken,
    `/dashboard/reviews/${id}/activate`,
    "POST",
    {},
  );
}

export async function deactivateDashboardReview(
  accessToken: string,
  id: string,
): Promise<DashboardReview> {
  return jsonMutation<DashboardReview>(
    accessToken,
    `/dashboard/reviews/${id}/deactivate`,
    "POST",
    {},
  );
}

export async function updateDashboardReviewHomepageVisibility(
  accessToken: string,
  id: string,
  payload: UpdateReviewHomepageVisibilityInput,
): Promise<DashboardReview> {
  return jsonMutation<DashboardReview>(
    accessToken,
    `/dashboard/reviews/${id}/homepage-visibility`,
    "PATCH",
    payload,
  );
}

export async function reorderDashboardReviews(
  accessToken: string,
  payload: ReorderReviewsInput,
): Promise<{ ok: true }> {
  return jsonMutation<{ ok: true }>(
    accessToken,
    "/dashboard/reviews/reorder",
    "PATCH",
    payload,
  );
}

/** @deprecated Use updateDashboardReview */
export async function patchDashboardReview(
  accessToken: string,
  id: string,
  payload: Record<string, unknown>,
): Promise<DashboardReview> {
  return updateDashboardReview(
    accessToken,
    id,
    payload as UpdateDashboardReviewInput,
  );
}

export async function getDashboardReportsOperations(
  accessToken: string,
  query: DashboardReportsQuery = {},
): Promise<DashboardReportSectionResponse> {
  return getDashboardReportSection(
    accessToken,
    "/dashboard/reports/operations",
    query,
  );
}

export async function getDashboardReportsFinancial(
  accessToken: string,
  query: DashboardReportsQuery = {},
): Promise<DashboardReportSectionResponse> {
  return getDashboardReportSection(
    accessToken,
    "/dashboard/reports/financial",
    query,
  );
}

export async function getDashboardReportsBookings(
  accessToken: string,
  query: DashboardReportsQuery = {},
): Promise<DashboardReportSectionResponse> {
  return getDashboardReportSection(
    accessToken,
    "/dashboard/reports/bookings",
    query,
  );
}

export async function getDashboardReportsServices(
  accessToken: string,
  query: DashboardReportsQuery = {},
): Promise<DashboardReportSectionResponse> {
  return getDashboardReportSection(
    accessToken,
    "/dashboard/reports/services",
    query,
  );
}

export async function getDashboardReportsClients(
  accessToken: string,
  query: DashboardReportsQuery = {},
): Promise<DashboardReportSectionResponse> {
  return getDashboardReportSection(
    accessToken,
    "/dashboard/reports/clients",
    query,
  );
}

export async function getDashboardReportsPayments(
  accessToken: string,
  query: DashboardReportsQuery = {},
): Promise<DashboardReportSectionResponse> {
  return getDashboardReportSection(
    accessToken,
    "/dashboard/reports/payments",
    query,
  );
}

export async function getDashboardFinancialReports(
  accessToken: string,
  query: DashboardReportsQuery = {},
): Promise<DashboardFinancialReport> {
  const res = await apiFetch(
    withQuery("/dashboard/reports/financial-summary", query),
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardFinancialReport;
}

export async function exportDashboardFinancialReport(
  accessToken: string,
  query: DashboardReportsQuery & {
    type?:
      | "summary"
      | "payments"
      | "outstanding"
      | "sales-items"
      | "daily-closing";
  } = {},
): Promise<Blob> {
  const res = await apiFetch(
    withQuery("/dashboard/reports/financial/export", query),
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return await res.blob();
}

export async function getDashboardStaffServicesRevenueReport(
  accessToken: string,
  query: StaffServicesRevenueQuery = {},
): Promise<StaffServicesRevenueReport> {
  const res = await apiFetch(
    withQuery("/dashboard/reports/staff-services-revenue", query),
    {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as StaffServicesRevenueReport;
}

export async function getDashboardStaffServicesRevenueDetail(
  accessToken: string,
  staffId: string,
  query: StaffServicesRevenueQuery = {},
): Promise<StaffServicesRevenueDetailReport> {
  const res = await apiFetch(
    withQuery(`/dashboard/reports/staff-services-revenue/${staffId}`, query),
    {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as StaffServicesRevenueDetailReport;
}

export async function exportDashboardStaffServicesRevenueReport(
  accessToken: string,
  query: StaffServicesRevenueQuery = {},
): Promise<Blob> {
  const res = await apiFetch(
    withQuery("/dashboard/reports/staff-services-revenue/export.csv", query),
    {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return await res.blob();
}

export async function getDashboardAuditLogs(
  accessToken: string,
  query: DashboardAuditLogsQuery = {},
): Promise<DashboardAuditLogsResponse> {
  const res = await apiFetch(
    withQuery("/dashboard/audit-logs", {
      search: query.search,
      module: query.module,
      action: query.action,
      entityType: query.entityType,
      userId: query.userId,
      branchId: query.branchId,
      severity: query.severity,
      entityId: query.entityId,
      category: query.category,
      overridesOnly: query.overridesOnly ? "true" : undefined,
      bookingId: query.bookingId,
      clientId: query.clientId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      page: query.page,
      limit: query.limit,
    }),
    {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardAuditLogsResponse;
}

export async function getDashboardAuditLogById(
  accessToken: string,
  id: string,
): Promise<DashboardAuditLogDetail> {
  const res = await apiFetch(apiUrl(`/dashboard/audit-logs/${id}`), {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardAuditLogDetail;
}

export async function getDashboardAuditLogFacets(
  accessToken: string,
): Promise<DashboardAuditLogFacets> {
  const res = await apiFetch(apiUrl("/dashboard/audit-logs/facets"), {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardAuditLogFacets;
}

// --- Dashboard notification logs (WhatsApp) ---

export type DashboardNotificationChannel = "WHATSAPP";

export type DashboardNotificationType =
  | "BOOKING_CONFIRMATION"
  | "BOOKING_REQUEST_RECEIVED"
  | "BOOKING_REJECTED"
  | "BOOKING_RESCHEDULED"
  | "APPOINTMENT_REMINDER"
  | "APPOINTMENT_REMINDER_90M"
  | "BOOKING_CANCELLATION"
  | "CHANGE_REQUEST_UPDATE";

export type DashboardNotificationStatus = "PENDING" | "SENT" | "FAILED";

export type DashboardNotificationLogItem = {
  id: string;
  channel: DashboardNotificationChannel;
  type: DashboardNotificationType;
  status: DashboardNotificationStatus;
  recipientPhone: string;
  provider: string;
  bookingId: string | null;
  bookingReference: string | null;
  clientName: string | null;
  branchId: string | null;
  branchName: string | null;
  bookingDateLabel: string | null;
  bookingTimeLabel: string | null;
  createdAt: string;
  sentAt: string | null;
  errorMessage: string | null;
  canRetry: boolean;
};

export type DashboardNotificationLogsQuery = {
  search?: string;
  channel?: DashboardNotificationChannel;
  type?: DashboardNotificationType;
  status?: DashboardNotificationStatus;
  branchId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
};

export type DashboardNotificationLogsResponse = {
  data: DashboardNotificationLogItem[];
  meta: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
  };
};

export type DashboardNotificationLogDetail = DashboardNotificationLogItem & {
  changeRequestId: string | null;
  providerMessageId: string | null;
  updatedAt: string;
  client: {
    id: string;
    fullName: string;
    phone: string;
    email: string | null;
  } | null;
  booking: {
    id: string;
    status: string;
    reference: string;
    dateLabel: string;
    timeLabel: string;
    services: string;
  } | null;
  changeRequest: {
    id: string;
    status: string;
    requestType: string;
    handledAt: string | null;
  } | null;
};

export type DashboardNotificationRetryResponse = {
  success: true;
  attempt: DashboardNotificationLogDetail;
};

export async function getDashboardNotificationLogs(
  accessToken: string,
  query: DashboardNotificationLogsQuery = {},
): Promise<DashboardNotificationLogsResponse> {
  const res = await apiFetch(
    withQuery("/dashboard/notifications", {
      search: query.search,
      channel: query.channel,
      type: query.type,
      status: query.status,
      branchId: query.branchId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      page: query.page,
      pageSize: query.pageSize,
    }),
    {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardNotificationLogsResponse;
}

export async function getDashboardNotificationLogById(
  accessToken: string,
  id: string,
): Promise<DashboardNotificationLogDetail> {
  const res = await apiFetch(apiUrl(`/dashboard/notifications/${id}`), {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardNotificationLogDetail;
}

export async function retryDashboardNotification(
  accessToken: string,
  id: string,
): Promise<DashboardNotificationRetryResponse> {
  const res = await apiFetch(apiUrl(`/dashboard/notifications/${id}/retry`), {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardNotificationRetryResponse;
}

// --- Cash drawer & daily closing (finance) ---

export type DashboardCashDrawerMovement = {
  id: string;
  type: "CASH_IN" | "CASH_OUT" | "ADJUSTMENT" | string;
  amount: number;
  reason: string;
  notes: string | null;
  createdAt: string;
  createdBy: { id: string; name: string };
};

export type DashboardCashDrawerSession = {
  id: string;
  shortRef: string;
  branchId: string;
  businessDate: string;
  status: "OPEN" | "CLOSED" | string;
  openingBalance: number;
  expectedCash: number;
  countedCash: number | null;
  cashDifference: number | null;
  notes: string | null;
  openedAt: string;
  closedAt: string | null;
  openedBy: { id: string; name: string };
  closedBy: { id: string; name: string } | null;
  movements: DashboardCashDrawerMovement[];
  totals: {
    cashPaymentsTotal: number;
    cashInTotal: number;
    cashOutTotal: number;
    adjustmentTotal: number;
  };
};

export type DashboardCashDrawerSummary = {
  openingBalance: number;
  cashPaymentsTotal: number;
  cashInTotal: number;
  cashOutTotal: number;
  adjustmentTotal: number;
  expectedCash: number;
  countedCash: number | null;
  cashDifference: number | null;
  status: string;
};

export type DashboardCashDrawerCashPaymentRow = {
  id: string;
  amount: number;
  paidAt: string | null;
  createdAt: string;
  client: { id: string; fullName: string } | null;
  cashier: { id: string; name: string } | null;
  invoice: { id: string; invoiceNumber: string } | null;
  bookingId: string;
};

export type DashboardCashDrawerCurrentResponse = {
  session: DashboardCashDrawerSession | null;
  summary: DashboardCashDrawerSummary | null;
  recentCashPayments: DashboardCashDrawerCashPaymentRow[];
};

export type DashboardCashDrawerDetailResponse =
  DashboardCashDrawerCurrentResponse;

export type DashboardPaymentBreakdownRow = {
  amount: number;
  count: number;
};

export type DashboardPaymentBreakdown = Record<
  string,
  DashboardPaymentBreakdownRow
>;

export type DashboardDailyClosingInvoiceSummary = {
  finalizedCount: number;
  paidCount: number;
  partiallyPaidCount: number;
  unpaidCount: number;
  totalInvoiced: number;
  totalPaid: number;
  totalRemaining: number;
};

export type DashboardOperationalSummary = {
  bookingCount: number;
  completedBookingCount: number;
  inProgressBookingCount: number;
  cancelledBookingCount: number;
  queueVisitCount: number;
  queueCompletedCount: number;
  queueActiveCount: number;
};

export type DashboardDailyClosingSummaryResponse = {
  branch: { id: string; name: string };
  businessDate: string;
  status: "OPEN" | "DRAFT" | "CLOSED" | string;
  existingClosingId: string | null;
  closingStatus: string | null;
  closedBy: { id: string; name: string } | null;
  closedAt: string | null;
  cashDrawerSummary: Record<string, unknown>;
  drawerSessionStatus: string | null;
  salesSummary: {
    grossSales: number;
    /** Receipt + single-line discounts on the day's invoices. */
    totalDiscounts?: number;
    /** Invoice amounts settled with loyalty points / the visit reward (not money received). */
    loyaltyRedeemed?: number;
    totalCollected: number;
    outstandingBalance: number;
  };
  paymentBreakdown: DashboardPaymentBreakdown;
  invoiceSummary: DashboardDailyClosingInvoiceSummary;
  paymentSummary: { paymentCount: number; totalCollected: number };
  operationalSummary: DashboardOperationalSummary;
  warnings: string[];
  recentInvoices: Array<{
    id: string;
    invoiceNumber: string;
    client: { id: string; fullName: string } | null;
    totalAmount: number;
    paidAmount: number;
    remainingAmount: number;
    paymentStatus: string;
    createdAt: string;
    bookingId: string;
  }>;
  recentPayments: Array<{
    id: string;
    amount: number;
    method: string;
    reference: string | null;
    paidAt: string | null;
    createdAt: string;
    client: { id: string; fullName: string } | null;
    cashier: { id: string; name: string } | null;
    invoice: { id: string; invoiceNumber: string } | null;
    bookingId: string;
  }>;
  snapshot: Record<string, unknown>;
  draftNotes: string | null;
  openItems?: DashboardDailyClosingOpenItems;
  openItemsPolicy?: DayCloseOpenItemsPolicy;
  carryOverReason?: string | null;
};

export type DashboardDailyClosingOpenItems = {
  openVisits: Array<{
    queueEntryId: string;
    bookingId: string | null;
    status: string;
    checkedInAt: string;
    clientName: string;
    clientPhone: string | null;
    serviceSummary: string | null;
  }>;
  unpaidInvoices: Array<{
    id: string;
    invoiceNumber: string;
    bookingId: string;
    client: { id: string; fullName: string; phone: string } | null;
    totalAmount: number;
    paidAmount: number;
    remainingAmount: number;
  }>;
};

export type DashboardDailyClosingReport = {
  id: string;
  shortRef: string;
  branch: { id: string; name: string };
  businessDate: string;
  status: string;
  notes: string | null;
  closedBy: { id: string; name: string } | null;
  closedAt: string | null;
  totals: {
    totalInvoices: number;
    grossSales: number;
    totalDiscounts?: number;
    totalCollected: number;
    cashCollected: number;
    cardCollected: number;
    instapayCollected: number;
    walletCollected: number;
    bankTransferCollected: number;
    otherCollected: number;
    outstandingBalance: number;
    expectedCash: number;
    countedCash: number;
    cashDifference: number;
    invoiceCount: number;
    paymentCount: number;
    bookingCount: number;
    completedBookingCount: number;
    inProgressBookingCount: number;
    cancelledBookingCount: number;
    queueVisitCount: number;
    queueCompletedCount: number;
    queueActiveCount: number;
  };
  savedSnapshot: unknown;
  liveSnapshot: Record<string, unknown>;
  warnings: string[];
  readOnly: boolean;
};

export async function getDashboardCashDrawerCurrent(
  accessToken: string,
  params: { branchId: string; date: string },
): Promise<DashboardCashDrawerCurrentResponse> {
  const res = await apiFetch(
    withQuery("/dashboard/cash-drawer/current", {
      branchId: params.branchId,
      date: params.date,
    }),
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw await parseApiError(res);
  return (await res.json()) as DashboardCashDrawerCurrentResponse;
}

export async function openDashboardCashDrawer(
  accessToken: string,
  payload: {
    branchId: string;
    businessDate: string;
    openingBalance: number;
    notes?: string;
  },
): Promise<DashboardCashDrawerDetailResponse> {
  return jsonMutation<DashboardCashDrawerDetailResponse>(
    accessToken,
    "/dashboard/cash-drawer/open",
    "POST",
    payload,
  );
}

export async function getDashboardCashDrawer(
  accessToken: string,
  id: string,
): Promise<DashboardCashDrawerDetailResponse> {
  const res = await apiFetch(apiUrl(`/dashboard/cash-drawer/${id}`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw await parseApiError(res);
  return (await res.json()) as DashboardCashDrawerDetailResponse;
}

export async function updateDashboardCashDrawer(
  accessToken: string,
  id: string,
  payload: { countedCash?: number; notes?: string },
): Promise<DashboardCashDrawerDetailResponse> {
  return jsonMutation<DashboardCashDrawerDetailResponse>(
    accessToken,
    `/dashboard/cash-drawer/${id}`,
    "PATCH",
    payload,
  );
}

export async function addDashboardCashDrawerMovement(
  accessToken: string,
  id: string,
  payload: {
    type: "CASH_IN" | "CASH_OUT" | "ADJUSTMENT";
    amount: number;
    reason: string;
    notes?: string;
  },
): Promise<DashboardCashDrawerDetailResponse> {
  return jsonMutation<DashboardCashDrawerDetailResponse>(
    accessToken,
    `/dashboard/cash-drawer/${id}/movements`,
    "POST",
    payload,
  );
}

export async function closeDashboardCashDrawer(
  accessToken: string,
  id: string,
  payload: { countedCash: number; notes?: string },
): Promise<DashboardCashDrawerDetailResponse> {
  return jsonMutation<DashboardCashDrawerDetailResponse>(
    accessToken,
    `/dashboard/cash-drawer/${id}/close`,
    "POST",
    payload,
  );
}

export async function getDashboardDailyClosingSummary(
  accessToken: string,
  params: { branchId: string; date: string },
): Promise<DashboardDailyClosingSummaryResponse> {
  const res = await apiFetch(
    withQuery("/dashboard/daily-closing/summary", {
      branchId: params.branchId,
      date: params.date,
    }),
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw await parseApiError(res);
  return (await res.json()) as DashboardDailyClosingSummaryResponse;
}

export async function saveDashboardDailyClosingDraft(
  accessToken: string,
  payload: { branchId: string; businessDate: string; notes?: string },
): Promise<DashboardDailyClosingReport> {
  return jsonMutation<DashboardDailyClosingReport>(
    accessToken,
    "/dashboard/daily-closing",
    "POST",
    payload,
  );
}

export async function getDashboardDailyClosing(
  accessToken: string,
  id: string,
): Promise<DashboardDailyClosingReport> {
  const res = await apiFetch(apiUrl(`/dashboard/daily-closing/${id}`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw await parseApiError(res);
  return (await res.json()) as DashboardDailyClosingReport;
}

export async function closeDashboardDailyClosing(
  accessToken: string,
  id: string,
  payload: { notes?: string; carryOverReason?: string },
): Promise<DashboardDailyClosingReport> {
  return jsonMutation<DashboardDailyClosingReport>(
    accessToken,
    `/dashboard/daily-closing/${id}/close`,
    "POST",
    payload,
  );
}

// ---------------------------------------------------------------------------
// Slot horizon + Holidays & closures (Batch 3)
// ---------------------------------------------------------------------------

export type DashboardSlotHorizonStatus = {
  branchId: string;
  todayYmd: string;
  lastSlotDate: string | null;
  /** Days between today and the last day that has slots; -1 when there are none. */
  daysAhead: number;
  horizonDays: number;
  /** False until slot defaults (working days/hours) were saved — automatic slots need them. */
  autoGenerationConfigured: boolean;
  low: boolean;
};

export type DashboardClosureAffectedBooking = {
  id: string;
  status: string;
  client: { id: string; fullName: string; phone: string } | null;
  slot: { date: string; startTime: string; endTime: string };
};

export type DashboardBranchClosure = {
  id: string;
  branchId: string;
  startDate: string;
  endDate: string;
  reason: string;
  createdAt: string;
  state: "PAST" | "ACTIVE" | "UPCOMING";
  closedSlotCount: number;
  affectedBookings: DashboardClosureAffectedBooking[];
};

export type DashboardClosureInput = {
  startDate: string;
  endDate: string;
  reason: string;
};

export async function getDashboardSlotHorizon(
  accessToken: string,
  branchId: string,
): Promise<DashboardSlotHorizonStatus> {
  const res = await apiFetch(
    apiUrl(`/dashboard/branches/${branchId}/slots/horizon`),
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw await parseApiError(res);
  return (await res.json()) as DashboardSlotHorizonStatus;
}

export async function ensureDashboardSlotHorizon(
  accessToken: string,
  branchId: string,
): Promise<{
  createdCount: number;
  closedDaysSkipped: number;
  dateFrom: string;
  dateTo: string;
  status: DashboardSlotHorizonStatus;
}> {
  return jsonMutation(
    accessToken,
    `/dashboard/branches/${branchId}/slots/ensure-horizon`,
    "POST",
    {},
  );
}

export async function getDashboardClosures(
  accessToken: string,
  branchId: string,
  opts?: { includePast?: boolean },
): Promise<{
  data: DashboardBranchClosure[];
  horizon: DashboardSlotHorizonStatus;
}> {
  const res = await apiFetch(
    apiUrl(
      `/dashboard/branches/${branchId}/closures${opts?.includePast ? "?includePast=true" : ""}`,
    ),
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw await parseApiError(res);
  return (await res.json()) as {
    data: DashboardBranchClosure[];
    horizon: DashboardSlotHorizonStatus;
  };
}

export async function previewDashboardClosure(
  accessToken: string,
  branchId: string,
  payload: DashboardClosureInput,
): Promise<{
  affectedBookings: DashboardClosureAffectedBooking[];
  openSlotCount: number;
}> {
  return jsonMutation(
    accessToken,
    `/dashboard/branches/${branchId}/closures/preview`,
    "POST",
    payload,
  );
}

export async function createDashboardClosure(
  accessToken: string,
  branchId: string,
  payload: DashboardClosureInput,
): Promise<DashboardBranchClosure> {
  return jsonMutation<DashboardBranchClosure>(
    accessToken,
    `/dashboard/branches/${branchId}/closures`,
    "POST",
    payload,
  );
}

export async function deleteDashboardClosure(
  accessToken: string,
  branchId: string,
  closureId: string,
): Promise<{ id: string; reopenedSlots: number; createdSlots: number }> {
  return jsonMutation(
    accessToken,
    `/dashboard/branches/${branchId}/closures/${closureId}`,
    "DELETE",
  );
}

// ---------------------------------------------------------------------------
// Loyalty program
// ---------------------------------------------------------------------------

export type DashboardLoyaltyRules = {
  enabled: boolean;
  pointsPerEgp: number;
  redeemPoints: number;
  redeemValue: number;
  visitsForReward: number;
  rewardServiceId: string | null;
  rewardServiceName: string | null;
  startedAt: string | null;
};

export type DashboardLoyaltySummary = {
  enabled: boolean;
  clientId: string;
  points: number;
  earnedPoints: number;
  redeemedPoints: number;
  adjustedPoints: number;
  redeemBlockPoints: number;
  redeemBlockValue: number;
  redeemableBlocks: number;
  visits: number;
  visitsForReward: number;
  rewardsEarned: number;
  rewardsUsed: number;
  rewardsAvailable: number;
  visitsToNextReward: number;
  rewardServiceId: string | null;
  rewardServiceName: string | null;
};

export type DashboardLoyaltyVisitSummary = DashboardLoyaltySummary & {
  invoiceRemaining: number | null;
  rewardLineOnVisit: boolean;
  alreadyRedeemedOnVisit: number;
};

export type DashboardLoyaltyClientRow = DashboardLoyaltySummary & {
  fullName: string;
  phone: string;
};

export type DashboardLoyaltyClientDetail = DashboardLoyaltySummary & {
  client: { id: string; fullName: string };
  history: Array<{
    id: string;
    type: "REDEEM_POINTS" | "REWARD" | "ADJUST";
    points: number;
    amountEgp: number | null;
    note: string | null;
    createdAt: string;
    reversed: boolean;
  }>;
};

async function loyaltyGet<T>(accessToken: string, path: string): Promise<T> {
  const res = await apiFetch(apiUrl(path), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw await parseApiError(res);
  return (await res.json()) as T;
}

export function getDashboardLoyaltySettings(accessToken: string): Promise<DashboardLoyaltyRules> {
  return loyaltyGet(accessToken, "/dashboard/loyalty/settings");
}

export function updateDashboardLoyaltySettings(
  accessToken: string,
  payload: Partial<{
    enabled: boolean;
    pointsPerEgp: number;
    redeemPoints: number;
    redeemValue: number;
    visitsForReward: number;
    rewardServiceId: string | null;
  }>,
): Promise<DashboardLoyaltyRules> {
  return jsonMutation(accessToken, "/dashboard/loyalty/settings", "PATCH", payload);
}

export function getDashboardLoyaltyClients(
  accessToken: string,
): Promise<{ rules: DashboardLoyaltyRules; data: DashboardLoyaltyClientRow[] }> {
  return loyaltyGet(accessToken, "/dashboard/loyalty/clients");
}

export function getDashboardLoyaltyClient(
  accessToken: string,
  clientId: string,
): Promise<DashboardLoyaltyClientDetail> {
  return loyaltyGet(accessToken, `/dashboard/loyalty/clients/${clientId}`);
}

export function adjustDashboardLoyaltyPoints(
  accessToken: string,
  clientId: string,
  payload: { points: number; note: string },
): Promise<DashboardLoyaltySummary> {
  return jsonMutation(accessToken, `/dashboard/loyalty/clients/${clientId}/adjust`, "POST", payload);
}

export function getDashboardQueueLoyalty(
  accessToken: string,
  queueEntryId: string,
): Promise<DashboardLoyaltyVisitSummary> {
  return loyaltyGet(accessToken, `/dashboard/queue/${queueEntryId}/loyalty`);
}

export function redeemDashboardQueueLoyaltyPoints(
  accessToken: string,
  queueEntryId: string,
  blocks = 1,
): Promise<{ redeemedPoints: number; amount: number; loyalty: DashboardLoyaltySummary }> {
  return jsonMutation(accessToken, `/dashboard/queue/${queueEntryId}/loyalty/redeem-points`, "POST", { blocks });
}

export function redeemDashboardQueueLoyaltyReward(
  accessToken: string,
  queueEntryId: string,
): Promise<{ amount: number; loyalty: DashboardLoyaltySummary }> {
  return jsonMutation(accessToken, `/dashboard/queue/${queueEntryId}/loyalty/redeem-reward`, "POST");
}
