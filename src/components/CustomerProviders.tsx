// src/components/CustomerProviders.tsx
"use client";

import React from "react";
import { CartProvider } from "@/context/CartContext";

export default function CustomerProviders({ children }: { children: React.ReactNode }) {
  return <CartProvider>{children}</CartProvider>;
}
