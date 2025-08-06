// app/sales/page.tsx
"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import supabase from "@/config/supabaseClient";

type InventoryItem = {
  id: number;
  product_name: string;
  category: string;
  quantity: number;
  unit: string;
  amount: number;
  sku: string;
};

type OrderWithDetails = {
  id: string;
  total_amount: number;
  status: string;
  date_created: string;
  customers: {
    name: string;
    email: string;
    phone: string;
    address: string;
  };
  order_items: {
    quantity: number;
    price: number;
    inventory: {
      product_name: string;
      category: string;
      unit_price: number;
      id: number;
      quantity: number;
    };
  }[];
};

type PickingOrder = {
  orderId: string;
  status: "accepted" | "rejected";
};

export default function SalesPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [orders, setOrders] = useState<OrderWithDetails[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderWithDetails | null>(
    null
  );
  const [editedQuantities, setEditedQuantities] = useState<number[]>([]);
  const [pickingStatus, setPickingStatus] = useState<PickingOrder[]>([]);

  const fetchItems = async () => {
    const { data } = await supabase.from("inventory").select();
    if (data) setItems(data);
  };

  const fetchOrders = async () => {
    const { data } = await supabase
      .from("orders")
      .select(
        `id, total_amount, status, date_created,
         customers ( name, email, phone, address ),
         order_items (
           quantity, price,
           inventory ( id, product_name, category, unit_price, quantity )
         )`
      )
      .order("date_created", { ascending: false });

    if (data) setOrders(data);
  };

  useEffect(() => {
    fetchItems();
    fetchOrders();
  }, []);

  const isOrderAccepted = (orderId: string) =>
    pickingStatus.find((p) => p.orderId === orderId && p.status === "accepted");

  const handleAcceptOrder = (order: OrderWithDetails) => {
    setPickingStatus((prev) => [
      ...prev,
      { orderId: order.id, status: "accepted" },
    ]);
    setEditedQuantities(order.order_items.map((item) => item.quantity));
    setSelectedOrder(order);
    setShowModal(true);
  };

  const handleRejectOrder = async (order: OrderWithDetails) => {
    setPickingStatus((prev) => [
      ...prev,
      { orderId: order.id, status: "rejected" },
    ]);

    await supabase
      .from("orders")
      .update({ status: "rejected" })
      .eq("id", order.id);
    await supabase.from("transactions").insert([
      {
        order_id: order.id,
        customer_name: order.customers.name,
        status: "rejected",
        date: new Date().toISOString(),
      },
    ]);

    fetchOrders();
  };

  const handleOrderComplete = async () => {
    if (!selectedOrder) return;

    for (let i = 0; i < selectedOrder.order_items.length; i++) {
      const oi = selectedOrder.order_items[i];
      const invId = oi.inventory.id;
      const currentQty = oi.inventory.quantity;
      const deductQty = editedQuantities[i];
      const remaining = currentQty - deductQty;

      if (remaining < 0) {
        alert(`Insufficient stock for ${oi.inventory.product_name}`);
        return;
      }

      await supabase
        .from("inventory")
        .update({ quantity: remaining })
        .eq("id", invId);

      await supabase.from("sales").insert([
        {
          inventory_id: invId,
          quantity_sold: deductQty,
          amount: deductQty * oi.price,
          date: new Date().toISOString(),
        },
      ]);
    }

    await supabase
      .from("orders")
      .update({ status: "completed" })
      .eq("id", selectedOrder.id);
    await supabase.from("transactions").insert([
      {
        order_id: selectedOrder.id,
        customer_name: selectedOrder.customers.name,
        status: "completed",
        date: new Date().toISOString(),
      },
    ]);

    alert("Order successfully completed.");
    setShowModal(false);
    setSelectedOrder(null);
    fetchOrders();
    fetchItems();
  };

  const handleCancel = (orderId: string) => {
    setPickingStatus((prev) => prev.filter((p) => p.orderId !== orderId));
  };

  const handleQuantityChange = (index: number, value: number) => {
    setEditedQuantities((prev) => {
      const newQuantities = [...prev];
      newQuantities[index] = value;
      return newQuantities;
    });
  };

  return (
    <div className="p-6">
      <motion.h1 className="text-3xl font-bold mb-4">
        Sales Processing
      </motion.h1>

      <input
        type="text"
        placeholder="Search products..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="mb-4 w-full md:w-1/3 px-4 py-2 border rounded"
      />

      {/* Inventory Table */}
      <div className="overflow-x-auto rounded-lg shadow mb-6">
        <table className="min-w-full bg-white text-sm">
          <thead className="bg-[#ffba20] text-black text-left">
            <tr>
              <th className="py-2 px-4">Product Name</th>
              <th className="py-2 px-4">Category</th>
              <th className="py-2 px-4">Stock</th>
              <th className="py-2 px-4">Unit</th>
              <th className="py-2 px-4">Price</th>
              <th className="py-2 px-4">Action</th>
            </tr>
          </thead>
          <tbody>
            {items
              .filter((item) =>
                item.product_name
                  .toLowerCase()
                  .includes(searchQuery.toLowerCase())
              )
              .map((item) => (
                <tr key={item.id} className="border-b hover:bg-gray-100">
                  <td className="py-2 px-4">{item.product_name}</td>
                  <td className="py-2 px-4">{item.category}</td>
                  <td className="py-2 px-4">{item.quantity}</td>
                  <td className="py-2 px-4">{item.unit}</td>
                  <td className="py-2 px-4">₱{item.amount.toLocaleString()}</td>
                  <td className="py-2 px-4">
                    <button
                      className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                      onClick={() => {
                        if (
                          selectedOrder &&
                          isOrderAccepted(selectedOrder.id)
                        ) {
                          setShowModal(true);
                        } else {
                          alert("Accept an order first.");
                        }
                      }}
                    >
                      Order Item
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Customer Orders */}
      <div className="mt-10">
        <h2 className="text-2xl font-bold mb-4">Customer Orders (Pending)</h2>
        {orders
          .filter((o) => o.status === "pending" || o.status === "accepted")
          .map((order) => {
            const isAccepted = isOrderAccepted(order.id);
            const isRejected = pickingStatus.find(
              (p) => p.orderId === order.id && p.status === "rejected"
            );

            return (
              <div
                key={order.id}
                className={`border p-4 mb-4 rounded shadow bg-white ${
                  isAccepted ? "border-green-600 border-2" : ""
                }`}
              >
                <p className="font-bold">Customer: {order.customers.name}</p>
                <p>Email: {order.customers.email}</p>
                <p>Phone: {order.customers.phone}</p>
                <p>Address: {order.customers.address}</p>
                <p>
                  Order Time:{" "}
                  {new Date(order.date_created).toLocaleString("en-PH", {
                    timeZone: "Asia/Manila",
                    dateStyle: "long",
                    timeStyle: "short",
                  })}
                </p>
                <ul className="mt-2 list-disc list-inside">
                  {order.order_items.map((item, idx) => (
                    <li key={idx}>
                      {item.inventory.product_name} - {item.quantity} pcs @ ₱
                      {item.price.toFixed(2)}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 font-bold">
                  Total: ₱{order.total_amount.toFixed(2)}
                </p>
                <p className="mb-2">Status: {order.status}</p>

                {order.status !== "completed" &&
                  order.status !== "rejected" && (
                    <div className="flex gap-2 mt-2">
                      {!isAccepted && !isRejected && (
                        <>
                          <button
                            onClick={() => handleAcceptOrder(order)}
                            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                          >
                            Accept Order
                          </button>
                          <button
                            onClick={() => handleRejectOrder(order)}
                            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
                          >
                            Reject Order
                          </button>
                        </>
                      )}
                      {isAccepted && (
                        <>
                          <button
                            onClick={handleOrderComplete}
                            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                          >
                            Order Complete
                          </button>
                          <button
                            onClick={() => handleCancel(order.id)}
                            className="bg-gray-400 text-white px-4 py-2 rounded hover:bg-gray-500"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                    </div>
                  )}
              </div>
            );
          })}
      </div>

      {/* Modal */}
      {showModal && selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-white p-6 rounded shadow-md w-full max-w-3xl flex justify-between">
            <div className="w-1/2 pr-4 border-r">
              <h2 className="font-bold text-lg mb-2">Customer Info</h2>
              <p>
                <strong>Name:</strong> {selectedOrder.customers.name}
              </p>
              <p>
                <strong>Email:</strong> {selectedOrder.customers.email}
              </p>
              <p>
                <strong>Phone:</strong> {selectedOrder.customers.phone}
              </p>
              <p>
                <strong>Address:</strong> {selectedOrder.customers.address}
              </p>
              <p>
                <strong>Date:</strong>{" "}
                {new Date(selectedOrder.date_created).toLocaleString("en-PH", {
                  timeZone: "Asia/Manila",
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </p>
              <p>
                <strong>Total:</strong> ₱{selectedOrder.total_amount.toFixed(2)}
              </p>
            </div>
            <div className="w-1/2 pl-4">
              <h2 className="font-bold text-lg mb-2">Picking List</h2>
              {selectedOrder.order_items.map((item, idx) => (
                <div key={idx} className="mb-2">
                  <p>{item.inventory.product_name}:</p>
                  <input
                    type="number"
                    min={1}
                    max={item.inventory.quantity}
                    value={editedQuantities[idx]}
                    onChange={(e) =>
                      handleQuantityChange(idx, Number(e.target.value))
                    }
                    className="border rounded px-2 py-1 w-24"
                  />
                </div>
              ))}
              <div className="mt-4 flex justify-end gap-2">
                <button
                  className="bg-gray-400 text-white px-4 py-2 rounded"
                  onClick={() => {
                    setShowModal(false);
                    setSelectedOrder(null);
                  }}
                >
                  OK
                </button>
                <button
                  className="bg-blue-600 text-white px-4 py-2 rounded"
                  onClick={handleOrderComplete}
                >
                  Order Complete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
