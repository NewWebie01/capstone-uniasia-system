"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BellIcon } from "@heroicons/react/24/solid";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { toast } from "sonner";

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

export default function NotificationBell() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const supabase = createClientComponentClient();
  const router = useRouter();

  // --- Realtime for new orders ---
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

  const handleClick = () => {
    setIsModalOpen(true);
  };

  // --- Click card: mark as read & go to sales page for order ---
  const handleGoToSales = (orderId: string) => {
    setOrders((prev) =>
      prev.map((order) =>
        order.id === orderId ? { ...order, read: true } : order
      )
    );
    setIsModalOpen(false);
    router.push(`/sales?order=${orderId}`);
    // For new tab: window.open(`/sales?order=${orderId}`, "_blank");
  };

  return (
    <>
      {/* Notification Bell */}
      <div
        className="fixed top-16 right-12 z-50 bg-white shadow-lg rounded-full p-3 cursor-pointer transition-transform hover:scale-110"
        title="Notifications"
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <BellIcon
          className="h-5 w-5 transition-colors duration-200"
          style={{ color: isHovered ? "#ffba20" : "#181918" }}
        />
        {orders.some((o) => !o.read) && (
          <span className="absolute top-1 right-1 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-white bg-red-600 rounded-full">
            {orders.filter((o) => !o.read).length}
          </span>
        )}
      </div>

      {/* Notification Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-lg p-6 max-w-xl w-full shadow-lg max-h-[90vh] overflow-y-auto">
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
                          <strong>{item.product_name}</strong> — {item.quantity}{" "}
                          pcs ({item.category} / {item.subcategory})
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
