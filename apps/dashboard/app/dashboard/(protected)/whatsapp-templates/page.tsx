"use client";

import {
  ApiClientError,
  activateDashboardWhatsAppTemplate,
  createDashboardWhatsAppTemplate,
  deactivateDashboardWhatsAppTemplate,
  listDashboardWhatsAppTemplates,
  postDashboardWhatsappDeepLink,
  previewDashboardWhatsAppTemplate,
  updateDashboardWhatsAppTemplate,
  type DashboardWhatsAppTemplate,
  type DashboardWhatsAppTemplatesListMeta,
  type WhatsAppTemplateCategory,
} from "@rouby/api-client";
import { formatDateTimeAmPm } from "@rouby/wall-clock";
import {
  AlertTriangle,
  Calendar,
  Check,
  Copy,
  Eye,
  Loader2,
  MessageCircle,
  Pencil,
  Plus,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useDashboardAuth } from "@/lib/dashboard-auth";

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function formatApiError(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected API error.";
}

const CATEGORY_LABELS: Record<string, string> = {
  booking_confirmation: "Booking",
  booking_reminder: "Booking",
  booking_rescheduled: "Booking",
  booking_cancelled: "Booking",
  walk_in_created: "Queue",
  queue_turn_reminder: "Queue",
  visit_completed: "Queue",
  invoice_created: "Payment",
  payment_received: "Payment",
  receipt_ready: "Payment",
  appointment_follow_up: "Client",
  birthday_greeting: "Client",
  promotion_message: "Client",
  custom: "Custom",
};

const CATEGORY_OPTIONS: { value: WhatsAppTemplateCategory; label: string }[] = [
  { value: "booking_confirmation", label: "Booking — Confirmation" },
  { value: "booking_reminder", label: "Booking — Reminder" },
  { value: "booking_rescheduled", label: "Booking — Rescheduled" },
  { value: "booking_cancelled", label: "Booking — Cancelled" },
  { value: "walk_in_created", label: "Queue — Walk-in created" },
  { value: "queue_turn_reminder", label: "Queue — Turn reminder" },
  { value: "visit_completed", label: "Queue — Visit completed" },
  { value: "invoice_created", label: "Payment — Invoice created" },
  { value: "payment_received", label: "Payment — Received" },
  { value: "receipt_ready", label: "Payment — Receipt ready" },
  { value: "appointment_follow_up", label: "Client — Follow-up" },
  { value: "birthday_greeting", label: "Client — Birthday" },
  { value: "promotion_message", label: "Client — Promotion" },
  { value: "custom", label: "Custom / Manual" },
];

const KNOWN_VARIABLE_KEYS = new Set<string>([
  "clientName",
  "clientPhone",
  "bookingReference",
  "bookingDate",
  "bookingTime",
  "serviceSummary",
  "services",
  "staffName",
  "bookingStatus",
  "branchName",
  "branchAddress",
  "branchPhone",
  "queueNumber",
  "estimatedWaitTime",
  "invoiceNumber",
  "invoiceTotal",
  "amountPaid",
  "remainingAmount",
  "paymentMethod",
  "receiptLink",
  "salonName",
  "salonPhone",
  "salonAddress",
  "whatsappNumber",
  "bookingLink",
  "rescheduleLink",
  "cancelLink",
  "totalAmount",
  "paidAmount",
]);

const VARIABLE_GROUPS: { title: string; keys: string[] }[] = [
  {
    title: "Client",
    keys: ["clientName", "clientPhone"],
  },
  {
    title: "Booking",
    keys: [
      "bookingReference",
      "bookingDate",
      "bookingTime",
      "serviceSummary",
      "staffName",
      "bookingStatus",
    ],
  },
  {
    title: "Branch",
    keys: ["branchName", "branchAddress", "branchPhone"],
  },
  {
    title: "Queue",
    keys: ["queueNumber", "estimatedWaitTime"],
  },
  {
    title: "Invoice / Payment",
    keys: [
      "invoiceNumber",
      "invoiceTotal",
      "amountPaid",
      "remainingAmount",
      "paymentMethod",
      "receiptLink",
    ],
  },
  {
    title: "Salon",
    keys: ["salonName", "salonPhone", "salonAddress", "whatsappNumber"],
  },
  {
    title: "Links",
    keys: ["bookingLink", "rescheduleLink", "cancelLink", "receiptLink"],
  },
];

const DEFAULT_SAMPLE_EN: Record<string, string> = {
  clientName: "Sara Ahmed",
  clientPhone: "01000000000",
  salonName: "Alrouby Salon & Spa",
  branchName: "Alrouby Main",
  branchAddress: "Alexandria",
  branchPhone: "+20 15 1110 0956",
  bookingReference: "BK-1024",
  bookingDate: "15 May 2026",
  bookingTime: "6:30 PM",
  serviceSummary: "Hair Styling, Manicure",
  services: "Hair Styling, Manicure",
  staffName: "Nour",
  bookingStatus: "Confirmed",
  queueNumber: "12",
  estimatedWaitTime: "25 min",
  invoiceNumber: "INV-1024",
  invoiceTotal: "EGP 1,250",
  amountPaid: "EGP 1,250",
  paidAmount: "EGP 1,250",
  totalAmount: "EGP 1,250",
  remainingAmount: "EGP 0",
  paymentMethod: "Cash",
  receiptLink: "https://example.com/receipt",
  salonAddress: "Alexandria",
  whatsappNumber: "+20 15 1110 0956",
  bookingLink: "https://example.com/booking",
  rescheduleLink: "https://example.com/reschedule",
  cancelLink: "https://example.com/cancel",
};

const DEFAULT_SAMPLE_AR: Record<string, string> = {
  clientName: "سارة أحمد",
  clientPhone: "٠١٠٠٠٠٠٠٠٠٠",
  salonName: "صالون وسبا الروبي",
  branchName: "فرع الروبي الرئيسي",
  branchAddress: "الإسكندرية، مصر",
  branchPhone: "+٢٠ ١٥ ١١١٠ ٠٩٥٦",
  bookingReference: "حجز-١٠٢٤",
  bookingDate: "١٥ مايو ٢٠٢٦",
  bookingTime: "٦:٣٠ مساءً",
  serviceSummary: "تصفيف شعر، مانيكير",
  services: "تصفيف شعر، مانيكير",
  staffName: "نور",
  bookingStatus: "مؤكد",
  queueNumber: "١٢",
  estimatedWaitTime: "حوالي ٢٥ دقيقة",
  invoiceNumber: "فاتورة-١٠٢٤",
  invoiceTotal: "١٬٢٥٠ ج.م.",
  amountPaid: "١٬٢٥٠ ج.م.",
  paidAmount: "١٬٢٥٠ ج.م.",
  totalAmount: "١٬٢٥٠ ج.م.",
  remainingAmount: "٠ ج.م.",
  paymentMethod: "نقدي",
  receiptLink: "https://example.com/receipt",
  salonAddress: "الإسكندرية",
  whatsappNumber: "+٢٠ ١٥ ١١١٠ ٠٩٥٦",
  bookingLink: "https://example.com/booking",
  rescheduleLink: "https://example.com/reschedule",
  cancelLink: "https://example.com/cancel",
};

function mergeSample(language: "ar" | "en"): Record<string, string> {
  return language === "ar" ? { ...DEFAULT_SAMPLE_AR } : { ...DEFAULT_SAMPLE_EN };
}

/** Full Arabic starter when creating a template or switching to Arabic with an empty body. */
const DEFAULT_NEW_TEMPLATE_BODY_AR = `مرحباً {{clientName}}،

نراسلك من {{salonName}}.

الفرع: {{branchName}}
العنوان: {{branchAddress}}
رقم التواصل: {{branchPhone}}`;

/** English starter for new templates or when switching to English with an empty body. */
const DEFAULT_NEW_TEMPLATE_BODY_EN = `Hello {{clientName}},

This is a message from {{salonName}}.

Branch: {{branchName}}
Address: {{branchAddress}}
Phone: {{branchPhone}}`;

function extractPlaceholderKeys(body: string): string[] {
  const found = new Set<string>();
  const double = /\{\{([a-zA-Z0-9_]+)\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = double.exec(body)) !== null) {
    found.add(m[1]);
  }
  const normalized = body.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key: string) =>
    `{${key}}`,
  );
  const single = /\{([a-zA-Z0-9_]+)\}/g;
  while ((m = single.exec(normalized)) !== null) {
    found.add(m[1]);
  }
  return [...found];
}

function localSubstitute(body: string, values: Record<string, string>): string {
  return body.replace(/\{\{([a-zA-Z0-9_]+)\}\}|\{([a-zA-Z0-9_]+)\}/g, (full, a, b) => {
    const key = (a ?? b) as string;
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      return values[key] ?? "";
    }
    return full;
  });
}

function findUnclosedBraceIssues(body: string): string[] {
  const issues: string[] = [];
  let depth = 0;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === "{") {
      depth += 1;
      if (depth > 2) {
        issues.push("Nested braces are not supported.");
        break;
      }
    } else if (ch === "}") {
      depth -= 1;
      if (depth < 0) {
        issues.push("Unexpected closing brace.");
        break;
      }
    }
  }
  if (depth > 0) {
    issues.push("Unclosed { or {{ in message body.");
  }
  return issues;
}

function categoryBadgeClass(category: string): string {
  const group = CATEGORY_LABELS[category] ?? "Custom";
  if (group === "Booking") {
    return "bg-[#E8F2EE] text-[#0E342B] border-[#0E342B]/20";
  }
  if (group === "Queue") {
    return "bg-[#E8F0FA] text-[#1E3A5F] border-[#1E3A5F]/20";
  }
  if (group === "Payment") {
    return "bg-[#FFF9EE] text-[#7A5A18] border-[#E8D9BC]";
  }
  if (group === "Client") {
    return "bg-[#F5EEFA] text-[#4A3066] border-[#D9C8E8]";
  }
  return "bg-[#F3F0EF] text-[#5C5348] border-border";
}

function WhatsAppBubble({
  text,
  dir,
}: {
  text: string;
  dir: "rtl" | "ltr";
}) {
  return (
    <div
      className="flex justify-start"
      dir={dir}
    >
      <div
        className="max-w-[95%] rounded-2xl rounded-tl-sm border border-[#DCF8C6] bg-[#DCF8C6] px-3 py-2 text-sm leading-relaxed text-[#1F2420] shadow-sm"
        style={{ whiteSpace: "pre-wrap" }}
      >
        {text}
      </div>
    </div>
  );
}

function CopyPreviewButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (!text.trim()) {
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be denied in non-secure contexts.
    }
  }
  return (
    <button
      type="button"
      onClick={() => void copy()}
      title={copied ? "Copied" : "Copy preview text"}
      className="inline-flex items-center gap-1.5 rounded-lg border border-[#E8D9BC] bg-white px-2 py-1.5 text-xs font-medium text-[#0E342B] shadow-sm transition hover:bg-[#FFF9EE]"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-emerald-600" />
          Copied
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5 text-[#B9974A]" />
          Copy
        </>
      )}
    </button>
  );
}

export default function DashboardWhatsappTemplatesPage() {
  const { token, hasPermission } = useDashboardAuth();
  const canManage = hasPermission("whatsapp.templates.manage");
  const canSend = hasPermission("whatsapp.send");
  const canView =
    hasPermission("whatsapp.templates.read") ||
    canManage ||
    canSend;

  const [loadState, setLoadState] = useState<"loading" | "ready" | "error" | "empty">(
    "loading",
  );
  const [error, setError] = useState("");
  const [rows, setRows] = useState<DashboardWhatsAppTemplate[]>([]);
  const [meta, setMeta] = useState<DashboardWhatsAppTemplatesListMeta | null>(null);

  const [draftSearch, setDraftSearch] = useState("");
  const [draftCategory, setDraftCategory] = useState("");
  const [draftLanguage, setDraftLanguage] = useState<"all" | "ar" | "en">("all");
  const [draftActive, setDraftActive] = useState<"all" | "true" | "false">("all");

  const [appliedSearch, setAppliedSearch] = useState("");
  const [appliedCategory, setAppliedCategory] = useState("");
  const [appliedLanguage, setAppliedLanguage] = useState<"all" | "ar" | "en">("all");
  const [appliedActive, setAppliedActive] = useState<"all" | "true" | "false">("all");

  const [drawerTemplate, setDrawerTemplate] = useState<DashboardWhatsAppTemplate | null>(
    null,
  );
  const [drawerPreview, setDrawerPreview] = useState<{
    previewText: string;
    unknownVariables: string[];
    warnings: string[];
  } | null>(null);

  const [modalOpen, setModalOpen] = useState<"create" | "edit" | null>(null);
  const [modalSaving, setModalSaving] = useState(false);
  const [modalError, setModalError] = useState("");
  const [editTargetId, setEditTargetId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formKey, setFormKey] = useState("");
  const [formCategory, setFormCategory] =
    useState<WhatsAppTemplateCategory>("custom");
  const [formLanguage, setFormLanguage] = useState<"ar" | "en">("ar");
  const [formDescription, setFormDescription] = useState("");
  const [formBody, setFormBody] = useState("");
  const [formActive, setFormActive] = useState(true);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const [deactivateTarget, setDeactivateTarget] = useState<DashboardWhatsAppTemplate | null>(
    null,
  );

  const [deepLinkTemplateKey, setDeepLinkTemplateKey] = useState("");
  const [deepLinkLanguage, setDeepLinkLanguage] = useState<"ar" | "en">("ar");
  const [deepLinkBookingId, setDeepLinkBookingId] = useState("");
  const [deepLinkClientId, setDeepLinkClientId] = useState("");
  const [deepLinkUrl, setDeepLinkUrl] = useState("");
  const [deepLinkDisplayText, setDeepLinkDisplayText] = useState("");
  const [deepLinkError, setDeepLinkError] = useState("");
  const [deepLinkLoading, setDeepLinkLoading] = useState(false);

  const unknownInBody = useMemo(
    () => extractPlaceholderKeys(formBody).filter((k) => !KNOWN_VARIABLE_KEYS.has(k)),
    [formBody],
  );
  const braceIssues = useMemo(() => findUnclosedBraceIssues(formBody), [formBody]);
  const livePreview = useMemo(
    () => localSubstitute(formBody, mergeSample(formLanguage)),
    [formBody, formLanguage],
  );

  const loadTemplates = useCallback(async () => {
    if (!token || !canView) {
      return;
    }
    setLoadState("loading");
    setError("");
    try {
      const response = await listDashboardWhatsAppTemplates(token, {
        search: appliedSearch || undefined,
        category: appliedCategory || undefined,
        language: appliedLanguage,
        isActive: appliedActive,
        page: 1,
        limit: 100,
      });
      setRows(response.data);
      setMeta(response.meta);
      const noFilters =
        !appliedSearch &&
        !appliedCategory &&
        appliedLanguage === "all" &&
        appliedActive === "all";
      if (response.meta.total === 0 && noFilters) {
        setLoadState("empty");
      } else {
        setLoadState("ready");
      }
    } catch (requestError) {
      setError(formatApiError(requestError));
      setLoadState("error");
    }
  }, [
    token,
    canView,
    appliedSearch,
    appliedCategory,
    appliedLanguage,
    appliedActive,
  ]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const refreshDrawerPreview = useCallback(async (t: DashboardWhatsAppTemplate) => {
    if (!token) {
      return;
    }
    try {
      const p = await previewDashboardWhatsAppTemplate(token, t.id, {});
      setDrawerPreview(p);
    } catch {
      setDrawerPreview({
        previewText: localSubstitute(t.body, mergeSample(t.language as "ar" | "en")),
        unknownVariables: extractPlaceholderKeys(t.body).filter(
          (k) => !KNOWN_VARIABLE_KEYS.has(k),
        ),
        warnings: findUnclosedBraceIssues(t.body),
      });
    }
  }, [token]);

  useEffect(() => {
    if (drawerTemplate && token) {
      void refreshDrawerPreview(drawerTemplate);
    } else {
      setDrawerPreview(null);
    }
  }, [drawerTemplate, token, refreshDrawerPreview]);

  function openCreateModal() {
    setModalOpen("create");
    setEditTargetId(null);
    setModalError("");
    setFormName("");
    setFormKey("");
    setFormCategory("custom");
    setFormLanguage("ar");
    setFormDescription("");
    setFormBody(DEFAULT_NEW_TEMPLATE_BODY_AR);
    setFormActive(true);
  }

  function handleFormLanguageChange(next: "ar" | "en") {
    setFormLanguage(next);
    setFormBody((body) => {
      if (body.trim() !== "") {
        return body;
      }
      return next === "ar" ? DEFAULT_NEW_TEMPLATE_BODY_AR : DEFAULT_NEW_TEMPLATE_BODY_EN;
    });
  }

  function openEditModal(t: DashboardWhatsAppTemplate) {
    setModalOpen("edit");
    setEditTargetId(t.id);
    setModalError("");
    setFormName(t.name);
    setFormKey(t.templateKey);
    setFormCategory((t.category as WhatsAppTemplateCategory) || "custom");
    setFormLanguage(t.language === "en" ? "en" : "ar");
    setFormDescription(t.description ?? "");
    setFormBody(t.body);
    setFormActive(t.isActive);
  }

  function insertVariable(key: string) {
    const el = bodyRef.current;
    const tokenStr = `{{${key}}}`;
    if (!el) {
      setFormBody((prev) => `${prev}${tokenStr}`);
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = `${formBody.slice(0, start)}${tokenStr}${formBody.slice(end)}`;
    setFormBody(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + tokenStr.length;
      el.setSelectionRange(pos, pos);
    });
  }

  async function onSaveModal(event: React.FormEvent) {
    event.preventDefault();
    if (!token || !canManage) {
      return;
    }
    setModalSaving(true);
    setModalError("");
    try {
      const keys = extractPlaceholderKeys(formBody);
      if (modalOpen === "create") {
        await createDashboardWhatsAppTemplate(token, {
          name: formName.trim(),
          templateKey: formKey.trim(),
          body: formBody,
          category: formCategory,
          language: formLanguage,
          description: formDescription.trim() || null,
          variables: keys,
          isActive: formActive,
        });
      } else if (editTargetId) {
        const updated = await updateDashboardWhatsAppTemplate(token, editTargetId, {
          name: formName.trim(),
          body: formBody,
          category: formCategory,
          language: formLanguage,
          description: formDescription.trim() || null,
          variables: keys,
          isActive: formActive,
        });
        if (drawerTemplate?.id === editTargetId) {
          setDrawerTemplate(updated);
        }
      }
      setModalOpen(null);
      await loadTemplates();
    } catch (requestError) {
      setModalError(formatApiError(requestError));
    } finally {
      setModalSaving(false);
    }
  }

  async function onActivate(t: DashboardWhatsAppTemplate) {
    if (!token || !canManage) {
      return;
    }
    if (!t.body.trim()) {
      return;
    }
    const unknown = extractPlaceholderKeys(t.body).filter((k) => !KNOWN_VARIABLE_KEYS.has(k));
    if (
      unknown.length > 0 &&
      !window.confirm(
        `This template uses unknown variables: ${unknown.join(", ")}. Activate anyway?`,
      )
    ) {
      return;
    }
    try {
      const updated = await activateDashboardWhatsAppTemplate(token, t.id);
      await loadTemplates();
      setDrawerTemplate((prev) => (prev?.id === updated.id ? updated : prev));
    } catch (requestError) {
      setError(formatApiError(requestError));
    }
  }

  async function onDeactivateConfirmed() {
    if (!token || !canManage || !deactivateTarget) {
      return;
    }
    try {
      const updated = await deactivateDashboardWhatsAppTemplate(token, deactivateTarget.id);
      setDeactivateTarget(null);
      await loadTemplates();
      setDrawerTemplate((prev) => (prev?.id === updated.id ? updated : prev));
    } catch (requestError) {
      setError(formatApiError(requestError));
    }
  }

  function applyFilters() {
    setAppliedSearch(draftSearch.trim());
    setAppliedCategory(draftCategory);
    setAppliedLanguage(draftLanguage);
    setAppliedActive(draftActive);
  }

  function clearFilters() {
    setDraftSearch("");
    setDraftCategory("");
    setDraftLanguage("all");
    setDraftActive("all");
    setAppliedSearch("");
    setAppliedCategory("");
    setAppliedLanguage("all");
    setAppliedActive("all");
  }

  async function onGenerateDeepLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canSend) {
      return;
    }
    setDeepLinkLoading(true);
    setDeepLinkError("");
    setDeepLinkUrl("");
    setDeepLinkDisplayText("");
    try {
      const response = await postDashboardWhatsappDeepLink(token, {
        templateKey: deepLinkTemplateKey.trim(),
        bookingId: deepLinkBookingId.trim(),
        clientId: deepLinkClientId.trim() || undefined,
        language: deepLinkLanguage,
      });
      setDeepLinkUrl(response.url);
      setDeepLinkDisplayText(response.displayText);
    } catch (requestError) {
      setDeepLinkError(formatApiError(requestError));
    } finally {
      setDeepLinkLoading(false);
    }
  }

  if (!canView) {
    return (
      <section className="rounded-xl border border-[#E7B9A4] bg-[#FFF1EC] p-5 text-sm text-danger shadow-sm">
        You do not have permission to view WhatsApp templates.
      </section>
    );
  }

  const filterChips: { label: string; onClear: () => void }[] = [];
  if (appliedSearch) {
    filterChips.push({
      label: `Search: ${appliedSearch}`,
      onClear: () => {
        setDraftSearch("");
        setAppliedSearch("");
      },
    });
  }
  if (appliedCategory) {
    filterChips.push({
      label: `Category: ${appliedCategory}`,
      onClear: () => {
        setDraftCategory("");
        setAppliedCategory("");
      },
    });
  }
  if (appliedLanguage !== "all") {
    filterChips.push({
      label: `Language: ${appliedLanguage}`,
      onClear: () => {
        setDraftLanguage("all");
        setAppliedLanguage("all");
      },
    });
  }
  if (appliedActive !== "all") {
    filterChips.push({
      label: `Status: ${appliedActive === "true" ? "Active" : "Inactive"}`,
      onClear: () => {
        setDraftActive("all");
        setAppliedActive("all");
      },
    });
  }

  return (
    <div className="space-y-6 bg-[#FFFBF7] pb-10 pt-2">
      <header className="rounded-2xl border border-[#E8D9BC]/80 bg-gradient-to-br from-[#FFFDF9] to-[#FFF9EE] p-6 shadow-md">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#1F2420]">
              WhatsApp Templates
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#7A6A58]">
              Manage reusable WhatsApp messages for bookings, reminders, payments, and client
              follow-ups.
            </p>
            {meta && (
              <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-[#E8D9BC] bg-white/80 px-3 py-1 text-xs text-[#5C5348]">
                <span
                  className={`h-2 w-2 rounded-full ${meta.whatsappConfigured ? "bg-emerald-500" : "bg-amber-400"}`}
                />
                WhatsApp:{" "}
                {meta.whatsappConfigured ? "Number configured" : "Not fully configured"}
              </p>
            )}
          </div>
          {canManage ? (
            <button
              type="button"
              onClick={() => openCreateModal()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0E342B] px-4 py-2.5 text-sm font-medium text-[#FFFDF9] shadow-md transition hover:bg-[#143E32]"
            >
              <Plus className="h-4 w-4" />
              New template
            </button>
          ) : null}
        </div>
      </header>

      {!canManage ? (
        <section className="rounded-xl border border-[#E8D9BC] bg-[#FFF9EE] p-4 text-sm text-[#7A6A58] shadow-sm">
          You can view templates. Editing requires{" "}
          <code className="rounded bg-white/80 px-1">whatsapp.templates.manage</code>.
        </section>
      ) : null}

      {loadState === "loading" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-2xl border border-border bg-[#F5F1EA]"
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total templates"
            value={meta?.stats.total ?? rows.length}
            icon={<MessageCircle className="h-5 w-5 text-[#B9974A]" />}
          />
          <StatCard
            label="Active"
            value={meta?.stats.active ?? rows.filter((r) => r.isActive).length}
            icon={<Check className="h-5 w-5 text-[#1E6A3A]" />}
          />
          <StatCard
            label="Arabic"
            value={meta?.stats.arabic ?? rows.filter((r) => r.language === "ar").length}
            icon={<Sparkles className="h-5 w-5 text-[#2C567A]" />}
          />
          <StatCard
            label="Inactive"
            value={meta?.stats.inactive ?? rows.filter((r) => !r.isActive).length}
            icon={<Calendar className="h-5 w-5 text-[#7A6A58]" />}
          />
        </div>
      )}

      <section className="rounded-2xl border border-[#E8D9BC]/80 bg-[#FFFDF9] p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
          <label className="min-w-[200px] flex-1 text-sm">
            <span className="mb-1 block font-medium text-[#1F2420]">Search</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#B9974A]" />
              <input
                value={draftSearch}
                onChange={(e) => setDraftSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyFilters();
                  }
                }}
                placeholder="Name or message text"
                className="w-full rounded-xl border border-border bg-white py-2 pl-10 pr-3 text-sm"
              />
            </span>
          </label>
          <label className="w-full min-w-[180px] text-sm lg:w-52">
            <span className="mb-1 block font-medium text-[#1F2420]">Category</span>
            <select
              value={draftCategory}
              onChange={(e) => setDraftCategory(e.target.value)}
              className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
            >
              <option value="">All categories</option>
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="w-full min-w-[140px] text-sm lg:w-40">
            <span className="mb-1 block font-medium text-[#1F2420]">Language</span>
            <select
              value={draftLanguage}
              onChange={(e) =>
                setDraftLanguage(e.target.value as "all" | "ar" | "en")
              }
              className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
            >
              <option value="all">All</option>
              <option value="ar">Arabic</option>
              <option value="en">English</option>
            </select>
          </label>
          <label className="w-full min-w-[140px] text-sm lg:w-40">
            <span className="mb-1 block font-medium text-[#1F2420]">Status</span>
            <select
              value={draftActive}
              onChange={(e) =>
                setDraftActive(e.target.value as "all" | "true" | "false")
              }
              className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
            >
              <option value="all">All</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => applyFilters()}
              className="rounded-xl bg-[#0E342B] px-4 py-2 text-sm font-medium text-[#FFFDF9] shadow-sm hover:bg-[#143E32]"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={() => clearFilters()}
              className="rounded-xl border border-border bg-white px-4 py-2 text-sm font-medium text-[#1F2420] hover:bg-[#F5F1EA]"
            >
              Clear filters
            </button>
          </div>
        </div>
        {filterChips.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {filterChips.map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={() => chip.onClear()}
                className="inline-flex items-center gap-1 rounded-full border border-[#E8D9BC] bg-[#FFF9EE] px-3 py-1 text-xs text-[#5C5348]"
              >
                {chip.label}
                <X className="h-3 w-3" />
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {loadState === "error" ? (
        <section className="rounded-2xl border border-[#E7B9A4] bg-[#FFF1EC] p-6 shadow-sm">
          <p className="text-sm font-medium text-danger">Something went wrong</p>
          <p className="mt-2 text-sm text-[#7A6A58]">{error}</p>
          <button
            type="button"
            onClick={() => void loadTemplates()}
            className="mt-4 rounded-xl bg-[#0E342B] px-4 py-2 text-sm font-medium text-[#FFFDF9]"
          >
            Retry
          </button>
        </section>
      ) : null}

      {loadState === "empty" ? (
        <section className="rounded-2xl border border-dashed border-[#E8D9BC] bg-[#FFFDF9] p-10 text-center shadow-sm">
          <MessageCircle className="mx-auto h-10 w-10 text-[#B9974A]" />
          <h2 className="mt-4 text-lg font-semibold text-[#1F2420]">No WhatsApp templates yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-[#7A6A58]">
            Create reusable messages for booking confirmations, reminders, payments, and
            follow-ups.
          </p>
          {canManage ? (
            <button
              type="button"
              onClick={() => openCreateModal()}
              className="mt-6 rounded-xl bg-[#0E342B] px-5 py-2.5 text-sm font-medium text-[#FFFDF9]"
            >
              New template
            </button>
          ) : null}
        </section>
      ) : null}

      {loadState === "ready" ? (
        <div className="overflow-hidden rounded-2xl border border-[#E8D9BC]/80 bg-[#FFFDF9] shadow-md">
          {rows.length === 0 ? (
            <div className="p-10 text-center">
              <h2 className="text-lg font-semibold text-[#1F2420]">No matching templates</h2>
              <p className="mt-2 text-sm text-[#7A6A58]">
                Try changing filters or clearing the search.
              </p>
              <button
                type="button"
                onClick={() => clearFilters()}
                className="mt-4 rounded-xl border border-border bg-white px-4 py-2 text-sm font-medium"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead className="border-b border-[#E8D9BC] bg-[#FFF9EE]/80 text-xs uppercase tracking-wide text-[#7A6A58]">
                <tr>
                  <th className="px-4 py-3 font-medium">Template</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Language</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="cursor-pointer border-b border-[#F0E6D8] transition hover:bg-[#FFF9EE]/90"
                    onClick={() => setDrawerTemplate(row)}
                  >
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-start gap-2">
                        <span
                          className={`mt-0.5 inline-flex rounded-full border px-2 py-0.5 text-[0.65rem] font-medium ${categoryBadgeClass(row.category)}`}
                        >
                          {(CATEGORY_LABELS[row.category] ?? "Custom").slice(0, 1)}
                        </span>
                        <div>
                          <p className="font-medium text-[#1F2420]">{row.name}</p>
                          <p className="mt-0.5 line-clamp-2 text-xs text-[#7A6A58]">
                            {row.body.slice(0, 120)}
                            {row.body.length > 120 ? "…" : ""}
                          </p>
                          <p className="mt-1 font-mono text-[0.65rem] text-[#B9974A]/90">
                            {row.templateKey}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${categoryBadgeClass(row.category)}`}
                      >
                        {CATEGORY_OPTIONS.find((c) => c.value === row.category)?.label ??
                          row.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className="rounded-full bg-[#F3F0EF] px-2 py-0.5 text-xs font-medium text-[#5C5348]">
                        {row.language === "ar" ? "Arabic" : "English"}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          row.isActive
                            ? "bg-[#EEF8EE] text-[#1E6A3A]"
                            : "bg-[#F3F0EF] text-[#7A6A58]"
                        }`}
                      >
                        {row.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-[#7A6A58]">
                      <div>{formatDateTimeAmPm(row.updatedAt)}</div>
                      {row.updatedBy?.name ? (
                        <div className="mt-0.5 text-[0.7rem]">by {row.updatedBy.name}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 align-top text-right">
                      <div className="flex flex-wrap justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => {
                            setDrawerTemplate(row);
                          }}
                          className="rounded-lg border border-border bg-white p-1.5 text-[#0E342B] hover:bg-[#F5F1EA]"
                          title="Preview"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {canManage ? (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditModal(row)}
                              className="rounded-lg border border-border bg-white p-1.5 text-[#0E342B] hover:bg-[#F5F1EA]"
                              title="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            {row.isActive ? (
                              <button
                                type="button"
                                onClick={() => setDeactivateTarget(row)}
                                className="rounded-lg border border-border bg-white px-2 py-1 text-xs text-[#7A6A58] hover:bg-[#FFF1EC]"
                              >
                                Deactivate
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void onActivate(row)}
                                className="rounded-lg border border-[#C9DEC5] bg-[#EEF8EE] px-2 py-1 text-xs text-[#1E6A3A] hover:bg-[#DDEEDD]"
                              >
                                Activate
                              </button>
                            )}
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}

      {drawerTemplate ? (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            className="absolute inset-0 bg-black/30"
            aria-label="Close drawer"
            onClick={() => setDrawerTemplate(null)}
          />
          <aside className="relative flex h-full w-full max-w-md flex-col border-l border-[#E8D9BC] bg-[#FFFBF7] shadow-2xl">
            <div className="flex items-start justify-between gap-2 border-b border-[#E8D9BC] p-4">
              <div>
                <h2 className="text-lg font-semibold text-[#1F2420]">{drawerTemplate.name}</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs font-medium ${categoryBadgeClass(drawerTemplate.category)}`}
                  >
                    {CATEGORY_OPTIONS.find((c) => c.value === drawerTemplate.category)?.label ??
                      drawerTemplate.category}
                  </span>
                  <span className="rounded-full bg-[#F3F0EF] px-2 py-0.5 text-xs">
                    {drawerTemplate.language === "ar" ? "Arabic" : "English"}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      drawerTemplate.isActive
                        ? "bg-[#EEF8EE] text-[#1E6A3A]"
                        : "bg-[#F3F0EF] text-[#7A6A58]"
                    }`}
                  >
                    {drawerTemplate.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDrawerTemplate(null)}
                className="rounded-lg p-2 text-[#7A6A58] hover:bg-[#F5F1EA]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
              <div className="flex flex-wrap gap-2">
                {canManage ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        openEditModal(drawerTemplate);
                        setDrawerTemplate(null);
                      }}
                      className="rounded-xl bg-[#0E342B] px-3 py-1.5 text-xs font-medium text-[#FFFDF9]"
                    >
                      Edit
                    </button>
                    {drawerTemplate.isActive ? (
                      <button
                        type="button"
                        onClick={() => setDeactivateTarget(drawerTemplate)}
                        className="rounded-xl border border-border bg-white px-3 py-1.5 text-xs"
                      >
                        Deactivate
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void onActivate(drawerTemplate)}
                        className="rounded-xl border border-[#C9DEC5] bg-[#EEF8EE] px-3 py-1.5 text-xs text-[#1E6A3A]"
                      >
                        Activate
                      </button>
                    )}
                  </>
                ) : null}
              </div>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[#B9974A]">
                  Message
                </h3>
                <div className="mt-2" dir={drawerTemplate.language === "ar" ? "rtl" : "ltr"}>
                  <WhatsAppBubble text={drawerTemplate.body} dir={drawerTemplate.language === "ar" ? "rtl" : "ltr"} />
                </div>
              </section>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[#B9974A]">
                  Variables in body
                </h3>
                <div className="mt-2 flex flex-wrap gap-1">
                  {extractPlaceholderKeys(drawerTemplate.body).length === 0 ? (
                    <p className="text-xs text-[#7A6A58]">No placeholders detected.</p>
                  ) : (
                    extractPlaceholderKeys(drawerTemplate.body).map((v) => (
                      <span
                        key={v}
                        className={`rounded-full px-2 py-0.5 font-mono text-[0.7rem] ${
                          KNOWN_VARIABLE_KEYS.has(v)
                            ? "bg-[#E8F2EE] text-[#0E342B]"
                            : "bg-[#FFF1EC] text-danger"
                        }`}
                      >
                        {`{{${v}}}`}
                      </span>
                    ))
                  )}
                </div>
              </section>

              <section>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-[#B9974A]">
                    Preview (sample data)
                  </h3>
                  {drawerPreview?.previewText ? (
                    <CopyPreviewButton text={drawerPreview.previewText} />
                  ) : null}
                </div>
                <div className="mt-2" dir={drawerTemplate.language === "ar" ? "rtl" : "ltr"}>
                  {drawerPreview ? (
                    <>
                      {drawerPreview.warnings.length > 0 || drawerPreview.unknownVariables.length > 0 ? (
                        <div className="mb-2 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                          <div>
                            {drawerPreview.unknownVariables.length > 0 ? (
                              <p>Unknown: {drawerPreview.unknownVariables.join(", ")}</p>
                            ) : null}
                            {drawerPreview.warnings.map((w) => (
                              <p key={w}>{w}</p>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <WhatsAppBubble
                        text={drawerPreview.previewText}
                        dir={drawerTemplate.language === "ar" ? "rtl" : "ltr"}
                      />
                    </>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-[#7A6A58]">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading preview…
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-xl border border-[#E8D9BC] bg-[#FFF9EE]/50 p-3 text-xs text-[#7A6A58]">
                <p>Created {formatDateTimeAmPm(drawerTemplate.createdAt)}</p>
                <p className="mt-1">Updated {formatDateTimeAmPm(drawerTemplate.updatedAt)}</p>
                {drawerTemplate.updatedBy?.name ? (
                  <p className="mt-1">Updated by {drawerTemplate.updatedBy.name}</p>
                ) : null}
                {drawerTemplate.metaTemplateStatus ? (
                  <p className="mt-2 font-medium text-[#1F2420]">
                    Meta template: {drawerTemplate.metaTemplateStatus}
                  </p>
                ) : null}
              </section>
            </div>
          </aside>
        </div>
      ) : null}

      {modalOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close modal"
            onClick={() => !modalSaving && setModalOpen(null)}
          />
          <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#E8D9BC] bg-[#FFFBF7] p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-[#1F2420]">
              {modalOpen === "create" ? "New template" : "Edit template"}
            </h2>
            <form className="mt-4 space-y-4" onSubmit={(e) => void onSaveModal(e)}>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block font-medium">Template name *</span>
                  <input
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full rounded-xl border border-border bg-white px-3 py-2"
                  />
                </label>
                {modalOpen === "create" ? (
                  <label className="text-sm">
                    <span className="mb-1 block font-medium">Template key *</span>
                    <input
                      required
                      value={formKey}
                      onChange={(e) => setFormKey(e.target.value.toUpperCase().replace(/\s+/g, "_"))}
                      placeholder="e.g. CUSTOM_FOLLOW_UP"
                      className="w-full rounded-xl border border-border bg-white px-3 py-2 font-mono text-sm"
                    />
                  </label>
                ) : (
                  <div className="text-sm">
                    <span className="mb-1 block font-medium text-[#7A6A58]">Template key</span>
                    <p className="rounded-xl border border-border bg-[#F5F1EA] px-3 py-2 font-mono text-xs">
                      {formKey}
                    </p>
                  </div>
                )}
                <label className="text-sm">
                  <span className="mb-1 block font-medium">Category *</span>
                  <select
                    required
                    value={formCategory}
                    onChange={(e) =>
                      setFormCategory(e.target.value as WhatsAppTemplateCategory)
                    }
                    className="w-full rounded-xl border border-border bg-white px-3 py-2"
                  >
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium">Language *</span>
                  <select
                    value={formLanguage}
                    onChange={(e) =>
                      handleFormLanguageChange(e.target.value as "ar" | "en")
                    }
                    className="w-full rounded-xl border border-border bg-white px-3 py-2"
                  >
                    <option value="ar">Arabic (RTL)</option>
                    <option value="en">English</option>
                  </select>
                </label>
              </div>
              <label className="text-sm">
                <span className="mb-1 block font-medium">Description</span>
                <input
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full rounded-xl border border-border bg-white px-3 py-2"
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={formActive}
                  onChange={(e) => setFormActive(e.target.checked)}
                />
                Active
              </label>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm font-medium">Message body *</span>
                  <span className="text-xs text-[#7A6A58]">{formBody.length} chars</span>
                </div>
                <textarea
                  ref={bodyRef}
                  required
                  dir={formLanguage === "ar" ? "rtl" : "ltr"}
                  rows={8}
                  value={formBody}
                  onChange={(e) => setFormBody(e.target.value)}
                  className="w-full rounded-xl border border-border bg-white px-3 py-2 font-sans text-sm leading-relaxed"
                />
                <p className="mt-1 text-xs text-[#7A6A58]" dir="ltr">
                  {formLanguage === "ar" ? (
                    <>
                      استخدم متغيرات مثل <code className="rounded bg-[#F5F1EA] px-1">{"{{clientName}}"}</code> و{" "}
                      <code className="rounded bg-[#F5F1EA] px-1">{"{{bookingDate}}"}</code>.
                    </>
                  ) : (
                    <>
                      Use variables like <code className="rounded bg-[#F5F1EA] px-1">{"{{clientName}}"}</code> and{" "}
                      <code className="rounded bg-[#F5F1EA] px-1">{"{{bookingDate}}"}</code>.
                    </>
                  )}
                </p>
                {unknownInBody.length > 0 ? (
                  <p className="mt-1 flex items-center gap-1 text-xs text-amber-800">
                    <AlertTriangle className="h-3 w-3" />
                    Unknown variables: {unknownInBody.join(", ")}
                  </p>
                ) : null}
                {braceIssues.length > 0 ? (
                  <p className="mt-1 text-xs text-amber-800">{braceIssues.join(" ")}</p>
                ) : null}
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#B9974A]">
                  Insert variable
                </p>
                <div className="max-h-40 space-y-2 overflow-y-auto rounded-xl border border-[#E8D9BC] bg-[#FFF9EE] p-2">
                  {VARIABLE_GROUPS.map((g) => (
                    <div key={g.title}>
                      <p className="text-[0.65rem] font-semibold text-[#7A6A58]">{g.title}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {g.keys.map((k) => (
                          <button
                            key={k}
                            type="button"
                            onClick={() => insertVariable(k)}
                            className="rounded-full border border-[#E8D9BC] bg-white px-2 py-0.5 font-mono text-[0.65rem] text-[#0E342B] hover:bg-[#E8F2EE]"
                          >
                            {`{{${k}}}`}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#B9974A]">
                    Live preview
                  </p>
                  {livePreview.trim() ? <CopyPreviewButton text={livePreview} /> : null}
                </div>
                <div dir={formLanguage === "ar" ? "rtl" : "ltr"}>
                  <WhatsAppBubble text={livePreview || "…"} dir={formLanguage === "ar" ? "rtl" : "ltr"} />
                </div>
              </div>
              {modalError ? (
                <p className="rounded-lg border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-sm text-danger">
                  {modalError}
                </p>
              ) : null}
              <div className="flex justify-end gap-2 border-t border-[#E8D9BC] pt-4">
                <button
                  type="button"
                  disabled={modalSaving}
                  onClick={() => setModalOpen(null)}
                  className="rounded-xl border border-border bg-white px-4 py-2 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSaving}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#0E342B] px-4 py-2 text-sm font-medium text-[#FFFDF9] disabled:opacity-60"
                >
                  {modalSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Save template
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deactivateTarget ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close"
            onClick={() => setDeactivateTarget(null)}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-[#E8D9BC] bg-[#FFFBF7] p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-[#1F2420]">Deactivate template?</h2>
            <p className="mt-2 text-sm text-[#7A6A58]">
              This template will no longer be used for automated WhatsApp messages. Existing
              message history will not be affected.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeactivateTarget(null)}
                className="rounded-xl border border-border bg-white px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void onDeactivateConfirmed()}
                className="rounded-xl bg-[#5C3D2E] px-4 py-2 text-sm font-medium text-[#FFFDF9]"
              >
                Deactivate
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {canSend ? (
        <section className="rounded-2xl border border-[#E8D9BC]/80 bg-[#FFFDF9] p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-[#1F2420]">Deep-link tester</h2>
          <p className="mt-1 text-xs text-[#7A6A58]">
            {/* TODO: When automated WhatsApp sending exists, prefer server-side sends; deep links remain for manual staff flows. */}
            Use a logical key (e.g. <code className="rounded bg-[#F5F1EA] px-1">BOOKING_CONFIRMED</code>) plus
            message language, or an explicit key like <code className="rounded bg-[#F5F1EA] px-1">BOOKING_CONFIRMED_AR</code>.
            Booking ID must be a valid UUID from your system.
          </p>
          <form onSubmit={(e) => void onGenerateDeepLink(e)} className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm">
              <span className="mb-1 block font-medium">Template key</span>
              <input
                value={deepLinkTemplateKey}
                onChange={(e) => setDeepLinkTemplateKey(e.target.value)}
                required
                placeholder="BOOKING_CONFIRMED"
                className="w-full rounded-xl border border-border bg-white px-3 py-2 font-mono text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Message language</span>
              <select
                value={deepLinkLanguage}
                onChange={(e) => setDeepLinkLanguage(e.target.value as "ar" | "en")}
                className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
              >
                <option value="ar">Arabic (_AR suffix)</option>
                <option value="en">English (_EN suffix)</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Booking ID (UUID)</span>
              <input
                value={deepLinkBookingId}
                onChange={(e) => setDeepLinkBookingId(e.target.value)}
                required
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="w-full rounded-xl border border-border bg-white px-3 py-2 font-mono text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Client ID (optional)</span>
              <input
                value={deepLinkClientId}
                onChange={(e) => setDeepLinkClientId(e.target.value)}
                className="w-full rounded-xl border border-border bg-white px-3 py-2 font-mono text-sm"
              />
            </label>
            <div className="lg:col-span-4">
              <button
                type="submit"
                disabled={deepLinkLoading || !UUID_V4_RE.test(deepLinkBookingId.trim())}
                className="rounded-xl bg-[#0E342B] px-4 py-2 text-sm font-medium text-[#FFFDF9] disabled:opacity-50"
              >
                {deepLinkLoading ? "Generating…" : "Generate deep link"}
              </button>
              {!UUID_V4_RE.test(deepLinkBookingId.trim()) && deepLinkBookingId.trim() ? (
                <p className="mt-2 text-xs text-amber-800">Enter a valid booking UUID.</p>
              ) : null}
            </div>
          </form>
          {deepLinkError ? (
            <p className="mt-3 rounded-lg border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-sm text-danger">
              {deepLinkError}
            </p>
          ) : null}
          {deepLinkUrl ? (
            <div className="mt-3 space-y-2 text-sm">
              <p className="font-medium text-[#1F2420]">URL</p>
              <a
                href={deepLinkUrl}
                target="_blank"
                rel="noreferrer"
                className="block break-all rounded-xl border border-border bg-white px-3 py-2 text-[#2C567A] underline"
              >
                {deepLinkUrl}
              </a>
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(deepLinkUrl)}
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-white px-2 py-1 text-xs"
              >
                <Copy className="h-3 w-3" />
                Copy URL
              </button>
              <p className="font-medium text-[#1F2420]">Display text</p>
              <p className="whitespace-pre-wrap rounded-xl border border-border bg-white px-3 py-2 text-[#1F2420]">
                {deepLinkDisplayText}
              </p>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[#E8D9BC]/80 bg-[#FFFDF9] p-4 shadow-sm">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF9EE]">
        {icon}
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-[#7A6A58]">{label}</p>
        <p className="text-2xl font-semibold text-[#1F2420]">{value}</p>
      </div>
    </div>
  );
}
