// src/app/admin/payments/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import supabase from "@/config/supabaseClient";
import { toast } from "sonner";
import { Info } from "lucide-react";


/* ----------------------------- Money ------------------------------ */
const peso = (n: number) =>
  (Number(n) || 0).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  });

/* ----------------------------- Dates ------------------------------ */
const formatPH = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/* ------------------------------ Types ------------------------------ */
type CustomerRow = {
  id: string | number;
  name: string | null;
  code: string | null; // TXN code lives here
  email: string | null;
  phone: string | null;
  address: string | null;
};

type OrderRow = {
  id: string | number;
  status: string | null;
  date_created?: string | null;

  total_amount?: number | null;
  grand_total_with_interest?: number | null;
  sales_tax?: number | null;
  shipping_fee?: number | null;

  terms?: string | null;
  payment_terms?: number | null;
  per_term_amount?: number | null;
};

type PaymentRow = {
  id: string;
  customer_id: string | number;
  order_id: string | number | null;
  amount: number;
  method: string | null;
  cheque_number: string | null;
  bank_name: string | null;
  cheque_date: string | null;
  image_url: string | null;
  status: string | null;
  created_at: string | null;
};

type LedgerRow = {
  sortDate: string;
  dateLabel: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  remarks: string;
};

const round2 = (n: number) =>
  Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const statusLower = (s?: string | null) => String(s || "").toLowerCase();

export default function AdminPaymentsLedgerPage() {
  const [loading, setLoading] = useState(true);

  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [selectedCustomerKey, setSelectedCustomerKey] = useState<string>("");

  const [selectedOrderId, setSelectedOrderId] = useState<string>("");


  const paySubKey = useRef<string>("");
  const orderSubKey = useRef<string>("");

  /* ------------------------------ Helpers ------------------------------ */
  const makeCustomerKey = (c: CustomerRow) =>
    (c.email || "").trim().toLowerCase() ||
    `${(c.name || "").trim().toLowerCase()}|${(c.phone || "").trim()}`;

  /* ------------------------------ Fetch customers ------------------------------ */
  async function fetchCustomers() {
    const { data, error } = await supabase
      .from("customers")
      .select("id, name, code, email, phone, address")
      .order("date", { ascending: false });

    if (error) throw error;
    setCustomers((data as CustomerRow[]) || []);
  }

  /* ------------------------------ Fetch orders by customer GROUP ------------------------------ */
  async function fetchOrdersByCustomerGroup(customerKey: string) {
    if (!customerKey) {
      setOrders([]);
      return;
    }

    const ids = customers
      .filter((c) => makeCustomerKey(c) === customerKey)
      .map((c) => String(c.id));

    if (!ids.length) {
      setOrders([]);
      return;
    }

    const { data, error } = await supabase
      .from("orders")
      .select(
        "id, status, date_created, total_amount, grand_total_with_interest, sales_tax, shipping_fee, terms, payment_terms, per_term_amount, customer_id"
      )
      .in("customer_id", ids)
      .order("date_created", { ascending: false });

    if (error) throw error;
    setOrders((data as OrderRow[]) || []);
  }

  /* ------------------------------ Fetch payments by order ------------------------------ */
  async function fetchPaymentsByOrder(orderId: string) {
    if (!orderId) {
      setPayments([]);
      return;
    }

    const { data, error } = await supabase
      .from("payments")
      .select(
        "id, customer_id, order_id, amount, method, cheque_number, bank_name, cheque_date, image_url, status, created_at"
      )
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    setPayments((data as PaymentRow[]) || []);
  }

  /* ------------------------------ Initial load ------------------------------ */
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await fetchCustomers();
      } catch (e: any) {
        console.error(e);
        toast.error(e?.message || "Failed to load customers.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* ------------------------------ Unique customers (no duplicates) ------------------------------ */
  const uniqueCustomers = useMemo(() => {
    const map = new Map<string, CustomerRow>();
    for (const c of customers) {
      const key = makeCustomerKey(c);
      if (!map.has(key)) map.set(key, c);
    }
    return Array.from(map.values());
  }, [customers]);

  /* ------------------------------ Selected objects ------------------------------ */
  const selectedCustomer = useMemo(() => {
    if (!selectedCustomerId) return null;
    // IMPORTANT: match dropdown source
    return (
      uniqueCustomers.find((c) => String(c.id) === String(selectedCustomerId)) || null
    );
  }, [uniqueCustomers, selectedCustomerId]);

  const txnCode = useMemo(() => {
    return String(selectedCustomer?.code || "").trim();
  }, [selectedCustomer]);

  const selectedOrder = useMemo(() => {
    if (!selectedOrderId) return null;
    return orders.find((o) => String(o.id) === String(selectedOrderId)) || null;
  }, [orders, selectedOrderId]);

  /* ------------------------------ When customerKey changes -> load orders ------------------------------ */
  useEffect(() => {
    (async () => {
      if (!selectedCustomerKey) {
        setOrders([]);
        setSelectedOrderId("");
        setPayments([]);
        return;
      }
      try {
        await fetchOrdersByCustomerGroup(selectedCustomerKey);
        setSelectedOrderId("");
        setPayments([]);
      } catch (e: any) {
        console.error(e);
        toast.error(e?.message || "Failed to load TXNs.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomerKey, customers]);

  /* ------------------------------ When order changes ------------------------------ */
  useEffect(() => {
    (async () => {
      if (!selectedOrderId) {
        setPayments([]);
        return;
      }
      try {
        await fetchPaymentsByOrder(selectedOrderId);
      } catch (e: any) {
        console.error(e);
        toast.error(e?.message || "Failed to load payments.");
      }
    })();
  }, [selectedOrderId]);

  /* ------------------------------ Realtime: orders (refresh by GROUP key) ------------------------------ */
  useEffect(() => {
    if (!selectedCustomerKey) return;

    const key = `orders-group:${selectedCustomerKey}`;
    if (orderSubKey.current === key) return;
    orderSubKey.current = key;

    const ch = supabase.channel("realtime-admin-ledger-orders");

    ch.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "orders" },
      async () => {
        try {
          await fetchOrdersByCustomerGroup(selectedCustomerKey);
        } catch (e) {
          console.error("Realtime orders refresh failed:", e);
        }
      }
    );

    ch.subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomerKey, customers]);

  /* ------------------------------ Realtime: payments (for selected order) ------------------------------ */
  useEffect(() => {
    if (!selectedOrderId) return;

    const key = `payments:${selectedOrderId}`;
    if (paySubKey.current === key) return;
    paySubKey.current = key;

    const ch = supabase.channel("realtime-admin-ledger-payments");
    ch.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "payments",
        filter: `order_id=eq.${selectedOrderId}`,
      },
      async () => {
        try {
          await fetchPaymentsByOrder(selectedOrderId);
        } catch (e) {
          console.error("Realtime payments refresh failed:", e);
        }
      }
    );

    ch.subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [selectedOrderId]);

  /* ------------------------------ Compute order grand total ------------------------------ */
  const orderGrandTotal = useMemo(() => {
    const o = selectedOrder;
    if (!o) return 0;

    const base =
      typeof o.grand_total_with_interest === "number" && Number.isFinite(o.grand_total_with_interest)
        ? Number(o.grand_total_with_interest)
        : Number(o.total_amount || 0);

    const shipping = Number(o.shipping_fee || 0);
    return round2(base + shipping);
  }, [selectedOrder]);

  /* ------------------------------ Ledger rows ------------------------------ */
  const ledgerRows: LedgerRow[] = useMemo(() => {
    if (!selectedOrder) return [];

    const createdAt = selectedOrder.date_created || new Date().toISOString();
    const rows: Omit<LedgerRow, "balance">[] = [];

    rows.push({
      sortDate: createdAt,
      dateLabel: formatPH(createdAt),
      description: `TXN Charge (${txnCode || "No TXN Code"})`,
      debit: orderGrandTotal,
      credit: 0,
      remarks: `Order Status: ${(selectedOrder.status || "—").toUpperCase()}`,
    });

    const payRows = (payments || [])
      .filter((p) => String(p.order_id ?? "") === String(selectedOrder.id))
      .filter((p) => {
        const st = statusLower(p.status);
return st === "received";

      })
      .map((p) => {
        const st = statusLower(p.status);
        const method = String(p.method || "Payment");
        const refParts = [
          p.cheque_number ? `Ref: ${p.cheque_number}` : null,
          p.bank_name ? `Bank: ${p.bank_name}` : null,
          p.cheque_date ? `Date: ${p.cheque_date}` : null,
        ].filter(Boolean);

        const desc =
          method.toLowerCase() === "deposit"
            ? `Deposit Payment${refParts.length ? ` (${refParts.join(" • ")})` : ""}`
            : `${method} Payment${refParts.length ? ` (${refParts.join(" • ")})` : ""}`;

        return {
          sortDate: p.created_at || new Date().toISOString(),
          dateLabel: formatPH(p.created_at),
          description: desc,
          debit: 0,
          credit: round2(Number(p.amount || 0)),
          remarks: st === "received" ? "RECEIVED" : "PENDING",
        };
      });

    rows.push(...payRows);
    rows.sort((a, b) => String(a.sortDate).localeCompare(String(b.sortDate)));

    let bal = 0;
    return rows.map((r) => {
      bal = round2(bal + (r.debit || 0) - (r.credit || 0));
      return { ...r, balance: bal };
    });
  }, [selectedOrder, payments, orderGrandTotal, txnCode]);


  const totalCredits = useMemo(
    () => round2(ledgerRows.reduce((s, r) => s + (r.credit || 0), 0)),
    [ledgerRows]
  );

  const currentBalance = useMemo(
    () => (ledgerRows.length ? round2(ledgerRows[ledgerRows.length - 1].balance) : 0),
    [ledgerRows]
  );

  /* ---------------------------------- UI ---------------------------------- */
  return (
    <div className="min-h-[calc(100vh-80px)]">
      <div className="mx-auto w-full max-w-6xl px-6 py-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-neutral-800">
              Payments Ledger
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Select a customer, then select a TXN to view the ledger: Debit, Credit, and Balance.
            </p>
          </div>


        </div>

        {/* Selectors */}
        <div className="mt-6 rounded-xl bg-white border border-gray-200 p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Customer */}
            <div>
              <label className="text-xs text-gray-600">Choose Customer *</label>
              <select
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
                value={selectedCustomerId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedCustomerId(id);

                  const picked =
                    uniqueCustomers.find((x) => String(x.id) === String(id)) || null;

                  const key = picked ? makeCustomerKey(picked) : "";
                  setSelectedCustomerKey(key);
                }}
              >
                <option value="">— Select customer —</option>
                {uniqueCustomers.map((c) => (
                  <option key={String(c.id)} value={String(c.id)}>
                    {(c.name || "Unknown").trim()} {c.email ? `— ${c.email}` : ""}
                  </option>
                ))}
              </select>

              {selectedCustomer && (
                <div className="mt-2 text-xs text-gray-700">
                  <div className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1">
                    <span className="font-semibold">Customer:</span>
                    <span className="font-medium">{selectedCustomer.name || "—"}</span>
                    {selectedCustomer.phone ? (
                      <>
                        <span className="opacity-50">•</span>
                        <span className="text-gray-500">{selectedCustomer.phone}</span>
                      </>
                    ) : null}
                  </div>
                </div>
              )}
            </div>

            {/* TXN / Order */}
            <div>
              <label className="text-xs text-gray-600">Choose TXN (Order) *</label>
              <select
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
                value={selectedOrderId}
                onChange={(e) => setSelectedOrderId(e.target.value)}
                disabled={!selectedCustomerId}
              >
                <option value="">— Select TXN —</option>
                {orders.map((o) => (
                  <option key={String(o.id)} value={String(o.id)}>
                    TXN {selectedCustomer?.code || "—"} — Order {String(o.id).slice(0, 8)}… —{" "}
                    {(o.status || "—").toUpperCase()}
                  </option>
                ))}
              </select>

              {!selectedCustomerId && (
                <div className="mt-2 flex items-start gap-2 text-xs text-gray-600">
                  <Info className="h-4 w-4 mt-0.5" />
                  Select a customer first.
                </div>
              )}
            </div>
          </div>


        </div>

        {/* Ledger */}
        {selectedOrderId ? (
          <div className="mt-6 rounded-xl bg-white border border-gray-200 p-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
              <div>
                <h2 className="text-lg font-semibold">
                  Ledger for TXN <span className="font-mono">{txnCode || "—"}</span>
                </h2>
                <p className="text-xs text-gray-600">
                  Debit = charge • Credit = payments • Balance = running balance
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1">
                  <b>Charge:</b> {peso(orderGrandTotal)}
                </span>
                <span className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1">
                  <b>Credits:</b> {peso(totalCredits)}
                </span>
                <span className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-900">
                  <b>Balance:</b> {peso(currentBalance)}
                </span>
              </div>
            </div>

            <div className="rounded-xl overflow-hidden ring-1 ring-gray-200 bg-white">
              <table className="w-full text-sm align-middle">
                <thead>
                  <tr
                    className="text-black uppercase tracking-wider text-[11px]"
                    style={{ background: "#ffba20" }}
                  >
                    <th className="py-2.5 px-3 text-left font-bold">DATE OF PAYMENT</th>
                    <th className="py-2.5 px-3 text-left font-bold">DESCRIPTION</th>
                    <th className="py-2.5 px-3 text-left font-bold">DEBIT</th>
                    <th className="py-2.5 px-3 text-left font-bold">CREDIT</th>
                    <th className="py-2.5 px-3 text-left font-bold">BALANCE</th>
                    <th className="py-2.5 px-3 text-left font-bold">REMARKS</th>
                  </tr>
                </thead>

                <tbody>
                  {ledgerRows.map((r, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-neutral-50"}>
                      <td className="py-2.5 px-3">{r.dateLabel}</td>
                      <td className="py-2.5 px-3 font-medium">{r.description}</td>
                      <td className="py-2.5 px-3 text-left font-mono">
                        {r.debit > 0 ? peso(r.debit) : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-left font-mono">
                        {r.credit > 0 ? peso(r.credit) : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold">
                        {peso(r.balance)}
                      </td>
                      <td className="py-2.5 px-3 text-left">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            r.remarks === "RECEIVED"
                              ? "bg-green-100 text-green-800"
                              : r.remarks === "PENDING"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {r.remarks}
                        </span>
                      </td>
                    </tr>
                  ))}

                  {ledgerRows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-10 text-neutral-400">
                        No ledger entries found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>


          </div>
        ) : null}

        {loading && <div className="mt-6 text-sm text-gray-600">Loading…</div>}
      </div>
    </div>
  );
}
