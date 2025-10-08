// src/app/customer/payments/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import supabase from "@/config/supabaseClient";
import { toast } from "sonner";
import { Upload, ReceiptText, FileImage, Wallet, Info } from "lucide-react";

/* ----------------------------- Config ----------------------------- */
const CHEQUE_BUCKET = "payments-cheques";

/* ----------------------------- Money ------------------------------ */
const formatCurrency = (n: number) =>
  (Number(n) || 0).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  });

/* ---------------------------------- Types --------------------------------- */
type ItemRow = {
  quantity: number;
  price: number;
  discount_percent?: number | null;
  inventory?: {
    product_name?: string | null;
    category?: string | null;
    subcategory?: string | null;
    status?: string | null;
    unit?: string | null;
    unit_price?: number | null;
    quantity?: number | null;
  } | null;
};

type OrderRow = {
  id: string | number; // bigint or uuid
  total_amount: number | null;
  status: string | null;
  truck_delivery_id?: number | null;
  grand_total_with_interest?: number | null;
  sales_tax?: number | null;
  per_term_amount?: number | null;
  order_items?: ItemRow[];
};

type CustomerTx = {
  id: string | number; // uuid or bigint
  name: string | null;
  code: string | null; // TXN
  contact_person?: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  date: string | null;
  orders?: OrderRow[];
};

type PaymentRow = {
  id: string;
  customer_id: string | number;
  order_id: string | number;
  amount: number;
  method: string | null;
  cheque_number: string | null;
  bank_name: string | null;
  cheque_date: string | null;
  image_url: string | null;
  created_at: string | null;
};

/* ------------------------------ Helpers ------------------------------ */
const inList = (vals: (string | number)[]) =>
  vals.map((v) => (typeof v === "string" ? `"${v}"` : String(v))).join(",");

/* ------------------------------ Component ------------------------------ */
export default function CustomerPaymentsPage() {
  const [loading, setLoading] = useState(true);
  const [authEmail, setAuthEmail] = useState<string | null>(null);

  const [txns, setTxns] = useState<CustomerTx[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const paymentsSubKey = useRef<string>("");

  const [selectedTxnCode, setSelectedTxnCode] = useState<string>("");

  // Upload form state
  const [amount, setAmount] = useState<string>("");
  const [chequeNumber, setChequeNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [chequeDate, setChequeDate] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /* ------------------------------- Fetch (same as Orders) ------------------------------- */
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const email = user?.email ?? null;
        setAuthEmail(email);
        if (!email) {
          setTxns([]);
          setPayments([]);
          return;
        }

        const { data: customers, error } = await supabase
          .from("customers")
          .select(
            `
            id, name, code, contact_person, email, phone, address, date,
            orders (
              id,
              total_amount,
              status,
              truck_delivery_id,
              grand_total_with_interest,
              sales_tax,
              per_term_amount,
              order_items (
                quantity,
                price,
                discount_percent,
                inventory:inventory_id (
                  product_name,
                  category,
                  subcategory,
                  status,
                  unit,
                  unit_price,
                  quantity
                )
              )
            )
          `
          )
          .eq("email", email)
          .order("date", { ascending: false });

        if (error) throw error;

        const txList = (customers as CustomerTx[]) || [];
        setTxns(txList);

        const customerIds = txList.map((c) => String(c.id));
        if (customerIds.length) {
          const { data: pays, error: payErr } = await supabase
            .from("payments")
            .select(
              "id, customer_id, order_id, amount, method, cheque_number, bank_name, cheque_date, image_url, created_at"
            )
            .in("customer_id", customerIds)
            .order("created_at", { ascending: false });
          if (!payErr) setPayments((pays as PaymentRow[]) || []);
        } else {
          setPayments([]);
        }
      } catch (e) {
        console.error(e);
        toast.error("Failed to load data.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* ----------------------------- Realtime payments ----------------------------- */
  useEffect(() => {
    const ids = (txns || []).map((c) => String(c.id));
    const key = `payments:${ids.join(",")}`;
    if (!ids.length || paymentsSubKey.current === key) return;
    paymentsSubKey.current = key;

    const filter = `customer_id=in.(${inList(ids)})`;
    const channel = supabase.channel("realtime-payments");
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "payments", filter },
      (payload) => {
        if (payload.eventType === "INSERT") {
          setPayments((prev) => [payload.new as PaymentRow, ...prev]);
        } else if (payload.eventType === "UPDATE") {
          setPayments((prev) =>
            prev.map((p) =>
              p.id === (payload.new as any)?.id ? (payload.new as PaymentRow) : p
            )
          );
        } else if (payload.eventType === "DELETE") {
          setPayments((prev) => prev.filter((p) => p.id !== (payload.old as any)?.id));
        }
      }
    );
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [txns]);

  /* --------------------------- Totals (same as Orders page) --------------------------- */
  function computeFromOrder(o?: OrderRow | null) {
    const items = o?.order_items ?? [];
    const subtotal = items.reduce((s, it) => {
      const unitPrice = Number(it.price ?? it.inventory?.unit_price ?? 0) || 0;
      const qty = Number(it.quantity || 0);
      return s + unitPrice * qty;
    }, 0);

    const totalDiscount = items.reduce((s, it) => {
      const unitPrice = Number(it.price ?? it.inventory?.unit_price ?? 0) || 0;
      const qty = Number(it.quantity || 0);
      const pct = Number(it.discount_percent ?? 0);
      return s + (unitPrice * qty * pct) / 100;
    }, 0);

    const salesTax = Number(o?.sales_tax ?? 0);
    const grandTotal =
      typeof o?.grand_total_with_interest === "number"
        ? Number(o!.grand_total_with_interest)
        : Math.max(subtotal - totalDiscount, 0) + salesTax;

    const perTerm = Number(o?.per_term_amount ?? 0);
    return { subtotal, totalDiscount, salesTax, grandTotal, perTerm };
  }

  const txnOptions = useMemo(() => {
    const out: { code: string; order: OrderRow }[] = [];
    for (const c of txns) {
      const code = c.code ?? "";
      const completed = (c.orders ?? []).find(
        (o) => (o.status || "").toLowerCase() === "completed"
      );
      if (code && completed) out.push({ code, order: completed });
    }
    return out;
  }, [txns]);

  const selectedPack = useMemo(() => {
    if (!selectedTxnCode) return null;
    const hit = txnOptions.find((t) => t.code === selectedTxnCode);
    if (!hit) return null;

    const totals = computeFromOrder(hit.order);
    const paid = payments
      .filter((p) => String(p.order_id) === String(hit.order.id))
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const balance = Math.max(totals.grandTotal - paid, 0);
    return { code: selectedTxnCode, order: hit.order, totals, paid, balance };
  }, [selectedTxnCode, txnOptions, payments]);

  const isCredit = useMemo(() => {
    const m = txns[0];
    return ((m as any)?.payment_type || "").toLowerCase() === "credit";
  }, [txns]);

  const totalBalance = useMemo(() => {
    if (!isCredit) return 0;
    return txnOptions.reduce((sum, t) => {
      const { grandTotal } = computeFromOrder(t.order);
      const paid = payments
        .filter((p) => String(p.order_id) === String(t.order.id))
        .reduce((s, p) => s + (Number(p.amount) || 0), 0);
      return sum + Math.max(grandTotal - paid, 0);
    }, 0);
  }, [txnOptions, payments, isCredit]);

  /* ------------------------------ Upload logic ----------------------------- */
  async function uploadChequeImage(
    file: File,
    customerId: string | number,
    orderId: string | number
  ) {
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const safeCust = String(customerId);
    const safeOrder = String(orderId);
    const path = `${safeCust}/${safeOrder}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${ext}`;

    const { error } = await supabase.storage
      .from(CHEQUE_BUCKET)
      .upload(path, file, { cacheControl: "3600", upsert: false });

    if (error) {
      const msg = (error as any)?.message || "Upload failed";
      throw new Error(`Storage upload error: ${msg}`);
    }

    const pub = supabase.storage.from(CHEQUE_BUCKET).getPublicUrl(path);
    const publicUrl = pub?.data?.publicUrl ?? null;
    if (!publicUrl) throw new Error("Could not get public URL for uploaded file.");
    return publicUrl;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const me = txns[0];
    if (!me?.id) {
      toast.error("Please sign in to continue.");
      return;
    }
    if (!selectedPack?.order?.id) {
      toast.error("Please select a transaction (TXN).");
      return;
    }

    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Enter a valid amount.");
      return;
    }
    if (selectedPack.balance > 0 && amt > selectedPack.balance) {
      toast.error("Amount exceeds remaining balance.");
      return;
    }

    setSubmitting(true);
    try {
      const meId = String(me.id);
      const orderId = String(selectedPack.order.id);

      let image_url: string | null = null;
      if (file) image_url = await uploadChequeImage(file, meId, orderId);

      const { error: insertErr } = await supabase.from("payments").insert({
        customer_id: meId,
        order_id: orderId,
        amount: amt,
        method: "Cheque",
        cheque_number: chequeNumber || null,
        bank_name: bankName || null,
        cheque_date: chequeDate || null,
        image_url,
      });

      if (insertErr) throw new Error(`DB insert error: ${insertErr.message}`);

      toast.success("✅ Cheque submitted. We’ll verify it shortly.");
      setAmount("");
      setChequeNumber("");
      setBankName("");
      setChequeDate("");
      setFile(null);
    } catch (err: any) {
      console.error("Submit failed:", err?.message || err);
      toast.error(err?.message || "Failed to submit cheque.");
    } finally {
      setSubmitting(false);
    }
  }

  /* ---------------------------------- UI ---------------------------------- */
  return (
    <div className="min-h-[calc(100vh-80px)]">
      <div className="mx-auto w-full max-w-6xl px-6 py-6">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-neutral-800">Payments</h1>
        </div>
        <p className="text-sm text-gray-600 mt-1">
          Upload a cheque for your <b>Transaction Code (TXN)</b>. For <b>Credit</b> customers, balances update automatically.
        </p>

        {/* Balances (Credit only) */}
        {isCredit && (
          <div className="mt-6 rounded-xl bg-white border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-green-700" />
                <h2 className="text-lg font-semibold">Your Balances</h2>
              </div>
              <div className="text-sm">
                <span className="text-gray-600 mr-2">Total Balance:</span>
                <span className="font-bold text-green-700">
                  {formatCurrency(totalBalance)}
                </span>
              </div>
            </div>

            <div className="mt-3 rounded-xl overflow-hidden ring-1 ring-gray-200 bg-white">
              <table className="w-full text-sm align-middle">
                <thead>
                  <tr
                    className="text-black uppercase tracking-wider text-[11px]"
                    style={{ background: "#ffba20" }}
                  >
                    <th className="py-2.5 px-3 text-left font-bold">TXN Code</th>
                    <th className="py-2.5 px-3 text-left font-bold">Status</th>
                    <th className="py-2.5 px-3 text-right font-bold">Grand Total</th>
                    <th className="py-2.5 px-3 text-right font-bold">Paid</th>
                    <th className="py-2.5 px-3 text-right font-bold">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {txnOptions.map(({ code, order }, idx) => {
                    const { grandTotal } = computeFromOrder(order);
                    const paid = payments
                      .filter((p) => String(p.order_id) === String(order.id))
                      .reduce((s, p) => s + (Number(p.amount) || 0), 0);
                    const bal = Math.max(grandTotal - paid, 0);

                    return (
                      <tr key={`${code}-${idx}`} className={idx % 2 ? "bg-neutral-50" : "bg-white"}>
                        <td className="py-2.5 px-3 font-mono">{code}</td>
                        <td className="py-2.5 px-3">{order.status ?? "—"}</td>
                        <td className="py-2.5 px-3 text-right font-mono">{formatCurrency(grandTotal)}</td>
                        <td className="py-2.5 px-3 text-right font-mono">{formatCurrency(paid)}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold">{formatCurrency(bal)}</td>
                      </tr>
                    );
                  })}
                  {txnOptions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-neutral-400">
                        No completed credit transactions yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {!isCredit && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 text-blue-900 px-4 py-3 text-sm">
                <Info className="h-4 w-4 mt-0.5" />
                <div>
                  Your payment type is <b>Cash</b>. Balances are shown only for <b>Credit</b> customers. You can still upload cheque proof here if needed.
                </div>
              </div>
            )}
          </div>
        )}

        {/* Upload Cheque — select by TXN code */}
        <div className="mt-6 rounded-xl bg-white border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Upload className="h-5 w-5 text-amber-600" />
            <h2 className="text-lg font-semibold">Upload Cheque Payment</h2>
          </div>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="col-span-1">
              <label className="text-xs text-gray-600">Select Transaction (TXN)</label>
              <select
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
                value={selectedTxnCode}
                onChange={(e) => setSelectedTxnCode(e.target.value)}
                required
              >
                <option value="">— Choose a TXN —</option>
                {txnOptions.map(({ code }, i) => (
                  <option key={`${code}-${i}`} value={code}>
                    {code}
                  </option>
                ))}
              </select>
              {!!selectedPack && (
                <div className="mt-1 text-xs text-gray-600">
                  Remaining balance:{" "}
                  <b className="text-green-700">{formatCurrency(selectedPack.balance)}</b>
                </div>
              )}
            </div>

            <div className="col-span-1">
              <label className="text-xs text-gray-600">Amount</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
                required
              />
            </div>

            <div className="col-span-1">
              <label className="text-xs text-gray-600">Cheque Number (optional)</label>
              <input
                type="text"
                value={chequeNumber}
                onChange={(e) => setChequeNumber(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
                placeholder="e.g., 00012345"
              />
            </div>

            <div className="col-span-1">
              <label className="text-xs text-gray-600">Bank Name (optional)</label>
              <input
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
                placeholder="e.g., BPI / BDO / Metrobank"
              />
            </div>

            <div className="col-span-1">
              <label className="text-xs text-gray-600">Cheque Date (optional)</label>
              <input
                type="date"
                value={chequeDate}
                onChange={(e) => setChequeDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>

            <div className="col-span-1">
              <label className="text-xs text-gray-600">Cheque Image (optional)</label>
              <div className="mt-1 flex items-center gap-3">
                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 cursor-pointer hover:bg-gray-50">
                  <FileImage className="h-4 w-4" />
                  <span className="text-sm">Choose file</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                <span className="text-xs text-gray-600">
                  {file ? file.name : "No file selected"}
                </span>
              </div>
            </div>

            <div className="col-span-1 md:col-span-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedTxnCode("");
                  setAmount("");
                  setChequeNumber("");
                  setBankName("");
                  setChequeDate("");
                  setFile(null);
                }}
                className="px-4 py-2 border rounded hover:bg-gray-100"
              >
                Clear
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 px-4 py-2 rounded bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-60"
              >
                {submitting ? "Submitting…" : "Submit Cheque"}
              </button>
            </div>
          </form>
        </div>

        {/* Items & Totals for selected TXN */}
        {selectedPack && (
          <div className="mt-6 rounded-xl bg-white border border-gray-200 p-4">
            <h2 className="text-lg font-semibold mb-3">
              Items for TXN <span className="font-mono">{selectedPack.code}</span>
            </h2>

            <div className="rounded-xl overflow-hidden ring-1 ring-gray-200 bg-white">
              <table className="w-full text-sm align-middle">
                <thead>
                  <tr
                    className="text-black uppercase tracking-wider text-[11px]"
                    style={{ background: "#ffba20" }}
                  >
                    <th className="py-2.5 px-3 text-center font-bold">QTY</th>
                    <th className="py-2.5 px-3 text-center font-bold">UNIT</th>
                    <th className="py-2.5 px-3 text-left font-bold">ITEM DESCRIPTION</th>
                    <th className="py-2.5 px-3 text-center font-bold">REMARKS</th>
                    <th className="py-2.5 px-3 text-center font-bold">UNIT PRICE</th>
                    <th className="py-2.5 px-3 text-center font-bold">DISCOUNT/ADD (%)</th>
                    <th className="py-2.5 px-3 text-center font-bold">AMOUNT</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedPack.order.order_items ?? []).map((it, idx) => {
                    const unit = it.inventory?.unit?.trim() || "pcs";
                    const desc = it.inventory?.product_name ?? "—";
                    const unitPrice =
                      Number(it.price ?? it.inventory?.unit_price ?? 0) || 0;
                    const qty = Number(it.quantity || 0);
                    const amount = qty * unitPrice;

                    const inStockFlag =
                      typeof it.inventory?.quantity === "number"
                        ? (it.inventory?.quantity ?? 0) > 0
                        : (it.inventory?.status || "")
                            .toLowerCase()
                            .includes("in stock");

                    return (
                      <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-neutral-50"}>
                        <td className="py-2.5 px-3 text-center font-mono">{qty}</td>
                        <td className="py-2.5 px-3 text-center font-mono">{unit}</td>
                        <td className="py-2.5 px-3">
                          <span className="font-semibold">{desc}</span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {inStockFlag ? "✓" : it.inventory?.status ? it.inventory.status : "✗"}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono whitespace-nowrap">
                          {formatCurrency(unitPrice)}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono whitespace-nowrap">
                          {typeof it.discount_percent === "number" ? `${it.discount_percent}%` : ""}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold whitespace-nowrap">
                          {formatCurrency(amount)}
                        </td>
                      </tr>
                    );
                  })}
                  {(selectedPack.order.order_items ?? []).length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-neutral-400">
                        No items found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-row gap-4 mt-5">
              <div className="w-2/3 text-xs pr-4" />
              <div className="flex flex-col items-end text-xs mt-1 w-1/3">
                <table className="text-right w-full">
                  <tbody>
                    <tr>
                      <td className="font-semibold py-0.5">Subtotal (Before Discount):</td>
                      <td className="pl-2 font-mono">
                        {formatCurrency(selectedPack.totals.subtotal)}
                      </td>
                    </tr>
                    <tr>
                      <td className="font-semibold py-0.5">Discount</td>
                      <td className="pl-2 font-mono">
                        {formatCurrency(selectedPack.totals.totalDiscount)}
                      </td>
                    </tr>
                    <tr>
                      <td className="font-semibold py-0.5">Sales Tax (12%):</td>
                      <td className="pl-2 font-mono">
                        {formatCurrency(selectedPack.totals.salesTax)}
                      </td>
                    </tr>
                    <tr>
                      <td className="font-bold py-1.5">Grand Total:</td>
                      <td className="pl-2 font-bold text-green-700 font-mono">
                        {formatCurrency(selectedPack.totals.grandTotal)}
                      </td>
                    </tr>
                    {selectedPack.totals.perTerm > 0 && (
                      <tr>
                        <td className="font-semibold py-0.5">Per Term:</td>
                        <td className="pl-2 font-bold text-blue-700 font-mono">
                          {formatCurrency(selectedPack.totals.perTerm)}
                        </td>
                      </tr>
                    )}
                    <tr>
                      <td className="font-semibold py-0.5">Paid:</td>
                      <td className="pl-2 font-mono">{formatCurrency(selectedPack.paid)}</td>
                    </tr>
                    <tr>
                      <td className="font-semibold py-0.5">Remaining Balance:</td>
                      <td className="pl-2 font-bold text-amber-700 font-mono">
                        {formatCurrency(selectedPack.balance)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {!isCredit && (
          <div className="mt-6 rounded-xl bg-white border border-gray-200 p-4">
            <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 text-blue-900 px-4 py-3 text-sm">
              <Info className="h-4 w-4 mt-0.5" />
              <div>
                Your payment type is <b>Cash</b>. Balances are shown only for <b>Credit</b> customers. You can still upload cheque proof here if needed.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
