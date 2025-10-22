// src/app/customer/payments/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import supabase from "@/config/supabaseClient";
import { toast } from "sonner";
import { Upload, FileImage, X, Calendar, Minus, Plus } from "lucide-react";

/* ----------------------------- Config ----------------------------- */
const CHEQUE_BUCKET = "payments-cheques";

/* ----------------------------- Money ------------------------------ */
const formatCurrency = (n: number) =>
  (Number(n) || 0).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  });

/* ----------------------------- Utils ------------------------------ */
const EPS = 0.000001;
const toNumber = (v: string | number): number =>
  typeof v === "number" ? v : Number(String(v).replace(/[^\d.]/g, "")) || 0;

// 2-decimal rounding helper for money
const round2 = (n: number) =>
  Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Local YYYY-MM-DD for <input type="date"> (avoids UTC off-by-one)
const todayLocalISO = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
};

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
  id: string | number;
  total_amount: number | null;
  status: string | null;
  truck_delivery_id?: number | null;
  grand_total_with_interest?: number | null;
  sales_tax?: number | null;
  interest_percent?: number | null;
  per_term_amount?: number | null;
  shipping_fee?: number | null;
  paid_amount?: number | null;
  balance?: number | null;
  terms?: string | null;
  order_items?: ItemRow[];
};

type CustomerTx = {
  id: string | number;
  name: string | null;
  code: string | null;
  contact_person?: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  date: string | null;
  payment_type?: string | null;
  orders?: OrderRow[];
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

type InstallmentRow = {
  id?: string;
  order_id: string;
  term_no: number;
  due_date: string;
  amount_due: number;
  amount_paid?: number | null;
  status?: string | null;
};

/* ------------------------------ Helpers ------------------------------ */
const inList = (vals: (string | number)[]) =>
  vals.map((v) => (typeof v === "string" ? `"${v}"` : String(v))).join(",");

const isReceived = (p: PaymentRow) =>
  (p?.status || "").toLowerCase() === "received";
const isPending = (p: PaymentRow) =>
  (p?.status || "").toLowerCase() === "pending";

/* -------- Shipping fee: orders.truck_delivery_id -> truck_deliveries.shipping_fee -------- */
async function fetchShippingFeeForOrder(
  orderId: string | number
): Promise<number> {
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
export default function CustomerPaymentsPage() {
  const [loading, setLoading] = useState(true);

  const [txns, setTxns] = useState<CustomerTx[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const paymentsSubKey = useRef<string>("");

  const [selectedTxnCode, setSelectedTxnCode] = useState<string>("");

  // Upload form state
  const [amount, setAmount] = useState<string>(""); // LOCKED display
  const [chequeNumber, setChequeNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [chequeDate, setChequeDate] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Shipping fee per order cache
  const [shippingFees, setShippingFees] = useState<Record<string, number>>({});

  // Installments
  const [installments, setInstallments] = useState<InstallmentRow[]>([]);
  const [loadingInstallments, setLoadingInstallments] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);

  // Multiplier for Credit (installments)
  const [termMultiplier, setTermMultiplier] = useState<number>(1);

  // Cash stepper
  const CASH_STEP = 1000;
  const MIN_CASH = 0.01;

  /* ------------------------------- Fetch ------------------------------- */
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const email = user?.email ?? null;
        if (!email) {
          setTxns([]);
          setPayments([]);
          return;
        }

        const { data: customers } = await supabase
          .from("customers")
          .select(
            `
            id, name, code, contact_person, email, phone, address, date, payment_type,
            orders (
              id,
              total_amount,
              status,
              truck_delivery_id,
              grand_total_with_interest,
              sales_tax,
              interest_percent,
              per_term_amount,
              shipping_fee,
              paid_amount,
              balance,
              terms,
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

        const txList = (customers as CustomerTx[]) || [];
        setTxns(txList);

        // Load payments for these customers
        const customerIds = txList.map((c) => String(c.id));
        if (customerIds.length) {
          const { data: pays } = await supabase
            .from("payments")
            .select(
              "id, customer_id, order_id, amount, method, cheque_number, bank_name, cheque_date, image_url, status, created_at"
            )
            .in("customer_id", customerIds)
            .order("created_at", { ascending: false });
          setPayments((pays as PaymentRow[]) || []);
        } else {
          setPayments([]);
        }

        // Prefetch shipping fees
        const allOrders = txList.flatMap((c) => c.orders ?? []);
        const allIds = Array.from(
          new Set(allOrders.filter((o) => !!o?.id).map((o) => String(o.id)))
        );

        const feeEntries = await Promise.all(
          allIds.map(async (oid) => {
            const fee = await fetchShippingFeeForOrder(oid);
            return [oid, fee] as [string, number];
          })
        );

        const feeMap: Record<string, number> = {};
        for (const [oid, fee] of feeEntries) feeMap[oid] = fee;
        setShippingFees(feeMap);
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
              p.id === (payload.new as any)?.id
                ? (payload.new as PaymentRow)
                : p
            )
          );
        } else if (payload.eventType === "DELETE") {
          setPayments((prev) =>
            prev.filter((p) => p.id !== (payload.old as any)?.id)
          );
        }
      }
    );
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [txns]);

  /* --------------------------- Totals --------------------------- */
  function computeFromOrder(o?: OrderRow | null, extraShippingFee = 0) {
    const items = o?.order_items ?? [];

    const subtotal = round2(
      items.reduce((s, it) => {
        const unitPrice =
          Number(it.price ?? it.inventory?.unit_price ?? 0) || 0;
        const qty = Number(it.quantity || 0);
        return s + unitPrice * qty;
      }, 0)
    );

    const totalDiscount = round2(
      items.reduce((s, it) => {
        const unitPrice =
          Number(it.price ?? it.inventory?.unit_price ?? 0) || 0;
        const qty = Number(it.quantity || 0);
        const pct = Number(it.discount_percent ?? 0);
        return s + (unitPrice * qty * pct) / 100;
      }, 0)
    );

    const salesTax = round2(Number(o?.sales_tax ?? 0));

    const computedExclFee = round2(
      Math.max(subtotal - totalDiscount, 0) + salesTax
    );

    const grandTotalExclFee =
      typeof o?.grand_total_with_interest === "number"
        ? round2(Number(o!.grand_total_with_interest))
        : computedExclFee;

    const shippingFee = round2(Number(extraShippingFee || 0));
    const finalGrandTotal = round2(grandTotalExclFee + shippingFee);

    const perTerm = round2(Number(o?.per_term_amount ?? 0));

    return {
      subtotal,
      totalDiscount,
      salesTax,
      grandTotalExclFee,
      shippingFee,
      finalGrandTotal, // rounded
      perTerm, // rounded
    };
  }

  /* Txn options */
  const txnOptions = useMemo(() => {
    const out: { code: string; order: OrderRow; customerId: string }[] = [];
    for (const c of txns) {
      const code = c.code ?? "";
      const completed = (c.orders ?? []).find(
        (o) => (o.status || "").toLowerCase() === "completed"
      );
      if (code && completed)
        out.push({ code, order: completed, customerId: String(c.id) });
    }
    return out;
  }, [txns]);

  /* ---------- Build lookups ---------- */
  const paymentsByOrder = useMemo(() => {
    const m = new Map<string, PaymentRow[]>();
    for (const p of payments) {
      const k = String(p.order_id ?? "");
      const arr = m.get(k) || [];
      arr.push(p);
      m.set(k, arr);
    }
    return m;
  }, [payments]);

  // Total received + pending cash (so balance drops right after submit cash)
  const effectivePaidTotalByOrder = useMemo(() => {
    const m = new Map<string, number>();
    for (const [orderId, arr] of paymentsByOrder.entries()) {
      const total = arr.reduce((s, p) => {
        const amt = Number(p.amount) || 0;
        const received = isReceived(p);
        const pendingCash =
          (p.method || "").toLowerCase() === "cash" && isPending(p);
        return s + (received || pendingCash ? amt : 0);
      }, 0);
      m.set(orderId, total);
    }
    return m;
  }, [paymentsByOrder]);

  // Show any TXN with a remaining balance
  const unpaidTxnOptions = useMemo(() => {
    const rows = txnOptions.map(({ order, customerId, code }) => {
      const orderId = String(order.id);
      const fee = shippingFees[orderId] ?? 0;
      const totals = computeFromOrder(order, fee);
      const paid = round2(effectivePaidTotalByOrder.get(orderId) || 0);
      const balance = Math.max(round2(totals.finalGrandTotal - paid), 0);
      return { code, order, customerId, balance };
    });
    return rows
      .filter((r) => r.balance > 0.01)
      .sort((a, b) => b.balance - a.balance);
  }, [txnOptions, effectivePaidTotalByOrder, shippingFees]);

  /* ----------------------------- Realtime installments ----------------------------- */
  useEffect(() => {
    // Subscribe for all visible order IDs
    const orderIds = txnOptions.map(({ order }) => String(order.id));
    if (!orderIds.length) return;

    const filter = `order_id=in.(${inList(orderIds)})`;
    const channel = supabase.channel("realtime-installments");

    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "order_installments", filter },
      async (payload) => {
        const changedOrderId = String(
          ((payload.new as any)?.order_id ??
            (payload.old as any)?.order_id ??
            "") ||
            ""
        );

        const currentOrderId = txnOptions.find(
          (t) => t.code === selectedTxnCode
        )?.order?.id;

        if (currentOrderId && String(currentOrderId) === changedOrderId) {
          try {
            setLoadingInstallments(true);
            const { data } = await supabase
              .from("order_installments")
              .select(
                "id, order_id, term_no, due_date, amount_due, amount_paid, status"
              )
              .eq("order_id", changedOrderId)
              .order("term_no", { ascending: true });

            setInstallments((data as InstallmentRow[]) || []);
          } finally {
            setLoadingInstallments(false);
          }
        }
      }
    );

    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [txnOptions, selectedTxnCode]);

  /* ---------- Keep selection valid ---------- */
  useEffect(() => {
    if (
      selectedTxnCode &&
      !unpaidTxnOptions.some((t) => t.code === selectedTxnCode)
    ) {
      setSelectedTxnCode("");
    }
  }, [selectedTxnCode, unpaidTxnOptions]);

  const selectedPack = useMemo(() => {
    if (!selectedTxnCode) return null;
    const hit = txnOptions.find((t) => t.code === selectedTxnCode);
    if (!hit) return null;

    const orderId = String(hit.order.id);
    const fee = shippingFees[orderId] ?? 0;
    const totals = computeFromOrder(hit.order, fee);
    const paid = round2(effectivePaidTotalByOrder.get(orderId) || 0);
    const balance = Math.max(round2(totals.finalGrandTotal - paid), 0);
    return {
      code: selectedTxnCode,
      order: hit.order,
      totals,
      paid,
      balance,
    };
  }, [selectedTxnCode, txnOptions, effectivePaidTotalByOrder, shippingFees]);

  /* -------- Determine method from order.terms (fallback to customer) -------- */
  const termsStr = String(
    (selectedPack?.order as any)?.terms ?? ""
  ).toLowerCase();
  const perTermAmt = Number(selectedPack?.order?.per_term_amount ?? 0);

  const customerMethodLower = String(
    txns.find((t) => t.code === selectedTxnCode)?.payment_type ??
      txns[0]?.payment_type ??
      ""
  ).toLowerCase();

  const looksInstallment =
    perTermAmt > 0 || /credit|net|month|term|install/.test(termsStr);

  const isCredit = customerMethodLower === "credit" || looksInstallment;
  const isCash = customerMethodLower === "cash" && !isCredit;

  /* ==================== INSTALLMENTS ==================== */
  useEffect(() => {
    async function fetchInstallmentsForSelected() {
      if (!selectedPack?.order?.id) {
        setInstallments([]);
        return;
      }
      try {
        setLoadingInstallments(true);
        const { data } = await supabase
          .from("order_installments")
          .select(
            "id, order_id, term_no, due_date, amount_due, amount_paid, status"
          )
          .eq("order_id", String(selectedPack.order.id))
          .order("term_no", { ascending: true });

        setInstallments((data as InstallmentRow[]) || []);
      } finally {
        setLoadingInstallments(false);
      }
    }
    fetchInstallmentsForSelected();
    // eslint-disable-next-line
  }, [selectedPack?.order?.id]);

  const unpaidInstallments = useMemo(
    () =>
      installments.filter((row) => (row.status || "").toLowerCase() !== "paid"),
    [installments]
  );
  const termAmount =
    unpaidInstallments.length > 0 ? unpaidInstallments[0].amount_due : 0;

  // -------------------------- CREDIT LIMITS & INIT --------------------------
  const getCreditMaxMultiplier = () => {
    if (!selectedPack) return 1;

    const remainingTerms = unpaidInstallments.length || 0;
    const perTerm = round2(Number(termAmount || 0));
    if (remainingTerms <= 0 || perTerm <= 0) return 1;

    const balance = round2(Number(selectedPack.balance || 0));
    const approxTerms = Math.round(balance / perTerm + 1e-6);
    return Math.max(1, Math.min(remainingTerms, approxTerms));
  };

  // Initialize amount whenever txn/mode/schedule changes
  useEffect(() => {
    if (!selectedPack) {
      setAmount("");
      return;
    }
    if (isCredit) {
      const max = getCreditMaxMultiplier();
      const start = Math.min(1, max) || 1;
      setTermMultiplier(start);
      if (termAmount > 0) setAmount((termAmount * start).toFixed(2));
      else setAmount("");
    } else {
      const bal = Number(selectedPack.balance || 0);
      setAmount(bal > 0 ? bal.toFixed(2) : "");
      setTermMultiplier(1);
    }
    // eslint-disable-next-line
  }, [selectedPack?.balance, isCredit, termAmount]);

  /* ===== Buttons-only update helpers ===== */
  const applyCreditMultiplier = (mult: number) => {
    if (!selectedPack || !isCredit || !termAmount) return;
    const clamped = Math.max(1, Math.min(mult, getCreditMaxMultiplier()));
    setTermMultiplier(clamped);
    setAmount((termAmount * clamped).toFixed(2));
  };
  const stepMultiplier = (delta: number) =>
    applyCreditMultiplier(termMultiplier + delta);

  const bumpCash = (dir: "inc" | "dec") => {
    if (!selectedPack || !isCash) return;
    const bal = Number(selectedPack.balance || 0);
    const cur = toNumber(amount) || 0;
    const next =
      dir === "inc"
        ? Math.min(cur + CASH_STEP, bal)
        : Math.max(cur - CASH_STEP, MIN_CASH);
    setAmount(bal > 0 ? next.toFixed(2) : "");
  };

  const payInFull = () => {
    if (!selectedPack) return;
    const bal = round2(Number(selectedPack.balance || 0));
    const val = bal > 0 ? bal.toFixed(2) : "";
    setAmount(val);
    if (!isCash) setTermMultiplier(getCreditMaxMultiplier());
  };

  const payInHalf = () => {
    if (!selectedPack) return;
    if (isCash) {
      const bal = Number(selectedPack.balance || 0);
      setAmount(Math.max(bal / 2, MIN_CASH).toFixed(2));
    } else {
      const max = getCreditMaxMultiplier();
      applyCreditMultiplier(Math.max(1, Math.floor(max / 2)));
    }
  };

  /* --------------------------- Validation flags --------------------------- */
  const enteredAmount = Number(amount) || 0;
  const numTermsCovered =
    isCredit && termAmount > 0 ? Math.floor(enteredAmount / termAmount) : 0;
  const remainingAfterTerms =
    isCredit && termAmount > 0
      ? enteredAmount - numTermsCovered * termAmount
      : 0;

  const exactBalance = selectedPack
    ? round2(Number(selectedPack.balance || 0))
    : 0;
  const isExactByBalance =
    !isCash && Math.abs(enteredAmount - exactBalance) < EPS;

  const isExactByTerms =
    enteredAmount > 0 &&
    Math.abs(remainingAfterTerms) < EPS &&
    numTermsCovered <= unpaidInstallments.length &&
    numTermsCovered > 0;

  const isPaymentExact = isCash
    ? enteredAmount > 0
    : isExactByTerms || isExactByBalance;

  const showPartialWarning =
    !isCash &&
    enteredAmount > 0 &&
    remainingAfterTerms !== 0 &&
    termAmount > 0 &&
    !isExactByBalance;

  const exceedsInstallments =
    !isCash &&
    numTermsCovered > unpaidInstallments.length &&
    unpaidInstallments.length > 0;

  const exceedsBalance =
    !!selectedPack && enteredAmount > (selectedPack.balance || 0) + EPS;

  const isFormValid =
    !!selectedTxnCode &&
    isPaymentExact &&
    (isCash ||
      (chequeNumber.trim().length > 0 &&
        bankName.trim().length > 0 &&
        chequeDate.trim().length > 0 &&
        !!file &&
        !showPartialWarning &&
        !exceedsInstallments));

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
    if (!publicUrl)
      throw new Error("Could not get public URL for uploaded file.");
    return publicUrl;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!selectedPack?.order?.id) {
      toast.error("Please complete all fields.");
      return;
    }

    const finalAmount = toNumber(amount);
    if (finalAmount <= 0) {
      toast.error("Please enter a valid amount greater than 0.");
      return;
    }

    // Disallow past cheque dates
    if (!isCash && chequeDate) {
      const min = new Date(todayLocalISO());
      const chosen = new Date(chequeDate + "T00:00:00");
      if (chosen < min) {
        toast.error("Cheque date cannot be in the past.");
        return;
      }
    }

    setSubmitting(true);
    try {
      const me = txns.find((t) => t.code === selectedTxnCode) ?? txns[0];
      if (!me?.id) throw new Error("Please sign in to continue.");

      const meId = String(me.id);
      const orderId = String(selectedPack.order.id);

      let image_url: string | null = null;
      let insertData: any = {
        customer_id: meId,
        order_id: orderId,
        amount: Number(finalAmount.toFixed(2)),
        method: isCash ? "Cash" : "Cheque",
        cheque_number: null,
        bank_name: null,
        cheque_date: null,
        image_url: null,
        status: "pending",
      };

      if (!isCash) {
        if (file) image_url = await uploadChequeImage(file, meId, orderId);
        insertData = {
          ...insertData,
          cheque_number: chequeNumber || null,
          bank_name: bankName || null,
          cheque_date: chequeDate || null,
          image_url,
        };
      } else {
        insertData = {
          ...insertData,
          cheque_number: chequeNumber || null,
          bank_name: bankName || null,
          cheque_date: chequeDate || null,
        };
      }

      // Insert payment and RETURN the new id for dedupe
      const { data: paymentRow, error: insertErr } = await supabase
        .from("payments")
        .insert(insertData)
        .select("id, created_at")
        .single();

      if (insertErr) throw new Error(`DB insert error: ${insertErr.message}`);
      const newPaymentId = String(paymentRow?.id);

      // 🔔 Notify Admin Bell via system_notifications (type: 'payment', title: 'Payment Request')
      try {
        const title = "💳 Payment Request";
        const message = `${me.name || "Customer"} • ${
          selectedPack.code
        } • ${formatCurrency(finalAmount)} ${
          isCash ? "(Cash)" : `(Cheque ${chequeNumber || ""})`
        }`.trim();

        await supabase.from("system_notifications").insert([
          {
            type: "payment", // visible in your admin bell
            title,
            message,
            order_id: orderId,
            customer_id: meId,
            source: "customer",
            read: false,
            metadata: {
              payment_id: newPaymentId,
              amount: Number(finalAmount.toFixed(2)),
              method: isCash ? "cash" : "cheque",
              cheque_number: chequeNumber || null,
              bank_name: bankName || null,
              cheque_date: chequeDate || null,
            },
          },
        ]);
      } catch (notifyErr) {
        console.error("system_notifications insert failed:", notifyErr);
      }

      toast.success(
        ` ${
          isCash ? "Cash" : "Cheque"
        } payment submitted. Awaiting admin verification.`
      );
      setSelectedTxnCode("");
      setAmount("");
      setChequeNumber("");
      setBankName("");
      setChequeDate("");
      setFile(null);
      setTermMultiplier(1);
    } catch (err: any) {
      console.error("Submit failed:", err?.message || err);
      toast.error(
        err?.message ||
          `Failed to submit ${isCash ? "cash" : "cheque"} payment.`
      );
    } finally {
      setSubmitting(false);
    }
  }

  /* ---------------------- Installment breakdown modal ---------------------- */
  const openBreakdown = () => setShowBreakdown(true);
  const closeBreakdown = () => setShowBreakdown(false);

  const paidCount = useMemo(
    () =>
      installments.filter((r) => (r.status || "").toLowerCase() === "paid")
        .length,
    [installments]
  );

  const termCount =
    selectedPack?.order?.per_term_amount &&
    selectedPack?.totals?.finalGrandTotal
      ? Math.round(
          selectedPack.totals.finalGrandTotal /
            selectedPack.order.per_term_amount
        )
      : undefined;

  /* ---------------------------------- UI ---------------------------------- */
  return (
    <div className="min-h-[calc(100vh-80px)]">
      <div className="mx-auto w-full max-w-6xl px-6 py-6">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-neutral-800">
            Payments
          </h1>
        </div>
        <p className="text-sm text-gray-600 mt-1">
          Upload a cheque for your <b>Transaction Code (TXN)</b>. For{" "}
          <b>Credit</b> customers, balances update automatically after admin
          verification.
        </p>

        {/* Upload / Submit Payment */}
        <div className="mt-6 rounded-xl bg-white border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Upload className="h-5 w-5 text-amber-600" />
            <h2 className="text-lg font-semibold">
              {isCash ? "Submit Cash Payment" : "Upload Cheque Payment"}
            </h2>
          </div>

          <form
            onSubmit={handleSubmit}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            <div className="col-span-1">
              <label className="text-xs text-gray-600">
                Select Transaction (TXN) *
              </label>
              <select
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
                value={selectedTxnCode}
                onChange={(e) => setSelectedTxnCode(e.target.value)}
                required
              >
                <option value="">— Choose a TXN —</option>
                {unpaidTxnOptions.map(({ code }, i) => (
                  <option key={`${code}-${i}`} value={code}>
                    {code}
                  </option>
                ))}
              </select>

              {!!selectedPack && (
                <div className="mt-2 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div className="text-sm md:text-base text-gray-700">
                    <span className="font-semibold">
                      Remaining balance (incl. shipping):
                    </span>{" "}
                    <span className="block md:inline font-bold text-green-700 leading-tight text-xl md:text-2xl">
                      {formatCurrency(selectedPack.balance)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={openBreakdown}
                    className="inline-flex items-center gap-2 self-start md:self-auto rounded-lg border border-amber-400 px-3 py-2 text-amber-700 hover:bg-amber-50"
                    title="See your monthly payment schedule for this TXN"
                  >
                    <Calendar className="h-4 w-4" />
                    View Breakdown
                  </button>
                </div>
              )}
            </div>
            {/* Amount (LOCKED) + controls */}
            <div className="col-span-1">
              <label className="text-xs text-gray-600">Amount *</label>
              <div className="mt-1">
                <input
                  type="text"
                  value={amount}
                  readOnly
                  onKeyDown={(e) => e.preventDefault()}
                  onWheel={(e) => e.preventDefault()}
                  className="w-full rounded-lg border px-3 py-2 border-gray-300 bg-gray-50 cursor-not-allowed focus:outline-none"
                />
              </div>

              {/* CREDIT controls */}
              {isCredit && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => stepMultiplier(-1)}
                    className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                    title="Pay fewer months"
                    disabled={termAmount <= 0 || termMultiplier <= 1}
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <div
                    className="h-10 px-3 inline-flex items-center justify-center rounded-lg border border-amber-400 bg-amber-50 font-semibold text-amber-800"
                    title={
                      termAmount > 0
                        ? "Number of months to pay"
                        : "Schedule not loaded yet"
                    }
                  >
                    × {termMultiplier}
                  </div>
                  <button
                    type="button"
                    onClick={() => stepMultiplier(+1)}
                    className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                    title="Pay more months"
                    disabled={
                      termAmount <= 0 ||
                      termMultiplier >= getCreditMaxMultiplier()
                    }
                  >
                    <Plus className="h-4 w-4" />
                  </button>

                  <div className="flex gap-2 ml-1">
                    <button
                      type="button"
                      onClick={payInFull}
                      className="rounded-md px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#ffba20] disabled:opacity-50"
                      style={{ backgroundColor: "#ffba20" }}
                      disabled={termAmount <= 0}
                    >
                      Pay in Full
                    </button>
                    <button
                      type="button"
                      onClick={payInHalf}
                      className="rounded-md px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#ffba20] disabled:opacity-50"
                      style={{ backgroundColor: "#ffba20" }}
                      disabled={termAmount <= 0}
                    >
                      Pay in Half
                    </button>
                  </div>
                </div>
              )}

              {/* CASH controls */}
              {isCash && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => bumpCash("dec")}
                    className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-gray-300 hover:bg-gray-50"
                    title={`Decrease ₱${CASH_STEP.toLocaleString()}`}
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <div
                    className="h-10 px-3 inline-flex items-center justify-center rounded-lg border border-amber-400 bg-amber-50 font-semibold text-amber-800"
                    title="Cash step"
                  >
                    ₱{CASH_STEP.toLocaleString()}
                  </div>
                  <button
                    type="button"
                    onClick={() => bumpCash("inc")}
                    className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-gray-300 hover:bg-gray-50"
                    title={`Increase ₱${CASH_STEP.toLocaleString()}`}
                  >
                    <Plus className="h-4 w-4" />
                  </button>

                  <div className="flex gap-2 ml-1">
                    <button
                      type="button"
                      onClick={payInFull}
                      className="rounded-md px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#ffba20]"
                      style={{ backgroundColor: "#ffba20" }}
                    >
                      Pay in Full
                    </button>

                    <button
                      type="button"
                      onClick={payInHalf}
                      className="rounded-md px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#ffba20]"
                      style={{ backgroundColor: "#ffba20" }}
                    >
                      Pay in Half
                    </button>
                  </div>
                </div>
              )}

              {/* Optional hints */}
              {!isCash && Number(amount) > 0 && termAmount > 0 && (
                <div className="mt-1 text-xs text-green-700">
                  This payment will pay off{" "}
                  <b>{Math.floor(Number(amount) / termAmount)}</b> installment
                  {Math.floor(Number(amount) / termAmount) > 1 ? "s" : ""}.
                </div>
              )}
            </div>{" "}
            {/* closes the Amount (LOCKED) + controls column */}
            {/* Cheque metadata */}
            <div className="col-span-1">
              <label className="text-xs text-gray-600">
                Cheque Number {isCash ? "(optional)" : "*"}
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="\d*"
                maxLength={20}
                value={chequeNumber}
                onChange={(e) => {
                  const digitsOnly = e.target.value
                    .replace(/\D/g, "")
                    .slice(0, 20);
                  setChequeNumber(digitsOnly);
                }}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
                placeholder="e.g., 00012345678901234567"
                required={!isCash}
              />
              <div className="mt-1 text-[11px] text-gray-500">
                Up to 20 digits. Letters or symbols are not allowed.
              </div>
            </div>
            <div className="col-span-1">
              <label className="text-xs text-gray-600">
                Bank Name {isCash ? "(optional)" : "*"}
              </label>
              <input
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
                placeholder="e.g., BPI / BDO / Metrobank"
                required={!isCash}
              />
            </div>
            <div className="col-span-1">
              <label className="text-xs text-gray-600">
                Cheque Date {isCash ? "(optional)" : "*"}
              </label>
              <input
                type="date"
                value={chequeDate}
                onChange={(e) => setChequeDate(e.target.value)}
                min={todayLocalISO()}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
                required={!isCash}
              />
            </div>
            <div className="col-span-1">
              <label className="text-xs text-gray-600">
                Cheque Image {isCash ? "(optional)" : "*"}
              </label>
              <div className="mt-1 flex items-center gap-3">
                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 cursor-pointer hover:bg-gray-50">
                  <FileImage className="h-4 w-4" />
                  <span className="text-sm">Choose file</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    required={!isCash}
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
                  setTermMultiplier(1);
                }}
                className="px-4 py-2 border rounded hover:bg-gray-100"
              >
                Clear
              </button>
              <button
                type="submit"
                disabled={!isFormValid || submitting}
                title={!isFormValid ? "Please complete all fields" : ""}
                className="inline-flex items-center gap-2 px-4 py-2 rounded bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? "Submitting…" : "Submit Payment"}
              </button>
            </div>
          </form>
        </div>

        {/* Items & Totals for selected TXN */}
        {selectedPack && (
          <div className="mt-6 rounded-xl bg-white border border-gray-200 p-4">
            <h2 className="text-lg font-semibold mb-3">
              Items for TXN{" "}
              <span className="font-mono">{selectedPack.code}</span>
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
                    <th className="py-2.5 px-3 text-left font-bold">
                      ITEM DESCRIPTION
                    </th>
                    <th className="py-2.5 px-3 text-center font-bold">
                      REMARKS
                    </th>
                    <th className="py-2.5 px-3 text-center font-bold">
                      UNIT PRICE
                    </th>
                    <th className="py-2.5 px-3 text-center font-bold">
                      DISCOUNT/ADD (%)
                    </th>
                    <th className="py-2.5 px-3 text-center font-bold">
                      AMOUNT
                    </th>
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
                      <tr
                        key={idx}
                        className={idx % 2 === 0 ? "bg-white" : "bg-neutral-50"}
                      >
                        <td className="py-2.5 px-3 text-center font-mono">
                          {qty}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono">
                          {unit}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-semibold">{desc}</span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {inStockFlag ? "✓" : it.inventory?.status ?? "✗"}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono whitespace-nowrap">
                          {formatCurrency(unitPrice)}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono whitespace-nowrap">
                          {typeof it.discount_percent === "number"
                            ? `${it.discount_percent}%`
                            : ""}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold whitespace-nowrap">
                          {formatCurrency(amount)}
                        </td>
                      </tr>
                    );
                  })}
                  {(selectedPack.order.order_items ?? []).length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="text-center py-8 text-neutral-400"
                      >
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
                      <td className="font-semibold py-0.5">
                        Subtotal (Before Discount):
                      </td>
                      <td className="pl-2 font-mono">
                        {formatCurrency(selectedPack.totals.subtotal)}
                      </td>
                    </tr>
                    <tr>
                      <td className="font-semibold py-0.5">Discount</td>
                      <td className="pl-2 font-mono">
                        -{formatCurrency(selectedPack.totals.totalDiscount)}
                      </td>
                    </tr>
                    <tr>
                      <td className="font-semibold py-0.5">Sales Tax (12%):</td>
                      <td className="pl-2 font-mono">
                        {formatCurrency(selectedPack.totals.salesTax)}
                      </td>
                    </tr>
                    {(selectedPack.order?.interest_percent ?? 0) > 0 && (
                      <tr>
                        <td className="font-semibold py-0.5">
                          Interest ({selectedPack.order.interest_percent}%):
                        </td>
                        <td className="pl-2 font-mono text-blue-700 font-bold">
                          {formatCurrency(
                            ((selectedPack.order.interest_percent ?? 0) / 100) *
                              (selectedPack.totals.subtotal -
                                selectedPack.totals.totalDiscount +
                                selectedPack.totals.salesTax)
                          )}
                        </td>
                      </tr>
                    )}
                    <tr>
                      <td className="font-semibold py-0.5">Shipping Fee:</td>
                      <td className="pl-2 font-mono">
                        {formatCurrency(selectedPack.totals.shippingFee)}
                      </td>
                    </tr>
                    <tr>
                      <td className="font-bold py-1.5">
                        Grand Total (Incl. Shipping):
                      </td>
                      <td className="pl-2 font-bold text-green-700 font-mono">
                        {formatCurrency(selectedPack.totals.finalGrandTotal)}
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
                      <td className="pl-2 font-mono">
                        {formatCurrency(selectedPack.paid)}
                      </td>
                    </tr>
                    <tr>
                      <td className="font-semibold py-0.5">
                        Remaining Balance:
                      </td>
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
      </div>

      {/* =================== Modal: Installment Breakdown =================== */}
      {showBreakdown && (
        <div className="fixed inset-0 z-50">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
            onClick={closeBreakdown}
            aria-hidden="true"
          />
          {/* Modal Box */}
          <div className="absolute inset-0 flex items-center justify-center px-2 py-4">
            <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl ring-1 ring-black/10 overflow-hidden animate-in fade-in zoom-in-90">
              {/* Header */}
              <div className="flex items-center justify-between px-7 py-4 border-b bg-gradient-to-r from-[#ffba20]/90 to-white/80">
                <div className="flex items-center gap-2 min-w-0">
                  <Calendar className="h-5 w-5 text-amber-600 shrink-0" />
                  <h3 className="text-lg md:text-xl font-bold tracking-tight text-neutral-900">
                    Installment Breakdown
                  </h3>
                  {selectedPack?.code && (
                    <span
                      className="ml-3 truncate max-w-[220px] font-mono text-xs md:text-sm text-neutral-700 bg-yellow-100 rounded px-2 py-1 border border-yellow-300"
                      title={selectedPack.code}
                    >
                      {selectedPack.code}
                    </span>
                  )}
                </div>
                <button
                  onClick={closeBreakdown}
                  className="rounded-full p-2 hover:bg-amber-100 transition"
                  aria-label="Close"
                >
                  <X className="h-4 w-4 text-neutral-600" />
                </button>
              </div>

              {/* Body */}
              <div className="px-7 py-5 bg-white">
                {loadingInstallments ? (
                  <div className="py-10 text-center text-sm text-gray-500 tracking-wide animate-pulse">
                    Loading schedule…
                  </div>
                ) : installments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-4">
                    <span className="font-bold text-base text-gray-700 mb-1">
                      No installment schedule found for this TXN.
                    </span>
                    {(selectedPack?.order?.per_term_amount ?? 0) > 0 && (
                      <div className="w-full max-w-sm mt-3 text-center">
                        <div className="flex flex-col gap-0.5 items-center mb-2">
                          <span className="font-medium text-gray-500 text-xs">
                            Terms:
                          </span>
                          <span className="font-mono text-base font-bold text-amber-700">
                            {termCount ?? "—"} month
                            {(termCount ?? 0) > 1 ? "s" : ""}
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5 items-center mb-3">
                          <span className="font-medium text-gray-500 text-xs">
                            Per Month:
                          </span>
                          <span className="font-mono text-2xl font-extrabold text-blue-700 drop-shadow">
                            {formatCurrency(
                              selectedPack?.order?.per_term_amount ?? 0
                            )}
                          </span>
                        </div>
                        <div className="rounded-xl shadow ring-1 ring-gray-200 overflow-hidden mt-2">
                          <table className="w-full bg-white">
                            <thead>
                              <tr style={{ background: "#ffba20" }}>
                                <th className="py-2 px-2 text-left font-bold text-neutral-900 text-xs">
                                  Month
                                </th>
                                <th className="py-2 px-2 text-right font-bold text-neutral-900 text-xs">
                                  Amount Due
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {Array.from({
                                length: termCount ?? 12,
                              }).map((_, i) => (
                                <tr
                                  key={i}
                                  className={
                                    i % 2 === 0 ? "bg-white" : "bg-[#fff7e5]"
                                  }
                                >
                                  <td className="py-1.5 px-2 border-b border-gray-100 font-mono text-sm">
                                    Month {i + 1}
                                  </td>
                                  <td className="py-1.5 px-2 border-b border-gray-100 text-right font-mono text-blue-700 font-bold text-sm">
                                    {formatCurrency(
                                      selectedPack?.order?.per_term_amount ?? 0
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {/* Summary */}
                        <div className="mt-3 w-full flex items-end justify-between text-xs">
                          <div className="text-amber-700">
                            ⚠️ Delayed payments may incur penalties. Please pay
                            on or before the due date.
                          </div>
                          <div className="font-semibold">
                            Total Monthly Paid:{" "}
                            <span className="font-bold text-blue-700">
                              {paidCount}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="rounded-xl overflow-hidden shadow ring-1 ring-gray-200 bg-white">
                      <table className="w-full text-xs align-middle">
                        <thead>
                          <tr
                            className="uppercase tracking-wider text-[11px]"
                            style={{ background: "#ffba20" }}
                          >
                            <th className="py-2 px-2 text-left font-bold text-neutral-900">
                              Term
                            </th>
                            <th className="py-2 px-2 text-left font-bold text-neutral-900">
                              Due Date
                            </th>
                            <th className="py-2 px-2 text-right font-bold text-neutral-900">
                              Amount Due
                            </th>
                            <th className="py-2 px-2 text-right font-bold text-neutral-900">
                              Amount Paid
                            </th>
                            <th className="py-2 px-2 text-center font-bold text-neutral-900">
                              Status
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {installments.map((row) => {
                            const paid = Number(row.amount_paid || 0);
                            const due = Number(row.amount_due || 0);
                            const isPaid = paid >= due;
                            return (
                              <tr
                                key={row.id || `${row.term_no}:${row.due_date}`}
                                className="border-b last:border-b-0"
                              >
                                <td className="py-1.5 px-2 font-mono">
                                  {row.term_no}
                                </td>
                                <td className="py-1.5 px-2">
                                  {new Date(
                                    row.due_date + "T00:00:00"
                                  ).toLocaleDateString("en-PH", {
                                    year: "numeric",
                                    month: "short",
                                    day: "2-digit",
                                  })}
                                </td>
                                <td className="py-1.5 px-2 text-right font-mono">
                                  {formatCurrency(due)}
                                </td>
                                <td className="py-1.5 px-2 text-right font-mono">
                                  {formatCurrency(paid)}
                                </td>
                                <td className="py-1.5 px-2 text-center">
                                  {isPaid ? (
                                    <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 font-semibold">
                                      Paid
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700 font-semibold">
                                      Pending
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {/* Footer note & count */}
                    <div className="mt-3 w-full flex items-end justify-between text-xs">
                      <div className="text-amber-700">
                        ⚠️ Delayed payments may incur penalties. Please pay on
                        or before the due date.
                      </div>
                      <div className="font-semibold">
                        Total Monthly Paid:{" "}
                        <span className="font-bold text-blue-700">
                          {paidCount}
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Footer */}
              <div className="px-7 py-3 border-t bg-gray-50 flex justify-end">
                <button
                  onClick={closeBreakdown}
                  className="px-5 py-1.5 rounded-lg border border-black font-semibold bg-black text-white hover:opacity-90 transition text-base"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
