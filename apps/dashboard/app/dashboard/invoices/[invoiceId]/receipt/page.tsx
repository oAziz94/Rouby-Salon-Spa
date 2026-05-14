"use client";

import {
  getDashboardInvoiceReceipt,
  type DashboardInvoiceReceipt,
} from "@rouby/api-client";
import { formatDateTimeAmPm } from "@rouby/wall-clock";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AuthRequired, PermissionGuard } from "@/components/auth-required";
import { useDashboardAuth } from "@/lib/dashboard-auth";

type ReceiptWidth = 58 | 80;

function formatEGP(amount: number): string {
  return `EGP ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function loadSavedWidth(): ReceiptWidth | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem("receiptWidth");
  if (!raw) {
    return null;
  }
  return raw === "58" ? 58 : 80;
}

export default function DashboardInvoiceReceiptPage() {
  const router = useRouter();
  const params = useParams<{ invoiceId: string }>();
  const searchParams = useSearchParams();
  const { token } = useDashboardAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<DashboardInvoiceReceipt | null>(null);
  const [width, setWidth] = useState<ReceiptWidth>(80);
  const [hasAutoPrinted, setHasAutoPrinted] = useState(false);

  useEffect(() => {
    const saved = loadSavedWidth();
    if (saved) {
      setWidth(saved);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("receiptWidth", String(width));
    }
  }, [width]);

  useEffect(() => {
    if (!token || !params.invoiceId) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    void getDashboardInvoiceReceipt(token, params.invoiceId)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          const saved = loadSavedWidth();
          if (!saved) {
            setWidth(result.receiptWidth === "58mm" ? 58 : 80);
          }
        }
      })
      .catch((requestError: unknown) => {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : "Failed to load receipt");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [params.invoiceId, token]);

  const shouldAutoPrint = useMemo(() => searchParams.get("print") === "1", [searchParams]);
  useEffect(() => {
    if (!shouldAutoPrint || loading || !data || hasAutoPrinted) {
      return;
    }
    setHasAutoPrinted(true);
    window.print();
  }, [data, hasAutoPrinted, loading, shouldAutoPrint]);

  const receiptClass = width === 58 ? "receipt receipt-58" : "receipt receipt-80";

  return (
    <AuthRequired>
      <PermissionGuard permission="invoices.read">
        <div className="receipt-page" data-width={String(width)}>
          <div className="no-print actions-wrap">
            <button type="button" className="action-btn" onClick={() => window.print()}>
              Print
            </button>
            <button type="button" className="action-btn" onClick={() => router.back()}>
              Back
            </button>
            <label className="width-select">
              Width
              <select
                value={String(width)}
                onChange={(event) => setWidth(event.target.value === "58" ? 58 : 80)}
              >
                <option value="58">58mm</option>
                <option value="80">80mm</option>
              </select>
            </label>
          </div>

          {loading ? <p className="no-print state-msg">Loading receipt...</p> : null}
          {!loading && error ? <p className="no-print state-msg error-msg">{error}</p> : null}

          {data ? (
            <article className={receiptClass}>
              <header className="center">
                <h1>{data.branch.salonName}</h1>
                <p>{data.branch.name}</p>
                {data.branch.phone ? <p>{data.branch.phone}</p> : null}
                {data.branch.address ? <p>{data.branch.address}</p> : null}
                <p className="title">{data.receiptTitle || "Receipt"}</p>
                <p>Invoice #{data.invoice.invoiceNumber}</p>
                <p>{formatDateTimeAmPm(data.invoice.finalizedAt)}</p>
              </header>

              <div className="separator" />

              <section>
                <p>Client: {data.client.name}</p>
                {data.client.phone ? <p>Phone: {data.client.phone}</p> : null}
                <p>Booking: {data.booking.reference}</p>
                <p>Source: {data.booking.source}</p>
                {data.queueEntry ? <p>Queue: {data.queueEntry.id.slice(-8).toUpperCase()}</p> : null}
                {data.invoice.cashierName ? <p>Cashier: {data.invoice.cashierName}</p> : null}
              </section>

              <div className="separator" />

              <section>
                {data.lines.map((line) => (
                  <div key={line.id} className="line-row">
                    <p className="line-name">{line.name}</p>
                    <div className="line-meta">
                      <span>
                        {line.quantity} x {formatEGP(line.unitPrice)}
                      </span>
                      <span>{formatEGP(line.lineTotal)}</span>
                    </div>
                  </div>
                ))}
              </section>

              <div className="separator" />

              <section className="totals">
                <p>
                  <span>Subtotal</span>
                  <span>{formatEGP(data.totals.subtotal)}</span>
                </p>
                {data.totals.discountAmount > 0 ? (
                  <p>
                    <span>Discount</span>
                    <span>-{formatEGP(data.totals.discountAmount)}</span>
                  </p>
                ) : null}
                {data.showVatOnInvoice === false ? null : (
                  <p>
                    <span>{data.taxLabel || "VAT"}</span>
                    <span>{formatEGP(data.totals.vatAmount)}</span>
                  </p>
                )}
                <p className="bold">
                  <span>Total</span>
                  <span>{formatEGP(data.totals.totalAmount)}</span>
                </p>
                <p>
                  <span>Paid</span>
                  <span>{formatEGP(data.totals.paidAmount)}</span>
                </p>
                <p>
                  <span>Remaining</span>
                  <span>{formatEGP(data.totals.remainingAmount)}</span>
                </p>
                <p>
                  <span>Status</span>
                  <span>{data.invoice.paymentStatus.replace(/_/g, " ")}</span>
                </p>
              </section>

              {data.showPaymentBreakdown === false ? null : data.payments.length > 0 ? (
                <>
                  <div className="separator" />
                  <section>
                    <p className="bold">Payments</p>
                    {data.payments.map((payment) => (
                      <div key={payment.id} className="payment-row">
                        <p>
                          {payment.method} - {formatEGP(payment.amount)}
                        </p>
                        {payment.referenceNumber ? <p>Ref: {payment.referenceNumber}</p> : null}
                        <p>{formatDateTimeAmPm(payment.paidAt)}</p>
                      </div>
                    ))}
                  </section>
                </>
              ) : null}

              <div className="separator" />

              <footer className="center">
                <p>{data.footerMessage}</p>
              </footer>
            </article>
          ) : null}
        </div>

        <style jsx global>{`
          @page {
            size: 80mm auto;
            margin: 0;
          }

          .receipt-page[data-width="58"] {
            --receipt-width: 58mm;
            --receipt-padding: 3mm;
            --receipt-font-size: 10px;
          }

          .receipt-page[data-width="80"] {
            --receipt-width: 80mm;
            --receipt-padding: 4mm;
            --receipt-font-size: 11px;
          }

          .receipt-page {
            min-height: 100vh;
            background: #f3f3f3;
            padding: 16px;
            font-family: Arial, sans-serif;
            color: #111;
          }

          .actions-wrap {
            margin: 0 auto 12px auto;
            width: var(--receipt-width, 80mm);
            display: flex;
            gap: 8px;
            align-items: center;
            justify-content: space-between;
          }

          .action-btn {
            border: 1px solid #d8d8d8;
            background: #fff;
            border-radius: 6px;
            padding: 6px 10px;
            font-size: 12px;
            cursor: pointer;
          }

          .width-select {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
          }

          .width-select select {
            border: 1px solid #d8d8d8;
            background: #fff;
            border-radius: 6px;
            padding: 4px 6px;
            font-size: 12px;
          }

          .state-msg {
            margin: 8px auto;
            width: var(--receipt-width, 80mm);
            font-size: 12px;
          }

          .error-msg {
            color: #b00020;
          }

          .receipt {
            width: var(--receipt-width, 80mm);
            margin: 0 auto;
            background: #fff;
            padding: var(--receipt-padding, 4mm);
            font-size: var(--receipt-font-size, 11px);
            line-height: 1.3;
            box-shadow: 0 0 0 1px #e6e6e6;
          }

          .center {
            text-align: center;
          }

          .receipt h1 {
            font-size: 1.1em;
            margin: 0;
          }

          .receipt p {
            margin: 2px 0;
            word-break: break-word;
          }

          .receipt .title {
            margin-top: 6px;
            font-weight: 700;
            letter-spacing: 0.5px;
            text-transform: uppercase;
          }

          .separator {
            border-top: 1px dashed #777;
            margin: 8px 0;
          }

          .line-row,
          .payment-row {
            margin-bottom: 6px;
          }

          .line-name {
            font-weight: 600;
          }

          .line-meta,
          .totals p {
            display: flex;
            justify-content: space-between;
            gap: 8px;
          }

          .bold {
            font-weight: 700;
          }

          @media print {
            @page {
              size: var(--receipt-width) auto;
              margin: 0;
            }

            html,
            body {
              margin: 0;
              padding: 0;
              background: #fff;
            }

            .no-print {
              display: none !important;
            }

            .receipt-page {
              padding: 0;
              background: #fff;
            }

            .receipt {
              box-shadow: none;
              border: none;
              margin: 0;
            }
          }
        `}</style>
      </PermissionGuard>
    </AuthRequired>
  );
}
