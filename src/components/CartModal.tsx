// src/components/CartModal.tsx
"use client";
import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useCart } from "../context/CartContext";

export default function CartModal({ onClose }: { onClose?: () => void }) {
  const { cart, updateQty, removeItem, clearCart, cartCount, cartTotal } = useCart();
  const router = useRouter();

  const handleCheckout = () => {
    // go to final checkout page (you already have /customer/checkout)
    router.push("/customer/checkout");
    if (onClose) onClose();
  };

  if (!cart || cart.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
        <div className="bg-white rounded-lg w-full max-w-lg p-6 shadow">
          <div className="text-center">
            <div className="text-lg font-semibold mb-2">Cart</div>
            <div className="text-sm text-gray-500">Your cart is empty.</div>
            <div className="mt-4 flex justify-center gap-2">
              <Link href="/customer/product-catalog" className="px-4 py-2 bg-[#181918] text-white rounded">Shop Products</Link>
              <button onClick={() => onClose?.()} className="px-4 py-2 border rounded">Close</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl w-full max-w-4xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Your Cart ({cartCount})</h3>
          <div className="flex items-center gap-2">
            <button onClick={() => { clearCart(); toast.success("Cart cleared"); }} className="text-sm px-3 py-1 border rounded">Clear</button>
            <button onClick={() => onClose?.()} className="text-sm px-3 py-1 border rounded">Close</button>
          </div>
        </div>

        <div className="overflow-auto max-h-[60vh]">
          <table className="w-full text-sm">
            <thead className="text-left text-gray-600">
              <tr>
                <th className="py-2">Product</th>
                <th>Price</th>
                <th>Qty</th>
                <th>Line</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cart.map((ci) => (
                <tr key={ci.item.id} className="border-t">
                  <td className="py-2">
                    <div className="font-medium">{ci.item.product_name}</div>
                    <div className="text-xs text-gray-500">{ci.item.category}</div>
                  </td>
                  <td className="py-2">{Number(ci.item.unit_price || 0).toLocaleString("en-PH", { style: "currency", currency: "PHP" })}</td>
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <button onClick={() => updateQty(ci.item.id, Math.max(1, ci.quantity - 1))} className="px-2 py-1 border rounded">−</button>
                      <input value={ci.quantity} onChange={(e) => updateQty(ci.item.id, Math.max(1, Number(e.target.value) || 1))} className="w-16 text-center border rounded px-2 py-1" />
                      <button onClick={() => updateQty(ci.item.id, ci.quantity + 1)} className="px-2 py-1 border rounded">+</button>
                    </div>
                  </td>
                  <td className="py-2 font-medium">{Number(ci.item.unit_price || 0 * ci.quantity).toLocaleString("en-PH", { style: "currency", currency: "PHP" })}</td>
                  <td className="py-2">
                    <button onClick={() => removeItem(ci.item.id)} className="text-sm text-red-600">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-gray-600">Estimated total</div>
          <div className="text-lg font-semibold">{Number(cartTotal || 0).toLocaleString("en-PH", { style: "currency", currency: "PHP" })}</div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={() => router.push("/customer/product-catalog")} className="px-4 py-2 border rounded">Continue Shopping</button>
          <button onClick={handleCheckout} className="px-4 py-2 rounded bg-[#ffba20] text-black">Proceed to Checkout</button>
        </div>
      </div>
    </div>
  );
}
