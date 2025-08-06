"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
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
  name: string;
  email: string;
  phone: string;
  address: string;
};

export default function CustomerInventoryPage() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCartPopup, setShowCartPopup] = useState(false);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo>({
    name: "",
    email: "",
    phone: "",
    address: "",
  });
  const [orderQuantity, setOrderQuantity] = useState(1);

  useEffect(() => {
    const fetchInventory = async () => {
      setLoading(true);
      const { data, error } = await supabase.from("inventory").select("*");
      if (error) {
        console.error("Error fetching inventory:", error.message);
      } else {
        setInventory(data);
      }
      setLoading(false);
    };

    fetchInventory();
  }, []);

  const handleAddToCartClick = (item: InventoryItem) => {
    setSelectedItem(item);
    setOrderQuantity(1);
  };

  const addToCart = () => {
    if (!selectedItem) return;

    if (orderQuantity > selectedItem.quantity) {
      alert(`Cannot order more than available stock (${selectedItem.quantity})`);
      return;
    }

    const alreadyInCart = cart.find((ci) => ci.item.id === selectedItem.id);
    if (alreadyInCart) {
      alert("Item already in cart.");
      return;
    }

    setCart([...cart, { item: selectedItem, quantity: orderQuantity }]);
    setSelectedItem(null);
    setOrderQuantity(1);
  };

  const updateCartQuantity = (itemId: number, newQty: number) => {
    setCart((prev) =>
      prev.map((ci) =>
        ci.item.id === itemId
          ? {
              ...ci,
              quantity:
                newQty > ci.item.quantity
                  ? ci.item.quantity
                  : newQty < 1
                  ? 1
                  : newQty,
            }
          : ci
      )
    );
  };

  const removeFromCart = (itemId: number) => {
    setCart((prev) => prev.filter((ci) => ci.item.id !== itemId));
  };

  const handleSubmitOrder = async () => {
    if (
      !customerInfo.name ||
      !customerInfo.email ||
      !customerInfo.phone ||
      !customerInfo.address
    ) {
      alert("Please fill in all customer details.");
      return;
    }

    try {
      const { data: customer, error: customerError } = await supabase
        .from("customers")
        .insert([customerInfo])
        .select()
        .single();

      if (customerError) throw customerError;
      const customerId = customer.id;

      const totalAmount = cart.reduce((sum, ci) => {
        const unitPrice = ci.item.unit_price || 0;
        return sum + unitPrice * ci.quantity;
      }, 0);

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert([
          {
            customer_id: customerId,
            total_amount: totalAmount,
            status: "pending",
          },
        ])
        .select()
        .single();

      if (orderError) throw orderError;
      const orderId = order.id;

      const items = cart.map((ci) => ({
        order_id: orderId,
        inventory_id: ci.item.id,
        quantity: ci.quantity,
        price: ci.item.unit_price || 0,
      }));

      const { error: itemError } = await supabase
        .from("order_items")
        .insert(items);
      if (itemError) throw itemError;

      alert("Order submitted successfully!");
      setCart([]);
      setCustomerInfo({ name: "", email: "", phone: "", address: "" });
      setShowCartPopup(false);
      setSelectedItem(null);

      const { data: updatedInventory, error: reloadError } = await supabase
        .from("inventory")
        .select("*");
      if (reloadError) throw reloadError;
      setInventory(updatedInventory);
    } catch (error: any) {
      console.error("Order submission error:", error.message);
      alert("Something went wrong. Please try again.");
    }
  };

  const totalItems = cart.reduce((sum, ci) => sum + ci.quantity, 0);

  return (
    <div className="p-4">
      <motion.h1 className="text-3xl font-bold mb-4">Product Catalog</motion.h1>

      {loading ? (
        <p>Loading inventory...</p>
      ) : (
        <div className="overflow-x-auto rounded-lg shadow mb-6">
          <table className="min-w-full bg-white text-sm">
            <thead className="bg-[#ffba20] text-black text-left">
              <tr>
                <th className="py-2 px-4">Product Name</th>
                <th className="py-2 px-4">Category</th>
                <th className="py-2 px-4">Subcategory</th>
                <th className="py-2 px-4">Quantity</th>
                <th className="py-2 px-4">Status</th>
                <th className="py-2 px-4">Action</th>
              </tr>
            </thead>
            <tbody>
              {inventory.map((item) => (
                <tr key={item.id} className="border-b hover:bg-gray-100">
                  <td className="py-2 px-4">{item.product_name}</td>
                  <td className="py-2 px-4">{item.category}</td>
                  <td className="py-2 px-4">{item.subcategory}</td>
                  <td className="py-2 px-4">{item.quantity}</td>
                  <td className="py-2 px-4">{item.status}</td>
                  <td className="py-2 px-4">
                    <button
                      className="bg-[#ffba20] text-white px-3 py-1 rounded hover:bg-yellow-600"
                      onClick={() => handleAddToCartClick(item)}
                    >
                      Add to Cart
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedItem && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex justify-center items-center">
          <div className="bg-white p-6 rounded shadow-lg max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">{selectedItem.product_name}</h2>
            <p>Category: {selectedItem.category}</p>
            <p>Subcategory: {selectedItem.subcategory}</p>
            <p>Status: {selectedItem.status}</p>
            <p>Available: {selectedItem.quantity}</p>
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

      {cart.length > 0 && (
        <div className="mt-10 bg-gray-100 p-4 rounded shadow">
          <h2 className="text-xl font-bold mb-4">Cart</h2>
          <table className="min-w-full bg-white text-sm">
            <thead className="bg-[#ffba20] text-black text-left">
              <tr>
                <th className="py-2 px-4">Product Name</th>
                <th className="py-2 px-4">Category</th>
                <th className="py-2 px-4">Subcategory</th>
                <th className="py-2 px-4">Quantity</th>
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
                  <td className="py-2 px-4">
                    <input
                      type="number"
                      min={1}
                      max={ci.item.quantity}
                      value={ci.quantity}
                      onChange={(e) =>
                        updateCartQuantity(ci.item.id, Number(e.target.value))
                      }
                      className="w-20 border px-2 py-1 rounded"
                    />
                  </td>
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

          <div className="mt-4 flex justify-between items-center">
            <div>Total Items: {totalItems}</div>
            <button
              className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
              onClick={() => setShowCartPopup(true)}
            >
              Order Item
            </button>
          </div>
        </div>
      )}

      {showCartPopup && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex justify-center items-center">
          <div className="bg-white p-6 rounded-lg shadow max-w-2xl w-full space-y-4">
            <h2 className="text-xl font-bold">Confirm Order</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                type="text"
                placeholder="Name"
                className="border px-3 py-2 rounded"
                value={customerInfo.name}
                onChange={(e) =>
                  setCustomerInfo({ ...customerInfo, name: e.target.value })
                }
              />
              <input
                type="email"
                placeholder="Email"
                className="border px-3 py-2 rounded"
                value={customerInfo.email}
                onChange={(e) =>
                  setCustomerInfo({ ...customerInfo, email: e.target.value })
                }
              />
              <input
                type="tel"
                placeholder="Phone"
                className="border px-3 py-2 rounded"
                value={customerInfo.phone}
                onChange={(e) =>
                  setCustomerInfo({ ...customerInfo, phone: e.target.value })
                }
              />
              <input
                type="text"
                placeholder="Address"
                className="border px-3 py-2 rounded col-span-2"
                value={customerInfo.address}
                onChange={(e) =>
                  setCustomerInfo({ ...customerInfo, address: e.target.value })
                }
              />
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm bg-gray-100">
                <thead className="bg-gray-200">
                  <tr>
                    <th className="py-2 px-3">Product</th>
                    <th className="py-2 px-3">Category</th>
                    <th className="py-2 px-3">Subcategory</th>
                    <th className="py-2 px-3">Qty</th>
                    <th className="py-2 px-3">Status</th>
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
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowCartPopup(false)}
                className="bg-gray-500 text-white px-4 py-2 rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitOrder}
                className="bg-[#ffba20] text-white px-4 py-2 rounded hover:bg-yellow-600"
              >
                Submit Order
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
