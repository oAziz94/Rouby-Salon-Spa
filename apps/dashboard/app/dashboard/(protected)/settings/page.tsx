"use client";

import {
  ApiClientError,
  createDashboardBranch,
  generateDashboardBranchSlots,
  getDashboardBranchSlotSettings,
  getDashboardSettings,
  listDashboardBranches,
  setDashboardDefaultBranch,
  updateDashboardBranch,
  updateDashboardBranchSlotSettings,
  updateDashboardBusinessIdentity,
  updateDashboardReceiptSettings,
  updateDashboardVatSettings,
  type BranchSlotGenerationSettings,
  type DashboardBranch,
  type DashboardSettings,
  type PatchSlotGenerationSettingsInput,
} from "@rouby/api-client";
import { useEffect, useMemo, useState } from "react";
import { useDashboardAuth } from "@/lib/dashboard-auth";

function apiError(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "Unexpected error.";
}

/** GET returns stored JSON including `schemaVersion`; PATCH/generate DTOs forbid extra keys. */
function slotSettingsToPatchPayload(
  s: BranchSlotGenerationSettings,
): PatchSlotGenerationSettingsInput {
  const {
    schemaVersion: _omit,
    workingDays,
    startTime,
    endTime,
    slotDurationMinutes,
    defaultCapacity,
    defaultOnlineBookable,
    breakPeriods,
  } = s;
  return {
    workingDays,
    startTime,
    endTime,
    slotDurationMinutes,
    defaultCapacity,
    defaultOnlineBookable,
    breakPeriods,
  };
}

type Banner = { type: "ok" | "error"; message: string } | null;

export default function SettingsIndexPage() {
  const { token, hasPermission } = useDashboardAuth();
  const canRead = hasPermission("settings.system.read") || hasPermission("settings.read");
  const canUpdate = hasPermission("settings.system.manage") || hasPermission("settings.update");
  const canBranchesCreate = hasPermission("branches.create") || hasPermission("branches.manage");
  const canSlotsRead = hasPermission("slots.read");
  const canSlotsUpdate =
    hasPermission("slots.create") && hasPermission("slots.capacity.configure");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [banner, setBanner] = useState<Banner>(null);
  const [settings, setSettings] = useState<DashboardSettings | null>(null);
  const [branches, setBranches] = useState<DashboardBranch[]>([]);
  const [slotBranchId, setSlotBranchId] = useState("");
  const [slotSettings, setSlotSettings] = useState<BranchSlotGenerationSettings | null>(null);
  const [weekStartDate, setWeekStartDate] = useState(new Date().toISOString().slice(0, 10));

  const [newBranchName, setNewBranchName] = useState("");
  const [newBranchAddress, setNewBranchAddress] = useState("");
  const [newBranchPhone, setNewBranchPhone] = useState("");
  const [newBranchActive, setNewBranchActive] = useState(true);
  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const [editBranchName, setEditBranchName] = useState("");
  const [editBranchAddress, setEditBranchAddress] = useState("");
  const [editBranchPhone, setEditBranchPhone] = useState("");
  const [editBranchActive, setEditBranchActive] = useState(true);

  const defaultBranchLabel = useMemo(() => {
    if (!settings?.defaultBranchId) return "Not set";
    return branches.find((b) => b.id === settings.defaultBranchId)?.name || "Unknown";
  }, [branches, settings?.defaultBranchId]);

  const editingBranch = useMemo(
    () => branches.find((b) => b.id === editingBranchId) || null,
    [branches, editingBranchId],
  );

  function openEditBranchModal(branch: DashboardBranch) {
    setEditingBranchId(branch.id);
    setEditBranchName(branch.name);
    setEditBranchAddress(branch.address || "");
    setEditBranchPhone(branch.phone || "");
    setEditBranchActive(branch.isActive ?? true);
  }

  function closeEditBranchModal() {
    setEditingBranchId(null);
    setEditBranchName("");
    setEditBranchAddress("");
    setEditBranchPhone("");
    setEditBranchActive(true);
  }

  async function load() {
    if (!token || !canRead) return;
    setLoading(true);
    setError("");
    try {
      const [s, bs] = await Promise.all([getDashboardSettings(token), listDashboardBranches(token)]);
      setSettings(s);
      setBranches(bs);
      const firstBranchId = s.defaultBranchId || bs[0]?.id || "";
      setSlotBranchId(firstBranchId);
      if (firstBranchId && canSlotsRead) {
        setSlotSettings(await getDashboardBranchSlotSettings(token, firstBranchId));
      }
    } catch (e) {
      setError(apiError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, canRead]);

  if (!canRead) {
    return (
      <section className="rounded-xl border border-[#E7B9A4] bg-[#FFF1EC] p-5 text-sm text-danger shadow-sm">
        You do not have permission to view settings.
      </section>
    );
  }

  if (loading) {
    return <p className="text-sm text-[#7A6A58]">Loading settings…</p>;
  }

  if (error || !settings) {
    return (
      <section className="space-y-3">
        <p className="rounded-xl border border-[#E7B9A4] bg-[#FFF1EC] p-5 text-sm text-danger shadow-sm">
          {error || "Failed to load settings."}
        </p>
        <button className="rounded-md bg-primary px-4 py-2 text-sm text-white" onClick={() => void load()}>
          Retry
        </button>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <header className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-[#1F2420]">Settings</h1>
        <p className="mt-2 text-sm text-[#7A6A58]">
          Manage salon profile, branches, slot generation, tax rate, and receipt details.
        </p>
      </header>

      {banner ? (
        <p
          className={`rounded-md px-3 py-2 text-sm ${banner.type === "ok" ? "border border-[#C9DEC5] bg-[#EEF8EE] text-[#1E6A3A]" : "border border-[#E7B9A4] bg-[#FFF1EC] text-danger"}`}
        >
          {banner.message}
        </p>
      ) : null}

      <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-[#1F2420]">Business Identity</h2>
        <p className="mt-1 text-sm text-[#7A6A58]">This information appears on receipts, invoices, and public salon details.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input className="rounded-md border border-border px-3 py-2" value={settings.businessIdentity.salonName} onChange={(e) => setSettings({ ...settings, businessIdentity: { ...settings.businessIdentity, salonName: e.target.value } })} />
          <input className="rounded-md border border-border px-3 py-2" placeholder="Legal name" value={settings.businessIdentity.legalName || ""} onChange={(e) => setSettings({ ...settings, businessIdentity: { ...settings.businessIdentity, legalName: e.target.value || null } })} />
          <input className="rounded-md border border-border px-3 py-2" placeholder="Phone" value={settings.businessIdentity.phone || ""} onChange={(e) => setSettings({ ...settings, businessIdentity: { ...settings.businessIdentity, phone: e.target.value || null } })} />
          <input className="rounded-md border border-border px-3 py-2" placeholder="WhatsApp" value={settings.businessIdentity.whatsappNumber || ""} onChange={(e) => setSettings({ ...settings, businessIdentity: { ...settings.businessIdentity, whatsappNumber: e.target.value || null } })} />
          <input className="rounded-md border border-border px-3 py-2" placeholder="Email" value={settings.businessIdentity.email || ""} onChange={(e) => setSettings({ ...settings, businessIdentity: { ...settings.businessIdentity, email: e.target.value || null } })} />
          <input className="rounded-md border border-border px-3 py-2" placeholder="Address" value={settings.businessIdentity.address || ""} onChange={(e) => setSettings({ ...settings, businessIdentity: { ...settings.businessIdentity, address: e.target.value || null } })} />
        </div>
        <button
          disabled={!canUpdate}
          className="mt-4 rounded-md bg-primary px-4 py-2 text-sm text-white disabled:opacity-60"
          onClick={async () => {
            try {
              const next = await updateDashboardBusinessIdentity(token!, settings.businessIdentity);
              setSettings(next);
              setBanner({ type: "ok", message: "Business identity updated." });
            } catch (e) {
              setBanner({ type: "error", message: apiError(e) });
            }
          }}
        >
          Save business identity
        </button>
      </article>

      <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-[#1F2420]">Branches</h2>
        <p className="mt-1 text-sm text-[#7A6A58]">Manage salon branches and choose the default branch used across the dashboard.</p>
        <p className="mt-2 text-sm text-[#7A6A58]">Default branch: <span className="font-medium text-[#1F2420]">{defaultBranchLabel}</span></p>
        <div className="mt-3 space-y-2">
          {branches.map((branch) => (
            <div key={branch.id} className="rounded-md border border-border p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-[#1F2420]">{branch.name}</p>
                  <p className="text-xs text-[#7A6A58]">{branch.address || "No address"} · {branch.phone || "No phone"}</p>
                </div>
                <div className="flex gap-2">
                  {settings.defaultBranchId === branch.id ? <span className="rounded-full bg-[#F3EBDD] px-2 py-1 text-xs">Default branch</span> : null}
                  <button
                    disabled={!canUpdate}
                    className="rounded border border-border px-2 py-1 text-xs"
                    onClick={() => openEditBranchModal(branch)}
                  >
                    Edit
                  </button>
                  <button disabled={!canUpdate} className="rounded border border-border px-2 py-1 text-xs" onClick={async () => {
                    try {
                      const next = await setDashboardDefaultBranch(token!, branch.id);
                      setSettings(next);
                      setBanner({ type: "ok", message: "Default branch updated." });
                    } catch (e) {
                      setBanner({ type: "error", message: apiError(e) });
                    }
                  }}>Set default</button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-4">
          <input className="rounded-md border border-border px-3 py-2" placeholder="New branch name" value={newBranchName} onChange={(e) => setNewBranchName(e.target.value)} />
          <input className="rounded-md border border-border px-3 py-2" placeholder="Address" value={newBranchAddress} onChange={(e) => setNewBranchAddress(e.target.value)} />
          <input className="rounded-md border border-border px-3 py-2" placeholder="Phone" value={newBranchPhone} onChange={(e) => setNewBranchPhone(e.target.value)} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={newBranchActive} onChange={(e) => setNewBranchActive(e.target.checked)} />Active</label>
        </div>
        <button disabled={!canBranchesCreate || !newBranchName.trim()} className="mt-3 rounded-md bg-primary px-4 py-2 text-sm text-white disabled:opacity-60" onClick={async () => {
          try {
            await createDashboardBranch(token!, { name: newBranchName.trim(), address: newBranchAddress, phone: newBranchPhone, isActive: newBranchActive });
            setNewBranchName(""); setNewBranchAddress(""); setNewBranchPhone("");
            await load();
            setBanner({ type: "ok", message: "Branch created." });
          } catch (e) {
            setBanner({ type: "error", message: apiError(e) });
          }
        }}>New branch</button>
      </article>

      {editingBranch ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-lg">
            <h3 className="text-lg font-semibold text-[#1F2420]">Edit branch</h3>
            <p className="mt-1 text-sm text-[#7A6A58]">
              Update basic branch details.
            </p>
            <div className="mt-4 grid gap-3">
              <input
                className="rounded-md border border-border px-3 py-2"
                placeholder="Branch name"
                value={editBranchName}
                onChange={(e) => setEditBranchName(e.target.value)}
              />
              <input
                className="rounded-md border border-border px-3 py-2"
                placeholder="Address"
                value={editBranchAddress}
                onChange={(e) => setEditBranchAddress(e.target.value)}
              />
              <input
                className="rounded-md border border-border px-3 py-2"
                placeholder="Phone"
                value={editBranchPhone}
                onChange={(e) => setEditBranchPhone(e.target.value)}
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editBranchActive}
                  onChange={(e) => setEditBranchActive(e.target.checked)}
                />
                Active
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                className="rounded-md border border-border px-4 py-2 text-sm"
                onClick={closeEditBranchModal}
              >
                Cancel
              </button>
              <button
                disabled={!canUpdate || !editBranchName.trim()}
                className="rounded-md bg-primary px-4 py-2 text-sm text-white disabled:opacity-60"
                onClick={async () => {
                  try {
                    await updateDashboardBranch(token!, editingBranch.id, {
                      name: editBranchName.trim(),
                      address: editBranchAddress,
                      phone: editBranchPhone,
                      isActive: editBranchActive,
                    });
                    await load();
                    closeEditBranchModal();
                    setBanner({ type: "ok", message: "Branch updated." });
                  } catch (e) {
                    setBanner({ type: "error", message: apiError(e) });
                  }
                }}
              >
                Save branch
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-[#1F2420]">Slot Generation</h2>
        <p className="mt-1 text-sm text-[#7A6A58]">Configure the default rules used when generating appointment slots.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <select className="rounded-md border border-border px-3 py-2" value={slotBranchId} onChange={async (e) => {
            setSlotBranchId(e.target.value);
            if (e.target.value) setSlotSettings(await getDashboardBranchSlotSettings(token!, e.target.value));
          }}>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <input type="date" className="rounded-md border border-border px-3 py-2" value={weekStartDate} onChange={(e) => setWeekStartDate(e.target.value)} />
        </div>
        {slotSettings ? (
          <div className="mt-3 grid gap-2 md:grid-cols-4">
            <input type="time" className="rounded-md border border-border px-3 py-2" value={slotSettings.startTime.slice(0, 5)} onChange={(e) => setSlotSettings({ ...slotSettings, startTime: e.target.value })} />
            <input type="time" className="rounded-md border border-border px-3 py-2" value={slotSettings.endTime.slice(0, 5)} onChange={(e) => setSlotSettings({ ...slotSettings, endTime: e.target.value })} />
            <select className="rounded-md border border-border px-3 py-2" value={slotSettings.slotDurationMinutes} onChange={(e) => setSlotSettings({ ...slotSettings, slotDurationMinutes: Number(e.target.value) })}>
              {[15, 30, 45, 60].map((n) => <option key={n} value={n}>{n} minutes</option>)}
            </select>
            <input type="number" min={1} className="rounded-md border border-border px-3 py-2" value={slotSettings.defaultCapacity} onChange={(e) => setSlotSettings({ ...slotSettings, defaultCapacity: Number(e.target.value) })} />
          </div>
        ) : null}
        <div className="mt-3 flex gap-2">
          <button
            disabled={!canSlotsUpdate || !slotBranchId || !slotSettings}
            className="rounded-md bg-primary px-4 py-2 text-sm text-white disabled:opacity-60"
            onClick={async () => {
              if (!token || !slotBranchId || !slotSettings) return;
              try {
                const next = await updateDashboardBranchSlotSettings(
                  token,
                  slotBranchId,
                  slotSettingsToPatchPayload(slotSettings),
                );
                setSlotSettings(next);
                setBanner({ type: "ok", message: "Slot generation settings saved." });
              } catch (e) {
                setBanner({ type: "error", message: apiError(e) });
              }
            }}
          >
            Save slot settings
          </button>
          <button
            disabled={!canSlotsUpdate || !slotBranchId || !slotSettings}
            className="rounded-md border border-border px-4 py-2 text-sm disabled:opacity-60"
            onClick={async () => {
              if (!token || !slotBranchId || !slotSettings) return;
              try {
                const result = await generateDashboardBranchSlots(token, {
                  branchId: slotBranchId,
                  weekStartDate,
                  ...slotSettingsToPatchPayload(slotSettings),
                });
                setBanner({ type: "ok", message: `Slots generated: ${result.createdCount}, skipped: ${result.skippedCount}.` });
              } catch (e) {
                setBanner({ type: "error", message: apiError(e) });
              }
            }}
          >
            Generate slots
          </button>
        </div>
      </article>

      <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-[#1F2420]">VAT / Tax</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.vatSettings.vatEnabled} onChange={(e) => setSettings({ ...settings, vatSettings: { ...settings.vatSettings, vatEnabled: e.target.checked } })} />VAT enabled</label>
          <input type="number" min={0} max={100} className="rounded-md border border-border px-3 py-2" value={settings.vatSettings.vatRatePercent} onChange={(e) => setSettings({ ...settings, vatSettings: { ...settings.vatSettings, vatRatePercent: Number(e.target.value) } })} />
          <input className="rounded-md border border-border px-3 py-2" value={settings.vatSettings.taxLabel} onChange={(e) => setSettings({ ...settings, vatSettings: { ...settings.vatSettings, taxLabel: e.target.value } })} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.vatSettings.showVatOnInvoice} onChange={(e) => setSettings({ ...settings, vatSettings: { ...settings.vatSettings, showVatOnInvoice: e.target.checked } })} />Show VAT on receipts</label>
        </div>
        <p className="mt-2 text-xs text-[#7A6A58]">Changing VAT settings affects future invoices only. Finalized invoices remain unchanged.</p>
        <button disabled={!canUpdate} className="mt-3 rounded-md bg-primary px-4 py-2 text-sm text-white disabled:opacity-60" onClick={async () => {
          try {
            const next = await updateDashboardVatSettings(token!, settings.vatSettings);
            setSettings(next);
            setBanner({ type: "ok", message: "VAT settings updated." });
          } catch (e) {
            setBanner({ type: "error", message: apiError(e) });
          }
        }}>Save VAT settings</button>
      </article>

      <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-[#1F2420]">Receipt Settings</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <input className="rounded-md border border-border px-3 py-2" value={settings.receiptSettings.receiptTitle} onChange={(e) => setSettings({ ...settings, receiptSettings: { ...settings.receiptSettings, receiptTitle: e.target.value } })} />
          <select className="rounded-md border border-border px-3 py-2" value={settings.receiptSettings.receiptWidth} onChange={(e) => setSettings({ ...settings, receiptSettings: { ...settings.receiptSettings, receiptWidth: e.target.value } })}><option value="58mm">58mm</option><option value="80mm">80mm</option></select>
          <input className="rounded-md border border-border px-3 py-2" value={settings.receiptSettings.receiptFooterMessage || ""} onChange={(e) => setSettings({ ...settings, receiptSettings: { ...settings.receiptSettings, receiptFooterMessage: e.target.value || null } })} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.receiptSettings.showSalonPhoneOnReceipt} onChange={(e) => setSettings({ ...settings, receiptSettings: { ...settings.receiptSettings, showSalonPhoneOnReceipt: e.target.checked } })} />Show salon phone</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.receiptSettings.showBranchAddressOnReceipt} onChange={(e) => setSettings({ ...settings, receiptSettings: { ...settings.receiptSettings, showBranchAddressOnReceipt: e.target.checked } })} />Show branch address</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.receiptSettings.showVatBreakdown} onChange={(e) => setSettings({ ...settings, receiptSettings: { ...settings.receiptSettings, showVatBreakdown: e.target.checked } })} />Show VAT breakdown</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.receiptSettings.showPaymentBreakdown} onChange={(e) => setSettings({ ...settings, receiptSettings: { ...settings.receiptSettings, showPaymentBreakdown: e.target.checked } })} />Show payment breakdown</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.receiptSettings.showCashierName} onChange={(e) => setSettings({ ...settings, receiptSettings: { ...settings.receiptSettings, showCashierName: e.target.checked } })} />Show cashier name</label>
        </div>
        <button disabled={!canUpdate} className="mt-3 rounded-md bg-primary px-4 py-2 text-sm text-white disabled:opacity-60" onClick={async () => {
          try {
            const next = await updateDashboardReceiptSettings(token!, settings.receiptSettings);
            setSettings(next);
            setBanner({ type: "ok", message: "Receipt settings updated." });
          } catch (e) {
            setBanner({ type: "error", message: apiError(e) });
          }
        }}>Save receipt settings</button>
      </article>
    </section>
  );
}
