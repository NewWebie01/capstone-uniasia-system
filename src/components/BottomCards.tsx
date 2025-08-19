// components/BottomCards.tsx
"use client";

import { useEffect, useState } from "react";
import { FaClipboardList, FaHistory } from "react-icons/fa";
import supabase from "@/config/supabaseClient";

type OrderRow = {
  id: string;
  total_amount: number;
  status: string;
  date_created: string;
  customers: { name: string } | null;
};

const statusColor = (s: string) => {
  const k = (s || "").toLowerCase();
  if (k === "completed") return "bg-green-100 text-green-700";
  if (k === "accepted") return "bg-blue-100 text-blue-700";
  if (k === "pending") return "bg-gray-100 text-gray-700";
  if (k === "rejected" || k === "cancelled") return "bg-red-100 text-red-700";
  return "bg-gray-100 text-gray-700";
};

const formatPHP = (n: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(n ?? 0);

const BottomCards = () => {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("orders")
        .select(
          `
          id,
          total_amount,
          status,
          date_created,
          customers:customer_id ( name )
        `
        )
        .order("date_created", { ascending: false })
        .limit(3);

      if (!error && data) setOrders(data as unknown as OrderRow[]);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Recent Orders */}
      <div className="bg-white p-4 rounded-xl shadow-sm flex items-start gap-4 min-h-[150px]">
        <FaClipboardList className="text-3xl text-[#001E80] mt-1" />
        <div className="flex-1">
          <h2 className="text-lg font-semibold mb-1">Recent Orders</h2>

          {loading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : orders.length === 0 ? (
            <p className="text-sm text-gray-500">No recent orders.</p>
          ) : (
            <ul className="divide-y">
              {orders.map((o) => (
                <li
                  key={o.id}
                  className="py-2 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">
                      {o.customers?.name ?? "Unknown Customer"}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(o.date_created).toLocaleString("en-PH", {
                        timeZone: "Asia/Manila",
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs ${statusColor(
                        o.status
                      )}`}
                    >
                      {o.status}
                    </span>
                    <span className="font-semibold text-sm">
                      {formatPHP(o.total_amount)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Activity Log (unchanged placeholder) */}
      <div className="bg-white p-4 rounded-xl shadow-sm flex items-start gap-4 min-h-[150px]">
        <FaHistory className="text-3xl text-[#ffba20] mt-1" />
        <div>
          <h2 className="text-lg font-semibold mb-1">Activity Log</h2>
          <p className="text-sm text-gray-500">No recent activity.</p>
        </div>
      </div>
    </div>
  );
};

export default BottomCards;
