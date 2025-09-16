// src/app/customer/track/page.tsx
"use client";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useEffect, useMemo, useRef, useState } from "react";
import supabase from "@/config/supabaseClient";
import {
  Truck,
  Clock,
  CheckCircle2,
  XCircle,
  MapPin,
  Phone,
  Mail,
  Info,
} from "lucide-react";

/* ----------------------------- Date formatter ----------------------------- */
const formatPH = (
  d?: string | number | Date | null,
  opts: "date" | "datetime" = "datetime"
) =>
  d
    ? new Intl.DateTimeFormat("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
        ...(opts === "datetime"
          ? { hour: "numeric", minute: "2-digit", hour12: true }
          : {}),
        timeZone: "Asia/Manila",
      }).format(new Date(d))
    : "—";

/* ------------------------------ Money helper ------------------------------ */
const formatCurrency = (n: number) =>
  n.toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  });

/* ---------------------------------- Types --------------------------------- */
type ItemRow = {
  quantity: number;
  price: number;
  discount_percent?: number | null; // ← NEW
  inventory?: {
    product_name?: string | null;
    category?: string | null;
    subcategory?: string | null;
    status?: string | null;
    unit?: string | null; // ← used for UNIT column
    unit_price?: number | null; // ← fallback pricing
    quantity?: number | null; // ← for in-stock flag
  } | null;
};

type OrderRow = {
  id: number;
  total_amount: number | null;
  status: string | null; // fallback only; prefer truck_deliveries.status
  truck_delivery_id?: number | null;
  // NEW: admin-saved totals/fields
  grand_total_with_interest?: number | null;
  sales_tax?: number | null;
  per_term_amount?: number | null;
  order_items?: ItemRow[];
};

type CustomerTx = {
  id: number;
  name: string | null;
  code: string | null; // TXN
  contact_person?: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  date: string | null;
  orders?: OrderRow[];
};

type Delivery = {
  id: number;
  status: string | null;
  schedule_date: string | null;
  eta_date?: string | null;
  date_received?: string | null;
  driver?: string | null;
  participants?: string[] | null;
  shipping_fee?: number | null;
};

/* ------------------------------- UI helpers ------------------------------- */
const DeliveryBadge = ({ status }: { status?: string | null }) => {
  const s = (status || "").trim().toLowerCase();

  if (s === "to receive")
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold bg-green-100 text-green-800">
        <CheckCircle2 className="h-3.5 w-3.5" />
        To Receive
      </span>
    );

  if (s === "delivered")
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold bg-green-200 text-green-900">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Delivered
      </span>
    );
  if (s === "ongoing" || s === "on going" || s === "in transit")
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold bg-amber-200 text-amber-900">
        <Truck className="h-3.5 w-3.5" />
        Ongoing
      </span>
    );
  if (s === "scheduled" || s === "schedule")
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold bg-blue-200 text-blue-900">
        <Clock className="h-3.5 w-3.5" />
        Scheduled
      </span>
    );
  if (s === "accepted")
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold bg-blue-200 text-blue-900">
        Accepted
      </span>
    );
  if (s === "rejected")
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold bg-red-200 text-red-900">
        <XCircle className="h-3.5 w-3.5" />
        Rejected
      </span>
    );

  return (
    <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold bg-yellow-200 text-yellow-900">
      Pending
    </span>
  );
};

// Normalize status string to check if it's "To Ship"
const isToShip = (s?: string | null) =>
  !!(s && /^(to[-_ ]?ship)$/i.test(s.trim()));

/* -------------------------------- Component -------------------------------- */
export default function TrackPage() {
  const [loading, setLoading] = useState(true);
  const [authEmail, setAuthEmail] = useState<string | null>(null);

  const [txns, setTxns] = useState<CustomerTx[]>([]);
  const [deliveriesById, setDeliveriesById] = useState<
    Record<number, Delivery>
  >({});

  // Confirm modal
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<number | null>(
    null
  );

  // Realtime
  const [orderIds, setOrderIds] = useState<number[]>([]);
  const [deliveryIds, setDeliveryIds] = useState<number[]>([]);
  const ordersSubKey = useRef<string>("");
  const deliveriesSubKey = useRef<string>("");

  // Expandable orders (orderId -> open?)
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const toggleExpanded = (id: number) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const hasData = useMemo(() => txns.length > 0, [txns.length]);

  /* ----------------------------- Pagination (TXN cards) ----------------------------- */
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  useEffect(() => {
    setCurrentPage(1);
  }, [txns.length]);

  const totalPages = Math.max(1, Math.ceil(txns.length / itemsPerPage));

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const pageStart = (currentPage - 1) * itemsPerPage;
  const pageEnd = pageStart + itemsPerPage;

  const pagedTxns = useMemo(
    () => txns.slice(pageStart, pageEnd),
    [txns, pageStart, pageEnd]
  );

  const goToPage = (p: number) =>
    setCurrentPage(Math.max(1, Math.min(totalPages, p)));

  /* -------------------------- Helper: fetch deliveries --------------------- */
  const fetchDeliveriesByIds = async (ids: number[]) => {
    if (!ids.length) return;
    const { data, error } = await supabase
      .from("truck_deliveries")
      .select(
        "id, status, schedule_date, eta_date, date_received, driver, participants, shipping_fee"
      )
      .in("id", ids);
    if (!error && data) {
      setDeliveriesById((prev) => {
        const next = { ...prev };
        for (const d of data as Delivery[])
          next[d.id] = { ...(next[d.id] ?? {}), ...d };
        return next;
      });
    }
  };

  /* ------------------------------- Initial load ---------------------------- */
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
          setDeliveriesById({});
          setOrderIds([]);
          setDeliveryIds([]);
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

        if (error || !customers) {
          setTxns([]);
          setDeliveriesById({});
          setOrderIds([]);
          setDeliveryIds([]);
          return;
        }

        const txList = customers as CustomerTx[];
        setTxns(txList);

        // Collect order & delivery IDs
        const oset = new Set<number>();
        const dset = new Set<number>();
        for (const t of txList) {
          for (const o of t.orders ?? []) {
            oset.add(o.id);
            if (o.truck_delivery_id != null) dset.add(o.truck_delivery_id);
          }
        }
        const oids = Array.from(oset);
        const dids = Array.from(dset);
        setOrderIds(oids);
        setDeliveryIds(dids);

        if (dids.length) await fetchDeliveriesByIds(dids);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* ----------------------- Realtime: truck_deliveries ---------------------- */
  useEffect(() => {
    const key = deliveryIds
      .slice()
      .sort((a, b) => a - b)
      .join(",");
    if (!key || key === deliveriesSubKey.current) return;
    deliveriesSubKey.current = key;

    const channel = supabase.channel("realtime-truck-deliveries");
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "truck_deliveries",
        filter: `id=in.(${key})`,
      },
      (payload) => {
        const n = payload.new as Delivery | undefined;
        const o = payload.old as Delivery | undefined;
        const row = n ?? o;
        if (!row?.id) return;

        setDeliveriesById((prev) => {
          const next = { ...prev };
          if (payload.eventType === "DELETE") {
            delete next[row.id];
          } else if (n) {
            next[row.id] = { ...(next[row.id] ?? {}), ...n };
          }
          return next;
        });
      }
    );
    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [deliveryIds]);

  /* ----------------------------- Realtime: orders -------------------------- */
  useEffect(() => {
    const key = orderIds
      .slice()
      .sort((a, b) => a - b)
      .join(",");
    if (!key || key === ordersSubKey.current) return;
    ordersSubKey.current = key;

    const channel = supabase.channel("realtime-orders");
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "orders",
        filter: `id=in.(${key})`,
      },
      async (payload) => {
        const newRow = payload.new as {
          id: number;
          status: string | null;
          truck_delivery_id: number | null;
          grand_total_with_interest?: number | null;
          sales_tax?: number | null;
          per_term_amount?: number | null;
        };

        const changedOrderId = newRow?.id;

        // Update local orders (status + delivery link + totals)
        setTxns((prev) =>
          prev.map((cust) => ({
            ...cust,
            orders: (cust.orders ?? []).map((o) =>
              o.id === changedOrderId
                ? {
                    ...o,
                    status: newRow?.status ?? o.status,
                    truck_delivery_id:
                      newRow?.truck_delivery_id ?? o.truck_delivery_id,
                    grand_total_with_interest:
                      newRow?.grand_total_with_interest ??
                      o.grand_total_with_interest,
                    sales_tax: newRow?.sales_tax ?? o.sales_tax,
                    per_term_amount:
                      newRow?.per_term_amount ?? o.per_term_amount,
                  }
                : o
            ),
          }))
        );

        // If order linked to a delivery, ensure we fetched that delivery
        if (newRow && newRow.truck_delivery_id != null) {
          const id: number = newRow.truck_delivery_id;
          setDeliveryIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
          await fetchDeliveriesByIds([id]);
        }
      }
    );
    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderIds]);

  return (
    <div className="min-h-[calc(100vh-80px)]">
      <div className="mx-auto w-full max-w-6xl px-6 py-6">
        <h1 className="text-3xl font-bold tracking-tight text-neutral-800">
          Track Your Delivery
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          Review your orders, check item details and totals, and track the
          latest delivery status.
        </p>

        {!authEmail && !loading && (
          <p className="mt-4 text-gray-700">
            Please sign in to view your orders.
          </p>
        )}
        {loading && <p className="mt-4 text-gray-700">Loading your orders…</p>}
        {!loading && authEmail && !hasData && (
          <p className="mt-4 text-gray-700">
            No orders found for <span className="font-medium">{authEmail}</span>
            .
          </p>
        )}

        {/* Orders list */}
        <div className="w-full space-y-4 mt-4">
          {!loading &&
            pagedTxns.map((t) => {
              const orderList = t.orders ?? [];

              // Header badge: prefer first order's delivery.status, fallback to order.status
              const firstOrder = orderList[0];
              const firstDelivery =
                firstOrder?.truck_delivery_id != null
                  ? deliveriesById[firstOrder.truck_delivery_id]
                  : undefined;
              const headerStatus =
                firstDelivery?.status ?? firstOrder?.status ?? "Pending";

              return (
                <div
                  key={t.id}
                  className="w-full bg-white rounded-xl shadow border border-gray-200"
                >
                  {/* Card header */}
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 px-5 py-3 border-b">
                    <div className="space-y-0.5">
                      <div className="text-[10px] uppercase tracking-wide text-gray-500">
                        TXN
                      </div>
                      <div className="font-semibold tracking-wide">
                        {t.code ?? "—"}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-600">Delivery:</span>
                      <DeliveryBadge status={headerStatus} />
                      {/* ETA chip for To Ship */}
                      {isToShip(headerStatus) && firstDelivery?.eta_date && (
                        <span className="text-xs font-medium text-blue-900 bg-blue-50 border border-blue-200 rounded px-2 py-0.5">
                          ETA: {formatPH(firstDelivery.eta_date, "date")}
                        </span>
                      )}
                      <div className="text-xs text-gray-500">
                        Placed: {formatPH(t.date)}
                      </div>
                    </div>
                  </div>

                  {/* Customer block */}
                  <div className="px-5 pt-3 pb-2 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div className="space-y-0.5">
                      <div className="text-xs text-gray-500">Name</div>
                      <div className="font-medium">{t.name ?? "—"}</div>
                    </div>

                    <div className="space-y-0.5">
                      <div className="text-xs text-gray-500">Address</div>
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 mt-[2px] text-gray-500" />
                        <span>{t.address ?? "—"}</span>
                      </div>
                    </div>

                    <div className="space-y-0.5">
                      <div className="text-xs text-gray-500">Contact</div>
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-gray-500" />
                        <span>{t.phone ?? "—"}</span>
                      </div>
                    </div>

                    <div className="space-y-0.5">
                      <div className="text-xs text-gray-500">Email</div>
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-gray-500" />
                        <span>{t.email ?? "—"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Orders (expandables) */}
                  {orderList.map((o) => {
                    const deliv = o.truck_delivery_id
                      ? deliveriesById[o.truck_delivery_id]
                      : undefined;
                    const rowStatus = deliv?.status ?? o.status ?? "Pending";

                    // show table only when admin has saved totals
                    // show details when the order is completed (works for Cash & Credit)
                    const showDetails =
                      (o.status || "").toLowerCase() === "completed";

                    // robust totals (works even if grand_total_with_interest is NULL)
                    const items = o.order_items ?? [];

                    const subtotal = items.reduce((s, it) => {
                      const unitPrice =
                        Number(it.price ?? it.inventory?.unit_price ?? 0) || 0;
                      const qty = Number(it.quantity || 0);
                      return s + unitPrice * qty;
                    }, 0);

                    const totalDiscount = items.reduce((s, it) => {
                      const unitPrice =
                        Number(it.price ?? it.inventory?.unit_price ?? 0) || 0;
                      const qty = Number(it.quantity || 0);
                      const pct = Number(it.discount_percent ?? 0);
                      return s + (unitPrice * qty * pct) / 100;
                    }, 0);

                    const salesTax = Number(o.sales_tax ?? 0);

                    const grandTotal =
                      typeof o.grand_total_with_interest === "number"
                        ? Number(o.grand_total_with_interest)
                        : Math.max(subtotal - totalDiscount, 0) + salesTax;

                    const perTerm = Number(o.per_term_amount ?? 0);

                    return (
                      <div key={o.id} className="px-5 pb-4">
                        {/* Clickable header to toggle details */}
                        <div
                          className="mt-2 flex items-center justify-between cursor-pointer hover:bg-gray-50 rounded-lg px-3 py-2"
                          onClick={() => toggleExpanded(o.id)}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-600">
                              Delivery:
                            </span>
                            <DeliveryBadge status={rowStatus} />
                            <span className="text-xs text-gray-500 select-none">
                              {expanded[o.id] ? "▲" : "▼"}
                            </span>
                          </div>
                        </div>

                        {/* Expandable body */}
                        {expanded[o.id] && (
                          <div className="mt-2">
                            {!showDetails ? (
                              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 px-4 py-3">
                                <Info className="h-4 w-4 mt-0.5" />
                                <div className="text-sm">
                                  <b>
                                    Awaiting admin to finalize pricing &
                                    discounts.
                                  </b>{" "}
                                  Once completed, your detailed item table and
                                  totals will appear here.
                                </div>
                              </div>
                            ) : (
                              <>
                                {/* Items table */}
                                <div className="rounded-xl overflow-hidden ring-1 ring-gray-200 bg-white">
                                  <table className="w-full text-sm align-middle">
                                    <thead>
                                      <tr
                                        className="text-black uppercase tracking-wider text-[11px]"
                                        style={{ background: "#ffba20" }}
                                      >
                                        <th className="py-2.5 px-3 text-center font-bold">
                                          QTY
                                        </th>
                                        <th className="py-2.5 px-3 text-center font-bold">
                                          UNIT
                                        </th>
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
                                      {(o.order_items ?? []).map((it, idx) => {
                                        const unit =
                                          it.inventory?.unit?.trim() || "pcs";
                                        const desc =
                                          it.inventory?.product_name ?? "—";
                                        const unitPrice =
                                          Number(
                                            it.price ??
                                              it.inventory?.unit_price ??
                                              0
                                          ) || 0;
                                        const qty = Number(it.quantity || 0);
                                        const amount = qty * unitPrice;

                                        const inStockFlag =
                                          typeof it.inventory?.quantity ===
                                          "number"
                                            ? (it.inventory?.quantity ?? 0) > 0
                                            : (it.inventory?.status || "")
                                                .toLowerCase()
                                                .includes("in stock");

                                        return (
                                          <tr
                                            key={idx}
                                            className={
                                              idx % 2 === 0
                                                ? "bg-white"
                                                : "bg-neutral-50"
                                            }
                                          >
                                            <td className="py-2.5 px-3 text-center font-mono">
                                              {qty}
                                            </td>
                                            <td className="py-2.5 px-3 text-center font-mono">
                                              {unit}
                                            </td>
                                            <td className="py-2.5 px-3">
                                              <span className="font-semibold">
                                                {desc}
                                              </span>
                                            </td>
                                            <td className="py-2.5 px-3 text-center">
                                              {inStockFlag
                                                ? "✓"
                                                : it.inventory?.status
                                                ? it.inventory.status
                                                : "✗"}
                                            </td>
                                            <td className="py-2.5 px-3 text-center font-mono whitespace-nowrap">
                                              {formatCurrency(unitPrice)}
                                            </td>
                                            <td className="py-2.5 px-3 text-center font-mono whitespace-nowrap">
                                              {typeof it.discount_percent ===
                                              "number"
                                                ? `${it.discount_percent}%`
                                                : ""}
                                            </td>

                                            <td className="py-2.5 px-3 text-center font-mono font-bold whitespace-nowrap">
                                              {formatCurrency(amount)}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                      {(o.order_items ?? []).length === 0 && (
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

                                {/* Totals box (matches your screenshot labels) */}
                                <div className="flex flex-row gap-4 mt-5">
                                  <div className="w-2/3 text-xs pr-4">
                                    {/* Optional notes or leave empty */}
                                  </div>
                                  <div className="flex flex-col items-end text-xs mt-1 w-1/3">
                                    <table className="text-right w-full">
                                      <tbody>
                                        <tr>
                                          <td className="font-semibold py-0.5">
                                            Subtotal (Before Discount):
                                          </td>
                                          <td className="pl-2 font-mono">
                                            {formatCurrency(subtotal)}
                                          </td>
                                        </tr>
                                        <tr>
                                          <td className="font-semibold py-0.5">
                                            Discount
                                          </td>
                                          <td className="pl-2 font-mono">
                                            {formatCurrency(totalDiscount)}
                                          </td>
                                        </tr>
                                        <tr>
                                          <td className="font-semibold py-0.5">
                                            Sales Tax (12%):
                                          </td>
                                          <td className="pl-2 font-mono">
                                            {formatCurrency(salesTax)}
                                          </td>
                                        </tr>
                                        <tr>
                                          <td className="font-bold py-1.5">
                                            Grand Total:
                                          </td>
                                          <td className="pl-2 font-bold text-green-700 font-mono">
                                            {formatCurrency(grandTotal)}
                                          </td>
                                        </tr>
                                        {perTerm > 0 && (
                                          <tr>
                                            <td className="font-semibold py-0.5">
                                              Per Term:
                                            </td>
                                            <td className="pl-2 font-bold text-blue-700 font-mono">
                                              {formatCurrency(perTerm)}
                                            </td>
                                          </tr>
                                        )}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </>
                            )}

                            {/* Delivery details */}
                            {deliv && (
                              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                <p>
                                  <span className="text-gray-500">
                                    Shipping Fee:
                                  </span>{" "}
                                  {typeof deliv.shipping_fee === "number"
                                    ? `₱${deliv.shipping_fee.toFixed(2)}`
                                    : "—"}
                                </p>
                                <p>
                                  <span className="text-gray-500">
                                    Schedule:
                                  </span>{" "}
                                  {formatPH(deliv.schedule_date)}
                                </p>
                                <p>
                                  <span className="text-gray-500">
                                    Received:
                                  </span>{" "}
                                  {deliv.date_received
                                    ? formatPH(deliv.date_received)
                                    : "Not yet received"}
                                </p>
                                {/* ETA line for To Ship */}
                                {isToShip(rowStatus) && (
                                  <p className="md:col-span-2">
                                    <span className="text-gray-500">ETA:</span>{" "}
                                    {deliv.eta_date
                                      ? formatPH(deliv.eta_date, "date")
                                      : "—"}
                                  </p>
                                )}
                                <p>
                                  <span className="text-gray-500">Driver:</span>{" "}
                                  {deliv.driver ?? "—"}
                                </p>
                                <p className="md:col-span-2">
                                  <span className="text-gray-500">
                                    Participants:
                                  </span>{" "}
                                  {Array.isArray(deliv.participants) &&
                                  deliv.participants.length > 0
                                    ? deliv.participants.join(", ")
                                    : "—"}
                                </p>
                              </div>
                            )}
                          </div>
                        )}

                        {deliv?.status === "To Receive" && (
                          <div className="mt-3">
                            <button
                              onClick={() => {
                                setSelectedDeliveryId(deliv.id);
                                setConfirmOpen(true);
                              }}
                              className="px-4 py-2 text-sm font-medium bg-green-600 text-white rounded hover:bg-green-700 transition"
                            >
                              Confirm Received
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
        </div>

        {/* Pagination controls */}
        {!loading && hasData && (
          <div className="mt-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              {/* Prev */}
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg 
                    bg-white/70 backdrop-blur-sm ring-1 ring-black/10
                    hover:bg-white active:translate-y-px transition
                    text-gray-800
                    disabled:opacity-50 disabled:cursor-not-allowed`}
                aria-label="Previous page"
                title="Previous page"
              >
                <span className="text-lg">←</span>
                <span className="font-medium">Prev</span>
              </button>

              {/* Center status */}
              <div className="text-sm sm:text-base font-medium text-gray-900/90 text-center">
                Page <span className="font-bold">{currentPage}</span> of{" "}
                <span className="font-bold">{totalPages}</span>
                <span className="hidden sm:inline text-gray-700/80">
                  {" "}
                  • Showing{" "}
                  {txns.length > 0 ? (
                    <>
                      <span className="font-semibold">{pageStart + 1}</span>–
                      <span className="font-semibold">
                        {Math.min(pageEnd, txns.length)}
                      </span>{" "}
                      of <span className="font-semibold">{txns.length}</span>
                    </>
                  ) : (
                    "0"
                  )}
                </span>
              </div>

              {/* Next */}
              <button
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg 
                    bg-white/70 backdrop-blur-sm ring-1 ring-black/10
                    hover:bg-white active:translate-y-px transition
                    text-gray-800
                    disabled:opacity-50 disabled:cursor-not-allowed`}
                aria-label="Next page"
                title="Next page"
              >
                <span className="font-medium">Next</span>
                <span className="text-lg">→</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Confirm Received Modal */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <h2 className="text-lg font-semibold mb-2">Confirm Delivery</h2>
          <p className="text-sm text-gray-600">
            Are you sure you want to mark this delivery as{" "}
            <strong>Received</strong>?
          </p>

          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => setConfirmOpen(false)}
              className="px-4 py-2 border rounded hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                if (!selectedDeliveryId) return;

                const { error } = await supabase
                  .from("truck_deliveries")
                  .update({
                    status: "Delivered",
                    date_received: new Date().toISOString(),
                  })
                  .eq("id", selectedDeliveryId);

                if (error) {
                  console.error("Delivery update failed:", error);
                  toast.error(
                    "❌ Failed to confirm delivery. Please try again."
                  );
                } else {
                  toast.success("✅ Thank you! Delivery has been confirmed.");
                }

                setConfirmOpen(false);
                setSelectedDeliveryId(null);
              }}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Confirm
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
