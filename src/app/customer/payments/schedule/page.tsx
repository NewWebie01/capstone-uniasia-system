// src/app/customer/payment-ledger/page.tsx
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

const round2 = (n: number) =>
  Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const statusLower = (s?: string | null) => String(s || "").toLowerCase();
const nowISO = () => new Date().toISOString();

/* ------------------------------ Types ------------------------------ */
type CustomerRow = {
  id: string | number;
  name: string | null;
  code: string | null; // Invoice No. lives here per your schema
  email: string | null;
  phone: string | null;
  address: string | null;
};

type OrderRow = {
  id: string | number;
  customer_id?: string | number | null;
  status: string | null;
  date_created?: string | null;

  total_amount?: number | null;
  grand_total_with_interest?: number | null;
  sales_tax?: number | null;
  shipping_fee?: number | null;

  terms?: string | null;
  payment_terms?: number | null;
  per_term_amount?: number | null;

  // ✅ Join customers (single row, forced inner join)
  customers?: { code: string | null } | null;
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

export default function CustomerMyPaymentLedgerPage() {
  const [loading, setLoading] = useState(true);

  const [meEmail, setMeEmail] = useState<string>("");
  const [meId, setMeId] = useState<string>("");

  const [myCustomers, setMyCustomers] = useState<CustomerRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);

  const [selectedOrderId, setSelectedOrderId] = useState<string>("");

  const paySubKey = useRef<string>("");
  const orderSubKey = useRef<string>("");

  /* ------------------------------ Helpers ------------------------------ */
  const makeCustomerKey = (c: CustomerRow) =>
    (c.email || "").trim().toLowerCase() ||
    `${(c.name || "").trim().toLowerCase()}|${(c.phone || "").trim()}`;

  /* ------------------------------ Load current user ------------------------------ */
  async function loadAuthUser() {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;

    const email = data?.user?.email || "";
    const uid = data?.user?.id || "";

    setMeEmail(email);
    setMeId(uid);

    if (!email) throw new Error("No logged-in user email found.");
    return { email, uid };
  }

  /* ------------------------------ Fetch customers owned by me ------------------------------ */
  async function fetchMyCustomersByEmail(email: string) {
    const { data, error } = await supabase
      .from("customers")
      .select("id, name, code, email, phone, address")
      .eq("email", email)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return ((data as CustomerRow[]) || []) as CustomerRow[];
  }

  async function fetchMyCustomersFallbackByProfilePhone(uid: string) {
    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("contact_number")
      .eq("id", uid)
      .maybeSingle();

    if (profErr) return [];

    const phone = String((prof as any)?.contact_number || "").trim();
    if (!phone) return [];

    const { data, error } = await supabase
      .from("customers")
      .select("id, name, code, email, phone, address")
      .eq("phone", phone)
      .order("created_at", { ascending: false });

    if (error) return [];
    return ((data as CustomerRow[]) || []) as CustomerRow[];
  }

  /* ------------------------------ Fetch orders by my customer group ------------------------------ */
  async function fetchOrdersByMyCustomerGroup(customersOwned: CustomerRow[]) {
    if (!customersOwned.length) {
      setOrders([]);
      return;
    }

    const key = makeCustomerKey(customersOwned[0]);
    const ids = customersOwned
      .filter((c) => makeCustomerKey(c) === key)
      .map((c) => String(c.id));

    if (!ids.length) {
      setOrders([]);
      return;
    }

    // ✅ IMPORTANT: use !inner to force a single joined customer row
    const { data, error } = await supabase
      .from("orders")
      .select(
        `
        id, customer_id, status, date_created,
        total_amount, grand_total_with_interest, sales_tax, shipping_fee,
        terms, payment_terms, per_term_amount,
        customers:customers!inner ( code )
        `
      )
      .in("customer_id", ids)
      .order("date_created", { ascending: false });

    if (error) throw error;

    // Supabase sometimes still returns customers as array; normalize it here safely
    const normalized: OrderRow[] = ((data as any[]) || []).map((row) => {
      const c = row.customers;
      const customersObj =
        Array.isArray(c) ? (c[0] ?? null) : (c ?? null);

      return { ...row, customers: customersObj };
    });

    setOrders(normalized);
  }

  /* ------------------------------ Fetch payments by selected order ------------------------------ */
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
        const { email, uid } = await loadAuthUser();

        let owned = await fetchMyCustomersByEmail(email);
        if (!owned.length) owned = await fetchMyCustomersFallbackByProfilePhone(uid);

        setMyCustomers(owned);
        await fetchOrdersByMyCustomerGroup(owned);

        setSelectedOrderId("");
        setPayments([]);
      } catch (e: any) {
        console.error(e);
        toast.error(e?.message || "Failed to load your ledger.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------ Selected order ------------------------------ */
  const selectedOrder = useMemo(() => {
    if (!selectedOrderId) return null;
    return orders.find((o) => String(o.id) === String(selectedOrderId)) || null;
  }, [orders, selectedOrderId]);

  // ✅ The invoice number to display everywhere
  const selectedInvoiceNo = useMemo(() => {
    const inv = String(selectedOrder?.customers?.code || "").trim();
    return inv || "";
  }, [selectedOrder]);

  /* ------------------------------ My display info ------------------------------ */
  const myDisplay = useMemo(() => {
    const c = myCustomers?.[0] || null;
    return {
      name: c?.name || "Customer",
      email: c?.email || meEmail || "—",
      phone: c?.phone || "—",
      address: c?.address || "—",
    };
  }, [myCustomers, meEmail]);

  /* ------------------------------ Compute order grand total ------------------------------ */
  const orderGrandTotal = useMemo(() => {
    const o = selectedOrder;
    if (!o) return 0;

    const base =
      typeof o.grand_total_with_interest === "number" &&
      Number.isFinite(o.grand_total_with_interest)
        ? Number(o.grand_total_with_interest)
        : Number(o.total_amount || 0);

    const shipping = Number(o.shipping_fee || 0);
    return round2(base + shipping);
  }, [selectedOrder]);

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

  /* ------------------------------ Realtime: refresh orders list ------------------------------ */
  useEffect(() => {
    if (!myCustomers.length) return;

    const key = `orders-my-ledger:${makeCustomerKey(myCustomers[0])}`;
    if (orderSubKey.current === key) return;
    orderSubKey.current = key;

    const ch = supabase.channel("realtime-customer-ledger-orders");
    ch.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "orders" },
      async () => {
        try {
          await fetchOrdersByMyCustomerGroup(myCustomers);
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
  }, [myCustomers]);

  /* ------------------------------ Realtime: payments for selected order ------------------------------ */
  useEffect(() => {
    if (!selectedOrderId) return;

    const key = `payments-my-ledger:${selectedOrderId}`;
    if (paySubKey.current === key) return;
    paySubKey.current = key;

    const ch = supabase.channel("realtime-customer-ledger-payments");
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

  /* ------------------------------ Ledger rows ------------------------------ */
  const ledgerRows = useMemo<LedgerRow[]>(() => {
    if (!selectedOrder) return [];

    const createdAt = selectedOrder.date_created || nowISO();
    const rows: Omit<LedgerRow, "balance">[] = [];

    rows.push({
      sortDate: createdAt,
      dateLabel: formatPH(createdAt),
      description: `Invoice Charge (${selectedInvoiceNo || "No Invoice No."})`,
      debit: orderGrandTotal,
      credit: 0,
      remarks: `Order Status: ${(selectedOrder.status || "—").toUpperCase()}`,
    });

    const payRows: Omit<LedgerRow, "balance">[] = (payments || [])
      .filter((p) => String(p.order_id ?? "") === String(selectedOrder.id))
      .map((p) => {
        const method = String(p.method || "Payment");
        const lines: string[] = [];
        lines.push(`${method} Payment`);
        if (p.cheque_number) lines.push(`Ref: ${p.cheque_number}`);
        if (p.bank_name) lines.push(`Bank: ${p.bank_name}`);
        if (p.cheque_date) lines.push(`Date: ${p.cheque_date}`);
        if (p.image_url) lines.push(`Proof: Available`);

        return {
          sortDate: p.created_at || nowISO(),
          dateLabel: formatPH(p.created_at),
          description: lines.join("\n"),
          debit: 0,
          credit: round2(Number(p.amount || 0)),
          remarks: (p.status || "—").toUpperCase(),
        };
      });

    rows.push(...payRows);
    rows.sort((a, b) => String(a.sortDate).localeCompare(String(b.sortDate)));

    let bal = 0;
    return rows.map((r) => {
      bal = round2(bal + (r.debit || 0) - (r.credit || 0));
      return { ...r, balance: bal };
    });
  }, [selectedOrder, payments, orderGrandTotal, selectedInvoiceNo]);

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
              My Payment Ledger
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Select one of your invoices to view Debit, Credit, and running Balance.
            </p>
          </div>
        </div>

        {/* My info */}
        <div className="mt-6 rounded-xl bg-white border border-gray-200 p-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="text-xs text-gray-700">
              <div className="inline-flex flex-wrap items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1">
                <span className="font-semibold">Customer:</span>
                <span className="font-medium">{myDisplay.name}</span>
                <span className="opacity-50">•</span>
                <span className="text-gray-600">{myDisplay.email}</span>
                {myDisplay.phone !== "—" ? (
                  <>
                    <span className="opacity-50">•</span>
                    <span className="text-gray-600">{myDisplay.phone}</span>
                  </>
                ) : null}
              </div>

              {myDisplay.address !== "—" ? (
                <div className="mt-2 text-[11px] text-gray-600">
                  <span className="font-semibold">Address:</span> {myDisplay.address}
                </div>
              ) : null}
            </div>

            {!myCustomers.length && !loading ? (
              <div className="flex items-start gap-2 text-xs text-gray-600">
                <Info className="h-4 w-4 mt-0.5" />
                No customer record matched your account yet (email/phone). Contact admin.
              </div>
            ) : null}
          </div>
        </div>

        {/* Invoice selector */}
        <div className="mt-4 rounded-xl bg-white border border-gray-200 p-4">
          <label className="text-xs text-gray-600">Choose Your Invoice *</label>
          <select
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
            value={selectedOrderId}
            onChange={(e) => setSelectedOrderId(e.target.value)}
            disabled={!orders.length}
          >
            <option value="">— Select Invoice —</option>

            {orders.map((o) => {
              const inv = String(o.customers?.code || "").trim();
              return (
                <option key={String(o.id)} value={String(o.id)}>
                  {inv ? `Invoice No. ${inv}` : "Invoice No. —"}
                </option>
              );
            })}
          </select>

          {!orders.length && !loading ? (
            <div className="mt-2 flex items-start gap-2 text-xs text-gray-600">
              <Info className="h-4 w-4 mt-0.5" />
              No invoices found for your account.
            </div>
          ) : null}
        </div>

        {/* Ledger */}
        {selectedOrderId ? (
          <div className="mt-6 rounded-xl bg-white border border-gray-200 p-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
              <div>
                <h2 className="text-lg font-semibold">
                  Ledger for{" "}
                  <span className="font-mono">
                    {selectedInvoiceNo ? `Invoice No. ${selectedInvoiceNo}` : "Invoice No. —"}
                  </span>
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

            {/* Ledger Table */}
            <div className="rounded-xl overflow-hidden ring-1 ring-gray-200 bg-white">
              <table className="w-full text-sm align-middle">
                <thead>
                  <tr
                    className="text-black uppercase tracking-wider text-[11px]"
                    style={{ background: "#ffba20" }}
                  >
                    <th className="py-2.5 px-3 text-left font-bold">DATE</th>
                    <th className="py-2.5 px-3 text-left font-bold">DESCRIPTION</th>
                    <th className="py-2.5 px-3 text-left font-bold">DEBIT</th>
                    <th className="py-2.5 px-3 text-left font-bold">CREDIT</th>
                    <th className="py-2.5 px-3 text-right font-bold">BALANCE</th>
                    <th className="py-2.5 px-3 text-left font-bold">STATUS</th>
                  </tr>
                </thead>

                <tbody>
                  {ledgerRows.map((r, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-neutral-50"}>
                      <td className="py-2.5 px-3">{r.dateLabel}</td>
                      <td className="py-2.5 px-3 font-medium whitespace-pre-line">
                        {r.description}
                      </td>
                      <td className="py-2.5 px-3 text-left font-mono">{peso(r.debit || 0)}</td>
                      <td className="py-2.5 px-3 text-left font-mono">{peso(r.credit || 0)}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold">
                        {peso(r.balance || 0)}
                      </td>
                      <td className="py-2.5 px-3 text-left">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            statusLower(r.remarks) === "received"
                              ? "bg-green-100 text-green-800"
                              : statusLower(r.remarks) === "pending"
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
