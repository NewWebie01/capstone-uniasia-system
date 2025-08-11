// src/app/customer/page.tsx
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import type { RealtimeChannel } from "@supabase/supabase-js";
import supabase from "@/config/supabaseClient";

type InventoryItem = {
  id: number;
  product_name: string;
  category: string;
  subcategory: string;
  quantity: number;
  unit_price: number;
  status: string;
  date_added: string;
};

type CartItem = {
  item: InventoryItem;
  quantity: number;
};

type CustomerInfo = {
  id?: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  contact_person?: string;
  code?: string;
  area?: string;
  date?: string;
  transaction?: string;
  status?: "pending" | "completed" | "rejected";
  payment_type?: "Credit" | "Balance" | "Cash";
  customer_type?: "New Customer" | "Existing Customer";
};

function generateTransactionCode(): string {
  const date = new Date();
  const yyyymmdd = date.toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `TXN-${yyyymmdd}-${random}`;
}

export default function CustomerInventoryPage() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>(""); // "" = All

  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [orderQuantity, setOrderQuantity] = useState(1);
  const [cart, setCart] = useState<CartItem[]>([]);

  const [showCartPopup, setShowCartPopup] = useState(false);   // first modal
  const [showFinalPopup, setShowFinalPopup] = useState(false); // final confirm modal
  const [finalOrderDetails, setFinalOrderDetails] = useState<{
    customer: CustomerInfo;
    items: CartItem[];
  } | null>(null);

  const [customerInfo, setCustomerInfo] = useState<CustomerInfo>({
    name: "",
    email: "",
    phone: "",
    address: "",
    contact_person: "",
    code: "",
    area: "",
    payment_type: "Cash",
    customer_type: undefined,
  });

  // Load inventory + realtime updates
  const fetchInventory = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("inventory").select("*");
    if (error) {
      console.error("Error fetching inventory:", error.message);
      toast.error("Could not load inventory.");
    } else {
      setInventory(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchInventory();

    const channel: RealtimeChannel = supabase
      .channel("public:inventory")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inventory" },
        () => fetchInventory()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchInventory]);

  // Payment type logic
  useEffect(() => {
    if (customerInfo.customer_type === "New Customer") {
      setCustomerInfo((prev) => ({ ...prev, payment_type: "Cash" }));
    } else if (customerInfo.customer_type === "Existing Customer") {
      setCustomerInfo((prev) => ({
        ...prev,
        payment_type: prev.payment_type === "Credit" ? "Credit" : "Cash",
      }));
    }
  }, [customerInfo.customer_type]);

  // Add to cart flow
  const handleAddToCartClick = (item: InventoryItem) => {
    setSelectedItem(item);
    setOrderQuantity(1);
  };

  const addToCart = () => {
    if (!selectedItem) return;

    if (orderQuantity > selectedItem.quantity) {
      toast.error(`Cannot order more than available stock (${selectedItem.quantity})`);
      return;
    }

    if (cart.some((ci) => ci.item.id === selectedItem.id)) {
      toast.error("Item already in cart.");
      return;
    }

    setCart((prev) => [...prev, { item: selectedItem, quantity: orderQuantity }]);
    setSelectedItem(null);
    setOrderQuantity(1);
  };

  const removeFromCart = (itemId: number) => {
    setCart((prev) => prev.filter((ci) => ci.item.id !== itemId));
  };

  // Open first confirm modal
  const handleShowCart = () => {
    if (!customerInfo.code) {
      setCustomerInfo((prev) => ({ ...prev, code: generateTransactionCode() }));
    }
    setShowCartPopup(true);
  };

  // First modal "Submit Order" -> only open final confirmation (no DB write, no toast)
  const handleOpenFinalModal = () => {
    if (
      !customerInfo.name ||
      !customerInfo.email ||
      !customerInfo.phone ||
      !customerInfo.address ||
      !customerInfo.payment_type ||
      !customerInfo.code ||
      !customerInfo.customer_type
    ) {
      toast.error("Please complete all required customer fields.");
      return;
    }

    setFinalOrderDetails({ customer: customerInfo, items: cart });
    setShowCartPopup(false);
    setShowFinalPopup(true);
  };

  // Final modal "Confirm Order" -> actually insert to DB, then toast + reset
  const handleConfirmOrder = async () => {
    if (!finalOrderDetails) return;

    const { customer, items } = finalOrderDetails;

    // Duplicate code check
    const { data: existing } = await supabase
      .from("customers")
      .select("code")
      .eq("code", customer.code);

    if (existing && existing.length > 0) {
      toast.error("Duplicate transaction code generated. Please try again.");
      return;
    }

    const customerPayload: Partial<CustomerInfo> = {
      ...customer,
      date: new Date().toISOString(),
      status: "pending",
      transaction: items.map((ci) => `${ci.item.product_name} x${ci.quantity}`).join(", "),
    };

    try {
      // Insert customer
      const { data: cust, error: custErr } = await supabase
        .from("customers")
        .insert([customerPayload])
        .select()
        .single();
      if (custErr) throw custErr;

      // Insert order
      const customerId = cust.id;
      const totalAmount = items.reduce(
        (sum, ci) => sum + (ci.item.unit_price || 0) * ci.quantity,
        0
      );

      const { data: ord, error: ordErr } = await supabase
        .from("orders")
        .insert([{ customer_id: customerId, total_amount: totalAmount, status: "pending" }])
        .select()
        .single();
      if (ordErr) throw ordErr;

      // Insert order items
      const orderId = ord.id;
      const rows = items.map((ci) => ({
        order_id: orderId,
        inventory_id: ci.item.id,
        quantity: ci.quantity,
        price: ci.item.unit_price || 0,
      }));
      const { error: itemsErr } = await supabase.from("order_items").insert(rows);
      if (itemsErr) throw itemsErr;

      // Success → toast here only
      toast.success("Your order has been submitted successfully!");

      // Reset UI
      setShowFinalPopup(false);
      setFinalOrderDetails(null);
      setCart([]);
      setCustomerInfo({
        name: "",
        email: "",
        phone: "",
        address: "",
        contact_person: "",
        code: "",
        area: "",
        payment_type: "Cash",
        customer_type: undefined,
      });

      await fetchInventory();
    } catch (e: any) {
      console.error("Order submission error:", e.message);
      toast.error("Something went wrong. Please try again.");
    }
  };

  // Derived
  const totalItems = cart.reduce((sum, ci) => sum + ci.quantity, 0);

  // categories list for dropdown (from inventory)
  const categories = useMemo(
    () => Array.from(new Set(inventory.map((i) => i.category))).sort(),
    [inventory]
  );

  // combined filters
  const filteredInventory = inventory.filter((i) => {
    const matchesSearch =
      i.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.subcategory.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory = categoryFilter === "" || i.category === categoryFilter;

    return matchesSearch && matchesCategory;
  });

  return (
    <div className="p-4">
      <motion.h1 className="text-3xl font-bold mb-4">Product Catalog</motion.h1>

      {/* Controls: Search + Category Filter */}
      <div className="mb-4 flex flex-col sm:flex-row gap-3 sm:items-center">
        <input
          type="text"
          placeholder="Search by product, category, or subcategory..."
          className="border border-gray-300 rounded px-3 py-2 w-full sm:max-w-xs focus:outline-none focus:ring-2 focus:ring-yellow-500"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />

        <select
          className="border border-gray-300 rounded px-3 py-2 w-full sm:w-auto focus:outline-none focus:ring-2 focus:ring-yellow-500"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">All Categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat || "Uncategorized"}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p>Loading inventory...</p>
      ) : (
        <div className="overflow-x-auto rounded-lg shadow mb-6">
          <table className="w-full table-fixed bg-white text-sm">
            <thead className="bg-[#ffba20] text-black text-left">
              <tr>
                <th className="py-2 px-4 w-1/5">Product Name</th>
                <th className="py-2 px-4 w-1/5">Category</th>
                <th className="py-2 px-4 w-1/5">Subcategory</th>
                <th className="py-2 px-4 w-1/5">Status</th>
                <th className="py-2 px-4 w-1/5">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredInventory.map((item) => (
                <tr key={item.id} className="border-b hover:bg-gray-100">
                  <td className="py-2 px-4">{item.product_name}</td>
                  <td className="py-2 px-4">{item.category}</td>
                  <td className="py-2 px-4">{item.subcategory}</td>
                  <td className="py-2 px-4">{item.status}</td>
                  <td className="py-2 px-4">
                    <button
                      className="bg-[#ffba20] text-white px-3 py-1 text-sm rounded hover:bg-yellow-600"
                      onClick={() => handleAddToCartClick(item)}
                    >
                      Add to Cart
                    </button>
                  </td>
                </tr>
              ))}

              {filteredInventory.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-6 text-gray-500">
                    No products found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add to Cart Modal */}
      {selectedItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-white p-6 rounded shadow-lg max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">{selectedItem.product_name}</h2>
            <p>Category: {selectedItem.category}</p>
            <p>Subcategory: {selectedItem.subcategory}</p>
            <p>Status: {selectedItem.status}</p>
            <div className="mt-4">
              <label className="block mb-1">Quantity to Order</label>
              <input
                type="number"
                className="w-full border px-3 py-2 rounded"
                min={1}
                max={selectedItem.quantity}
                value={orderQuantity}
                onChange={(e) => setOrderQuantity(Number(e.target.value))}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setSelectedItem(null)}
                className="bg-gray-500 text-white px-4 py-2 rounded"
              >
                Cancel
              </button>
              <button
                onClick={addToCart}
                className="bg-[#ffba20] text-white px-4 py-2 rounded hover:bg-yellow-600"
              >
                Add to Cart
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cart Preview */}
      {cart.length > 0 && (
        <div className="mt-10 bg-gray-100 p-4 rounded shadow">
          <h2 className="text-xl font-bold mb-4">Cart</h2>
          <table className="w-full bg-white text-sm mb-4">
            <thead className="bg-[#ffba20] text-black text-left">
              <tr>
                <th className="py-2 px-4">Product</th>
                <th className="py-2 px-4">Category</th>
                <th className="py-2 px-4">Subcategory</th>
                <th className="py-2 px-4">Qty</th>
                <th className="py-2 px-4">Status</th>
                <th className="py-2 px-4">Remove</th>
              </tr>
            </thead>
            <tbody>
              {cart.map((ci) => (
                <tr key={ci.item.id} className="border-b">
                  <td className="py-2 px-4">{ci.item.product_name}</td>
                  <td className="py-2 px-4">{ci.item.category}</td>
                  <td className="py-2 px-4">{ci.item.subcategory}</td>
                  <td className="py-2 px-4">{ci.quantity}</td>
                  <td className="py-2 px-4">{ci.item.status}</td>
                  <td className="py-2 px-4">
                    <button
                      onClick={() => removeFromCart(ci.item.id)}
                      className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-between items-center">
            <div>Total Items: {totalItems}</div>
            <button
              className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
              onClick={handleShowCart}
            >
              Order Item
            </button>
          </div>
        </div>
      )}

      {/* First Confirm Order Modal */}
      {showCartPopup && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex justify-center items-center">
          <div className="bg-white p-6 rounded-none shadow w-full max-w-5xl space-y-4">
            <h2 className="text-xl font-bold">Confirm Order</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                placeholder="Customer Name"
                className="border px-3 py-2 rounded"
                value={customerInfo.name}
                onChange={(e) => setCustomerInfo({ ...customerInfo, name: e.target.value })}
              />
              <input
                type="email"
                placeholder="Email"
                className="border px-3 py-2 rounded"
                value={customerInfo.email}
                onChange={(e) => setCustomerInfo({ ...customerInfo, email: e.target.value })}
              />
              <input
                type="tel"
                placeholder="Phone"
                className="border px-3 py-2 rounded"
                value={customerInfo.phone}
                onChange={(e) => setCustomerInfo({ ...customerInfo, phone: e.target.value })}
              />
              <input
                placeholder="Address"
                className="border px-3 py-2 rounded"
                value={customerInfo.address}
                onChange={(e) => setCustomerInfo({ ...customerInfo, address: e.target.value })}
              />
              <input
                placeholder="Contact Person"
                className="border px-3 py-2 rounded"
                value={customerInfo.contact_person}
                onChange={(e) => setCustomerInfo({ ...customerInfo, contact_person: e.target.value })}
              />
              <input
                placeholder="Transaction Code"
                className="border px-3 py-2 rounded bg-gray-100 cursor-not-allowed"
                value={customerInfo.code || "Will be generated when you click 'Order Item'"}
                readOnly
              />
              <input
                placeholder="Area"
                className="border px-3 py-2 rounded"
                value={customerInfo.area}
                onChange={(e) => setCustomerInfo({ ...customerInfo, area: e.target.value })}
              />

              <div className="col-span-2">
                <label className="block mb-1">Customer Type</label>
                <select
                  className="border px-3 py-2 rounded w-full"
                  value={customerInfo.customer_type || ""}
                  onChange={(e) =>
                    setCustomerInfo({
                      ...customerInfo,
                      customer_type: e.target.value as "New Customer" | "Existing Customer",
                    })
                  }
                >
                  <option value="" disabled>
                    Select customer type
                  </option>
                  <option value="New Customer">New Customer</option>
                  <option value="Existing Customer">Existing Customer</option>
                </select>
              </div>

              <div className="col-span-2">
                <label className="block mb-1">Payment Type</label>
                <div className="flex gap-4">
                  {(customerInfo.customer_type === "Existing Customer"
                    ? ["Credit", "Balance"]
                    : ["Cash"]
                  ).map((type) => (
                    <label key={type} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="payment_type"
                        value={type}
                        checked={customerInfo.payment_type === type}
                        onChange={(e) =>
                          setCustomerInfo({
                            ...customerInfo,
                            payment_type: e.target.value as "Cash" | "Credit" | "Balance",
                          })
                        }
                      />
                      {type}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Cart in first modal */}
            <table className="w-full table-fixed text-sm bg-gray-100">
              <thead className="bg-gray-200">
                <tr>
                  <th className="py-2 px-3 text-left">Product</th>
                  <th className="py-2 px-3 text-left">Category</th>
                  <th className="py-2 px-3 text-left">Subcategory</th>
                  <th className="py-2 px-3 text-left">Qty</th>
                  <th className="py-2 px-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {cart.map((ci) => (
                  <tr key={ci.item.id} className="border-b">
                    <td className="py-2 px-3">{ci.item.product_name}</td>
                    <td className="py-2 px-3">{ci.item.category}</td>
                    <td className="py-2 px-3">{ci.item.subcategory}</td>
                    <td className="py-2 px-3">{ci.quantity}</td>
                    <td className="py-2 px-3">{ci.item.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowCartPopup(false)}
                className="bg-gray-500 text-white px-4 py-2 rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleOpenFinalModal}
                className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
              >
                Submit Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Final Confirmation Modal */}
      {showFinalPopup && finalOrderDetails && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex justify-center items-center">
          <div className="bg-white p-6 rounded-none shadow w-full max-w-4xl space-y-4">
            <h2 className="text-xl font-bold">Order Confirmation</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <div className="text-xs text-gray-500">Customer</div>
                <div className="font-medium">{finalOrderDetails.customer.name}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Transaction Code</div>
                <div className="font-medium">{finalOrderDetails.customer.code}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Date</div>
                <div className="font-medium">{new Date().toLocaleString()}</div>
              </div>
            </div>

            <table className="w-full table-fixed text-sm bg-gray-100">
              <thead className="bg-gray-200">
                <tr>
                  <th className="py-2 px-3 text-left">Product</th>
                  <th className="py-2 px-3 text-left">Category</th>
                  <th className="py-2 px-3 text-left">Subcategory</th>
                  <th className="py-2 px-3 text-left">Qty</th>
                  <th className="py-2 px-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {finalOrderDetails.items.map((ci) => (
                  <tr key={ci.item.id} className="border-b">
                    <td className="py-2 px-3">{ci.item.product_name}</td>
                    <td className="py-2 px-3">{ci.item.category}</td>
                    <td className="py-2 px-3">{ci.item.subcategory}</td>
                    <td className="py-2 px-3">{ci.quantity}</td>
                    <td className="py-2 px-3">{ci.item.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowFinalPopup(false)}
                className="bg-gray-500 text-white px-4 py-2 rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmOrder} // writes to DB + toast
                className="bg-[#ffba20] text-white px-4 py-2 rounded hover:bg-yellow-600"
              >
                Confirm Order
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
