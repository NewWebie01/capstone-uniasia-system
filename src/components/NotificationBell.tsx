// src/components/NotificationBell.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { BellIcon } from "@heroicons/react/24/solid";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emit } from "@/utils/eventEmitter";
import { toast } from "sonner";

/* ----------------------------- Types ----------------------------- */
type NotificationRow = {
  id: string;
  type: string;
  title: string | null;
  message: string | null;
  related_id: string | null;
  is_read: boolean;
  created_at: string;
  user_email?: string | null;
};

type ExpiringItem = {
  id: number;
  sku: string;
  product_name: string;
  quantity: number;
  unit: string | null;
  expiration_date: string;
};

type OrderItemFull = {
  quantity: number;
  price: number | null;
  inventory: {
    id: number;
    product_name: string;
    category: string;
    subcategory: string;
    unit_price: number | null;
    unit: string | null;
  } | null;
};

type OrderFull = {
  id: string;
  total_amount: number | null;
  status: string | null;
  date_created: string | null;
  date_completed: string | null;
  salesman: string | null;
  terms: string | null;
  po_number: string | null;
  customers: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    code?: string | null;
  } | null;
  order_items: OrderItemFull[];
};

/* ----------------------------- Config ----------------------------- */
/** Visible types for the Admin bell UI */
const VISIBLE_TYPES = new Set([
  "order",
  "order_created",
  "order_completed",
  "order_approved",
  "payment",
  "payment_received",
  "expiration",
  "delivery_to_ship",
  "delivery_to_receive",
  "delivery_delivered",
]);

/** When collapsing duplicates, prefer higher number */
const TYPE_PRIORITY: Record<string, number> = {
  order: 3,
  order_created: 2,
  order_approved: 2,
  order_completed: 2,
  payment_received: 3,
  payment: 2,
  expiration: 1,
  delivery_delivered: 2,
  delivery_to_receive: 2,
  delivery_to_ship: 1,
};

/* ----------------------------- Helpers ----------------------------- */
function toPHDateOnlyISO(date: Date) {
  const ph = new Date(
    date.toLocaleString("en-US", { timeZone: "Asia/Manila" })
  );
  const yyyy = ph.getFullYear();
  const mm = String(ph.getMonth() + 1).padStart(2, "0");
  const dd = String(ph.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatPHDate(d?: string | Date | null) {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Manila",
  });
}

function kindMeta(type?: string) {
  switch ((type || "").toLowerCase()) {
    case "order":
    case "order_created":
    case "order_completed":
    case "order_approved":
      return {
        icon: "🛒",
        label: "Order",
        badgeClass: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
        cardBorderClass: "border-l-4 border-blue-400",
      };
    case "payment":
    case "payment_received":
      return {
        icon: "💳",
        label: "Payment",
        badgeClass: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
        cardBorderClass: "border-l-4 border-emerald-400",
      };
    case "expiration":
      return {
        icon: "⏰",
        label: "Expiring",
        badgeClass: "bg-orange-50 text-orange-700 ring-1 ring-orange-200",
        cardBorderClass: "border-l-4 border-orange-400",
      };
    case "delivery_to_ship":
    case "delivery_to_receive":
    case "delivery_delivered":
      return {
        icon: "🚚",
        label: "Delivery",
        badgeClass: "bg-purple-50 text-purple-700 ring-1 ring-purple-200",
        cardBorderClass: "border-l-4 border-purple-400",
      };
    default:
      return {
        icon: "🔔",
        label: "System",
        badgeClass: "bg-gray-100 text-gray-700 ring-1 ring-gray-200",
        cardBorderClass: "border-l-4 border-gray-300",
      };
  }
}

/** Canonical key for dedupe across different types representing same event */
function canonicalKeyFromSystemRow(r: any): string {
  if (r.order_id) return `order:${r.order_id}`;
  if (r.metadata?.payment_id) return `payment:${String(r.metadata.payment_id)}`;
  if (r.item_id) return `expiration:${r.item_id}`;
  return `${String(r.type || "system").toLowerCase()}:${r.id}`;
}

/** Normalize a system row to the UI NotificationRow */
function normalizeSystemRow(r: any): NotificationRow {
  let related_id: string | null = null;
  if (r.order_id) related_id = String(r.order_id);
  else if (r.item_id) related_id = String(r.item_id);
  else if (r.metadata?.payment_id) related_id = String(r.metadata.payment_id);

  return {
    id: r.id,
    type: r.type,
    title: r.title,
    message: r.message,
    created_at: r.created_at,
    related_id,
    is_read: Boolean(r.read),
    user_email: r.user_email ?? null,
  };
}

/** Choose which row wins when keys collide (by priority then recency) */
function choosePreferred(a: any, b: any) {
  const ta = String(a.type || "").toLowerCase();
  const tb = String(b.type || "").toLowerCase();
  const pa = TYPE_PRIORITY[ta] ?? 0;
  const pb = TYPE_PRIORITY[tb] ?? 0;
  if (pa !== pb) return pa > pb ? a : b;
  // tie-breaker: newer created_at wins
  const da = new Date(a.created_at).getTime();
  const db = new Date(b.created_at).getTime();
  return db > da ? b : a;
}

/** Only used for expiration scans (orders/payments come from server) */
async function upsertRecentExpiration(
  supabase: SupabaseClient<any>,
  payload: { item_id: number; title: string; message: string }
) {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: existing } = await supabase
    .from("system_notifications")
    .select("id")
    .eq("type", "expiration")
    .eq("item_id", payload.item_id)
    .gte("created_at", oneDayAgo)
    .limit(1)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: inserted, error } = await supabase
    .from("system_notifications")
    .insert([
      {
        type: "expiration",
        title: payload.title,
        message: payload.message,
        item_id: payload.item_id,
        read: false,
        source: "system",
      },
    ])
    .select("id")
    .single();

  if (error) {
    console.error("Failed to insert system notification:", error.message);
    return null;
  }
  return inserted?.id ?? null;
}

async function fetchOrderFull(
  supabase: SupabaseClient<any>,
  orderId: string
): Promise<OrderFull | null> {
  const { data, error } = await supabase
    .from("orders")
    .select(
      `
      id, total_amount, status, date_created, date_completed, salesman, terms, po_number,
      customers:customer_id ( id, name, email, phone, address, code),
      order_items (
        quantity, price,
        inventory:inventory_id ( id, product_name, category, subcategory, unit_price, unit )
      )
    `
    )
    .eq("id", orderId)
    .single();

  if (error || !data) {
    console.error("fetchOrderFull error:", error?.message);
    return null;
  }
  return data as unknown as OrderFull;
}

/* ========================= Component ========================= */
export default function NotificationBell() {
  const supabase = createClientComponentClient() as SupabaseClient<any>;
  const router = useRouter();
  const pathname = usePathname();

  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [orderModalLoading, setOrderModalLoading] = useState(false);
  const [orderModalData, setOrderModalData] = useState<OrderFull | null>(null);

  /** Keys we've already displayed (order:<id>, payment:<id>, expiration:<id>) */
  const seenKeysRef = useRef<Set<string>>(new Set());

  /* ---------- Load existing (filter + collapse duplicates by canonical key) ---------- */
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("system_notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      if (!error && data) {
        // collapse duplicates by canonical key
        const bucket = new Map<string, any>();
        for (const r of data as any[]) {
          const tLower = String(r.type || "").toLowerCase();
          if (!VISIBLE_TYPES.has(tLower)) continue;

          const key = canonicalKeyFromSystemRow(r);
          const existing = bucket.get(key);
          if (!existing) {
            bucket.set(key, r);
          } else {
            bucket.set(key, choosePreferred(existing, r));
          }
        }

        const finalRows = Array.from(bucket.values()).sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        // seed dedupe set and map to UI rows
        const mapped = finalRows.map((r) => {
          const key = canonicalKeyFromSystemRow(r);
          seenKeysRef.current.add(key);
          return normalizeSystemRow(r);
        });

        setNotifications(mapped);
      }
    })();
  }, [supabase]);

  /* ---------- Realtime (filter + canonical dedupe) + toasts ---------- */
  useEffect(() => {
    const channel = supabase.channel("system_notifications_realtime");
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "system_notifications" },
      (payload) => {
        if (payload.eventType === "INSERT") {
          const r: any = payload.new;
          const tLower = String(r.type || "").toLowerCase();
          if (!VISIBLE_TYPES.has(tLower)) return;

          const key = canonicalKeyFromSystemRow(r);
          if (seenKeysRef.current.has(key)) return; // <- stop 2nd copy (e.g., order + order_created)
          seenKeysRef.current.add(key);

          const n = normalizeSystemRow(r);
          setNotifications((prev) => [n, ...prev]);

          // Toasts fire only once per key (first time we see it)
          if (key.startsWith("order:")) {
            toast.success(n.title ?? "New Order", {
              description: n.message ?? undefined,
              action: {
                label: "Open",
                onClick: async () => {
                  if (n.related_id) {
                    setOrderModalOpen(true);
                    setOrderModalLoading(true);
                    const full = await fetchOrderFull(supabase, n.related_id);
                    setOrderModalData(full);
                    setOrderModalLoading(false);
                  }
                },
              },
            });
          } else if (key.startsWith("payment:")) {
            toast.success(n.title ?? "Payment Received", {
              description: n.message ?? undefined,
              action: {
                label: "Payments",
                onClick: async () => {
                  try {
                    if (n.related_id)
                      sessionStorage.setItem(
                        "scroll-to-payment-id",
                        n.related_id
                      );
                  } catch {}
                  if (pathname === "/payments") {
                    setTimeout(
                      () => emit("scroll-to-payment", n.related_id || ""),
                      50
                    );
                  } else {
                    await router.push("/payments");
                  }
                },
              },
            });
          }
        } else if (payload.eventType === "UPDATE") {
          const r: any = payload.new;
          const tLower = String(r.type || "").toLowerCase();
          if (!VISIBLE_TYPES.has(tLower)) return;

          setNotifications((prev) =>
            prev.map((x) => (x.id === r.id ? normalizeSystemRow(r) : x))
          );
        } else if (payload.eventType === "DELETE") {
          const r: any = payload.old;
          setNotifications((prev) => prev.filter((x) => x.id !== r.id));
        }
      }
    );
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, pathname, router]);

  /* ---------- Expiring items scanner (every 5 min) ---------- */
  useEffect(() => {
    const scan = async () => {
      const todayPH = toPHDateOnlyISO(new Date());
      const in7PH = toPHDateOnlyISO(
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      );

      const { data, error } = await supabase
        .from("inventory")
        .select("id, sku, product_name, quantity, unit, expiration_date")
        .not("expiration_date", "is", null)
        .lte("expiration_date", in7PH)
        .gte("expiration_date", todayPH);

      if (!data || error) return;
      const items = data as unknown as ExpiringItem[];

      for (const item of items) {
        await upsertRecentExpiration(supabase, {
          item_id: item.id,
          title: `⏰ Expiring soon: ${item.product_name}`,
          message: `${item.product_name} (${item.sku}) • ${item.quantity} ${
            item.unit ?? ""
          } • Exp: ${formatPHDate(item.expiration_date)}`,
        });
      }
    };

    scan();
    const timer = setInterval(scan, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [supabase]);

  /* ---------- Badge & groups ---------- */
  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.is_read).length,
    [notifications]
  );

  const grouped = useMemo(() => {
    const today = new Date().toLocaleDateString("en-PH", {
      timeZone: "Asia/Manila",
    });
    const todayList: NotificationRow[] = [];
    const earlierList: NotificationRow[] = [];
    for (const n of notifications) {
      const day = new Date(n.created_at).toLocaleDateString("en-PH", {
        timeZone: "Asia/Manila",
      });
      (day === today ? todayList : earlierList).push(n);
    }
    return { todayList, earlierList };
  }, [notifications]);

  /* ---------- Actions ---------- */
  const openModal = () => setIsModalOpen(true);

  const markOneRead = async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    await supabase
      .from("system_notifications")
      .update({ read: true })
      .eq("id", id);
  };

  const goToPayments = async (paymentId: string) => {
    try {
      sessionStorage.setItem("scroll-to-payment-id", paymentId);
    } catch {}
    if (pathname === "/payments") {
      setTimeout(() => emit("scroll-to-payment", paymentId), 50);
    } else {
      await router.push("/payments");
    }
  };

  const handleClickNotification = async (n: NotificationRow) => {
    await markOneRead(n.id);

    const t = n.type.toLowerCase();
    if (t.startsWith("order") && n.related_id) {
      setOrderModalOpen(true);
      setOrderModalLoading(true);
      const full = await fetchOrderFull(supabase, n.related_id);
      setOrderModalData(full);
      setOrderModalLoading(false);
      return;
    }

    if (t.startsWith("payment") && n.related_id) {
      await goToPayments(n.related_id);
      setIsModalOpen(false);
      return;
    }
  };

  const clearAll = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await supabase
      .from("system_notifications")
      .update({ read: true })
      .eq("read", false);
  };

  const handleOpenInSales = async () => {
    const id = orderModalData?.id;
    if (!id) return;

    try {
      sessionStorage.setItem("scroll-to-order-id", id);
    } catch {}

    setOrderModalOpen(false);
    setOrderModalData(null);

    if (pathname === "/sales") {
      setTimeout(() => emit("scroll-to-order", id), 50);
      return;
    }
    await router.push("/sales");
  };

  /* ============================== UI ============================== */
  const renderNotifItem = (n: NotificationRow) => {
    const meta = kindMeta(n.type);
    return (
      <li
        key={n.id}
        onClick={() => handleClickNotification(n)}
        className={[
          "border rounded p-3 cursor-pointer transition-colors",
          meta.cardBorderClass,
          n.is_read
            ? "bg-white hover:bg-gray-50 text-gray-900"
            : "bg-yellow-50 hover:bg-yellow-100 text-yellow-900 border-yellow-200",
        ].join(" ")}
        title={
          n.type.toLowerCase().startsWith("order")
            ? "View Order Details"
            : n.type.toLowerCase().startsWith("payment")
            ? "Open Payment"
            : undefined
        }
      >
        <div className="flex items-center justify-between">
          <span
            className={[
              "inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full",
              n.is_read
                ? meta.badgeClass
                : "bg-yellow-100 text-yellow-800 ring-1 ring-yellow-200",
            ].join(" ")}
          >
            <span>{meta.icon}</span>
            <span className="text-inherit">{meta.label}</span>
          </span>
        </div>

        <div className="mt-1 font-medium">{n.title || "(no title)"}</div>
        <div
          className={[
            "text-sm",
            n.is_read ? "text-gray-700" : "text-yellow-900 font-medium",
          ].join(" ")}
        >
          {n.message}
        </div>
        <div
          className={[
            "text-xs mt-1",
            n.is_read ? "text-gray-400" : "text-yellow-700",
          ].join(" ")}
        >
          {formatPHDate(n.created_at)}
        </div>
      </li>
    );
  };

  return (
    <>
      {/* Floating Bell */}
      <div
        className="fixed top-16 right-12 z-50 bg-white shadow-lg rounded-full p-3 cursor-pointer transition-transform hover:scale-110"
        title="Notifications"
        onClick={openModal}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <BellIcon
          className="h-5 w-5 transition-colors duration-200"
          style={{ color: isHovered ? "#ffba20" : "#181918" }}
        />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-white bg-red-600 rounded-full">
            {unreadCount}
          </span>
        )}
      </div>

      {/* Main Notifications Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg p-6 w-full max-w-xl shadow-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Notifications</h2>
              <div className="flex gap-2">
                <button
                  className="px-3 py-1.5 text-sm rounded bg-gray-100 hover:bg-gray-200"
                  onClick={clearAll}
                  title="Mark all as read"
                >
                  Mark all read
                </button>
                <button
                  className="px-3 py-1.5 text-sm rounded bg-gray-800 text-white hover:bg-gray-900"
                  onClick={() => setIsModalOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>

            {/* Today */}
            {grouped.todayList.length > 0 && (
              <>
                <div className="text-xs font-semibold uppercase text-gray-500 mb-2">
                  Today
                </div>
                <ul className="space-y-2 mb-4">
                  {grouped.todayList.map(renderNotifItem)}
                </ul>
              </>
            )}

            {/* Earlier */}
            <div className="text-xs font-semibold uppercase text-gray-500 mb-2">
              Earlier
            </div>
            {grouped.earlierList.length === 0 ? (
              <div className="text-gray-500 text-sm">
                No earlier notifications
              </div>
            ) : (
              <ul className="space-y-2">
                {grouped.earlierList.map(renderNotifItem)}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ==================== Order Details Modal ==================== */}
      {orderModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-auto shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">Order Details</h3>
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-200">
                  🛒 Order
                </span>
              </div>
              <div className="flex gap-2">
                {orderModalData?.id && (
                  <button
                    className="px-3 py-1.5 text-sm rounded bg-gray-100 hover:bg-gray-200"
                    onClick={handleOpenInSales}
                    title="Open in Sales"
                  >
                    Open in Sales
                  </button>
                )}
                <button
                  className="px-3 py-1.5 text-sm rounded bg-gray-800 text-white hover:bg-gray-900"
                  onClick={() => {
                    setOrderModalOpen(false);
                    setOrderModalData(null);
                  }}
                >
                  Close
                </button>
              </div>
            </div>

            {!orderModalData && !orderModalLoading && (
              <div className="p-6 text-sm text-red-600">Order not found.</div>
            )}
            {orderModalLoading && <div className="p-6">Loading…</div>}

            {orderModalData && (
              <div className="p-6 space-y-4">
                {/* Header facts */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <div className="text-xs text-gray-500">
                      Transaction Code
                    </div>
                    <div className="font-mono text-sm">
                      {orderModalData.customers?.code ?? "—"}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500">Status</div>
                    <div className="font-medium">
                      {orderModalData.status ?? "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Date Created</div>
                    <div className="font-medium">
                      {orderModalData.date_created
                        ? new Date(orderModalData.date_created).toLocaleString(
                            "en-PH",
                            { timeZone: "Asia/Manila" }
                          )
                        : "—"}
                    </div>
                  </div>
                </div>

                {/* Customer */}
                <div className="rounded-lg border">
                  <div className="px-4 py-2 border-b bg-gray-50 text-sm font-medium">
                    Customer
                  </div>
                  <div className="p-4 text-sm grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div>
                      <div className="text-xs text-gray-500">Name</div>
                      <div className="font-medium">
                        {orderModalData.customers?.name ?? "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Email</div>
                      <div>{orderModalData.customers?.email ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Phone</div>
                      <div>{orderModalData.customers?.phone ?? "—"}</div>
                    </div>
                    <div className="md:col-span-2">
                      <div className="text-xs text-gray-500">Address</div>
                      <div className="break-words">
                        {orderModalData.customers?.address ?? "—"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Items */}
                <div className="rounded-lg border overflow-hidden">
                  <div className="px-4 py-2 border-b bg-gray-50 text-sm font-medium">
                    Items
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-3 py-2 text-left">Product</th>
                          <th className="px-3 py-2 text-left">Category</th>
                          <th className="px-3 py-2 text-left">Subcategory</th>
                          <th className="px-3 py-2 text-left">Unit</th>
                          <th className="px-3 py-2 text-right">Unit Price</th>
                          <th className="px-3 py-2 text-right">Qty</th>
                          <th className="px-3 py-2 text-right">Line Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orderModalData.order_items.map((oi, idx) => {
                          const p = oi.inventory;
                          const unitPrice = Number(
                            p?.unit_price ?? oi.price ?? 0
                          );
                          const lineTotal =
                            unitPrice * Number(oi.quantity ?? 0);
                          return (
                            <tr key={idx} className="border-t">
                              <td className="px-3 py-2">
                                {p?.product_name ?? "—"}
                              </td>
                              <td className="px-3 py-2">
                                {p?.category ?? "—"}
                              </td>
                              <td className="px-3 py-2">
                                {p?.subcategory ?? "—"}
                              </td>
                              <td className="px-3 py-2">{p?.unit ?? "—"}</td>
                              <td className="px-3 py-2 text-right">
                                {new Intl.NumberFormat("en-PH", {
                                  style: "currency",
                                  currency: "PHP",
                                  maximumFractionDigits: 2,
                                }).format(unitPrice)}
                              </td>
                              <td className="px-3 py-2 text-right">
                                {oi.quantity}
                              </td>
                              <td className="px-3 py-2 text-right">
                                {new Intl.NumberFormat("en-PH", {
                                  style: "currency",
                                  currency: "PHP",
                                  maximumFractionDigits: 2,
                                }).format(lineTotal)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t bg-gray-50">
                          <td className="px-3 py-2 text-right" colSpan={6}>
                            <span className="text-gray-600 mr-2">Total:</span>
                          </td>
                          <td className="px-3 py-2 text-right font-semibold">
                            {new Intl.NumberFormat("en-PH", {
                              style: "currency",
                              currency: "PHP",
                              maximumFractionDigits: 2,
                            }).format(Number(orderModalData.total_amount ?? 0))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
