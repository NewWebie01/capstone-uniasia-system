// src/app/customer/track/page.tsx
"use client";

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
} from "lucide-react";

/* ----------------------------- Date formatter ----------------------------- */
const formatPH = (d?: string | number | Date | null) =>
  d
    ? new Intl.DateTimeFormat("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: "Asia/Manila",
      }).format(new Date(d))
    : "—";

/* ---------------------------------- Types --------------------------------- */
type ItemRow = {
  quantity: number;
  price: number;
  inventory?: {
    product_name?: string | null;
    category?: string | null;
    subcategory?: string | null;
    status?: string | null;
  } | null;
};

type OrderRow = {
  id: number;
  total_amount: number | null;
  status: string | null; // fallback only; prefer truck_deliveries.status
  truck_delivery_id?: number | null;
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
  date_received?: string | null;
  driver?: string | null;
  participants?: string[] | null;
};

/* ------------------------------- UI helpers ------------------------------- */
const DeliveryBadge = ({ status }: { status?: string | null }) => {
  const s = (status || "").trim().toLowerCase();

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

export default function TrackPage() {
  const [loading, setLoading] = useState(true);
  const [authEmail, setAuthEmail] = useState<string | null>(null);

  const [txns, setTxns] = useState<CustomerTx[]>([]);
  const [deliveriesById, setDeliveriesById] = useState<
    Record<number, Delivery>
  >({});

  // For realtime subscriptions
  const [orderIds, setOrderIds] = useState<number[]>([]);
  const [deliveryIds, setDeliveryIds] = useState<number[]>([]);
  const ordersSubKey = useRef<string>("");
  const deliveriesSubKey = useRef<string>("");

  // Expandable orders (orderId -> open?)
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const toggleExpanded = (id: number) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const hasData = useMemo(() => txns.length > 0, [txns.length]);

  /* -------------------------- Helper: fetch deliveries --------------------- */
  const fetchDeliveriesByIds = async (ids: number[]) => {
    if (!ids.length) return;
    const { data, error } = await supabase
      .from("truck_deliveries")
      .select("id, status, schedule_date, date_received, driver, participants")
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
            id,
            name,
            code,
            contact_person,
            email,
            phone,
            address,
            date,
            orders (
              id,
              total_amount,
              status,
              truck_delivery_id,
              order_items (
                quantity,
                price,
                inventory:inventory_id (
                  product_name,
                  category,
                  subcategory,
                  status
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

        // Collect order IDs and delivery IDs
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

        // Fetch initial delivery rows
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
        };

        const changedOrderId = newRow?.id;

        // Update local orders (status + delivery link)
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
                  }
                : o
            ),
          }))
        );

        // If order got linked to a delivery, fetch & subscribe that delivery
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
        {/* Title + subtitle (matches Product Catalog style) */}
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
            txns.map((t) => {
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

                    return (
                      <div key={o.id} className="px-5 pb-4">
                        {/* Clickable header to toggle details */}
                        <div
                          className="mt-2 flex items-center justify-between cursor-pointer hover:bg-gray-50 rounded-lg px-3 py-2"
                          onClick={() => toggleExpanded(o.id)}
                        >
                          <div className="text-sm font-semibold text-gray-800">
                            Order #{o.id}
                          </div>
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
                            {/* Items table */}
                            <div className="rounded-xl overflow-hidden ring-1 ring-gray-200 bg-white">
                              <table className="w-full text-sm">
                                <thead className="bg-gray-100">
                                  <tr className="text-gray-700">
                                    <th className="py-2.5 px-3 text-left font-semibold">
                                      Product
                                    </th>
                                    <th className="py-2.5 px-3 text-left font-semibold">
                                      Category
                                    </th>
                                    <th className="py-2.5 px-3 text-left font-semibold">
                                      Subcategory
                                    </th>
                                    <th className="py-2.5 px-3 text-left font-semibold">
                                      Qty
                                    </th>
                                    <th className="py-2.5 px-3 text-left font-semibold">
                                      Inv. Status
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(o.order_items ?? []).map((it, idx) => (
                                    <tr
                                      key={idx}
                                      className="border-t hover:bg-gray-50/60"
                                    >
                                      <td className="py-2.5 px-3">
                                        {it.inventory?.product_name ?? "—"}
                                      </td>
                                      <td className="py-2.5 px-3">
                                        {it.inventory?.category ?? "—"}
                                      </td>
                                      <td className="py-2.5 px-3">
                                        {it.inventory?.subcategory ?? "—"}
                                      </td>
                                      <td className="py-2.5 px-3">
                                        {it.quantity}
                                      </td>
                                      <td className="py-2.5 px-3">
                                        {it.inventory?.status ?? "—"}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            {/* Delivery details */}
                            {deliv && (
                              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
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
                      </div>
                    );
                  })}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
