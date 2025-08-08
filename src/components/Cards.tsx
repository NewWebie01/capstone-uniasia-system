// components/Cards.tsx
"use client";

import React, { useState, useEffect } from "react";
import {
  FaDollarSign,
  FaExclamationTriangle,
  FaTruck,
  FaUserFriends,
} from "react-icons/fa";
import supabase from "@/config/supabaseClient";

type InventoryItem = { id: number; product_name: string; quantity: number; };
type Delivery      = { id: number; destination: string; };
type Customer      = { id: number; name: string; };

const Cards: React.FC = () => {
  const [totalSales, setTotalSales]               = useState<number | null>(null);
  const [outOfStockItems, setOutOfStockItems]     = useState<InventoryItem[] | null>(null);
  const [ongoingDeliveries, setOngoingDeliveries] = useState<Delivery[] | null>(null);
  const [existingCustomers, setExistingCustomers] = useState<Customer[] | null>(null);

  useEffect(() => {
    // 1) Total sales
    async function fetchTotalSales() {
      const { data, error } = await supabase.from("sales").select("amount");
      if (!error && data) {
        setTotalSales(data.reduce((sum, r) => sum + Number(r.amount ?? 0), 0));
      }
    }
    // 2) Out-of-stock
    async function fetchOutOfStockItems() {
      const { data, error } = await supabase
        .from("inventory")
        .select("id, product_name, quantity")
        .eq("quantity", 0)
        .order("product_name", { ascending: true });
      if (!error && data) setOutOfStockItems(data);
    }
    // 3) Ongoing deliveries
    async function fetchOngoingDeliveries() {
      const { data, error } = await supabase
        .from("truck_deliveries")
        .select("id, destination")
        .eq("status", "Ongoing")
        .order("destination", { ascending: true });
      if (!error && data) setOngoingDeliveries(data);
    }
    // 4) Existing customers (deduped)
    async function fetchExistingCustomers() {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name")
        .eq("customer_type", "Existing Customer")
        .order("name", { ascending: true });
      if (!error && data) {
        const seen = new Set<string>();
        setExistingCustomers(
          data.filter(c => {
            if (seen.has(c.name)) return false;
            seen.add(c.name);
            return true;
          })
        );
      }
    }

    fetchTotalSales();
    fetchOutOfStockItems();
    fetchOngoingDeliveries();
    fetchExistingCustomers();
  }, []);

  const renderNumber = (val: number | null, prefix = "") =>
    val === null ? "…" : prefix + val.toLocaleString();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {/* Total Sales */}
      <div className="bg-white p-4 rounded-xl shadow-sm flex items-start gap-4 overflow-hidden">
        {/* align icon to top of text */}
        <FaDollarSign className="text-3xl text-green-600 mt-1" />
        <div>
          <div className="font-medium text-sm sm:text-base">Total Sales</div>
          <div className="text-xs sm:text-sm text-gray-500">
            {totalSales === null
              ? "Loading…"
              : new Intl.NumberFormat("en-PH", {
                  style: "currency",
                  currency: "PHP",
                  maximumFractionDigits: 0,
                }).format(totalSales)}
          </div>
        </div>
      </div>

      {/* Out of Stock */}
      <div className="bg-white p-4 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center gap-4 mb-2">
          <FaExclamationTriangle className="text-3xl text-red-500" />
          <div>
            <div className="font-medium text-sm sm:text-base">Out of Stock</div>
            <div className="text-xs sm:text-sm text-gray-500">
              {outOfStockItems === null
                ? "Loading…"
                : `${outOfStockItems.length} item${outOfStockItems.length === 1 ? "" : "s"}`}
            </div>
          </div>
        </div>
        {outOfStockItems && outOfStockItems.length > 0 && (
          <ul className="text-xs text-gray-700 list-disc list-inside space-y-1 max-h-24 overflow-y-auto">
            {outOfStockItems.map(item => (
              <li key={item.id}>{item.product_name}</li>
            ))}
          </ul>
        )}
      </div>

      {/* Ongoing Deliveries */}
      <div className="bg-white p-4 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center gap-4 mb-2">
          <FaTruck className="text-3xl text-yellow-600" />
          <div>
            <div className="font-medium text-sm sm:text-base">Ongoing Deliveries</div>
            <div className="text-xs sm:text-sm text-gray-500">
              {ongoingDeliveries === null
                ? "Loading…"
                : `${ongoingDeliveries.length} delivery${ongoingDeliveries.length === 1 ? "" : "ies"}`}
            </div>
          </div>
        </div>
        {ongoingDeliveries && ongoingDeliveries.length > 0 && (
          <ul className="text-xs text-gray-700 list-disc list-inside space-y-1 max-h-24 overflow-y-auto">
            {ongoingDeliveries.map(d => (
              <li key={d.id}>{d.destination}</li>
            ))}
          </ul>
        )}
      </div>

      {/* Existing Customers */}
      <div className="bg-white p-4 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center gap-4 mb-2">
          <FaUserFriends className="text-3xl text-[#ffba20]" />
          <div>
            <div className="font-medium text-sm sm:text-base">Existing Customers</div>
            <div className="text-xs sm:text-sm text-gray-500">
              {existingCustomers === null
                ? "Loading…"
                : `${existingCustomers.length} customer${existingCustomers.length === 1 ? "" : "s"}`}
            </div>
          </div>
        </div>
        {existingCustomers && existingCustomers.length > 0 && (
          <ul className="text-xs text-gray-700 list-disc list-inside space-y-1 max-h-24 overflow-y-auto">
            {existingCustomers.map(c => (
              <li key={c.id}>{c.name}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default Cards;
