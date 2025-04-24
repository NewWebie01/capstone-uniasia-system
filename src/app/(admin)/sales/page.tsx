"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import supabase from "@/config/supabaseClient";

// Inventory type definition
type InventoryItem = {
  id: number;
  product_name: string;
  category: string;
  quantity: number;
  unit: string;
  amount: number;
  sku: string;
};

type OrderItem = {
  item: InventoryItem;
  orderQuantity: number;
};

export default function SalesPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [orderQuantity, setOrderQuantity] = useState<number>(0);
  const [orderList, setOrderList] = useState<OrderItem[]>([]); // Track added items
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // Fetch inventory
  const fetchItems = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("inventory").select();
    if (error) {
      setFetchError("Error fetching inventory");
      console.error(error);
    } else {
      setItems(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const filteredItems = items.filter((item) =>
    item.product_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddToOrder = () => {
    if (
      !selectedItem ||
      orderQuantity <= 0 ||
      orderQuantity > selectedItem.quantity
    ) {
      alert("Please select a valid item and enter a valid quantity.");
      return;
    }

    // Check if item is already in the order list
    const existingOrderItem = orderList.find(
      (orderItem) => orderItem.item.id === selectedItem.id
    );

    if (existingOrderItem) {
      alert("This item is already in the order list.");
      return;
    }

    const newOrderItem: OrderItem = {
      item: selectedItem,
      orderQuantity,
    };

    setOrderList([...orderList, newOrderItem]);
    setOrderQuantity(0);
    setSelectedItem(null);
  };

  const handleRemoveFromOrder = (itemId: number) => {
    setOrderList(orderList.filter((orderItem) => orderItem.item.id !== itemId));
  };

  const handleSubmitOrder = async () => {
    const totalAmount = orderList.reduce(
      (total, orderItem) =>
        total + orderItem.item.amount * orderItem.orderQuantity,
      0
    );
    const dateSold = new Date().toLocaleString("en-PH", {
      dateStyle: "long",
      timeStyle: "short",
      hour12: true,
    });

    // Log the sale for each item
    for (let orderItem of orderList) {
      const { error: saleError } = await supabase.from("sales").insert([
        {
          item_id: orderItem.item.id,
          product_name: orderItem.item.product_name,
          quantity: orderItem.orderQuantity,
          total_amount: orderItem.item.amount * orderItem.orderQuantity,
          date_sold: dateSold,
        },
      ]);

      if (saleError) {
        console.error(saleError);
        alert("Error logging the sale.");
        return;
      }

      // Update inventory quantity
      const updatedQty = orderItem.item.quantity - orderItem.orderQuantity;
      const { error: updateError } = await supabase
        .from("inventory")
        .update({ quantity: updatedQty })
        .eq("id", orderItem.item.id);

      if (updateError) {
        console.error(updateError);
        alert("Error updating inventory.");
        return;
      }
    }

    setFeedbackMessage("Order placed successfully!");
    setOrderList([]); // Clear the order list
    await fetchItems();
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

      {feedbackMessage && (
        <div className="mb-4 text-green-600">{feedbackMessage}</div>
      )}

      {loading ? (
        <div>Loading...</div>
      ) : (
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
              {filteredItems.map((item) => (
                <tr key={item.id} className="border-b hover:bg-gray-100">
                  <td className="py-2 px-4">{item.product_name}</td>
                  <td className="py-2 px-4">{item.category}</td>
                  <td className="py-2 px-4">{item.quantity}</td>
                  <td className="py-2 px-4">{item.unit}</td>
                  <td className="py-2 px-4">₱{item.amount.toFixed(2)}</td>
                  <td className="py-2 px-4">
                    <button
                      className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600"
                      onClick={() => setSelectedItem(item)}
                    >
                      Add to Order
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedItem && (
        <motion.div
          className="p-6 bg-gray-100 rounded shadow-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <h2 className="text-xl font-bold mb-4">Add to Order</h2>
          <div className="mb-4">
            <strong>Product:</strong> {selectedItem.product_name}
          </div>
          <div className="mb-4">
            <strong>Price per unit:</strong> ₱{selectedItem.amount.toFixed(2)}
          </div>
          <label className="block mb-2">Quantity to Order</label>
          <input
            type="number"
            value={orderQuantity}
            onChange={(e) => setOrderQuantity(Number(e.target.value))}
            className="w-full mb-4 px-4 py-2 border rounded"
            min={1}
            max={selectedItem.quantity}
          />
          <button
            onClick={handleAddToOrder}
            className="bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600"
          >
            Add to Order
          </button>
        </motion.div>
      )}

      {orderList.length > 0 && (
        <div className="mt-6 p-6 bg-gray-100 rounded shadow-md">
          <h2 className="text-xl font-bold mb-4">Order Review</h2>
          <table className="min-w-full bg-white text-sm">
            <thead className="bg-[#ffba20] text-black text-left">
              <tr>
                <th className="py-2 px-4">Product Name</th>
                <th className="py-2 px-4">Quantity</th>
                <th className="py-2 px-4">Price</th>
                <th className="py-2 px-4">Total</th>
                <th className="py-2 px-4">Action</th>
              </tr>
            </thead>
            <tbody>
              {orderList.map((orderItem) => (
                <tr
                  key={orderItem.item.id}
                  className="border-b hover:bg-gray-100"
                >
                  <td className="py-2 px-4">{orderItem.item.product_name}</td>
                  <td className="py-2 px-4">{orderItem.orderQuantity}</td>
                  <td className="py-2 px-4">
                    ₱{orderItem.item.amount.toFixed(2)}
                  </td>
                  <td className="py-2 px-4">
                    ₱
                    {(orderItem.orderQuantity * orderItem.item.amount).toFixed(
                      2
                    )}
                  </td>
                  <td className="py-2 px-4">
                    <button
                      onClick={() => handleRemoveFromOrder(orderItem.item.id)}
                      className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4">
            <strong>Total Order Value:</strong> ₱
            {orderList
              .reduce(
                (total, orderItem) =>
                  total + orderItem.item.amount * orderItem.orderQuantity,
                0
              )
              .toFixed(2)}
          </div>
          <button
            onClick={handleSubmitOrder}
            className="bg-green-500 text-white py-2 px-4 rounded hover:bg-green-600 mt-4"
          >
            Submit Order
          </button>
        </div>
      )}
    </div>
  );
}
