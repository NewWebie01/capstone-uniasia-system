// src/components/AddToCartModal.tsx
"use client";

import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { InventoryItem, useCart } from "@/context/CartContext"; // adjust path if your context path differs

type Props = {
  item: InventoryItem | null;
  onClose: () => void;
  initialQty?: number;
};

const MAX_QTY = 1000;
const clamp = (n: number) => Math.max(1, Math.min(MAX_QTY, Math.floor(n || 1)));

function formatPeso(n: number) {
  return (Number(n) || 0).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  });
}

export default function AddToCartModal({ item, onClose, initialQty = 1 }: Props) {
  const { addItem } = useCart();
  const [qty, setQty] = useState<number>(clamp(initialQty));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setQty(clamp(initialQty));
  }, [initialQty]);

  // If modal mounted without an item, render nothing (parent should avoid this, but we guard)
  if (!item) return null;

  const availableQty = Number(item.quantity ?? 0);
  const unitPrice = Number(item.unit_price ?? 0);

  const canAdd = () => {
    if (!item) return false;
    // if stock info exists (availableQty > 0) enforce it; otherwise allow (some DB rows may not carry quantity)
    if (availableQty > 0 && qty > availableQty) return false;
    if (qty < 1 || qty > MAX_QTY) return false;
    return true;
  };

  async function handleAdd() {
    if (!item) {
      toast.error("No item selected.");
      return;
    }

    if (qty > MAX_QTY) {
      setQty(MAX_QTY);
      toast.error(`Maximum ${MAX_QTY} per item.`);
      return;
    }

    if (availableQty > 0 && qty > availableQty) {
      toast.error("Requested quantity exceeds available stock.");
      return;
    }

    setLoading(true);
    try {
      addItem(item, qty);
      toast.success("Item added to cart.");
      onClose();
    } catch (err) {
      console.error("Add to cart failed:", err);
      toast.error("Failed to add to cart. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-semibold">{item.product_name}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-black" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3">
          <div className="flex items-center gap-4">
            <div className="w-28 h-20 bg-gray-100 flex items-center justify-center overflow-hidden rounded">
              {item.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.image_url} alt={item.product_name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-sm text-gray-400">No Image</span>
              )}
            </div>

            <div className="flex-1">
              <div className="text-sm text-gray-500">
                {item.category ?? "—"} • {item.subcategory ?? "General"}
              </div>

              <div className="font-semibold mt-1">
                {formatPeso(unitPrice)}
              </div>

              <div className={`text-xs mt-1 ${ (availableQty ?? 0) <= 0 ? "text-red-500" : "text-green-600" }`}>
                {item.status ?? (availableQty <= 0 ? "Out of stock" : "In Stock")}
              </div>
            </div>
          </div>

          <label className="text-sm">Quantity</label>
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1 border rounded"
              onClick={() => setQty((s) => clamp(s - 1))}
              aria-label="Decrease"
            >
              −
            </button>

            <input
              type="number"
              value={qty}
              min={1}
              max={MAX_QTY}
              onChange={(e) => {
                const v = Number(e.target.value || 1);
                setQty(clamp(Number.isFinite(v) ? v : 1));
              }}
              className="w-24 border rounded px-2 py-1 text-center"
            />

            <button
              className="px-3 py-1 border rounded"
              onClick={() => setQty((s) => clamp(s + 1))}
              aria-label="Increase"
            >
              +
            </button>

            <div className="text-xs text-gray-500 ml-auto">Max {MAX_QTY} per item</div>
          </div>

          {availableQty > 0 && (
            <div className="text-xs text-gray-500">
              Available: <span className="font-medium">{availableQty}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 mt-4">
            <button onClick={onClose} className="px-4 py-2 rounded border bg-white hover:bg-gray-50">Cancel</button>
            <button
              onClick={handleAdd}
              disabled={loading || !canAdd()}
              className={`px-4 py-2 rounded ${loading || !canAdd() ? "bg-gray-300 text-gray-600 cursor-not-allowed" : "bg-[#ffba20] text-black"}`}
            >
              {loading ? "Adding..." : "Add to Cart"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
