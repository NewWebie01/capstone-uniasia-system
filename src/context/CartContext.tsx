// src/context/CartContext.tsx
"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

/* ----------------------------- Shared types ----------------------------- */
export type InventoryItem = {
  id: number;
  product_name: string;
  category?: string | null;
  subcategory?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  status?: string | null;
  image_url?: string | null;
  unit?: string | null;
  pieces_per_unit?: number | null;
  weight_per_piece_kg?: number | null;
};

export type CartItem = { item: InventoryItem; quantity: number };

type CartContextShape = {
  cart: CartItem[];
  addItem: (item: InventoryItem, qty?: number) => void;
  updateQty: (itemId: number, qty: number) => void;
  removeItem: (itemId: number) => void;
  clearCart: () => void;
  cartCount: number;
  cartTotal: number;
};

const CartContext = createContext<CartContextShape | null>(null);

const CART_STORAGE_KEY = "uniasia_cart_v1";

function loadCartFromStorage(): CartItem[] {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CartItem[];
  } catch {
    return [];
  }
}
function saveCartToStorage(cart: CartItem[]) {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  } catch {}
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>(() => {
    if (typeof window === "undefined") return [];
    return loadCartFromStorage();
  });

  // persist
  useEffect(() => {
    saveCartToStorage(cart);
  }, [cart]);

  const addItem = (item: InventoryItem, qty = 1) => {
    if (!item || !("id" in item)) return;
    setCart((prev) => {
      const existing = prev.find((c) => c.item.id === item.id);
      if (existing) {
        return prev.map((c) => (c.item.id === item.id ? { ...c, quantity: Math.max(1, c.quantity + qty) } : c));
      }
      // ensure quantity is at least 1
      return [...prev, { item, quantity: Math.max(1, qty) }];
    });
  };

  const updateQty = (itemId: number, qty: number) => {
    setCart((prev) => prev.map((c) => (c.item.id === itemId ? { ...c, quantity: Math.max(1, qty) } : c)));
  };

  const removeItem = (itemId: number) => {
    setCart((prev) => prev.filter((c) => c.item.id !== itemId));
  };

  const clearCart = () => setCart([]);

  const cartCount = useMemo(() => cart.reduce((s, c) => s + c.quantity, 0), [cart]);
  const cartTotal = useMemo(
    () =>
      cart.reduce((s, c) => {
        const price = Number(c.item.unit_price ?? 0);
        return s + price * c.quantity;
      }, 0),
    [cart]
  );

  const value: CartContextShape = {
    cart,
    addItem,
    updateQty,
    removeItem,
    clearCart,
    cartCount,
    cartTotal,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextShape {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
