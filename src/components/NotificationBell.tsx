// src/components/NotificationBell.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { BellIcon } from "@heroicons/react/24/solid";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emit } from "@/utils/eventEmitter";

/* ----------------------------- Types ----------------------------- */
type NotificationRow = {
  id: string;
  type: string; // 'order' | 'payment' | 'expiration' | 'system' | ...
  title: string | null;
  message: string | null;
  related_id: string | null; // order_id, payment_id, or inventory_id (UI only)
  is_read: boolean; // UI field (maps to DB column "read")
  created_at: string; // ISO
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
    code?: string | null; // transaction code
  } | null;
  order_items: OrderItemFull[];
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
      return {
        icon: "🛒",
        label: "Order",
        badgeClass: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
        cardBorderClass: "border-l-4 border-blue-400",
      };
    case "payment":
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
    default:
      return {
        icon: "🔔",
        label: "System",
        badgeClass: "bg-gray-100 text-gray-700 ring-1 ring-gray-200",
        cardBorderClass: "border-l-4 border-gray-300",
      };
  }
}

/** Avoid dupes for same event in last 24h.
 *  For 'order' we dedupe by (type, order_id).
 *  For 'expiration' we dedupe by (type, item_id).
 *  Other types skip dedupe (safe default).
 */
async function upsertRecentNotification(
  supabase: SupabaseClient<any>,
  payload: Omit<NotificationRow, "id" | "is_read" | "created_at">
) {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const t = (payload.type || "").toLowerCase();
  let existing: { id: string } | null = null;

  if (t === "order" && payload.related_id) {
    const { data } = await supabase
      .from("system_notifications")
      .select("id")
      .eq("type", payload.type)
      .eq("order_id", payload.related_id) // dedupe by order id
      .gte("created_at", oneDayAgo)
      .limit(1)
      .maybeSingle();
    existing = (data as any) || null;
  } else if (t === "expiration" && payload.related_id) {
    const { data } = await supabase
      .from("system_notifications")
      .select("id")
      .eq("type", payload.type)
      .eq("item_id", Number(payload.related_id)) // dedupe by item id
      .gte("created_at", oneDayAgo)
      .limit(1)
      .maybeSingle();
    existing = (data as any) || null;
  }

  if (existing) return existing.id;

  // Build insert row for system_notifications
  const insertRow: Record<string, any> = {
    type: payload.type,
    title: payload.title,
    message: payload.message,
    read: false,
    source: "system",
    // map related_id smartly
  };

  if (t === "order" && payload.related_id) {
    insertRow.order_id = payload.related_id;
  } else if (t === "payment" && payload.related_id) {
    // no dedicated column; keep for UI via metadata
    insertRow.metadata = {
      ...(insertRow.metadata || {}),
      payment_id: payload.related_id,
    };
  } else if (t === "expiration" && payload.related_id) {
    insertRow.item_id = Number(payload.related_id);
  }

  const { data: inserted, error } = await supabase
    .from("system_notifications")
    .insert([insertRow])
    .select("id")
    .single();

  if (error) {
    console.error("Failed to insert system notification:", error.message);
    return null;
  }
  return inserted?.id ?? null;
}

/** Fetch a full order with FKs resolved (customers + items->inventory) */
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

  // order-details modal
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [orderModalLoading, setOrderModalLoading] = useState(false);
  const [orderModalData, setOrderModalData] = useState<OrderFull | null>(null);

  // Dedup for realtime orders
  const lastOrderId = useRef<string | null>(null);

  /* ---------- Load existing notifications on mount (ADMIN: system_notifications) ---------- */
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("system_notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (!error && data) {
        // Map DB read -> UI is_read and reconstruct related_id best-effort
        const mapped = (data as any[]).map((r) => {
          let related_id: string | null = null;
          if (r.order_id) related_id = String(r.order_id);
          else if (r.item_id) related_id = String(r.item_id);
          else if (r.metadata?.payment_id)
            related_id = String(r.metadata.payment_id);
          return {
            id: r.id,
            type: r.type,
            title: r.title,
            message: r.message,
            created_at: r.created_at,
            related_id,
            is_read: Boolean(r.read),
            user_email: r.user_email ?? null, // ignore if not present
          } as NotificationRow;
        });
        setNotifications(mapped);
      }
    })();
  }, [supabase]);

  /* ---------- Realtime: system_notifications (INSERT/UPDATE/DELETE) ---------- */
  useEffect(() => {
    const channel = supabase.channel("system_notifications_realtime");

    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "system_notifications" },
      (payload) => {
        if (payload.eventType === "INSERT") {
          const r: any = payload.new;
          const n: NotificationRow = {
            id: r.id,
            type: r.type,
            title: r.title,
            message: r.message,
            created_at: r.created_at,
            is_read: Boolean(r.read),
            related_id: r.order_id
              ? String(r.order_id)
              : r.item_id
              ? String(r.item_id)
              : r.metadata?.payment_id
              ? String(r.metadata.payment_id)
              : null,
            user_email: r.user_email ?? null,
          };
          setNotifications((prev) => [n, ...prev]);
        } else if (payload.eventType === "UPDATE") {
          const r: any = payload.new;
          const n: NotificationRow = {
            id: r.id,
            type: r.type,
            title: r.title,
            message: r.message,
            created_at: r.created_at,
            is_read: Boolean(r.read),
            related_id: r.order_id
              ? String(r.order_id)
              : r.item_id
              ? String(r.item_id)
              : r.metadata?.payment_id
              ? String(r.metadata.payment_id)
              : null,
            user_email: r.user_email ?? null,
          };
          setNotifications((prev) => prev.map((x) => (x.id === n.id ? n : x)));
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
  }, [supabase]);

  /* ---------- Realtime: orders INSERT -> create admin notification ---------- */
  useEffect(() => {
    const channel = supabase
      .channel("orders_channel_for_admin_bell")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        async (payload) => {
          const order = payload.new as { id: string; customer_id: string };
          if (lastOrderId.current === order.id) return;
          lastOrderId.current = order.id;

          const full = await fetchOrderFull(supabase, order.id);
          const custName = full?.customers?.name || "Customer";
          const items = full?.order_items?.length || 0;

          const title = "🛒 New Order Received";
          const code = full?.customers?.code;
          const msg = `${custName}${code ? ` • ${code}` : ""}: ${items} item${
            items === 1 ? "" : "s"
          }`;

          await upsertRecentNotification(supabase, {
            type: "order",
            title,
            message: msg,
            related_id: order.id, // map to system_notifications.order_id
            user_email: null,
          });

          // Optimistic UI (keeps your current behavior)
          setNotifications((prev) => [
            {
              id: crypto.randomUUID(),
              type: "order",
              title,
              message: msg,
              related_id: order.id,
              is_read: false,
              created_at: new Date().toISOString(),
              user_email: null,
            },
            ...prev,
          ]);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase]);

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
        await upsertRecentNotification(supabase, {
          type: "expiration",
          title: `⏰ Expiring soon: ${item.product_name}`,
          message: `${item.product_name} (${item.sku}) • ${item.quantity} ${
            item.unit ?? ""
          } • Exp: ${formatPHDate(item.expiration_date)}`,
          related_id: String(item.id), // map to system_notifications.item_id
          user_email: null,
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
  const openModal = () => {
    setIsModalOpen(true); // open only; don't auto-mark read
  };

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
      // already there -> ask page to scroll now
      setTimeout(() => emit("scroll-to-payment", paymentId), 50);
    } else {
      await router.push("/payments");
    }
  };

  const handleClickNotification = async (n: NotificationRow) => {
    await markOneRead(n.id);

    if (n.type === "order" && n.related_id) {
      setOrderModalOpen(true);
      setOrderModalLoading(true);
      const full = await fetchOrderFull(supabase, n.related_id);
      setOrderModalData(full);
      setOrderModalLoading(false);
      return;
    }

    if (n.type === "payment" && n.related_id) {
      // open the payments page and scroll/highlight the exact cheque row
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
          n.type === "order"
            ? "View Order Details"
            : n.type === "payment"
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

            {orderModalLoading ? (
              <div className="p-6">Loading…</div>
            ) : !orderModalData ? (
              <div className="p-6 text-sm text-red-600">Order not found.</div>
            ) : (
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
