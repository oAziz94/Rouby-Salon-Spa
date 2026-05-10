"use client";

import {
  ApiClientError,
  getSlotGenerationSettings,
  updateSlotGenerationSettings,
  type SlotGenerationDefaults,
} from "@rouby/api-client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useDashboardAuth } from "@/lib/dashboard-auth";

type LoadState = "loading" | "loaded" | "error";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function formatApiError(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected API error.";
}

function cloneDefaults(d: SlotGenerationDefaults): SlotGenerationDefaults {
  return {
    ...d,
    workingDays: [...d.workingDays],
    breakPeriods: d.breakPeriods.map((b) => ({ ...b })),
  };
}

export default function DashboardSlotGenerationSettingsPage() {
  const { token, hasPermission } = useDashboardAuth();
  const canRead = hasPermission("slots.read");
  const canEdit =
    hasPermission("slots.create") && hasPermission("slots.capacity.configure");

  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<SlotGenerationDefaults | null>(null);

  const loadData = useCallback(async () => {
    if (!token || !canRead) {
      return;
    }
    setState("loading");
    setError("");
    try {
      const response = await getSlotGenerationSettings(token);
      setForm(cloneDefaults(response));
      setState("loaded");
    } catch (requestError) {
      setError(formatApiError(requestError));
      setState("error");
    }
  }, [canRead, token]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function toggleWorkingDay(day: number) {
    setForm((prev) => {
      if (!prev) {
        return prev;
      }
      const has = prev.workingDays.includes(day);
      const workingDays = has
        ? prev.workingDays.filter((d) => d !== day)
        : [...prev.workingDays, day].sort((a, b) => a - b);
      return { ...prev, workingDays };
    });
  }

  function setBreakPeriods(
    updater: (rows: SlotGenerationDefaults["breakPeriods"]) => SlotGenerationDefaults["breakPeriods"],
  ) {
    setForm((prev) => (prev ? { ...prev, breakPeriods: updater(prev.breakPeriods) } : prev));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canEdit || !form) {
      return;
    }
    if (form.workingDays.length === 0) {
      setSaveError("Select at least one working day.");
      return;
    }
    setSaving(true);
    setSaveError("");
    setSaveSuccess("");
    try {
      const response = await updateSlotGenerationSettings(token, {
        workingDays: form.workingDays,
        startTime: form.startTime.length === 5 ? `${form.startTime}:00` : form.startTime,
        endTime: form.endTime.length === 5 ? `${form.endTime}:00` : form.endTime,
        slotDurationMinutes: form.slotDurationMinutes,
        defaultCapacity: form.defaultCapacity,
        defaultOnlineBookable: form.defaultOnlineBookable,
        breakPeriods: form.breakPeriods.map((b) => ({
          startTime: b.startTime.length === 5 ? `${b.startTime}:00` : b.startTime,
          endTime: b.endTime.length === 5 ? `${b.endTime}:00` : b.endTime,
        })),
      });
      setForm(cloneDefaults(response));
      setSaveSuccess("Slot generation settings saved.");
    } catch (requestError) {
      setSaveError(formatApiError(requestError));
    } finally {
      setSaving(false);
    }
  }

  if (!canRead) {
    return (
      <section className="rounded-xl border border-[#E7B9A4] bg-[#FFF1EC] p-5 text-sm text-danger shadow-sm">
        You do not have permission to view slot generation settings.
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <header className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-[#1F2420]">Slot generation defaults</h1>
            <p className="mt-2 text-sm text-[#7A6A58]">
              Used by &quot;Generate week slots&quot; on the Slots page. Calendar times follow the
              same rules as manual slot creation (default Africa/Cairo context per architecture
              docs).
            </p>
          </div>
          <Link
            href="/dashboard/settings"
            className="rounded-md border border-border bg-white px-3 py-2 text-sm font-medium text-[#1F2420]"
          >
            Back to settings
          </Link>
        </div>
      </header>

      {state === "loading" ? (
        <p className="text-sm text-[#7A6A58]">Loading…</p>
      ) : null}
      {state === "error" ? (
        <section className="rounded-xl border border-[#E7B9A4] bg-[#FFF1EC] p-5 text-sm text-danger shadow-sm">
          {error}
        </section>
      ) : null}

      {state === "loaded" && form ? (
        <form
          onSubmit={onSubmit}
          className="space-y-6 rounded-xl border border-border bg-card p-6 shadow-sm"
        >
          <div>
            <p className="text-sm font-medium text-[#1F2420]">Working days</p>
            <p className="mt-1 text-xs text-[#7A6A58]">0 = Sunday through 6 = Saturday (UTC date).</p>
            <div className="mt-3 flex flex-wrap gap-3">
              {WEEKDAY_LABELS.map((label, day) => (
                <label key={label} className="flex items-center gap-2 text-sm text-[#1F2420]">
                  <input
                    type="checkbox"
                    checked={form.workingDays.includes(day)}
                    onChange={() => toggleWorkingDay(day)}
                    disabled={!canEdit}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Start time</span>
              <input
                type="time"
                value={form.startTime.slice(0, 5)}
                onChange={(e) =>
                  setForm((prev) => (prev ? { ...prev, startTime: e.target.value } : prev))
                }
                disabled={!canEdit}
                className="w-full rounded-md border border-border bg-white px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">End time</span>
              <input
                type="time"
                value={form.endTime.slice(0, 5)}
                onChange={(e) =>
                  setForm((prev) => (prev ? { ...prev, endTime: e.target.value } : prev))
                }
                disabled={!canEdit}
                className="w-full rounded-md border border-border bg-white px-3 py-2"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Slot duration (minutes)</span>
              <input
                type="number"
                min={5}
                max={480}
                value={form.slotDurationMinutes}
                onChange={(e) =>
                  setForm((prev) =>
                    prev ? { ...prev, slotDurationMinutes: Number(e.target.value) } : prev,
                  )
                }
                disabled={!canEdit}
                className="w-full rounded-md border border-border bg-white px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Default capacity</span>
              <input
                type="number"
                min={1}
                max={500}
                value={form.defaultCapacity}
                onChange={(e) =>
                  setForm((prev) =>
                    prev ? { ...prev, defaultCapacity: Number(e.target.value) } : prev,
                  )
                }
                disabled={!canEdit}
                className="w-full rounded-md border border-border bg-white px-3 py-2"
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm text-[#1F2420]">
            <input
              type="checkbox"
              checked={form.defaultOnlineBookable}
              onChange={(e) =>
                setForm((prev) =>
                  prev ? { ...prev, defaultOnlineBookable: e.target.checked } : prev,
                )
              }
              disabled={!canEdit}
            />
            Default online bookable
          </label>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-[#1F2420]">Break periods (optional)</p>
              {canEdit ? (
                <button
                  type="button"
                  onClick={() =>
                    setBreakPeriods((rows) => [...rows, { startTime: "12:00", endTime: "13:00" }])
                  }
                  className="rounded-md border border-border bg-white px-2 py-1 text-xs font-medium"
                >
                  Add break
                </button>
              ) : null}
            </div>
            <ul className="mt-3 space-y-2">
              {form.breakPeriods.map((row, index) => (
                <li key={`${index}-${row.startTime}`} className="flex flex-wrap items-end gap-2">
                  <label className="text-sm">
                    <span className="mb-1 block text-[#7A6A58]">From</span>
                    <input
                      type="time"
                      value={row.startTime.slice(0, 5)}
                      onChange={(e) =>
                        setBreakPeriods((rows) =>
                          rows.map((r, i) =>
                            i === index ? { ...r, startTime: e.target.value } : r,
                          ),
                        )
                      }
                      disabled={!canEdit}
                      className="rounded-md border border-border bg-white px-2 py-1"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-[#7A6A58]">To</span>
                    <input
                      type="time"
                      value={row.endTime.slice(0, 5)}
                      onChange={(e) =>
                        setBreakPeriods((rows) =>
                          rows.map((r, i) => (i === index ? { ...r, endTime: e.target.value } : r)),
                        )
                      }
                      disabled={!canEdit}
                      className="rounded-md border border-border bg-white px-2 py-1"
                    />
                  </label>
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() =>
                        setBreakPeriods((rows) => rows.filter((_, i) => i !== index))
                      }
                      className="text-xs text-danger"
                    >
                      Remove
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>

          {saveError ? (
            <p className="rounded-md border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-sm text-danger">
              {saveError}
            </p>
          ) : null}
          {saveSuccess ? (
            <p className="rounded-md border border-[#E7B9A4] bg-[#EAF7EE] px-3 py-2 text-sm text-[#1E6A3A]">
              {saveSuccess}
            </p>
          ) : null}

          {canEdit ? (
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save settings"}
              </button>
            </div>
          ) : (
            <p className="text-sm text-[#7A6A58]">You can view these defaults but not edit them.</p>
          )}
        </form>
      ) : null}
    </section>
  );
}
