"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { BellIcon } from "@heroicons/react/24/solid";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { toast } from "sonner";
import { emit } from "@/utils/eventEmitter";

// --- Types ---
type OrderItem = {
  product_name: string;
  category: string;
  subcategory: string;
  quantity: number;
};

type Order = {
  id: string;
  customer_name: string;
  email: string;
  phone: string;
  address: string;
  items: OrderItem[];
  read?: boolean;
};

type ExpiringItem = {
  id: number;
  sku: string;
  product_name: string;
  quantity: number;
  unit: string;
  expiration_date: string;
};

// --- Helpers for persistent 1-day badge for expiring items ---
const EXP_NOTIF_KEY = "expiringNotifTimes";

function getExpiringNotifTimes(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(EXP_NOTIF_KEY) || "{}");
  } catch {
    return {};
  }
}

function setExpiringNotifTime(id: number, timestamp: number) {
  const all = getExpiringNotifTimes();
  all[id] = timestamp;
  localStorage.setItem(EXP_NOTIF_KEY, JSON.stringify(all));
}

function clearOldExpiringNotifs() {
  const all = getExpiringNotifTimes();
  const now = Date.now();
  let changed = false;
  for (const idStr of Object.keys(all)) {
    const time = all[idStr];
    if (now - Number(time) > 24 * 60 * 60 * 1000) {
      delete all[idStr];
      changed = true;
    }
  }
  if (changed) localStorage.setItem(EXP_NOTIF_KEY, JSON.stringify(all));
  return all;
}


function formatPHDate(d: string | Date) {
  // Display date only (no time), e.g. "Oct 13, 2025"
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit"
  });
}

// --- NotificationBell Component ---
export default function NotificationBell() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [expirations, setExpirations] = useState<ExpiringItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const supabase = createClientComponentClient();
  const router = useRouter();

  // Deduplication guard
  const lastOrderId = useRef<string | null>(null);

  // --- ORDERS: Real-time (existing logic) ---
  useEffect(() => {
    const channel = supabase
      .channel("orders_channel")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
        },
        async (payload) => {
          if (payload.new.id === lastOrderId.current) return;
          lastOrderId.current = payload.new.id;

          const { data, error } = await supabase
            .from("orders")
            .select(
              `
              id,
              customers (name, email, phone, address),
              order_items (
                quantity,
                inventory (
                  product_name,
                  category,
                  subcategory
                )
              )
            `
            )
            .eq("id", payload.new.id)
            .single();

          if (error) {
            console.error("❌ Error fetching order details:", error.message);
            return;
          }

          const customer = Array.isArray(data.customers)
            ? data.customers[0]
            : data.customers;

          const items = data.order_items.map((item: any) => ({
            product_name: item.inventory.product_name,
            category: item.inventory.category,
            subcategory: item.inventory.subcategory,
            quantity: item.quantity,
          }));

          const newOrder: Order = {
            id: data.id,
            customer_name: customer?.name,
            email: customer?.email,
            phone: customer?.phone,
            address: customer?.address,
            items,
            read: false,
          };

          setOrders((prev) => [newOrder, ...prev.slice(0, 4)]);
          toast.success("🛒 New order received!");
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  // --- EXPIRE: Fetch expiring inventory (within 7 days, PH time) ---
  // Helper to get today's and +7 day PH date in YYYY-MM-DD
  function toPHDateISO(date: Date) {
    const ph = new Date(date.toLocaleString("en-US", { timeZone: "Asia/Manila" }));
    return `${ph.getFullYear()}-${String(ph.getMonth() + 1).padStart(2, "0")}-${String(ph.getDate()).padStart(2, "0")}`;
  }

  const fetchExpirations = async () => {
    const todayPH = toPHDateISO(new Date());
    const in7PH = toPHDateISO(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    const { data, error } = await supabase
      .from("inventory")
      .select("id, sku, product_name, quantity, unit, expiration_date")
      .not("expiration_date", "is", null)
      .lte("expiration_date", in7PH)
      .gte("expiration_date", todayPH);
    if (error) return;

    // Load local 1-day expiring notifs
    const notifTimes = clearOldExpiringNotifs();
    const now = Date.now();

    // Show toast for new soon-to-expire, and update storage
    (data || []).forEach((item) => {
      if (!notifTimes[item.id]) {
        setExpiringNotifTime(item.id, now);
        toast.warning(
          `⏰ Expiring soon: ${item.product_name} (${item.sku}) on ${formatPHDate(item.expiration_date)}`
        );
      }
    });

    // Only keep in-bell expiring items for 1 day after detection
    const visibleExpirations = (data || []).filter(
      (item) => notifTimes[item.id] && now - notifTimes[item.id] <= 24 * 60 * 60 * 1000
    );
    setExpirations(visibleExpirations);
  };

  // Fetch on mount, and every 5 minutes
  useEffect(() => {
    fetchExpirations();
    const timer = setInterval(fetchExpirations, 5 * 60 * 1000); // every 5 min
    return () => clearInterval(timer);
  }, []);

  // --- NOTIF BELL BADGE ---
  const badgeCount = orders.filter((o) => !o.read).length + expirations.length;

  // --- Click = Mark all orders read, open modal ---
  const handleBellClick = () => {
    setOrders((prev) => prev.map((order) => ({ ...order, read: true })));
    setIsModalOpen(true);
  };

  // --- Click order: go to sales page and scroll ---
  const handleGoToSales = async (orderId: string) => {
    setOrders((prev) =>
      prev.map((order) =>
        order.id === orderId ? { ...order, read: true } : order
      )
    );
    setIsModalOpen(false);
    await router.push("/sales");
    setTimeout(() => {
      emit("scroll-to-order", orderId);
    }, 400);
  };

  return (
    <>
      {/* Notification Bell */}
      <div
        className="fixed top-16 right-12 z-50 bg-white shadow-lg rounded-full p-3 cursor-pointer transition-transform hover:scale-110"
        title="Notifications"
        onClick={handleBellClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <BellIcon
          className="h-5 w-5 transition-colors duration-200"
          style={{ color: isHovered ? "#ffba20" : "#181918" }}
        />
        {badgeCount > 0 && (
          <span className="absolute top-1 right-1 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-white bg-red-600 rounded-full">
            {badgeCount}
          </span>
        )}
      </div>

      {/* Notification Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-lg p-6 max-w-xl w-full shadow-lg max-h-[90vh] overflow-y-auto">
            {/* --- Expirations Section --- */}
            {expirations.length > 0 && (
              <div className="mb-6">
                <h2 className="text-lg font-bold mb-2 text-red-600">⏰ Expiring/Expired Items</h2>
                <ul className="list-disc list-inside text-sm space-y-1">
                  {expirations.map(item => (
                    <li key={item.id}>
                      <b>{item.product_name}</b> ({item.sku}) – <span className="text-red-600">
                        {formatPHDate(item.expiration_date)}
                      </span> &nbsp;
                      <span className="text-gray-600">
                        {item.quantity} {item.unit}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {/* --- Orders Section --- */}
            <h2 className="text-xl font-semibold mb-4">🛒 Recent Orders</h2>
            {orders.length === 0 ? (
              <div className="text-gray-500">No new orders</div>
            ) : (
              <div className="space-y-4">
                {orders.map((order) => (
                  <div
                    key={order.id}
                    onClick={() => handleGoToSales(order.id)}
                    className={`border border-gray-200 rounded p-4 transition-colors duration-300 cursor-pointer shadow-sm ${
                      order.read
                        ? "bg-white hover:bg-gray-50"
                        : "bg-blue-100 hover:bg-blue-200"
                    }`}
                    title="Click to go to Sales"
                  >
                    <div className="mb-1">
                      <strong>Name:</strong> {order.customer_name}
                    </div>
                    <div className="mb-1">
                      <strong>Email:</strong> {order.email}
                    </div>
                    <div className="mb-1">
                      <strong>Phone:</strong> {order.phone}
                    </div>
                    <div className="mb-2">
                      <strong>Address:</strong> {order.address}
                    </div>
                    <h3 className="font-medium mb-1">📦 Items:</h3>
                    <ul className="list-disc list-inside text-sm space-y-1 mb-2">
                      {order.items.map((item, idx) => (
                        <li key={idx}>
                          <strong>{item.product_name}</strong> — {item.quantity} pcs ({item.category} / {item.subcategory})
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-6 text-right">
              <button
                className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-800"
                onClick={() => setIsModalOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
