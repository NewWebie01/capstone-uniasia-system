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
  return dt.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
};


/* ------------------------------ Types ------------------------------ */
type CustomerRow = {
  id: string | number;
  name: string | null;
  code: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;

  payment_type?: "Cash" | "Credit" | string | null; // ✅ ADD
};


type OrderRow = {
  id: string | number;
  customer_id: string | number; // ✅ ADD THIS
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

const nowISO = () => new Date().toISOString();

async function getAdminEmail() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.email || null;
}

/* ----------------------- Upload proof image ----------------------- */
async function uploadPaymentProof(file: File, orderId: string) {
  // Uses existing public bucket: payment-cheques
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${orderId}/${Date.now()}-${safeName}`;

  const { error: upErr } = await supabase.storage
    .from("payment-cheques")

    .upload(path, file, { cacheControl: "3600", upsert: false });

  if (upErr) throw upErr;

  const { data } = supabase.storage.from("payment-cheques").getPublicUrl(path);

  return data.publicUrl;
}

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

  /* -------------------- Add Payment form state -------------------- */
  const [payAmount, setPayAmount] = useState<string>("");
  const [payMethod, setPayMethod] = useState<string>("Cash");
  const [payChequeNumber, setPayChequeNumber] = useState<string>("");
  const [payBankName, setPayBankName] = useState<string>("");
  const [payChequeDate, setPayChequeDate] = useState<string>(""); // YYYY-MM-DD
  const [payProofFile, setPayProofFile] = useState<File | null>(null);
  const [paySaving, setPaySaving] = useState<boolean>(false);

  /* -------------------- Confirmation modal state -------------------- */
  const [showConfirm, setShowConfirm] = useState<boolean>(false);

  /* ------------------------------ Helpers ------------------------------ */
  const makeCustomerKey = (c: CustomerRow) =>
    (c.email || "").trim().toLowerCase() ||
    `${(c.name || "").trim().toLowerCase()}|${(c.phone || "").trim()}`;

  const resetPaymentForm = () => {
    setPayAmount("");
    setPayMethod("Cash");
    setPayChequeNumber("");
    setPayBankName("");
    setPayChequeDate("");
    setPayProofFile(null);
  };

  /* ------------------------------ Fetch customers ------------------------------ */
  async function fetchCustomers() {
    const { data, error } = await supabase
      .from("customers")
      .select("id, name, code, email, phone, address, payment_type")
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

  const codeByCustomerId = useMemo(() => {
  const map = new Map<string, string>();
  for (const c of customers) {
    const id = String(c.id);
    const code = String(c.code || "").trim();
    if (code) map.set(id, code);
  }
  return map;
}, [customers]);


  /* ------------------------------ Selected objects ------------------------------ */
  const selectedCustomer = useMemo(() => {
    if (!selectedCustomerId) return null;
    return (
      uniqueCustomers.find((c) => String(c.id) === String(selectedCustomerId)) ||
      null
    );
  }, [uniqueCustomers, selectedCustomerId]);

    const selectedOrder = useMemo(() => {
    if (!selectedOrderId) return null;
    return orders.find((o) => String(o.id) === String(selectedOrderId)) || null;
  }, [orders, selectedOrderId]);

const invoiceNo = useMemo(() => {
  if (!selectedOrder) return "";
  return String(codeByCustomerId.get(String(selectedOrder.customer_id)) || "").trim();
}, [selectedOrder, codeByCustomerId]);

const paymentSummary = useMemo(() => {
  const payTypeRaw = String(selectedCustomer?.payment_type || "").trim();
  const payType = payTypeRaw || "—";

  const days =
    typeof selectedOrder?.payment_terms === "number" && selectedOrder.payment_terms > 0
      ? selectedOrder.payment_terms
      : null;

  const termsText = days
    ? `${days} DAYS`
    : selectedOrder?.terms
    ? String(selectedOrder.terms)
    : "";

  if (payType.toLowerCase() === "credit") {
    return `Credit${termsText ? ` • ${termsText}` : ""}`;
  }
  if (payType.toLowerCase() === "cash") {
    return "Cash";
  }

  return `${payType}${termsText ? ` • ${termsText}` : ""}`;
}, [selectedCustomer?.payment_type, selectedOrder?.payment_terms, selectedOrder?.terms]);


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
        toast.error(e?.message || "Failed to load invoices.");
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
      typeof o.grand_total_with_interest === "number" &&
      Number.isFinite(o.grand_total_with_interest)
        ? Number(o.grand_total_with_interest)
        : Number(o.total_amount || 0);

    const shipping = Number(o.shipping_fee || 0);
    return round2(base + shipping);
  }, [selectedOrder]);

  /* ------------------------------ Validation for Add Payment ------------------------------ */
  const payAmountNum = useMemo(() => Number(payAmount), [payAmount]);

  const payFormValid = useMemo(() => {
    if (!selectedOrderId) return false;
    if (!selectedCustomer) return false;

    if (!Number.isFinite(payAmountNum) || payAmountNum <= 0) return false;
    if (!String(payMethod || "").trim()) return false;

    // REQUIRE all details:
    if (!payChequeNumber.trim()) return false;
    if (!payBankName.trim()) return false;
    if (!payChequeDate) return false; // date required
    if (!payProofFile) return false; // proof required

    return true;
  }, [
    selectedOrderId,
    selectedCustomer,
    payAmountNum,
    payMethod,
    payChequeNumber,
    payBankName,
    payChequeDate,
    payProofFile,
  ]);

  /* ------------------------------ Add payment (step 1: open confirm) ------------------------------ */
  function openConfirmPayment() {
    if (!payFormValid) {
      toast.error("Complete all fields (including proof image) before adding payment.");
      return;
    }
    setShowConfirm(true);
  }

  /* ------------------------------ Add payment (step 2: confirm + save) ------------------------------ */
  async function confirmAddPayment() {
    if (!payFormValid) {
      toast.error("Complete all fields first.");
      return;
    }
    if (!selectedOrderId || !selectedCustomer || !payProofFile) return;

    setPaySaving(true);
    try {
      const adminEmail = await getAdminEmail();

      // 1) Upload proof
      const imageUrl = await uploadPaymentProof(payProofFile, String(selectedOrderId));

      // 2) Insert payment row
      const { error } = await supabase.from("payments").insert([
        {
          customer_id: String(selectedCustomer.id),
          order_id: String(selectedOrderId),
          amount: round2(payAmountNum),
          method: payMethod || null,
          cheque_number: payChequeNumber.trim(),
          bank_name: payBankName.trim(),
          cheque_date: payChequeDate, // YYYY-MM-DD
          image_url: imageUrl,
          status: "received",
          received_at: nowISO(),
          received_by: adminEmail,
        },
      ]);

      if (error) throw error;

      toast.success("Payment added.");

      setShowConfirm(false);
      resetPaymentForm();

      // Refresh payments list
      await fetchPaymentsByOrder(String(selectedOrderId));
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to add payment.");
    } finally {
      setPaySaving(false);
    }
  }

  /* ------------------------------ Ledger rows ------------------------------ */
  const ledgerRows = useMemo<LedgerRow[]>(() => {
    if (!selectedOrder) return [];

    const createdAt = selectedOrder.date_created || nowISO();
    const rows: Omit<LedgerRow, "balance">[] = [];

    rows.push({
      sortDate: createdAt,
      dateLabel: formatPH(createdAt),
      description: `Invoice Charge (${invoiceNo || "No Invoice No."})`,
      debit: orderGrandTotal,
      credit: 0,
      remarks: `Order Status: ${(selectedOrder.status || "—").toUpperCase()}`,
    });

    const payRows: Omit<LedgerRow, "balance">[] = (payments || [])
      .filter((p) => String(p.order_id ?? "") === String(selectedOrder.id))
      .filter((p) => statusLower(p.status) === "received")
      .map((p) => {
        const method = String(p.method || "Payment");
        const isDeposit = method.toLowerCase() === "deposit";

        const lines: string[] = [];
        lines.push(isDeposit ? "Deposit Payment" : `${method} Payment`);
        if (p.cheque_number) lines.push(`Ref: ${p.cheque_number}`);
        if (p.bank_name) lines.push(`Bank: ${p.bank_name}`);
        if (p.cheque_date) lines.push(`Date: ${p.cheque_date}`);

        return {
          sortDate: p.created_at || nowISO(),
          dateLabel: formatPH(p.created_at),
          description: lines.join("\n"),
          debit: 0,
          credit: round2(Number(p.amount || 0)),
          remarks: "RECEIVED",
        };
      });

    rows.push(...payRows);
    rows.sort((a, b) => String(a.sortDate).localeCompare(String(b.sortDate)));

    let bal = 0;
    return rows.map((r) => {
      bal = round2(bal + (r.debit || 0) - (r.credit || 0));
      return { ...r, balance: bal };
    });
  }, [selectedOrder, payments, orderGrandTotal, invoiceNo]);

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
              Select a customer, then select an Invoice to view the ledger: Debit, Credit, and
              Balance.
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

                  // reset invoice selection + payment form
                  setSelectedOrderId("");
                  setPayments([]);
                  resetPaymentForm();
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

            {/* Invoice / Order */}
            <div>
              <label className="text-xs text-gray-600">Choose Invoice *</label>
              <select
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
                value={selectedOrderId}
                onChange={(e) => {
                  setSelectedOrderId(e.target.value);
                  resetPaymentForm();
                }}
                disabled={!selectedCustomerId}
              >
                <option value="">— Select Invoice —</option>
{orders.map((o) => {
  const code = codeByCustomerId.get(String(o.customer_id)) || "—";
  return (
    <option key={String(o.id)} value={String(o.id)}>
      Invoice No. {code}
    </option>
  );
})}

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
  Ledger for Invoice No.{" "}
  <span className="font-mono">{invoiceNo || "—"}</span>

  <span className="mt-1 block text-sm font-normal text-gray-600">
    • Payment: <span className="font-semibold">{paymentSummary}</span>
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

            {/* Add Payment (for selected invoice) */}
            <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">

              <div className="text-sm font-semibold text-gray-800 mb-2">
                Add Payment (for this Invoice)
              </div>

              <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-xs text-gray-600">Amount *</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    placeholder="0.00"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-600">Method *</label>
                  <select
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                  >
                    <option value="Cash">Cash</option>
                    <option value="Deposit">Deposit</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Transfer">Transfer</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-gray-600">Ref / Cheque No. *</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    value={payChequeNumber}
                    onChange={(e) => setPayChequeNumber(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-600">Bank *</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    value={payBankName}
                    onChange={(e) => setPayBankName(e.target.value)}
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs text-gray-600">Cheque/Deposit Date *</label>
                  <input
                    type="date"
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    value={payChequeDate}
                    onChange={(e) => setPayChequeDate(e.target.value)}
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs text-gray-600">
                    Proof of Payment (Image) *
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      setPayProofFile(f);
                    }}
                  />
                  {payProofFile ? (
                    <div className="mt-1 text-[11px] text-gray-600">
                      Selected: <span className="font-medium">{payProofFile.name}</span>
                    </div>
                  ) : null}
                </div>

                <div className="md:col-span-2 flex items-end justify-end">
                  <button
                    type="button"
                    onClick={openConfirmPayment}
                    disabled={!payFormValid || paySaving}
                    className="h-10 rounded-lg bg-amber-500 px-4 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
                    title={!payFormValid ? "Complete all required fields first." : ""}
                  >
                    {paySaving ? "Saving..." : "Add Payment"}
                  </button>
                </div>
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
                    <tr
                      key={idx}
                      className={idx % 2 === 0 ? "bg-white" : "bg-neutral-50"}
                    >
                      <td className="py-2.5 px-3">{r.dateLabel}</td>
                      <td className="py-2.5 px-3 font-medium whitespace-pre-line">
                        {r.description}
                      </td>

                      <td className="py-2.5 px-3 text-left font-mono">
                        {peso(r.debit || 0)}
                      </td>

                      <td className="py-2.5 px-3 text-left font-mono">
                        {peso(r.credit || 0)}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono font-bold">
                        {peso(r.balance || 0)}
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

            {/* Confirmation Modal */}
            {showConfirm ? (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
                <div className="w-full max-w-xl rounded-2xl bg-white shadow-xl">
                  <div className="p-4 border-b border-gray-200">
                    <div className="text-lg font-bold text-neutral-800">
                      Confirm Payment
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      Please review the details before saving.
                    </div>
                  </div>

                  <div className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                        <div className="text-xs text-gray-500">Invoice No.</div>
                        <div className="font-mono font-semibold">{invoiceNo || "—"}</div>
                      </div>

                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
  <div className="text-xs text-gray-500">Customer Payment</div>
  <div className="font-semibold">{paymentSummary}</div>
</div>


                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                        <div className="text-xs text-gray-500">Amount</div>
                        <div className="font-semibold">{peso(payAmountNum || 0)}</div>
                      </div>

                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                        <div className="text-xs text-gray-500">Method</div>
                        <div className="font-semibold">{payMethod}</div>
                      </div>

                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                        <div className="text-xs text-gray-500">Ref / Cheque No.</div>
                        <div className="font-semibold">{payChequeNumber}</div>
                      </div>

                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                        <div className="text-xs text-gray-500">Bank</div>
                        <div className="font-semibold">{payBankName}</div>
                      </div>

                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                        <div className="text-xs text-gray-500">Cheque/Deposit Date</div>
                        <div className="font-semibold">{payChequeDate}</div>
                      </div>

                      <div className="md:col-span-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                        <div className="text-xs text-gray-500">Proof Image</div>
                        <div className="font-semibold">
                          {payProofFile ? payProofFile.name : "—"}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowConfirm(false)}
                        disabled={paySaving}
                        className="h-10 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={confirmAddPayment}
                        disabled={paySaving}
                        className="h-10 rounded-lg bg-amber-500 px-4 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
                      >
                        {paySaving ? "Saving..." : "Confirm & Save"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {loading && <div className="mt-6 text-sm text-gray-600">Loading…</div>}
      </div>
    </div>
  );
}
