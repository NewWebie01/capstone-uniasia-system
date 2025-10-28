// src/app/customer/payments/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import supabase from "@/config/supabaseClient";
import { toast } from "sonner";
import { Upload, FileImage, Minus, Plus } from "lucide-react";


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

  // order_id -> truck_delivery_id (so we can resubscribe to relevant deliveries)
  const [orderDeliveryMap, setOrderDeliveryMap] = useState<
    Record<string, number | null>
  >({});

  // Installments
  const [installments, setInstallments] = useState<InstallmentRow[]>([]);
  const [loadingInstallments, setLoadingInstallments] = useState(false);

  // Multiplier for Credit (installments)
  const [termMultiplier, setTermMultiplier] = useState<number>(1);

  // Cash stepper
  const CASH_STEP = 1000;
  const MIN_CASH = 0.01;

  // Locally lock TXNs immediately after a payment submit (prevents double submit)
  const [lockedTxn, setLockedTxn] = useState<Record<string, true>>({});

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

  /* ---- Realtime: truck_deliveries.shipping_fee changes -> refresh fee ------ */
  useEffect(() => {
    const deliveryIds = Object.values(orderDeliveryMap).filter(
      (v): v is number => typeof v === "number" && Number.isFinite(v)
    );
    if (!deliveryIds.length) return;

    const deliveryToOrders = new Map<number, string[]>();
    for (const [orderId, delId] of Object.entries(orderDeliveryMap)) {
      if (typeof delId === "number" && Number.isFinite(delId)) {
        const arr = deliveryToOrders.get(delId) ?? [];
        arr.push(orderId);
        deliveryToOrders.set(delId, arr);
      }
    }

    const filter = `id=in.(${inList(deliveryIds)})`;
    const ch = supabase.channel("realtime-delivery-fee");

    const refreshFee = async (orderId: string | number) => {
      try {
        const fee = await fetchShippingFeeForOrder(orderId);
        const key = String(orderId);
        setShippingFees((prev) =>
              prev[key] === fee ? prev : { ...prev, [key]: fee });
      } catch (e) {
        console.error("refreshShippingFee (deliveries) failed:", e);
      }
    };

    ch.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "truck_deliveries", filter },
      (payload) => {
        const delId =
          (payload.new as any)?.id ?? (payload.old as any)?.id ?? null;
        if (delId && deliveryToOrders.has(delId)) {
          for (const orderId of deliveryToOrders.get(delId) ?? []) {
            refreshFee(orderId);
          }
        }
      }
    );

    ch.subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [orderDeliveryMap]);

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
      finalGrandTotal,
      perTerm,
    };
  }

  /* Txn options (completed orders only) */
  const rawTxnOptions = useMemo(() => {
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

  /* ---------------- Prefetch & track order->delivery mapping ---------------- */
  useEffect(() => {
    const orderIds = txns
      .flatMap((c) =>
        (c.orders ?? [])
          .filter((o) => (o.status || "").toLowerCase() === "completed")
          .map((o) => String(o.id))
      );

    if (!orderIds.length) {
      setOrderDeliveryMap({});
      return;
    }

    (async () => {
      try {
        const { data, error } = await supabase
          .from("orders")
          .select("id, truck_delivery_id")
          .in("id", orderIds);

        if (error) throw error;

        const map: Record<string, number | null> = {};
        for (const row of (data ?? []) as Array<{
          id: string | number;
          truck_delivery_id: number | null;
        }>) {
          map[String(row.id)] = row.truck_delivery_id ?? null;
        }
        setOrderDeliveryMap(map);
      } catch (e) {
        console.error("Failed to build orderDeliveryMap:", e);
      }
    })();
  }, [txns]);

  /* ---------------- Realtime: orders -> refresh fee on any update ----------- */
  useEffect(() => {
    const orderIds = txns
      .flatMap((c) =>
        (c.orders ?? [])
          .filter((o) => (o.status || "").toLowerCase() === "completed")
          .map((o) => String(o.id))
      );

    if (!orderIds.length) return;

    const filter = `id=in.(${inList(orderIds)})`;
    const ch = supabase.channel("realtime-orders-fee");

    const refreshFee = async (orderId: string | number) => {
      try {
        const fee = await fetchShippingFeeForOrder(orderId);
        const key = String(orderId);
        setShippingFees((prev) =>
          prev[key] === fee ? prev : { ...prev, [key]: fee }
        );
      } catch (e) {
        console.error("refreshShippingFee (orders) failed:", e);
      }
    };

    ch.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "orders", filter },
      (payload) => {
        const orderId =
          (payload.new as any)?.id ?? (payload.old as any)?.id ?? null;
        if (orderId) refreshFee(orderId);
      }
    );

    ch.subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
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

  /** Enriched unpaid TXN options with fee; options with fee<=0 are disabled in the UI */
  type TxnOption = {
    code: string;
    order: OrderRow;
    customerId: string;
    balance: number;
    fee: number;
  };

  const unpaidTxnOptions: TxnOption[] = useMemo(() => {
    const rows = rawTxnOptions.map(({ order, customerId, code }) => {
      const orderId = String(order.id);
      const fee = shippingFees[orderId] ?? 0;
      const totals = computeFromOrder(order, fee);
      const paid = round2(effectivePaidTotalByOrder.get(orderId) || 0);
      const balance = Math.max(round2(totals.finalGrandTotal - paid), 0);
      return { code, order, customerId, balance, fee };
    });
    return rows
      .filter((r) => r.balance > 0.01 && !lockedTxn[r.code])
      .sort((a, b) => b.balance - a.balance);
  }, [rawTxnOptions, effectivePaidTotalByOrder, shippingFees, lockedTxn]);

  /* ----------------------------- Realtime installments ----------------------------- */
  useEffect(() => {
    const orderIds = rawTxnOptions.map(({ order }) => String(order.id));
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
            "") || ""
        );

        const currentOrderId = rawTxnOptions.find(
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
  }, [rawTxnOptions, selectedTxnCode]);

  /* ---------- Keep selection valid (and reject TXNs without shipping fee) ---------- */
  useEffect(() => {
    if (!selectedTxnCode) return;
    const opt = unpaidTxnOptions.find((t) => t.code === selectedTxnCode);
    if (!opt) {
      setSelectedTxnCode("");
      return;
    }
    if ((opt.fee ?? 0) <= 0) {
      setSelectedTxnCode("");
    }
  }, [selectedTxnCode, unpaidTxnOptions]);

  const selectedPack = useMemo(() => {
    if (!selectedTxnCode) return null;
    const hit = unpaidTxnOptions.find((t) => t.code === selectedTxnCode);
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
  }, [selectedTxnCode, unpaidTxnOptions, effectivePaidTotalByOrder, shippingFees]);

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

// 1) Load the schedule rows for the selected order (if any).
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

// 2) Which rows are unpaid *as stored in DB* (we won't trust their amounts).
const unpaidInstallments = useMemo(
  () => installments.filter((row) => (row.status || "").toLowerCase() !== "paid"),
  [installments]
);

// 3) “All terms paid” according to DB.
const allTermsPaid =
  installments.length > 0 && unpaidInstallments.length === 0;

// 4) Equalized logic: always divide the *current remaining balance* evenly
// across remaining unpaid terms. If DB says "all paid" but balance > 0,
// treat leftover as ONE catch-up term.
const remainingBalance = round2(Number(selectedPack?.balance || 0));
const remainingTerms = useMemo(() => {
  if (!selectedPack || !isCredit) return 0;
  if (allTermsPaid) return remainingBalance > EPS ? 1 : 0;
  return Math.max(0, unpaidInstallments.length);
}, [selectedPack, isCredit, allTermsPaid, unpaidInstallments.length, remainingBalance]);

// Per-term amount (equal split). Last term carries the rounding remainder.
const equalizedPerTerm = useMemo(() => {
  if (!isCredit || !selectedPack) return 0;
  if (remainingTerms <= 0) return 0;
  return round2(remainingBalance / remainingTerms);
}, [isCredit, selectedPack, remainingTerms, remainingBalance]);

// 5) Build the *display* rows for the modal using equalized remaining amounts.
//    - Keep original "Paid" rows as-is.
//    - For each UNPAID row, set its remaining (due - paid) to the same target.
//      i.e., amount_due = amount_paid + targetRemainingPerRow.
//      The last row carries the rounding remainder so the sum equals Remaining Balance.
const breakdownRows = useMemo<InstallmentRow[]>(() => {
  if (!selectedPack || !isCredit) return installments;

  // If DB says all paid but we still have a balance → one catch-up row
  if (remainingTerms === 1 && allTermsPaid && remainingBalance > EPS) {
    const nextNo = ((installments[installments.length - 1]?.term_no) ?? 0) + 1;
    return [
      ...installments,
      {
        id: "__equalized_catchup__",
        order_id: String(selectedPack.order.id),
        term_no: nextNo,
        due_date: todayLocalISO(),
        amount_due: remainingBalance, // whole leftover as one term
        amount_paid: 0,
        status: "pending",
      },
    ];
  }

  if (remainingTerms <= 0) return installments;

  // Equalize the REMAINING across unpaid rows.
  const unpaidRows = installments.filter(
    (r) => (r.status || "").toLowerCase() !== "paid"
  );
  const unpaidCount = unpaidRows.length;

  // Equal remaining per each unpaid row
  const perRemaining = round2(remainingBalance / unpaidCount);

  // Remainder goes to the last row to make the sum exact
  const sumFirst = round2(perRemaining * (unpaidCount - 1));
  const lastRemaining = round2(remainingBalance - sumFirst);

  // Build targets array of "remaining" values per unpaid row
  const targets = [
    ...Array(Math.max(0, unpaidCount - 1)).fill(perRemaining),
    lastRemaining,
  ];

  // Replace amount_due for unpaid rows so that (due - paid) == target
  let i = 0;
  return installments.map((row) => {
    const due  = round2(Number(row.amount_due || 0));
    const paid = round2(Number(row.amount_paid || 0));
    const isPaid = paid + EPS >= due;

    if (isPaid) return row; // keep paid rows untouched

    const targetRemain = targets[i++] ?? 0;     // equal remaining for this row
    const newDue = round2(paid + targetRemain); // ensure (newDue - paid) == target
    return { ...row, amount_due: newDue };
  });
}, [
  installments,
  isCredit,
  selectedPack?.order?.id,
  allTermsPaid,
  remainingTerms,
  remainingBalance,
]);


// 6) Easy helpers driven by the equalized rows.
const equalizedUnpaidAmounts = useMemo(() => {
  return breakdownRows
    .filter((r) => (r.status || "").toLowerCase() !== "paid")
    .map((r) =>
      round2(Math.max(0, Number(r.amount_due || 0) - Number(r.amount_paid || 0)))
    );
}, [breakdownRows]);

// Amount of the next term (for button enabling / hints)
const effectiveTermAmount = useMemo(() => {
  if (!isCredit || remainingTerms <= 0) return 0;
  // Next unpaid term amount is the first in our equalized list.
  return equalizedUnpaidAmounts[0] ?? 0;
}, [isCredit, remainingTerms, equalizedUnpaidAmounts]);

// Sum of the next k unpaid equalized terms.
const sumNextKUnpaid = (k: number) => {
  const slice = equalizedUnpaidAmounts.slice(0, Math.max(0, k));
  const total = slice.reduce((s, a) => s + a, 0);
  return round2(total);
};

// Total of all remaining (equalized) unpaid terms.
const totalOfAllUnpaid = useMemo(() => {
  return round2(equalizedUnpaidAmounts.reduce((s, a) => s + a, 0));
}, [equalizedUnpaidAmounts]);

// 7) Multiplier guards (how many months can we pay without exceeding balance?)
const getCreditMaxMultiplier = () => {
  if (!selectedPack || !isCredit) return 1;
  if (remainingTerms <= 0) return 1;

  let k = 1;
  while (k <= remainingTerms && sumNextKUnpaid(k) <= remainingBalance + EPS) {
    k++;
  }
  return Math.max(1, Math.min(k - 1, remainingTerms));
};

// 8) Initialize Amount whenever txn/mode/schedule changes.
useEffect(() => {
  if (!selectedPack) {
    setAmount("");
    return;
  }

  if (isCredit) {
    if (remainingTerms === 0) {
      // Nothing unpaid — amount locked to 0
      setTermMultiplier(1);
      setAmount("");
      return;
    }

    // If DB says all terms paid but there is leftover balance (catch-up term)
    if (allTermsPaid) {
      setTermMultiplier(1);
      setAmount(remainingBalance > 0 ? remainingBalance.toFixed(2) : "");
      return;
    }

    const max = getCreditMaxMultiplier();
    const start = Math.min(1, max) || 1;
    setTermMultiplier(start);
    setAmount(sumNextKUnpaid(start).toFixed(2));
  } else {
    const bal = Number(selectedPack.balance || 0);
    setAmount(bal > 0 ? bal.toFixed(2) : "");
    setTermMultiplier(1);
  }
  // eslint-disable-next-line
}, [
  selectedPack?.balance,
  isCredit,
  remainingTerms,
  allTermsPaid,
]);

// 9) Keep Amount in sync with multiplier (credit).
useEffect(() => {
  if (!selectedPack || !isCredit) return;

  if (remainingTerms === 0) {
    setTermMultiplier(1);
    setAmount("");
    return;
  }

  // Catch-up single term case
  if (allTermsPaid) {
    setTermMultiplier(1);
    setAmount(remainingBalance > 0 ? remainingBalance.toFixed(2) : "");
    return;
  }

  const max = getCreditMaxMultiplier();
  const k = Math.max(1, Math.min(termMultiplier, max));
  if (k !== termMultiplier) setTermMultiplier(k);
  setAmount(sumNextKUnpaid(k).toFixed(2));
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [termMultiplier, isCredit, selectedPack?.code, remainingTerms, allTermsPaid]);

/* ===== Buttons-only update helpers (use equalized amounts) ===== */
const applyCreditMultiplier = (mult: number) => {
  if (!selectedPack || !isCredit) return;
  const clamped = Math.max(1, Math.min(mult, getCreditMaxMultiplier()));
  setTermMultiplier(clamped);
  setAmount(sumNextKUnpaid(clamped).toFixed(2));
};
const stepMultiplier = (delta: number) => applyCreditMultiplier(termMultiplier + delta);


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

  if (isCash) {
    setAmount(bal > 0 ? bal.toFixed(2) : "");
    return;
  }

  // CREDIT → multiplier equals all remaining terms; amount equals full remaining balance.
  if (remainingTerms <= 0) {
    setTermMultiplier(1);
    setAmount("");
    return;
  }
  setTermMultiplier(remainingTerms);
  setAmount(bal.toFixed(2));
};

const payInHalf = () => {
  if (!selectedPack) return;

  if (isCash) {
    const bal = Number(selectedPack.balance || 0);
    setAmount(Math.max(bal / 2, MIN_CASH).toFixed(2));
    return;
  }

  // CREDIT
  if (remainingTerms <= 0) {
    setTermMultiplier(1);
    setAmount("");
    return;
  }

  if (allTermsPaid) {
    // Catch-up half
    const bal = Number(selectedPack.balance || 0);
    setTermMultiplier(1);
    setAmount(Math.max(bal / 2, 0).toFixed(2));
    return;
  }

  // Half the remaining terms (rounded down, at least 1)
  const half = Math.max(1, Math.floor(remainingTerms / 2));
  applyCreditMultiplier(half);
};

/* --------------------------- Validation flags --------------------------- */

// Current amount in the input (rounded)
const enteredAmount = round2(toNumber(amount));

// For CREDIT: see if the amount exactly matches the sum of the next k equalized terms
let matchedK = 0;
if (isCredit && remainingTerms > 0 && enteredAmount > 0) {
  for (let k = 1; k <= remainingTerms; k++) {
    if (Math.abs(enteredAmount - sumNextKUnpaid(k)) < EPS) {
      matchedK = k;
      break;
    }
  }
}

// Exact if (a) matches one of the k-term sums OR (b) equals full remaining balance
const isExactByTerms   = isCredit && matchedK > 0;
const isExactByBalance = isCredit && Math.abs(enteredAmount - remainingBalance) < EPS;

// Cash: allow any positive amount up to balance
const isPaymentExact = isCash
  ? enteredAmount > 0 && enteredAmount <= (selectedPack?.balance || 0) + EPS
  : (isExactByTerms || isExactByBalance);

// Safety: never allow paying above the remaining balance
const exceedsBalance =
  !!selectedPack && enteredAmount > (selectedPack.balance || 0) + EPS;

// Final form-valid flag (note: cheque fields required only for cheque mode)
const isFormValid =
  !!selectedTxnCode &&
  isPaymentExact &&
  !exceedsBalance &&
  (isCash ||
    (chequeNumber.trim().length > 0 &&
      bankName.trim().length > 0 &&
      chequeDate.trim().length > 0 &&
      !!file));



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
      const justSubmittedCode = selectedPack.code;

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

      const { data: paymentRow, error: insertErr } = await supabase
        .from("payments")
        .insert(insertData)
        .select("id, created_at")
        .single();

      if (insertErr) throw new Error(`DB insert error: ${insertErr.message}`);
      const newPaymentId = String(paymentRow?.id);

      // notify admin
      try {
        const title = "💳 Payment Request";
        const message = `${me.name || "Customer"} • ${
          selectedPack.code
        } • ${formatCurrency(finalAmount)} ${
          isCash ? "(Cash)" : `(Cheque ${chequeNumber || ""})`
        }`.trim();

        await supabase.from("system_notifications").insert([
          {
            type: "payment",
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
        ` ${isCash ? "Cash" : "Cheque"} payment submitted. Awaiting admin verification.`
      );
      setSelectedTxnCode("");
      setAmount("");
      setChequeNumber("");
      setBankName("");
      setChequeDate("");
      setFile(null);
      setTermMultiplier(1);
      setLockedTxn((prev) => ({ ...prev, [justSubmittedCode]: true }));
    } catch (err: any) {
      console.error("Submit failed:", err?.message || err);
      toast.error(
        err?.message || `Failed to submit ${isCash ? "cash" : "cheque"} payment.`
      );
    } finally {
      setSubmitting(false);
    }
  }

  /* ---------------------- Installment breakdown modal ---------------------- */


  // Count rows paid (trust backend values)
  const paidCount = useMemo(() => {
    return installments.filter((r) => {
      const due = round2(Number(r.amount_due || 0));
      const paid = round2(Number(r.amount_paid || 0));
      return paid + EPS >= due;
    }).length;
  }, [installments]);

  /* ---------------------------------- UI ---------------------------------- */
  const allTxnsWaitingForFee =
    unpaidTxnOptions.length > 0 &&
    unpaidTxnOptions.every((t) => (t.fee ?? 0) <= 0);

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

        {allTxnsWaitingForFee && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Your orders are almost ready! Please wait for the{" "}
            <b>shipping fee</b> to be applied to your TXN before submitting a
            payment.
          </div>
        )}

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
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) {
                    setSelectedTxnCode("");
                    return;
                  }
                  const opt = unpaidTxnOptions.find((t) => t.code === val);
                  if (!opt) {
                    setSelectedTxnCode("");
                    return;
                  }
                  if ((opt.fee ?? 0) <= 0) {
                    toast.warning(
                      "This TXN is waiting for a shipping fee. Please try again later."
                    );
                    e.currentTarget.value = selectedTxnCode || "";
                    return;
                  }
                  if (lockedTxn[val]) {
                    toast.warning(
                      "This TXN already has a submitted payment pending verification."
                    );
                    e.currentTarget.value = selectedTxnCode || "";
                    return;
                  }

                  setSelectedTxnCode(val);
                }}
                required
              >
                <option value="">— Choose a TXN —</option>
                {unpaidTxnOptions.map(({ code, fee }, i) => {
                  const isLocked = !!lockedTxn[code];
                  const waitingFee = (fee ?? 0) <= 0;
                  return (
                    <option
                      key={`${code}-${i}`}
                      value={code}
                      disabled={waitingFee || isLocked}
                    >
                      {code}
                      {waitingFee
                        ? " — (Waiting for shipping fee)"
                        : isLocked
                        ? " — (Pending payment)"
                        : ""}
                    </option>
                  );
                })}
              </select>

               </div>  

{/* Selected TXN summary + installment counters */}
{!!selectedPack && (
  <div className="mt-2">
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      {/* Remaining Balance */}
      <div className="flex flex-col">
        <span className="font-semibold text-gray-800">
          Remaining balance (incl. shipping):
        </span>
        <span className="font-bold text-green-700 text-2xl leading-tight">
          {formatCurrency(selectedPack.balance)}
        </span>
      </div>

      {/* Credit counters */}
      {isCredit && (
        <div className="flex items-center gap-3 text-sm md:text-base">
          <div>
            <span className="font-semibold">Total Monthly Paid:</span>{" "}
            <span className="font-bold">{paidCount}</span>
          </div>
          <span className="opacity-50">•</span>
          <div>
            <span className="font-semibold">Remaining Months:</span>{" "}
            <span className="font-bold">{Math.max(0, remainingTerms)}</span>
          </div>
        </div>
      )}
    </div>
  </div>
)}



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
        disabled={effectiveTermAmount <= 0 || termMultiplier <= 1}
      >
        <Minus className="h-4 w-4" />
      </button>

      <div
        className="h-10 px-3 inline-flex items-center justify-center rounded-lg border border-amber-400 bg-amber-50 font-semibold text-amber-800"
        title={effectiveTermAmount > 0 ? "Number of months to pay" : "Schedule not loaded yet"}
      >
        × {termMultiplier}
      </div>

      <button
        type="button"
        onClick={() => stepMultiplier(+1)}
        className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
        title="Pay more months"
        disabled={effectiveTermAmount <= 0 || termMultiplier >= getCreditMaxMultiplier()}
      >
        <Plus className="h-4 w-4" />
      </button>

      <div className="flex gap-2 ml-1">
        <button
          type="button"
          onClick={payInFull}
          className="rounded-md px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-1"
          style={{ backgroundColor: "#ffba20" }}
          disabled={effectiveTermAmount <= 0}
        >
          Pay in Full
        </button>

        <button
          type="button"
          onClick={payInHalf}
          className="rounded-md px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-1"
          style={{ backgroundColor: "#ffba20" }}
          disabled={effectiveTermAmount <= 0}

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
          className="rounded-md px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-1"
          style={{ backgroundColor: "#ffba20" }}
        >
          Pay in Full
        </button>

        <button
          type="button"
          onClick={payInHalf}
          className="rounded-md px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-1"
          style={{ backgroundColor: "#ffba20" }}
        >
          Pay in Half
        </button>
      </div>
    </div>
  )}

{/* Optional hint */}
{!isCash && Number(amount) > 0 && (
  <div className="mt-1 text-xs text-green-700">
    {(() => {
      const amt = Number(amount) || 0;
      const per = effectiveTermAmount;
      if (allTermsPaid) {
        return <>This payment will settle the <b>remaining balance</b>.</>;
      }
      if (per > 0) {
        const k = Math.min(unpaidInstallments.length, Math.floor(amt / per));
        // const scheduleTotal = totalOfAllUnpaid();
        const isFullWithLeftover =
          Math.abs(amt - (selectedPack?.balance ?? 0)) < EPS &&
          totalOfAllUnpaid  + EPS < (selectedPack?.balance ?? 0);
        return (
          <>
            This payment will pay off <b>{k}</b> installment{k > 1 ? "s" : ""}.
            {isFullWithLeftover && (
              <> It also settles the <b>remaining shipping/adjustment</b> amount.</>
            )}
          </>
        );
      }
      return null;
    })()}
  </div>
)}


</div>


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
                  const digitsOnly = e.target.value.replace(/\D/g, "").slice(0, 20);
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
                      <tr
                        key={idx}
                        className={idx % 2 === 0 ? "bg-white" : "bg-neutral-50"}
                      >
                        <td className="py-2.5 px-3 text-center font-mono">{qty}</td>
                        <td className="py-2.5 px-3 text-center font-mono">{unit}</td>
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

                    {selectedPack.totals.shippingFee > 0 && (
                      <tr>
                        <td className="font-semibold py-0.5">Shipping Fee:</td>
                        <td className="pl-2 font-mono">
                          {formatCurrency(selectedPack.totals.shippingFee)}
                        </td>
                      </tr>
                    )}

                    <tr>
                      <td className="font-bold py-1.5">
                        Grand Total
                        {selectedPack.totals.shippingFee > 0
                          ? " (Incl. Shipping)"
                          : ""}
                        :
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


    </div>
  );
}