"use client";

import {
  ApiClientError,
  createDashboardClient,
  patchDashboardClient,
  type DashboardBranch,
  type DashboardClient,
} from "@rouby/api-client";
import { X } from "lucide-react";
import { useEffect, useState } from "react";

function formatApiError(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.statusCode === 403) {
      return "You do not have permission for this action.";
    }
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong.";
}

const modalShell =
  "fixed inset-0 z-[60] flex items-center justify-center bg-[#2A1722]/45 p-4 backdrop-blur-[1px]";
const modalCard =
  "w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl max-h-[90vh] overflow-y-auto";
const labelClass = "block text-sm font-medium text-foreground";
const inputClass =
  "mt-1 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-foreground shadow-sm outline-none focus:border-[color:var(--gold)]/60";
const primaryBtn =
  "rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50";
const ghostBtn =
  "rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-[#FFF9EE]";

type CreateClientModalProps = {
  open: boolean;
  onClose: () => void;
  token: string;
  branches: DashboardBranch[];
  canPickPreferredBranch: boolean;
  canSensitiveNotes: boolean;
  saving: boolean;
  onSavingChange: (v: boolean) => void;
  onSuccess: (client: DashboardClient) => void;
  onErrorToast: (message: string) => void;
};

export function CreateClientModal({
  open,
  onClose,
  token,
  branches,
  canPickPreferredBranch,
  canSensitiveNotes,
  saving,
  onSavingChange,
  onSuccess,
  onErrorToast,
}: CreateClientModalProps) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [preferredBranchId, setPreferredBranchId] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }
    setFullName("");
    setPhone("");
    setEmail("");
    setPreferredBranchId("");
    setNotes("");
    setFormError("");
  }, [open]);

  if (!open) {
    return null;
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError("");
    onSavingChange(true);
    try {
      const payload: Record<string, unknown> = {
        fullName: fullName.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
      };
      if (canPickPreferredBranch && preferredBranchId) {
        payload.preferredBranchId = preferredBranchId;
      }
      if (canSensitiveNotes && notes.trim()) {
        payload.notes = notes.trim();
      }
      const created = await createDashboardClient(token, payload);
      onSuccess(created);
      onClose();
    } catch (err) {
      const msg = formatApiError(err);
      setFormError(msg);
      onErrorToast(msg);
    } finally {
      onSavingChange(false);
    }
  }

  return (
    <div className={modalShell}>
      <section className={modalCard} role="dialog" aria-modal="true" aria-labelledby="create-client-title">
        <div className="flex items-start justify-between gap-3">
          <h2 id="create-client-title" className="text-lg font-semibold text-foreground">
            Create client
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border bg-white p-1.5 text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Phone is required so we can match returning guests and avoid duplicates.
        </p>
        <form className="mt-5 space-y-4" onSubmit={(e) => void onSubmit(e)}>
          <label className={labelClass}>
            Full name
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className={inputClass}
              autoComplete="name"
            />
          </label>
          <label className={labelClass}>
            Phone
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              minLength={3}
              className={inputClass}
              autoComplete="tel"
              placeholder="+20… or local number"
            />
          </label>
          <label className={labelClass}>
            Email <span className="font-normal text-muted-foreground">(optional)</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              autoComplete="email"
            />
          </label>
          {canPickPreferredBranch && branches.length > 0 ? (
            <label className={labelClass}>
              Preferred branch{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
              <select
                value={preferredBranchId}
                onChange={(e) => setPreferredBranchId(e.target.value)}
                className={inputClass}
              >
                <option value="">No preference</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {canSensitiveNotes ? (
            <label className={labelClass}>
              Sensitive notes <span className="font-normal text-muted-foreground">(optional)</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className={inputClass}
              />
            </label>
          ) : null}
          {formError ? (
            <p className="rounded-xl border border-[#E7B9A4]/80 bg-[#FFF1EC] px-3 py-2 text-sm text-danger">{formError}</p>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className={ghostBtn} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className={primaryBtn} disabled={saving}>
              {saving ? "Creating…" : "Create client"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

type EditClientModalProps = {
  open: boolean;
  onClose: () => void;
  token: string;
  client: DashboardClient | null;
  branches: DashboardBranch[];
  canPickPreferredBranch: boolean;
  canContact: boolean;
  canSensitiveNotes: boolean;
  saving: boolean;
  onSavingChange: (v: boolean) => void;
  onSaved: (client: DashboardClient) => void;
  onErrorToast: (message: string) => void;
};

export function EditClientModal({
  open,
  onClose,
  token,
  client,
  branches,
  canPickPreferredBranch,
  canContact,
  canSensitiveNotes,
  saving,
  onSavingChange,
  onSaved,
  onErrorToast,
}: EditClientModalProps) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [preferredBranchId, setPreferredBranchId] = useState("");
  const [notes, setNotes] = useState("");
  const [allergies, setAllergies] = useState("");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!open || !client) {
      return;
    }
    setFullName(client.fullName ?? "");
    setPhone((client.phone as string | undefined) ?? "");
    setEmail((client.email as string | undefined) ?? "");
    setPreferredBranchId((client.preferredBranchId as string | undefined) ?? "");
    setNotes((client.notes as string | undefined) ?? "");
    setAllergies((client.allergiesOrWarnings as string | undefined) ?? "");
    setFormError("");
  }, [open, client]);

  if (!open || !client) {
    return null;
  }

  const editingClient = client;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!editingClient.id) {
      return;
    }
    setFormError("");
    onSavingChange(true);
    try {
      const payload: Record<string, unknown> = {
        fullName: fullName.trim(),
      };
      if (canContact) {
        payload.phone = phone.trim() || undefined;
        payload.email = email.trim() || undefined;
      }
      if (canPickPreferredBranch) {
        payload.preferredBranchId = preferredBranchId || null;
      }
      if (canSensitiveNotes) {
        payload.notes = notes.trim() || null;
        payload.allergiesOrWarnings = allergies.trim() || null;
      }
      const updated = await patchDashboardClient(token, editingClient.id, payload);
      onSaved(updated);
      onClose();
    } catch (err) {
      const msg = formatApiError(err);
      setFormError(msg);
      onErrorToast(msg);
    } finally {
      onSavingChange(false);
    }
  }

  return (
    <div className={modalShell}>
      <section className={modalCard} role="dialog" aria-modal="true" aria-labelledby="edit-client-title">
        <div className="flex items-start justify-between gap-3">
          <h2 id="edit-client-title" className="text-lg font-semibold text-foreground">
            Edit client
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border bg-white p-1.5 text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <form className="mt-5 space-y-4" onSubmit={(e) => void onSubmit(e)}>
          <label className={labelClass}>
            Full name
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Phone
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={!canContact}
              required={canContact}
              className={`${inputClass} disabled:cursor-not-allowed disabled:bg-[#F5F1EA]`}
            />
            {!canContact ? (
              <span className="mt-1 block text-xs text-muted-foreground">Hidden — you cannot edit contact fields.</span>
            ) : null}
          </label>
          <label className={labelClass}>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={!canContact}
              className={`${inputClass} disabled:cursor-not-allowed disabled:bg-[#F5F1EA]`}
            />
          </label>
          {canPickPreferredBranch && branches.length > 0 ? (
            <label className={labelClass}>
              Preferred branch
              <select
                value={preferredBranchId}
                onChange={(e) => setPreferredBranchId(e.target.value)}
                className={inputClass}
              >
                <option value="">No preference</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {canSensitiveNotes ? (
            <>
              <label className={labelClass}>
                Sensitive notes
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className={inputClass}
                />
              </label>
              <label className={labelClass}>
                Allergies / warnings
                <textarea
                  value={allergies}
                  onChange={(e) => setAllergies(e.target.value)}
                  rows={2}
                  className={inputClass}
                />
              </label>
            </>
          ) : null}
          {formError ? (
            <p className="rounded-xl border border-[#E7B9A4]/80 bg-[#FFF1EC] px-3 py-2 text-sm text-danger">{formError}</p>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className={ghostBtn} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className={primaryBtn} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
