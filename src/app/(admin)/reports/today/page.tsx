// src/app/(admin)/reports/today/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import supabase from "@/config/supabaseClient";
import { toast } from "sonner";
import { motion } from "framer-motion";

/* ----------------------------- Types ----------------------------- */
type CustomerMini = {
  id: string;
  name: string | null;
};

type OrderRow = {
  id: string;
  status: string | null;
  completed_at: string | null; // orders.date_completed
  created_at: string | null;   // orders.date_created
  grand_total_with_interest: number | null;
  grand_total: number | null; // orders.total_amount (if you show it)
  customer: CustomerMini | null;
};

type PaymentRow = {
  id: string;
  amount: number;
  status: string | null;
  created_at: string | null;
  order_id: string | null;
  customer: CustomerMini | null;
};

/* ----------------------------- Helpers ----------------------------- */
const peso = (n: number) =>
  (Number(n) || 0).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  });

const fmtPHDateTime = (d?: string | null) =>
  d
    ? new Intl.DateTimeFormat("en-PH", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: "Asia/Manila",
      }).format(new Date(d))
    : "—";

const startOfTodayISO = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const start = new Date(y, m, d, 0, 0, 0);
  return start.toISOString();
};

const endOfTodayISO = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const end = new Date(y, m, d, 23, 59, 59, 999);
  return end.toISOString();
};

const uniq = <T,>(arr: T[]) => Array.from(new Set<T>(arr));

/* ----------------------------- Page ----------------------------- */
export default function TodayReportPage() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);

  // date window = "today"
  const fromISO = useMemo(() => startOfTodayISO(), []);
  const toISO = useMemo(() => endOfTodayISO(), []);

  useEffect(() => {
    let mounted = true;

    async function run() {
      setLoading(true);

      // --- ORDERS (today) ---
      const { data: rawOrders, error: ordErr } = await supabase
        .from("orders")
        .select(
          `
          id,
          status,
          date_created,
          date_completed,
          grand_total_with_interest,
          total_amount,
          customer:customer_id ( id, name )
        `
        )
        .gte("date_created", fromISO)
        .lte("date_created", toISO)
        .order("date_created", { ascending: false });

      if (ordErr) {
        console.error(ordErr);
        toast.error("Failed to load orders");
      } else if (mounted) {
        const rows: OrderRow[] = (rawOrders ?? []).map((o: any) => ({
          id: String(o.id),
          status: o.status ?? null,
          created_at: o.date_created ?? null,
          completed_at: o.date_completed ?? null,
          grand_total_with_interest:
            o.grand_total_with_interest != null
              ? Number(o.grand_total_with_interest)
              : null,
          grand_total: o.total_amount != null ? Number(o.total_amount) : null,
          customer: o.customer
            ? { id: String(o.customer.id), name: o.customer.name ?? null }
            : null,
        }));
        setOrders(rows);
      }

      // --- PAYMENTS (today) ---
      const { data: rawPayments, error: payErr } = await supabase
        .from("payments")
        .select(
          `
          id,
          amount,
          status,
          created_at,
          order_id,
          customer:customer_id ( id, name )
        `
        )
        .gte("created_at", fromISO)
        .lte("created_at", toISO)
        .order("created_at", { ascending: false });

      if (payErr) {
        console.error(payErr);
        toast.error("Failed to load payments");
      } else if (mounted) {
        const rows: PaymentRow[] = (rawPayments ?? []).map((p: any) => ({
          id: String(p.id),
          amount: Number(p.amount ?? 0),
          status: p.status ?? null,
          created_at: p.created_at ?? null,
          order_id: p.order_id ?? null,
          customer: p.customer
            ? { id: String(p.customer.id), name: p.customer.name ?? null }
            : null,
        }));
        setPayments(rows);
      }

      setLoading(false);
    }

    run();
    return () => {
      mounted = false;
    };
  }, [fromISO, toISO]);

  /* ------------------------ Derived metrics ------------------------ */
  const totalSalesToday = useMemo(() => {
    // use completed orders' grand_total_with_interest when available; fallback to total_amount
    return (orders ?? []).reduce((sum, o) => {
      const v =
        o.grand_total_with_interest ??
        (o.grand_total != null ? o.grand_total : 0);
      return sum + (Number(v) || 0);
    }, 0);
  }, [orders]);

  const paymentsToday = useMemo(
    () => (payments ?? []).reduce((s, p) => s + (Number(p.amount) || 0), 0),
    [payments]
  );

  const orderStatuses = useMemo(
    () => uniq(orders.map((o) => o.status ?? "—")),
    [orders]
  );

  /* --------------------------- Actions --------------------------- */
  const handlePrint = () => {
    window.print();
  };

  const handleExportExcel = async () => {
    try {
      const XLSX = await import("xlsx");

      // Sheet 1: Orders
      const orderSheetData = [
        [
          "Order ID",
          "Customer",
          "Status",
          "Created At",
          "Completed At",
          "Total (w/ interest)",
          "Total (raw)",
        ],
        ...orders.map((o) => [
          o.id,
          o.customer?.name ?? "",
          o.status ?? "",
          fmtPHDateTime(o.created_at),
          fmtPHDateTime(o.completed_at),
          o.grand_total_with_interest ?? 0,
          o.grand_total ?? 0,
        ]),
      ];
      const wsOrders = XLSX.utils.aoa_to_sheet(orderSheetData);

      // Auto column widths
      const ordersColWidths = [20, 28, 14, 22, 22, 20, 14].map((wch) => ({ wch }));
      (wsOrders as any)["!cols"] = ordersColWidths;

      // Sheet 2: Payments
      const paymentSheetData = [
        ["Payment ID", "Customer", "Order ID", "Status", "Created At", "Amount"],
        ...payments.map((p) => [
          p.id,
          p.customer?.name ?? "",
          p.order_id ?? "",
          p.status ?? "",
          fmtPHDateTime(p.created_at),
          p.amount,
        ]),
      ];
      const wsPayments = XLSX.utils.aoa_to_sheet(paymentSheetData);
      const payColWidths = [20, 28, 20, 14, 22, 14].map((wch) => ({ wch }));
      (wsPayments as any)["!cols"] = payColWidths;

      // Summary sheet
      const wsSummary = XLSX.utils.aoa_to_sheet([
        ["Today (Asia/Manila)"],
        [new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" })],
        [],
        ["Metrics"],
        ["Total Sales (orders)", totalSalesToday],
        ["Total Payments Received", paymentsToday],
        [],
        ["Order Statuses"],
        ...orderStatuses.map((s) => [s]),
      ]);
      (wsSummary as any)["!cols"] = [{ wch: 28 }, { wch: 20 }];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");
      XLSX.utils.book_append_sheet(wb, wsOrders, "Orders");
      XLSX.utils.book_append_sheet(wb, wsPayments, "Payments");

      const file = `uniasia-today-report-${new Date()
        .toISOString()
        .slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, file);
    } catch (err) {
      console.error(err);
      toast.error("Export failed");
    }
  };

  /* ----------------------------- UI ----------------------------- */
  return (
    <div className="print:p-6">
      {/* Print styles */}
      <style
        // Keep it inline so it travels with the page
        dangerouslySetInnerHTML={{
          __html: `
        @media print {
          @page { margin: 12mm; }
          .no-print { display: none !important; }
          .print-card { break-inside: avoid; page-break-inside: avoid; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ddd; padding: 6px; font-size: 11px; }
          th { background: #f4f4f4; }
        }
      `,
        }}
      />

      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <motion.h1
          className="text-2xl font-bold mr-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          Today Report
        </motion.h1>

        <button
          onClick={handleExportExcel}
          className="px-3 py-2 rounded bg-white border hover:bg-gray-50"
        >
          Export Excel
        </button>

        <button
          onClick={handlePrint}
          className="px-3 py-2 rounded bg-[#181918] text-white hover:text-[#ffba20]"
        >
          Print Report
        </button>
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <>
          {/* Summary */}
          <motion.div
            className="grid md:grid-cols-3 gap-4 print-card"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="bg-white rounded-xl shadow p-4">
              <div className="text-sm text-gray-500">Total Sales (Orders)</div>
              <div className="text-2xl font-semibold">{peso(totalSalesToday)}</div>
              <div className="text-xs text-gray-400 mt-1">
                Based on orders created today (w/ interest if available)
              </div>
            </div>

            <div className="bg-white rounded-xl shadow p-4">
              <div className="text-sm text-gray-500">Payments Received</div>
              <div className="text-2xl font-semibold">{peso(paymentsToday)}</div>
              <div className="text-xs text-gray-400 mt-1">Payments created today</div>
            </div>

            <div className="bg-white rounded-xl shadow p-4">
              <div className="text-sm text-gray-500">Order Statuses (today)</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {orderStatuses.map((s) => (
                  <span
                    key={s}
                    className="text-xs px-2 py-1 rounded bg-gray-100 border"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Orders table */}
          <motion.div
            className="mt-6 bg-white rounded-xl shadow p-4 print-card"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="text-lg font-semibold mb-3">Orders (Today)</div>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-600">
                    <th className="py-2 px-2">Order ID</th>
                    <th className="py-2 px-2">Customer</th>
                    <th className="py-2 px-2">Status</th>
                    <th className="py-2 px-2">Created</th>
                    <th className="py-2 px-2">Completed</th>
                    <th className="py-2 px-2 text-right">Total (w/ interest)</th>
                    <th className="py-2 px-2 text-right">Total (raw)</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0 ? (
                    <tr>
                      <td className="py-3 px-2" colSpan={7}>
                        No orders today.
                      </td>
                    </tr>
                  ) : (
                    orders.map((o) => (
                      <tr key={o.id} className="border-t">
                        <td className="py-2 px-2">{o.id}</td>
                        <td className="py-2 px-2">{o.customer?.name ?? "—"}</td>
                        <td className="py-2 px-2">{o.status ?? "—"}</td>
                        <td className="py-2 px-2">{fmtPHDateTime(o.created_at)}</td>
                        <td className="py-2 px-2">
                          {fmtPHDateTime(o.completed_at)}
                        </td>
                        <td className="py-2 px-2 text-right">
                          {o.grand_total_with_interest != null
                            ? peso(o.grand_total_with_interest)
                            : "—"}
                        </td>
                        <td className="py-2 px-2 text-right">
                          {o.grand_total != null ? peso(o.grand_total) : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>

          {/* Payments table */}
          <motion.div
            className="mt-6 bg-white rounded-xl shadow p-4 print-card"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="text-lg font-semibold mb-3">Payments (Today)</div>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-600">
                    <th className="py-2 px-2">Payment ID</th>
                    <th className="py-2 px-2">Customer</th>
                    <th className="py-2 px-2">Order ID</th>
                    <th className="py-2 px-2">Status</th>
                    <th className="py-2 px-2">Created</th>
                    <th className="py-2 px-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.length === 0 ? (
                    <tr>
                      <td className="py-3 px-2" colSpan={6}>
                        No payments today.
                      </td>
                    </tr>
                  ) : (
                    payments.map((p) => (
                      <tr key={p.id} className="border-t">
                        <td className="py-2 px-2">{p.id}</td>
                        <td className="py-2 px-2">{p.customer?.name ?? "—"}</td>
                        <td className="py-2 px-2">{p.order_id ?? "—"}</td>
                        <td className="py-2 px-2">{p.status ?? "—"}</td>
                        <td className="py-2 px-2">
                          {fmtPHDateTime(p.created_at)}
                        </td>
                        <td className="py-2 px-2 text-right">{peso(p.amount)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        </>
      )}
    </div>
  );
}
