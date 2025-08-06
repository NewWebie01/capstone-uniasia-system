"use client";

import { useEffect, useState } from "react";
import { BellIcon } from "@heroicons/react/24/solid";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export default function NotificationBell() {
  const [hasNewOrder, setHasNewOrder] = useState(false);
  const [latestOrder, setLatestOrder] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const supabase = createClientComponentClient();

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
          console.log("🔔 New order received:", payload);

          const { data, error } = await supabase
            .from("orders")
            .select(`
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
            `)
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

          setLatestOrder({
            customer_name: customer?.name,
            email: customer?.email,
            phone: customer?.phone,
            address: customer?.address,
            items,
          });

          setHasNewOrder(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  const handleClick = () => {
    setHasNewOrder(false);
    setIsModalOpen(true);
  };

  return (
    <>
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
        {hasNewOrder && (
          <span className="absolute top-1 right-1 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-white bg-red-600 rounded-full">
            🔴
          </span>
        )}
      </div>

      {isModalOpen && latestOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full shadow-lg">
            <h2 className="text-xl font-semibold mb-4">🛒 New Order Details</h2>
            <div className="mb-2"><strong>Name:</strong> {latestOrder.customer_name}</div>
            <div className="mb-2"><strong>Email:</strong> {latestOrder.email}</div>
            <div className="mb-2"><strong>Phone:</strong> {latestOrder.phone}</div>
            <div className="mb-4"><strong>Address:</strong> {latestOrder.address}</div>

            <h3 className="text-md font-semibold mb-2">📦 Ordered Items:</h3>
            <ul className="list-disc list-inside space-y-1 max-h-40 overflow-y-auto">
              {latestOrder.items.map((item: any, index: number) => (
                <li key={index}>
                  <strong>{item.product_name}</strong> — {item.quantity} pcs
                  ({item.category} / {item.subcategory})
                </li>
              ))}
            </ul>

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
