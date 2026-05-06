"use client";

import {
  ApiClientError,
  getDashboardVatSettings,
  patchDashboardVatSettings,
} from "@rouby/api-client";
import { useEffect, useState } from "react";
import { useDashboardAuth } from "@/lib/dashboard-auth";

type LoadState = "loading" | "loaded" | "error";

function formatApiError(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected API error.";
}

export default function DashboardVatSettingsPage() {
  const { token, hasPermission } = useDashboardAuth();
  const canRead =
    hasPermission("vat.settings.read") || hasPermission("vat.settings.manage");
  const canManage = hasPermission("vat.settings.manage");

  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  const [vatEnabled, setVatEnabled] = useState(false);
  const [defaultVatRate, setDefaultVatRate] = useState("0.14");
  const [pricesIncludeVat, setPricesIncludeVat] = useState(false);
  const [showVatOnInvoice, setShowVatOnInvoice] = useState(true);
  const [taxRegistrationNumber, setTaxRegistrationNumber] = useState("");

  async function loadData() {
    if (!token || !canRead) {
      return;
    }
    setState("loading");
    setError("");
    try {
      const response = await getDashboardVatSettings(token);
      setVatEnabled(response.vatEnabled);
      setDefaultVatRate(String(response.defaultVatRate));
      setPricesIncludeVat(response.pricesIncludeVat);
      setShowVatOnInvoice(response.showVatOnInvoice);
      setTaxRegistrationNumber(response.taxRegistrationNumber ?? "");
      setState("loaded");
    } catch (requestError) {
      setError(formatApiError(requestError));
      setState("error");
    }
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, canRead]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canManage) {
      return;
    }
    setSaving(true);
    setSaveError("");
    setSaveSuccess("");
    try {
      const vatRateNumber = Number(defaultVatRate);
      if (!Number.isFinite(vatRateNumber)) {
        setSaveError("Default VAT rate must be a valid number.");
        return;
      }
      const response = await patchDashboardVatSettings(token, {
        vatEnabled,
        defaultVatRate: vatRateNumber,
        pricesIncludeVat,
        showVatOnInvoice,
        taxRegistrationNumber: taxRegistrationNumber.trim() || null,
      });
      setVatEnabled(response.vatEnabled);
      setDefaultVatRate(String(response.defaultVatRate));
      setPricesIncludeVat(response.pricesIncludeVat);
      setShowVatOnInvoice(response.showVatOnInvoice);
      setTaxRegistrationNumber(response.taxRegistrationNumber ?? "");
      setSaveSuccess("VAT settings updated.");
    } catch (requestError) {
      setSaveError(formatApiError(requestError));
    } finally {
      setSaving(false);
    }
  }

  if (!canRead) {
    return (
      <section className="rounded-xl border border-[#E7B9A4] bg-[#FFF1EC] p-5 text-sm text-danger shadow-sm">
        You do not have permission to view VAT settings.
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <header className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-[#1F2420]">VAT Settings</h1>
        <p className="mt-2 text-sm text-[#7A6A58]">
          Manage VAT defaults and invoice display behavior.
        </p>
      </header>

      {state === "loading" ? (
        <section className="rounded-xl border border-border bg-card p-5 text-sm text-[#7A6A58] shadow-sm">
          Loading VAT settings...
        </section>
      ) : null}
      {state === "error" ? (
        <section className="rounded-xl border border-[#E7B9A4] bg-[#FFF1EC] p-5 text-sm text-danger shadow-sm">
          {error}
        </section>
      ) : null}

      {state === "loaded" ? (
        <form
          onSubmit={(event) => void onSubmit(event)}
          className="rounded-xl border border-border bg-card p-5 shadow-sm"
        >
          {!canManage ? (
            <p className="mb-4 rounded-md border border-[#E8D9BC] bg-[#FFF9EE] px-3 py-2 text-sm text-[#7A6A58]">
              You can view these settings but cannot edit them.
            </p>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">VAT enabled</span>
              <select
                value={vatEnabled ? "true" : "false"}
                onChange={(event) => setVatEnabled(event.target.value === "true")}
                disabled={!canManage}
                className="w-full rounded-md border border-border bg-white px-3 py-2 disabled:bg-[#F5F1EA]"
              >
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
              </select>
            </label>

            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">
                Default VAT rate (decimal)
              </span>
              <input
                value={defaultVatRate}
                onChange={(event) => setDefaultVatRate(event.target.value)}
                disabled={!canManage}
                placeholder="0.14"
                className="w-full rounded-md border border-border bg-white px-3 py-2 disabled:bg-[#F5F1EA]"
              />
            </label>

            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">
                Prices include VAT
              </span>
              <select
                value={pricesIncludeVat ? "true" : "false"}
                onChange={(event) => setPricesIncludeVat(event.target.value === "true")}
                disabled={!canManage}
                className="w-full rounded-md border border-border bg-white px-3 py-2 disabled:bg-[#F5F1EA]"
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>

            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">
                Show VAT on invoice
              </span>
              <select
                value={showVatOnInvoice ? "true" : "false"}
                onChange={(event) => setShowVatOnInvoice(event.target.value === "true")}
                disabled={!canManage}
                className="w-full rounded-md border border-border bg-white px-3 py-2 disabled:bg-[#F5F1EA]"
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>

            <label className="text-sm md:col-span-2">
              <span className="mb-1 block font-medium text-[#1F2420]">
                Tax registration number
              </span>
              <input
                value={taxRegistrationNumber}
                onChange={(event) => setTaxRegistrationNumber(event.target.value)}
                disabled={!canManage}
                placeholder="Optional tax registration number"
                className="w-full rounded-md border border-border bg-white px-3 py-2 disabled:bg-[#F5F1EA]"
              />
            </label>
          </div>

          {saveError ? (
            <p className="mt-4 rounded-md border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-sm text-danger">
              {saveError}
            </p>
          ) : null}
          {saveSuccess ? (
            <p className="mt-4 rounded-md border border-[#C9DEC5] bg-[#EEF8EE] px-3 py-2 text-sm text-[#1E6A3A]">
              {saveSuccess}
            </p>
          ) : null}

          {canManage ? (
            <div className="mt-4">
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save VAT settings"}
              </button>
            </div>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}
