export type DashboardLoginUser = {
  id: string;
  name: string;
  email: string;
  roleId: string;
  branchId: string | null;
};

export type DashboardLoginResponse = {
  accessToken: string;
  expiresIn: number;
  user: DashboardLoginUser;
};

export type DashboardAuthMeResponse = {
  id: string;
  name: string;
  email: string;
  roleId: string;
  branchId: string | null;
  staffId?: string | null;
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
  createdAt?: string;
  user?: {
    id?: string;
    name?: string;
    email?: string;
  } | null;
};

export type DashboardReportsOverviewResponse = {
  range?: { from: string | null; to: string | null };
  branchId?: string | null;
  todayBookings?: number;
  pendingBookings?: number;
  confirmedBookings?: number;
  completedBookings?: number;
  cancelledBookings?: number;
  noShowBookings?: number;
  upcomingAppointments?: DashboardOverviewAppointment[];
  recentActivity?: DashboardOverviewActivity[];
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

export type DashboardAuditLogItem = {
  id: string;
  module: string;
  action: string;
  entityId?: string | null;
  entityType?: string | null;
  userId?: string | null;
  metadata?: unknown;
  createdAt: string;
  user?: {
    id?: string;
    name?: string | null;
    email?: string | null;
  } | null;
};

export type DashboardAuditLogsQuery = {
  module?: string;
  action?: string;
  userId?: string;
  entityId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
};

export type DashboardAuditLogsResponse = {
  data: DashboardAuditLogItem[];
  meta: DashboardListMeta;
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
};

export type DashboardSlotsListResponse = {
  data: DashboardSlot[];
  meta: DashboardListMeta;
};

export type DashboardBookingsListItem = {
  id: string;
  status: string;
  branchId: string;
  slotId: string | null;
  clientId: string;
  source: string;
  totalAmount: number;
  currency: "EGP" | string;
  createdAt: string;
};

export type DashboardBookingsListResponse = {
  data: DashboardBookingsListItem[];
  meta: DashboardListMeta;
};

export type DashboardBookingDetail = {
  id: string;
  status: string;
  branchId: string;
  slotId: string;
  source: string;
  subtotal: number;
  discountAmount: number;
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
    nameSnapshot: string;
    priceSnapshot: number;
    durationMinutesSnapshot: number;
    quantity: number;
    lineMetadata: unknown;
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
    paidAmount: number;
    remainingAmount: number;
    status: string;
  } | null;
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
  nameSnapshot: string;
  priceSnapshot: number;
  durationMinutesSnapshot: number;
  quantity: number;
  lineMetadata: unknown;
};

export type DashboardInvoiceListItem = {
  id: string;
  invoiceNumber: string;
  bookingId: string;
  clientId: string;
  subtotal: number;
  discountAmount: number;
  vatRate: number;
  vatAmount: number;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: string;
  paymentMethod: string | null;
  currency: "EGP" | string;
  createdAt: string;
  updatedAt: string;
};

export type DashboardInvoiceDetail = DashboardInvoiceListItem & {
  lines: DashboardInvoiceLine[];
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
  defaultVatRate: number;
  pricesIncludeVat: boolean;
  showVatOnInvoice: boolean;
  taxRegistrationNumber: string | null;
  defaultTimezone: string;
  defaultCurrency: string;
};

export type PatchDashboardVatSettingsInput = Partial<{
  vatEnabled: boolean;
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

export type DashboardWhatsappTemplate = {
  id: string;
  name: string;
  templateKey: string;
  content: string;
  variables: unknown;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DashboardWhatsappTemplatesResponse = {
  data: DashboardWhatsappTemplate[];
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
  description: string | null;
  imageUrl: string | null;
  priceDisplayType: "FIXED" | "STARTS_FROM" | "RANGE" | "CONTACT" | string;
  basePrice: number | null;
  basePriceMax: number | null;
  durationMinutes: number | null;
  isTaxable: boolean;
  bookingAvailability: boolean;
  preparationNotes: string | null;
  aftercareNotes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  currency: "EGP" | string;
  branchIds: string[];
};

export type DashboardServiceVariant = {
  id: string;
  serviceId: string;
  name: string;
  description: string | null;
  price: number;
  durationMinutes: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  currency: "EGP" | string;
};

export type DashboardPackage = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  originalPrice: number;
  packagePrice: number;
  durationMinutes: number;
  startDate: string | null;
  endDate: string | null;
  isTaxable: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  currency: "EGP" | string;
  serviceIds: string[];
  branchIds: string[];
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
  offerCode: string | null;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT" | string;
  discountValue: number;
  startDate: string;
  endDate: string;
  usageLimit: number | null;
  perClientUsageLimit: number | null;
  isActive: boolean;
  eligibilityRules: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  currency: "EGP" | string;
};

export type DashboardGalleryItem = {
  id: string;
  imageUrl: string;
  title: string | null;
  category: string | null;
  description: string | null;
  isFeatured: boolean;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DashboardReview = {
  id: string;
  clientId: string | null;
  bookingId: string | null;
  relatedServiceId: string | null;
  rating: number;
  comment: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "HIDDEN" | string;
  displayOnWebsite: boolean;
  createdAt: string;
  updatedAt: string;
  client?: {
    id: string;
    fullName: string;
  } | null;
  booking?: {
    id: string;
    status: string;
  } | null;
};

export class ApiClientError extends Error {
  statusCode: number;
  code?: string;

  constructor(message: string, statusCode: number, code?: string) {
    super(message);
    this.name = "ApiClientError";
    this.statusCode = statusCode;
    this.code = code;
  }
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
  const base = (raw ?? "http://localhost:4000/api/v1").replace(/\/$/, "");
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

/**
 * POST /dashboard/auth/login (Sprint 1).
 * Caller handles token storage (e.g. sessionStorage).
 */
export async function postDashboardAuthLogin(
  email: string,
  password: string,
): Promise<DashboardLoginResponse> {
  const res = await fetch(apiUrl("/dashboard/auth/login"), {
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

async function parseApiError(res: Response): Promise<ApiClientError> {
  let message = `Request failed (${res.status})`;
  let code: string | undefined;

  try {
    const body = (await res.json()) as unknown;
    if (typeof body === "object" && body !== null) {
      const maybeMessage = (body as { message?: unknown }).message;
      const maybeCode = (body as { code?: unknown }).code;

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

  return new ApiClientError(message, res.status, code);
}

export async function getDashboardAuthMe(
  accessToken: string,
): Promise<DashboardAuthMeResponse> {
  const res = await fetch(apiUrl("/dashboard/auth/me"), {
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

export async function getDashboardAuthPermissions(
  accessToken: string,
): Promise<DashboardPermissionsResponse> {
  const res = await fetch(apiUrl("/dashboard/auth/permissions"), {
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

export async function getDashboardReportsOverview(
  accessToken: string,
  query: DashboardReportsQuery = {},
): Promise<DashboardReportsOverviewResponse> {
  const res = await fetch(withQuery("/dashboard/reports/overview", query), {
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
  const res = await fetch(withQuery(resourcePath, query), {
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

export async function getDashboardBranches(
  accessToken: string,
): Promise<DashboardBranch[]> {
  const res = await fetch(apiUrl("/dashboard/branches"), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardBranch[];
}

export async function getDashboardBookings(
  accessToken: string,
  query: DashboardBookingsListQuery = {},
): Promise<DashboardBookingsListResponse> {
  const res = await fetch(
    withQuery("/dashboard/bookings", {
      branchId: query.branchId,
      status: query.status,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      clientId: query.clientId,
      slotId: query.slotId,
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
  const res = await fetch(apiUrl(`/dashboard/bookings/${bookingId}`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardBookingDetail;
}

export async function getDashboardSlots(
  accessToken: string,
  branchId: string,
  query: DashboardSlotsListQuery = {},
): Promise<DashboardSlotsListResponse> {
  const res = await fetch(
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
  const res = await fetch(apiUrl(`/dashboard/branches/${branchId}/slots/${slotId}`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
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
  const res = await fetch(apiUrl(path), {
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
    | "require-follow-up"
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

export async function getDashboardBookingPayments(
  accessToken: string,
  bookingId: string,
): Promise<DashboardBookingPaymentsResponse> {
  const res = await fetch(apiUrl(`/dashboard/bookings/${bookingId}/payments`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardBookingPaymentsResponse;
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
  const res = await fetch(
    withQuery("/dashboard/invoices", {
      branchId: query.branchId,
      bookingId: query.bookingId,
      clientId: query.clientId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
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
  const res = await fetch(apiUrl(`/dashboard/invoices/${invoiceId}`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardInvoiceDetail;
}

export async function postDashboardBookingInvoice(
  accessToken: string,
  bookingId: string,
): Promise<DashboardInvoiceDetail> {
  return jsonMutation<DashboardInvoiceDetail>(
    accessToken,
    `/dashboard/bookings/${bookingId}/invoices`,
    "POST",
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

export async function postDashboardWhatsappDeepLink(
  accessToken: string,
  payload: { templateKey: string; bookingId: string; clientId?: string },
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
  const res = await fetch(apiUrl("/dashboard/settings/vat"), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardVatSettingsResponse;
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
  const res = await fetch(apiUrl("/dashboard/settings/payment-policy"), {
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

export async function getDashboardWhatsappTemplates(
  accessToken: string,
): Promise<DashboardWhatsappTemplatesResponse> {
  const res = await fetch(apiUrl("/dashboard/whatsapp-templates"), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as DashboardWhatsappTemplatesResponse;
}

export async function postDashboardWhatsappTemplate(
  accessToken: string,
  payload: {
    name: string;
    templateKey: string;
    content: string;
    variables?: string[];
    isActive?: boolean;
  },
): Promise<DashboardWhatsappTemplate> {
  return jsonMutation<DashboardWhatsappTemplate>(
    accessToken,
    "/dashboard/whatsapp-templates",
    "POST",
    payload,
  );
}

export async function patchDashboardWhatsappTemplate(
  accessToken: string,
  templateId: string,
  payload: Partial<{
    name: string;
    content: string;
    variables: string[];
    isActive: boolean;
  }>,
): Promise<DashboardWhatsappTemplate> {
  return jsonMutation<DashboardWhatsappTemplate>(
    accessToken,
    `/dashboard/whatsapp-templates/${templateId}`,
    "PATCH",
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
  const res = await fetch(
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
  const res = await fetch(apiUrl(`/dashboard/booking-change-requests/${requestId}`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
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
  const res = await fetch(
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
  const res = await fetch(apiUrl(`/dashboard/clients/${clientId}`), {
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
  return jsonMutation<DashboardClient>(accessToken, "/dashboard/clients", "POST", payload);
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
  const res = await fetch(
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
  const res = await fetch(
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
  return (await res.json()) as { data: DashboardService[]; meta: DashboardListMeta };
}

export async function postDashboardService(
  accessToken: string,
  payload: Record<string, unknown>,
): Promise<DashboardService> {
  return jsonMutation<DashboardService>(accessToken, "/dashboard/services", "POST", payload);
}

export async function patchDashboardService(
  accessToken: string,
  id: string,
  payload: Record<string, unknown>,
): Promise<DashboardService> {
  return jsonMutation<DashboardService>(accessToken, `/dashboard/services/${id}`, "PATCH", payload);
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
  const res = await fetch(apiUrl(`/dashboard/services/${serviceId}/variants`), {
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
  query: { page?: number; pageSize?: number; isActive?: boolean } = {},
): Promise<{ data: DashboardPackage[]; meta: DashboardListMeta }> {
  const res = await fetch(
    withQuery("/dashboard/packages", {
      page: query.page,
      pageSize: query.pageSize,
      isActive: query.isActive,
    }),
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as { data: DashboardPackage[]; meta: DashboardListMeta };
}

export async function postDashboardPackage(
  accessToken: string,
  payload: Record<string, unknown>,
): Promise<DashboardPackage> {
  return jsonMutation<DashboardPackage>(accessToken, "/dashboard/packages", "POST", payload);
}

export async function patchDashboardPackage(
  accessToken: string,
  id: string,
  payload: Record<string, unknown>,
): Promise<DashboardPackage> {
  return jsonMutation<DashboardPackage>(accessToken, `/dashboard/packages/${id}`, "PATCH", payload);
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
  const res = await fetch(
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
  return (await res.json()) as { data: DashboardBundle[]; meta: DashboardListMeta };
}

export async function postDashboardBundle(
  accessToken: string,
  payload: Record<string, unknown>,
): Promise<DashboardBundle> {
  return jsonMutation<DashboardBundle>(accessToken, "/dashboard/bundles", "POST", payload);
}

export async function patchDashboardBundle(
  accessToken: string,
  id: string,
  payload: Record<string, unknown>,
): Promise<DashboardBundle> {
  return jsonMutation<DashboardBundle>(accessToken, `/dashboard/bundles/${id}`, "PATCH", payload);
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
  const res = await fetch(
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
  return (await res.json()) as { data: DashboardOffer[]; meta: DashboardListMeta };
}

export async function postDashboardOffer(
  accessToken: string,
  payload: Record<string, unknown>,
): Promise<DashboardOffer> {
  return jsonMutation<DashboardOffer>(accessToken, "/dashboard/offers", "POST", payload);
}

export async function patchDashboardOffer(
  accessToken: string,
  id: string,
  payload: Record<string, unknown>,
): Promise<DashboardOffer> {
  return jsonMutation<DashboardOffer>(accessToken, `/dashboard/offers/${id}`, "PATCH", payload);
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

export async function getDashboardGallery(
  accessToken: string,
  query: {
    page?: number;
    pageSize?: number;
    category?: string;
    isActive?: boolean;
  } = {},
): Promise<{ data: DashboardGalleryItem[]; meta: DashboardListMeta }> {
  const res = await fetch(
    withQuery("/dashboard/gallery", {
      page: query.page,
      pageSize: query.pageSize,
      category: query.category,
      isActive: query.isActive,
    }),
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as { data: DashboardGalleryItem[]; meta: DashboardListMeta };
}

export async function postDashboardGalleryItem(
  accessToken: string,
  payload: Record<string, unknown>,
): Promise<DashboardGalleryItem> {
  return jsonMutation<DashboardGalleryItem>(accessToken, "/dashboard/gallery", "POST", payload);
}

export async function patchDashboardGalleryItem(
  accessToken: string,
  id: string,
  payload: Record<string, unknown>,
): Promise<DashboardGalleryItem> {
  return jsonMutation<DashboardGalleryItem>(accessToken, `/dashboard/gallery/${id}`, "PATCH", payload);
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

export async function getDashboardReviews(
  accessToken: string,
  query: {
    page?: number;
    pageSize?: number;
    status?: string;
    displayOnWebsite?: boolean;
    createdFrom?: string;
    createdTo?: string;
  } = {},
): Promise<{ data: DashboardReview[]; meta: DashboardListMeta }> {
  const res = await fetch(
    withQuery("/dashboard/reviews", {
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
      displayOnWebsite: query.displayOnWebsite,
      createdFrom: query.createdFrom,
      createdTo: query.createdTo,
    }),
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    throw await parseApiError(res);
  }
  return (await res.json()) as { data: DashboardReview[]; meta: DashboardListMeta };
}

export async function patchDashboardReview(
  accessToken: string,
  id: string,
  payload: Record<string, unknown>,
): Promise<DashboardReview> {
  return jsonMutation<DashboardReview>(accessToken, `/dashboard/reviews/${id}`, "PATCH", payload);
}

export async function getDashboardReportsOperations(
  accessToken: string,
  query: DashboardReportsQuery = {},
): Promise<DashboardReportSectionResponse> {
  return getDashboardReportSection(accessToken, "/dashboard/reports/operations", query);
}

export async function getDashboardReportsFinancial(
  accessToken: string,
  query: DashboardReportsQuery = {},
): Promise<DashboardReportSectionResponse> {
  return getDashboardReportSection(accessToken, "/dashboard/reports/financial", query);
}

export async function getDashboardReportsBookings(
  accessToken: string,
  query: DashboardReportsQuery = {},
): Promise<DashboardReportSectionResponse> {
  return getDashboardReportSection(accessToken, "/dashboard/reports/bookings", query);
}

export async function getDashboardReportsServices(
  accessToken: string,
  query: DashboardReportsQuery = {},
): Promise<DashboardReportSectionResponse> {
  return getDashboardReportSection(accessToken, "/dashboard/reports/services", query);
}

export async function getDashboardReportsClients(
  accessToken: string,
  query: DashboardReportsQuery = {},
): Promise<DashboardReportSectionResponse> {
  return getDashboardReportSection(accessToken, "/dashboard/reports/clients", query);
}

export async function getDashboardReportsPayments(
  accessToken: string,
  query: DashboardReportsQuery = {},
): Promise<DashboardReportSectionResponse> {
  return getDashboardReportSection(accessToken, "/dashboard/reports/payments", query);
}

export async function getDashboardAuditLogs(
  accessToken: string,
  query: DashboardAuditLogsQuery = {},
): Promise<DashboardAuditLogsResponse> {
  const res = await fetch(
    withQuery("/dashboard/audit-logs", {
      module: query.module,
      action: query.action,
      userId: query.userId,
      entityId: query.entityId,
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
  return (await res.json()) as DashboardAuditLogsResponse;
}
