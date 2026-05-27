"use client";

import { useEffect, useState } from "react";
import { FaClipboardList } from "react-icons/fa";
// import supabase from "@/config/supabaseClient"; // SUPABASE (commented)
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";

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

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [topTen, setTopTen] = useState<OrderRow[]>([]);
  const [loadingTen, setLoadingTen] = useState(false);

  const pathname = usePathname();

  // Auto-close modal on route change
  useEffect(() => {
    setModalOpen(false);
  }, [pathname]);

  // ---------------- SUPABASE FETCH (COMMENTED) ----------------
  // Fetch 3 for card
  // useEffect(() => {
  //   (async () => {
  //     setLoading(true);
  //     const { data, error } = await supabase
  //       .from("orders")
  //       .select(
  //         `
  //         id,
  //         total_amount,
  //         status,
  //         date_created,
  //         customers:customer_id ( name )
  //       `
  //       )
  //       .order("date_created", { ascending: false })
  //       .limit(3);
  //
  //     if (!error && data) setOrders(data as unknown as OrderRow[]);
  //     setLoading(false);
  //   })();
  // }, []);
  // ------------------------------------------------------------

  // TEMP fallback so UI still works while Supabase is removed
  useEffect(() => {
    setLoading(false);
    setOrders([]); // keep empty until MySQL API is wired
  }, []);

  // ---------------- SUPABASE FETCH (COMMENTED) ----------------
  // Fetch 10 for modal
  // async function fetchTopTen() {
  //   setLoadingTen(true);
  //   const { data } = await supabase
  //     .from("orders")
  //     .select(
  //       `
  //       id,
  //       total_amount,
  //       status,
  //       date_created,
  //       customers:customer_id ( name )
  //     `
  //     )
  //     .order("date_created", { ascending: false })
  //     .limit(10);
  //   setTopTen((data as unknown as OrderRow[]) || []);
  //   setLoadingTen(false);
  // }
  // ------------------------------------------------------------

  // TEMP fallback modal loader (no DB yet)
  async function fetchTopTen() {
    setLoadingTen(true);
    setTopTen([]); // empty until MySQL API is wired
    setLoadingTen(false);
  }

  // Open modal & load data
  const handleOpenModal = () => {
    setModalOpen(true);
    fetchTopTen();
  };

  // ESC to close
  useEffect(() => {
    if (!modalOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModalOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [modalOpen]);

  return (
    <>
      {/* CARD */}
      <div
        className="bg-white rounded-2xl shadow-lg h-full flex flex-col min-w-[290px] cursor-pointer transition"
        title="Click to view more recent orders"
        onClick={handleOpenModal}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleOpenModal();
        }}
        role="button"
      >
        {/* Header: Yellow Bar */}
        <div className="flex items-center px-4 py-3 rounded-t-2xl bg-[#FFBA20]">
          <FaClipboardList className="text-2xl text-[#001E80] mr-2" />
          <span className="font-bold text-lg text-[#181918]">
            Recent Orders
          </span>
        </div>

        {/* Card Body */}
        <div className="flex-1 px-6 py-4">
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
                        o.status,
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

          <span className="text-xs text-center text-gray-400 mt-3 pointer-events-none">
            Click card to view more
          </span>
        </div>
      </div>

      {/* MODAL */}
      <AnimatePresence>
        {modalOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-0 relative"
              initial={{ y: 60, opacity: 0, scale: 0.97 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 60, opacity: 0, scale: 0.97 }}
              transition={{ type: "spring", bounce: 0.2, duration: 0.33 }}
            >
              {/* Modal Header: Yellow Bar */}
              <div className="flex items-center px-4 py-3 rounded-t-2xl bg-[#FFBA20]">
                <FaClipboardList className="text-2xl text-[#001E80] mr-2" />
                <span className="font-bold text-lg text-[#181918]">
                  Recent Orders
                </span>
                <button
                  className="ml-auto text-gray-500 hover:text-yellow-600 transition"
                  onClick={() => setModalOpen(false)}
                  aria-label="Close"
                >
                  <X size={22} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="px-6 py-5">
                {loadingTen ? (
                  <div className="flex flex-col items-center justify-center h-[80px]">
                    <svg
                      className="animate-spin h-6 w-6 text-gray-400"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                      />
                    </svg>
                  </div>
                ) : topTen.length === 0 ? (
                  <p className="text-gray-400 text-sm mt-2">
                    No recent orders.
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
                    {topTen.map((o) => (
                      <li
                        key={o.id}
                        className="py-3 flex items-start justify-between gap-3"
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
                              o.status,
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
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default BottomCards;
