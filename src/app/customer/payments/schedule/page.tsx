"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import supabase from "@/config/supabaseClient";
import { toast } from "sonner";

/* ----------------------------- Money ------------------------------ */
const peso = (n: number) =>
  (Number(n) || 0).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  });

/* ----------------------------- Dates ------------------------------ */
// Local YYYY-MM-DD for <input type="date"> and comparisons
const todayLocalISO = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

const parseLocalDate = (isoDate: string) => {
  const [y, m, d] = (isoDate || "").split("-").map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1, 0, 0, 0, 0);
};

const startOfTodayLocal = () => {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
};

/* ----------------------------- Utils ------------------------------ */
const round2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const EPS = 0.000001;

const inList = (vals: (string | number)[]) =>
  vals.map((v) => (typeof v === "string" ? `"${v}"` : String(v))).join(",");

/* ---------------------------------- Types --------------------------------- */
type OrderItemRow = {
  quantity: number;
  price: number | null;
  discount_percent?: number | null;
  inventory?: {
    product_name?: string | null;
    unit?: string | null;
    unit_price?: number | null;
  } | null;
};

type OrderRow = {
  id: string | number;
  status: string | null;
  grand_total_with_interest?: number | null;
  sales_tax?: number | null;
  interest_percent?: number | null;
  per_term_amount?: number | null; // base per-term (no shipping)
  payment_terms?: number | null;
  truck_delivery_id?: string | null;
  order_items?: OrderItemRow[] | null;
};

type CustomerTx = {
  id: string | number;
  name: string | null;
  code: string | null; // TXN code
  email: string | null;
  payment_type?: string | null;
  orders?: OrderRow[] | null;
};

type InstallmentRow = {
  id?: string;
  order_id: string;
  term_no: number;
  due_date: string; // YYYY-MM-DD
  amount_due: number;
  amount_paid?: number | null;
  status?: string | null; // "paid" | "pending"
};

/* -------- Shipping fee: orders.truck_delivery_id -> truck_deliveries.shipping_fee -------- */
async function fetchShippingFeeForOrder(orderId: string | number): Promise<number> {
  try {
    const { data: ord } = await supabase
      .from("orders")
      .select("truck_delivery_id")
      .eq("id", orderId)
      .maybeSingle();

    const deliveryId = ord?.truck_delivery_id;
    if (!deliveryId) return 0;

    const { data: del } = await supabase
      .from("truck_deliveries")
      .select("shipping_fee")
      .eq("id", deliveryId)
      .maybeSingle();

    const fee = Number(del?.shipping_fee ?? 0);
    return Number.isFinite(fee) ? fee : 0;
  } catch {
    return 0;
  }
}

/* ------------------------------ Component ------------------------------ */
export default function PaymentSchedulePage() {
  const [loading, setLoading] = useState(true);
  const [txns, setTxns] = useState<CustomerTx[]>([]);
  const [selectedTxnCode, setSelectedTxnCode] = useState<string>("");

  const [installments, setInstallments] = useState<InstallmentRow[]>([]);
  const [loadingInstallments, setLoadingInstallments] = useState(false);

  // order_id -> shippingFee cache
  const [shippingFees, setShippingFees] = useState<Record<string, number>>({});
  const paymentsSubKey = useRef<string>("");

  /* ------------------------------- Fetch customers + completed orders ------------------------------- */
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // Load ALL customers with their orders (filter to completed later)
        const { data: customers, error } = await supabase
          .from("customers")
          .select(
            `
            id, name, code, email, payment_type,
            orders (
              id, status, grand_total_with_interest, sales_tax, interest_percent, per_term_amount, payment_terms, truck_delivery_id
            )
          `
          )
          .order("id", { ascending: false });

        if (error) throw error;

        const list = (customers as CustomerTx[]) || [];
        setTxns(list);

        // Prefetch shipping fees for completed orders
        const allCompletedOrders = list
          .flatMap((c) => c.orders ?? [])
          .filter((o) => (o.status || "").toLowerCase() === "completed");

        const allOrderIds = Array.from(new Set(allCompletedOrders.map((o) => String(o.id))));
        const entries = await Promise.all(
          allOrderIds.map(async (oid) => [oid, await fetchShippingFeeForOrder(oid)] as [string, number])
        );
        const map: Record<string, number> = {};
        for (const [oid, fee] of entries) map[oid] = fee;
        setShippingFees(map);
      } catch (e) {
        console.error(e);
        toast.error("Failed to load payment schedules.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* --------------------------- Build TXN options (completed only) --------------------------- */
  const txnOptions = useMemo(() => {
    const out: {
      code: string;
      order: OrderRow;
      customerId: string;
      customerName: string;
      customerEmail: string | null;
      paymentType: string | null | undefined;
    }[] = [];

    for (const c of txns) {
      const code = c.code ?? "";
      const completed = (c.orders ?? []).find((o) => (o.status || "").toLowerCase() === "completed");
      if (code && completed) {
        out.push({
          code,
          order: completed,
          customerId: String(c.id),
          customerName: (c.name || "").trim() || "Unknown",
          customerEmail: c.email || null,
          paymentType: c.payment_type,
        });
      }
    }
    // Most recent first (already ordered by customers.id desc)
    return out;
  }, [txns]);

  const selectedPack = useMemo(() => {
    if (!selectedTxnCode) return null;
    const hit = txnOptions.find((t) => t.code === selectedTxnCode) || null;
    return hit;
  }, [txnOptions, selectedTxnCode]);

  /* ----------------------------- Load schedule rows for selected order ----------------------------- */
  useEffect(() => {
    (async () => {
      if (!selectedPack?.order?.id) {
        setInstallments([]);
        return;
      }
      try {
        setLoadingInstallments(true);
        const { data, error } = await supabase
          .from("order_installments")
          .select("id, order_id, term_no, due_date, amount_due, amount_paid, status")
          .eq("order_id", String(selectedPack.order.id))
          .order("term_no", { ascending: true });

        if (error) throw error;
        setInstallments((data as InstallmentRow[]) || []);
      } catch (e) {
        console.error(e);
        toast.error("Failed to load installment schedule.");
      } finally {
        setLoadingInstallments(false);
      }
    })();
  }, [selectedPack?.order?.id]);

  /* ----------------------------- Realtime: order_installments & payments ----------------------------- */
  useEffect(() => {
    const orderId = selectedPack?.order?.id ? String(selectedPack.order.id) : "";
    if (!orderId) return;

    const ch = supabase.channel("realtime-installments-view");
    ch.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "order_installments", filter: `order_id=eq.${orderId}` },
      async () => {
        try {
          const { data } = await supabase
            .from("order_installments")
            .select("id, order_id, term_no, due_date, amount_due, amount_paid, status")
            .eq("order_id", orderId)
            .order("term_no", { ascending: true });
          setInstallments((data as InstallmentRow[]) || []);
        } catch (e) {
          console.error(e);
        }
      }
    );

    // If admins update shipping fee or payments update amounts, the backend might adjust installments
    // Also listen to payments by this order to refresh
    const payKey = `payments:${orderId}`;
    if (paymentsSubKey.current !== payKey) paymentsSubKey.current = payKey;

    ch.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "payments", filter: `order_id=eq.${orderId}` },
      async () => {
        try {
          const { data } = await supabase
            .from("order_installments")
            .select("id, order_id, term_no, due_date, amount_due, amount_paid, status")
            .eq("order_id", orderId)
            .order("term_no", { ascending: true });
          setInstallments((data as InstallmentRow[]) || []);
        } catch (e) {
          console.error(e);
        }
      }
    );

    ch.subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [selectedPack?.order?.id]);

  /* ----------------------------- Totals & status helpers ----------------------------- */
  const orderShippingFee = useMemo(() => {
    if (!selectedPack?.order?.id) return 0;
    return round2(shippingFees[String(selectedPack.order.id)] || 0);
  }, [selectedPack?.order?.id, shippingFees]);

  // Sum from rows
  const totals = useMemo(() => {
    const due = round2(installments.reduce((s, r) => s + Number(r.amount_due || 0), 0));
    const paid = round2(installments.reduce((s, r) => s + Number(r.amount_paid || 0), 0));
    const remaining = Math.max(0, round2(due - paid));
    return { due, paid, remaining };
  }, [installments]);

  const nextUnpaid = useMemo(() => {
    const today0 = startOfTodayLocal();
    const sorted = [...installments].sort((a, b) => a.term_no - b.term_no);
    for (const r of sorted) {
      const amtDue = Number(r.amount_due || 0);
      const amtPaid = Number(r.amount_paid || 0);
      const isPaid = (r.status || "").toLowerCase() === "paid" || amtPaid + EPS >= amtDue;

      if (!isPaid) {
        const d = parseLocalDate(r.due_date);
        const isOverdue = d < today0;
        return { ...r, isOverdue };
      }
    }
    return null;
  }, [installments]);

  const badge = (r: InstallmentRow) => {
    const amtDue = Number(r.amount_due || 0);
    const amtPaid = Number(r.amount_paid || 0);
    const isPaid = (r.status || "").toLowerCase() === "paid" || amtPaid + EPS >= amtDue;
    if (isPaid)
      return (
        <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
          Paid
        </span>
      );
    const isOverdue = parseLocalDate(r.due_date) < startOfTodayLocal();
    if (isOverdue)
      return (
        <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800">
          Overdue
        </span>
      );
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
        Pending
      </span>
    );
  };

  return (
    <div className="min-h-[calc(100vh-80px)]">
      <div className="mx-auto w-full max-w-6xl px-6 py-6">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-neutral-800">Payment Schedule</h1>
        </div>
        <p className="text-sm text-gray-600 mt-1">
          View your <b>installment plan</b> per Transaction Code (TXN). Status updates in real time.
        </p>

        {/* Selector */}
        <div className="mt-5 rounded-xl bg-white border border-gray-200 p-4">
          <label className="text-xs text-gray-600">Select Transaction (TXN)</label>
          <select
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
            value={selectedTxnCode}
            onChange={(e) => setSelectedTxnCode(e.target.value)}
          >
            <option value="">— Choose a TXN —</option>
            {txnOptions.map(({ code, customerName }, i) => (
              <option key={`${code}-${i}`} value={code}>
                {code} — {customerName}
              </option>
            ))}
          </select>

          {/* Owner badge */}
          {!!selectedPack && (
            <div className="mt-2 text-xs text-gray-700">
              <span className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1">
                <span className="font-semibold">Owner:</span>{" "}
                <span className="font-medium">{selectedPack.customerName}</span>
                {selectedPack.customerEmail ? (
                  <>
                    <span className="opacity-50">•</span>
                    <span className="text-gray-500">{selectedPack.customerEmail}</span>
                  </>
                ) : null}
              </span>
            </div>
          )}
        </div>

        {/* Summary */}
        {selectedPack && (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="text-xs text-gray-500">Grand Total (incl. shipping)</div>
              <div className="text-2xl font-bold text-green-700 mt-1">
                {peso(
                  round2(
                    Number(selectedPack.order.grand_total_with_interest || 0) +
                      (orderShippingFee || 0)
                  )
                )}
              </div>
              {orderShippingFee > 0 && (
                <div className="text-[11px] text-gray-500 mt-1">
                  Shipping fee: <b>{peso(orderShippingFee)}</b> (distributed across terms)
                </div>
              )}
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="text-xs text-gray-500">Paid</div>
              <div className="text-2xl font-bold text-blue-700 mt-1">{peso(totals.paid)}</div>
              <div className="text-[11px] text-gray-500 mt-1">
                Remaining: <b className="text-amber-700">{peso(totals.remaining)}</b>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="text-xs text-gray-500">Next Due</div>
              {nextUnpaid ? (
                <div className="mt-1">
                  <div className="text-lg font-semibold">
                    Term #{nextUnpaid.term_no} — {nextUnpaid.due_date}
                  </div>
                  <div className="text-sm text-gray-700">
                    Amount due: <b>{peso(Number(nextUnpaid.amount_due || 0))}</b>
                  </div>
                  <div className="mt-1">{badge(nextUnpaid)}</div>
                </div>
              ) : (
                <div className="text-lg font-semibold mt-1">All terms paid 🎉</div>
              )}
            </div>
          </div>
        )}

        {/* Schedule table */}
        {selectedPack && (
          <div className="mt-6 rounded-xl bg-white border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200">
              <h2 className="text-lg font-semibold">
                Installment Schedule — <span className="font-mono">{selectedPack.code}</span>
              </h2>
              <div className="text-xs text-gray-500">
                {selectedPack.paymentType?.toLowerCase() === "credit"
                  ? "Credit terms detected."
                  : "Payment plan available."}{" "}
                Updates automatically when a payment is received.
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm align-middle">
                <thead>
                  <tr className="text-black uppercase tracking-wider text-[11px]" style={{ background: "#ffba20" }}>
                    <th className="py-2.5 px-3 text-center font-bold">Term #</th>
                    <th className="py-2.5 px-3 text-center font-bold">Due Date</th>
                    <th className="py-2.5 px-3 text-center font-bold">Amount Due</th>
                    <th className="py-2.5 px-3 text-center font-bold">Amount Paid</th>
                    <th className="py-2.5 px-3 text-center font-bold">Remaining</th>
                    <th className="py-2.5 px-3 text-center font-bold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingInstallments ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-neutral-400">
                        Loading schedule…
                      </td>
                    </tr>
                  ) : (installments ?? []).length ? (
                    installments.map((r, idx) => {
                      const amtDue = Number(r.amount_due || 0);
                      const amtPaid = Number(r.amount_paid || 0);
                      const remain = Math.max(0, round2(amtDue - amtPaid));
                      const overdue = parseLocalDate(r.due_date) < startOfTodayLocal();
                      const paid = (r.status || "").toLowerCase() === "paid" || amtPaid + EPS >= amtDue;

                      return (
                        <tr key={r.id || `${r.order_id}-${r.term_no}-${idx}`} className={idx % 2 === 0 ? "bg-white" : "bg-neutral-50"}>
                          <td className="py-2.5 px-3 text-center font-mono">{r.term_no}</td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={overdue && !paid ? "text-rose-600 font-semibold" : ""}>
                              {r.due_date}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono">{peso(amtDue)}</td>
                          <td className="py-2.5 px-3 text-center font-mono">{peso(amtPaid)}</td>
                          <td className="py-2.5 px-3 text-center font-mono">{peso(remain)}</td>
                          <td className="py-2.5 px-3 text-center">{badge(r)}</td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-neutral-400">
                        No schedule found for this TXN.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer totals */}
            {!!installments.length && (
              <div className="px-4 py-3 border-t border-gray-200 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="text-sm">
                  <div className="text-gray-500">Total Due</div>
                  <div className="font-bold">{peso(totals.due)}</div>
                </div>
                <div className="text-sm">
                  <div className="text-gray-500">Total Paid</div>
                  <div className="font-bold text-blue-700">{peso(totals.paid)}</div>
                </div>
                <div className="text-sm">
                  <div className="text-gray-500">Remaining Balance</div>
                  <div className="font-bold text-amber-700">{peso(totals.remaining)}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {!loading && !txnOptions.length && (
          <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            No completed TXNs found yet.
          </div>
        )}
      </div>
    </div>
  );
}
