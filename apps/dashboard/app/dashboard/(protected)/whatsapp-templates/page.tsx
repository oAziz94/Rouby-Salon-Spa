"use client";

import {
  ApiClientError,
  getDashboardWhatsappTemplates,
  patchDashboardWhatsappTemplate,
  postDashboardWhatsappDeepLink,
  postDashboardWhatsappTemplate,
  type DashboardWhatsappTemplate,
} from "@rouby/api-client";
import { useEffect, useMemo, useState } from "react";
import { useDashboardAuth } from "@/lib/dashboard-auth";

type LoadState = "loading" | "loaded" | "empty" | "error";

function formatApiError(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected API error.";
}

function sanitizeVariables(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function renderPreview(content: string, values: Record<string, string>): string {
  return content.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) => {
    const trimmed = key.trim();
    return values[trimmed] ?? `{${trimmed}}`;
  });
}

export default function DashboardWhatsappTemplatesPage() {
  const { token, hasPermission } = useDashboardAuth();
  const canManage = hasPermission("whatsapp.templates.manage");
  const canSend = hasPermission("whatsapp.send");
  const canView = canManage || canSend;

  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [rows, setRows] = useState<DashboardWhatsappTemplate[]>([]);

  const [selectedId, setSelectedId] = useState("");
  const selectedTemplate = useMemo(
    () => rows.find((item) => item.id === selectedId) ?? null,
    [rows, selectedId],
  );

  const [createName, setCreateName] = useState("");
  const [createTemplateKey, setCreateTemplateKey] = useState("");
  const [createContent, setCreateContent] = useState("");
  const [createVariables, setCreateVariables] = useState("");
  const [createIsActive, setCreateIsActive] = useState(true);
  const [createError, setCreateError] = useState("");
  const [createSaving, setCreateSaving] = useState(false);

  const [editName, setEditName] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editVariables, setEditVariables] = useState("");
  const [editIsActive, setEditIsActive] = useState(true);
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editSuccess, setEditSuccess] = useState("");

  const [previewValues, setPreviewValues] = useState<Record<string, string>>({});

  const [deepLinkTemplateKey, setDeepLinkTemplateKey] = useState("");
  const [deepLinkBookingId, setDeepLinkBookingId] = useState("");
  const [deepLinkClientId, setDeepLinkClientId] = useState("");
  const [deepLinkUrl, setDeepLinkUrl] = useState("");
  const [deepLinkDisplayText, setDeepLinkDisplayText] = useState("");
  const [deepLinkError, setDeepLinkError] = useState("");
  const [deepLinkLoading, setDeepLinkLoading] = useState(false);

  async function loadTemplates() {
    if (!token || !canView) {
      return;
    }
    setState("loading");
    setError("");
    try {
      const response = await getDashboardWhatsappTemplates(token);
      setRows(response.data);
      setState(response.data.length > 0 ? "loaded" : "empty");
      const initialSelectedId = response.data[0]?.id ?? "";
      setSelectedId((prev) => (prev && response.data.some((r) => r.id === prev) ? prev : initialSelectedId));
    } catch (requestError) {
      setError(formatApiError(requestError));
      setState("error");
    }
  }

  useEffect(() => {
    void loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, canView]);

  useEffect(() => {
    if (!selectedTemplate) {
      setEditName("");
      setEditContent("");
      setEditVariables("");
      setEditIsActive(true);
      setPreviewValues({});
      return;
    }
    const vars = sanitizeVariables(selectedTemplate.variables);
    setEditName(selectedTemplate.name);
    setEditContent(selectedTemplate.content);
    setEditVariables(vars.join(", "));
    setEditIsActive(selectedTemplate.isActive);
    setPreviewValues(
      Object.fromEntries(vars.map((variableName) => [variableName, ""])),
    );
    setDeepLinkTemplateKey(selectedTemplate.templateKey);
    setEditError("");
    setEditSuccess("");
  }, [selectedTemplate]);

  async function onCreateTemplate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canManage) {
      return;
    }
    setCreateSaving(true);
    setCreateError("");
    try {
      const variables = createVariables
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      await postDashboardWhatsappTemplate(token, {
        name: createName.trim(),
        templateKey: createTemplateKey.trim(),
        content: createContent,
        variables,
        isActive: createIsActive,
      });
      setCreateName("");
      setCreateTemplateKey("");
      setCreateContent("");
      setCreateVariables("");
      setCreateIsActive(true);
      await loadTemplates();
    } catch (requestError) {
      setCreateError(formatApiError(requestError));
    } finally {
      setCreateSaving(false);
    }
  }

  async function onSaveTemplate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canManage || !selectedTemplate) {
      return;
    }
    setEditSaving(true);
    setEditError("");
    setEditSuccess("");
    try {
      const variables = editVariables
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      await patchDashboardWhatsappTemplate(token, selectedTemplate.id, {
        name: editName.trim(),
        content: editContent,
        variables,
        isActive: editIsActive,
      });
      setEditSuccess("Template updated.");
      await loadTemplates();
    } catch (requestError) {
      setEditError(formatApiError(requestError));
    } finally {
      setEditSaving(false);
    }
  }

  async function onToggleActive(template: DashboardWhatsappTemplate) {
    if (!token || !canManage) {
      return;
    }
    setEditError("");
    setEditSuccess("");
    try {
      await patchDashboardWhatsappTemplate(token, template.id, {
        isActive: !template.isActive,
      });
      await loadTemplates();
    } catch (requestError) {
      setEditError(formatApiError(requestError));
    }
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

  const templateVariables = selectedTemplate
    ? sanitizeVariables(selectedTemplate.variables)
    : [];
  const previewText = selectedTemplate
    ? renderPreview(selectedTemplate.content, previewValues)
    : "";

  return (
    <section className="space-y-6">
      <header className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-[#1F2420]">
          WhatsApp Templates
        </h1>
        <p className="mt-2 text-sm text-[#7A6A58]">
          Manage template content and test deep-link output.
        </p>
      </header>

      {!canManage ? (
        <section className="rounded-xl border border-[#E8D9BC] bg-[#FFF9EE] p-4 text-sm text-[#7A6A58] shadow-sm">
          You can view templates. Editing and activation require
          `whatsapp.templates.manage`.
        </section>
      ) : null}

      {state === "loading" ? (
        <section className="rounded-xl border border-border bg-card p-5 text-sm text-[#7A6A58] shadow-sm">
          Loading templates...
        </section>
      ) : null}
      {state === "error" ? (
        <section className="rounded-xl border border-[#E7B9A4] bg-[#FFF1EC] p-5 text-sm text-danger shadow-sm">
          {error}
        </section>
      ) : null}
      {state === "empty" ? (
        <section className="rounded-xl border border-border bg-card p-5 text-sm text-[#7A6A58] shadow-sm">
          No templates found.
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-[#1F2420]">Templates List</h2>
          <div className="mt-3 space-y-2">
            {rows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setSelectedId(row.id)}
                className={`w-full rounded-lg border px-3 py-2 text-left ${
                  selectedId === row.id
                    ? "border-primary bg-[#FFF9EE]"
                    : "border-border bg-white"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-[#1F2420]">{row.name}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      row.isActive
                        ? "bg-[#EEF8EE] text-[#1E6A3A]"
                        : "bg-[#F3F0EF] text-[#7A6A58]"
                    }`}
                  >
                    {row.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[#7A6A58]">{row.templateKey}</p>
              </button>
            ))}
          </div>
        </article>

        {canManage ? (
          <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-[#1F2420]">Create Template</h2>
            <form onSubmit={(event) => void onCreateTemplate(event)} className="mt-3 space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-[#1F2420]">Name</span>
                <input
                  value={createName}
                  onChange={(event) => setCreateName(event.target.value)}
                  required
                  className="w-full rounded-md border border-border bg-white px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-[#1F2420]">Template key</span>
                <input
                  value={createTemplateKey}
                  onChange={(event) => setCreateTemplateKey(event.target.value)}
                  required
                  className="w-full rounded-md border border-border bg-white px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-[#1F2420]">Variables</span>
                <input
                  value={createVariables}
                  onChange={(event) => setCreateVariables(event.target.value)}
                  placeholder="clientName, bookingDate, bookingTime"
                  className="w-full rounded-md border border-border bg-white px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-[#1F2420]">Content</span>
                <textarea
                  value={createContent}
                  onChange={(event) => setCreateContent(event.target.value)}
                  required
                  rows={5}
                  className="w-full rounded-md border border-border bg-white px-3 py-2"
                />
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-[#1F2420]">
                <input
                  type="checkbox"
                  checked={createIsActive}
                  onChange={(event) => setCreateIsActive(event.target.checked)}
                />
                Active
              </label>
              {createError ? (
                <p className="rounded-md border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-sm text-danger">
                  {createError}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={createSaving}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                {createSaving ? "Creating..." : "Create template"}
              </button>
            </form>
          </article>
        ) : null}
      </section>

      {selectedTemplate ? (
        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-[#1F2420]">Edit Template</h2>
              {canManage ? (
                <button
                  type="button"
                  onClick={() => void onToggleActive(selectedTemplate)}
                  className="rounded-md border border-border bg-white px-3 py-1.5 text-xs"
                >
                  {selectedTemplate.isActive ? "Deactivate" : "Activate"}
                </button>
              ) : null}
            </div>
            <form onSubmit={(event) => void onSaveTemplate(event)} className="space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-[#1F2420]">Name</span>
                <input
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  disabled={!canManage}
                  className="w-full rounded-md border border-border bg-white px-3 py-2 disabled:bg-[#F5F1EA]"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-[#1F2420]">Template key</span>
                <input
                  value={selectedTemplate.templateKey}
                  readOnly
                  className="w-full rounded-md border border-border bg-[#F5F1EA] px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-[#1F2420]">Variables</span>
                <input
                  value={editVariables}
                  onChange={(event) => setEditVariables(event.target.value)}
                  disabled={!canManage}
                  className="w-full rounded-md border border-border bg-white px-3 py-2 disabled:bg-[#F5F1EA]"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-[#1F2420]">Content</span>
                <textarea
                  value={editContent}
                  onChange={(event) => setEditContent(event.target.value)}
                  rows={6}
                  disabled={!canManage}
                  className="w-full rounded-md border border-border bg-white px-3 py-2 disabled:bg-[#F5F1EA]"
                />
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-[#1F2420]">
                <input
                  type="checkbox"
                  checked={editIsActive}
                  onChange={(event) => setEditIsActive(event.target.checked)}
                  disabled={!canManage}
                />
                Active
              </label>
              {editError ? (
                <p className="rounded-md border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-sm text-danger">
                  {editError}
                </p>
              ) : null}
              {editSuccess ? (
                <p className="rounded-md border border-[#C9DEC5] bg-[#EEF8EE] px-3 py-2 text-sm text-[#1E6A3A]">
                  {editSuccess}
                </p>
              ) : null}
              {canManage ? (
                <button
                  type="submit"
                  disabled={editSaving}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                >
                  {editSaving ? "Saving..." : "Save template"}
                </button>
              ) : null}
            </form>
          </article>

          <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-[#1F2420]">
              Content Preview & Variables
            </h2>
            {templateVariables.length === 0 ? (
              <p className="mt-2 text-sm text-[#7A6A58]">
                This template has no explicit variables list.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {templateVariables.map((variableName) => (
                  <label key={variableName} className="block text-sm">
                    <span className="mb-1 block font-medium text-[#1F2420]">
                      {variableName}
                    </span>
                    <input
                      value={previewValues[variableName] ?? ""}
                      onChange={(event) =>
                        setPreviewValues((prev) => ({
                          ...prev,
                          [variableName]: event.target.value,
                        }))
                      }
                      className="w-full rounded-md border border-border bg-white px-3 py-2"
                    />
                  </label>
                ))}
              </div>
            )}
            <div className="mt-3 rounded-md border border-border bg-[#FFFDF9] p-3 text-sm text-[#1F2420] whitespace-pre-wrap">
              {previewText || selectedTemplate.content}
            </div>
          </article>
        </section>
      ) : null}

      {canSend ? (
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-[#1F2420]">
            Deep-link Tester
          </h2>
          <p className="mt-1 text-xs text-[#7A6A58]">
            Generates `POST /dashboard/whatsapp/deep-link` output for real booking context.
          </p>
          <form onSubmit={(event) => void onGenerateDeepLink(event)} className="mt-3 grid gap-3 md:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Template key</span>
              <input
                value={deepLinkTemplateKey}
                onChange={(event) => setDeepLinkTemplateKey(event.target.value)}
                required
                className="w-full rounded-md border border-border bg-white px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Booking ID</span>
              <input
                value={deepLinkBookingId}
                onChange={(event) => setDeepLinkBookingId(event.target.value)}
                required
                className="w-full rounded-md border border-border bg-white px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">
                Client ID (optional)
              </span>
              <input
                value={deepLinkClientId}
                onChange={(event) => setDeepLinkClientId(event.target.value)}
                className="w-full rounded-md border border-border bg-white px-3 py-2"
              />
            </label>
            <div className="md:col-span-3">
              <button
                type="submit"
                disabled={deepLinkLoading}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                {deepLinkLoading ? "Generating..." : "Generate deep link"}
              </button>
            </div>
          </form>
          {deepLinkError ? (
            <p className="mt-3 rounded-md border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-sm text-danger">
              {deepLinkError}
            </p>
          ) : null}
          {deepLinkUrl ? (
            <div className="mt-3 space-y-2">
              <p className="text-sm font-medium text-[#1F2420]">URL</p>
              <a
                href={deepLinkUrl}
                target="_blank"
                rel="noreferrer"
                className="block break-all rounded-md border border-border bg-[#FFFDF9] px-3 py-2 text-sm text-[#2C567A] underline"
              >
                {deepLinkUrl}
              </a>
              <p className="text-sm font-medium text-[#1F2420]">Display text</p>
              <p className="whitespace-pre-wrap rounded-md border border-border bg-[#FFFDF9] px-3 py-2 text-sm text-[#1F2420]">
                {deepLinkDisplayText}
              </p>
            </div>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
