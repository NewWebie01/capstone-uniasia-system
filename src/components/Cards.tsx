"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  FaDollarSign,
  FaExclamationTriangle,
  FaTruck,
  FaUserFriends,
  FaClock,
} from "react-icons/fa";
// import supabase from "@/config/supabaseClient"; // SUPABASE (commented)

/* =========================
   TYPES
========================= */
type InventoryItem = {
  id: number;
  product_name: string;
  quantity: number;
  expiration_date?: string | null;
  stock_level?: string | null; // DB trigger-calculated level
  status?: string | null; // fallback if stock_level is null
};
type Delivery = { id: number; destination: string; status?: string | null };
type Customer = { id: number; name: string; customer_type?: string | null };

type MovingProduct = {
  id: number;
  sku: string;
  product_name: string;
  category: string;
  subcategory: string;
  unit: string;
  current_stock: number;
  units_90d: number;
  est_days_of_cover: number | null;
  pr_units_velocity: number;
};

type ModalType =
  | "atRisk"
  | "deliveries"
  | "customers"
  | "expNotify"
  | "moving"
  | null;

const pluralize = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/* Match Bargraph's default "Monthly" window (last 6 months incl current) */
function getMonthlyStartISO(): string {
  const now = new Date();
  const earliest = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const y = earliest.getFullYear();
  const m = String(earliest.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

const Cards: React.FC = () => {
  const [totalSales, setTotalSales] = useState<number | null>(null);
  const [atRiskItems, setAtRiskItems] = useState<InventoryItem[] | null>(null);
  const [ongoingDeliveries, setOngoingDeliveries] = useState<Delivery[] | null>(
    null,
  );
  const [existingCustomers, setExistingCustomers] = useState<Customer[] | null>(
    null,
  );

  // Expiring within 30 days
  const [expiringSoon, setExpiringSoon] = useState<InventoryItem[] | null>(
    null,
  );

  const [movingProducts, setMovingProducts] = useState<MovingProduct[]>([]);
  const [modal, setModal] = useState<ModalType>(null);

  const monthlyStartISO = useMemo(() => getMonthlyStartISO(), []);

  /* -------------------- Loaders (SUPABASE) -------------------- */
  // async function loadTotalSales() {
  //   const { data, error } = await supabase
  //     .from("payments")
  //     .select("amount, status, received_at")
  //     .eq("status", "received")
  //     .not("received_at", "is", null)
  //     .gte("received_at", monthlyStartISO);
  //
  //   if (error) {
  //     console.error("TotalSales load error:", error);
  //     setTotalSales(0);
  //     return;
  //   }
  //   const sum =
  //     (data ?? []).reduce(
  //       (acc: number, r: any) => acc + (Number(r.amount) || 0),
  //       0
  //     ) || 0;
  //   setTotalSales(sum);
  // }

  // async function loadLists() {
  //   try {
  //     const [invRes, delivRes, custRes] = await Promise.all([
  //       supabase
  //         .from("inventory")
  //         .select("id, product_name, quantity, expiration_date, stock_level, status")
  //         .order("product_name", { ascending: true }),
  //       supabase
  //         .from("truck_deliveries")
  //         .select("id, destination, status")
  //         .eq("status", "To Ship")
  //         .order("destination", { ascending: true }),
  //       supabase
  //         .from("customers")
  //         .select("id, name, customer_type")
  //         .eq("customer_type", "Existing Customer")
  //         .order("name", { ascending: true }),
  //     ]);
  //
  //     if (!invRes.error && invRes.data) {
  //       const LOW_SET = new Set(["Low", "Critical", "Out of Stock"]);
  //       const atRisk = (invRes.data as InventoryItem[]).filter((i) => {
  //         const lvl = (i.stock_level || i.status || "").trim();
  //         const isZero = (i.quantity || 0) === 0;
  //         return LOW_SET.has(lvl) || isZero;
  //       });
  //       setAtRiskItems(atRisk);
  //
  //       const DAYS_AHEAD = 30;
  //       const start = new Date();
  //       start.setHours(0, 0, 0, 0);
  //       const end = new Date(Date.now() + DAYS_AHEAD * 86400000);
  //       end.setHours(23, 59, 59, 999);
  //
  //       setExpiringSoon(
  //         (invRes.data as InventoryItem[]).filter((i) => {
  //           if (!i.expiration_date) return false;
  //           const exp = new Date(i.expiration_date);
  //           exp.setHours(0, 0, 0, 0);
  //           return exp >= start && exp <= end;
  //         })
  //       );
  //     }
  //
  //     if (!delivRes.error && delivRes.data)
  //       setOngoingDeliveries(delivRes.data as Delivery[]);
  //
  //     if (!custRes.error && custRes.data) {
  //       const seen = new Set<string>();
  //       const unique = (custRes.data as Customer[]).filter((c) => {
  //         if (seen.has(c.name)) return false;
  //         seen.add(c.name);
  //         return true;
  //       });
  //       setExistingCustomers(unique);
  //     }
  //   } catch (e) {
  //     console.error("Cards list fetch error:", e);
  //   }
  // }

  // async function loadMovingProducts() {
  //   const { data, error } = await supabase
  //     .from("v_fast_moving_products")
  //     .select("*")
  //     .order("units_90d", { ascending: false });
  //   if (error) {
  //     console.error("Moving products load error:", error);
  //     setMovingProducts([]);
  //     return;
  //   }
  //   setMovingProducts((data as MovingProduct[]) ?? []);
  // }

  /* -------------------- Initial load (TEMP FALLBACK) -------------------- */
  useEffect(() => {
    // While Supabase is removed, keep dashboard usable:
    setTotalSales(0);
    setAtRiskItems([]);
    setOngoingDeliveries([]);
    setExistingCustomers([]);
    setExpiringSoon([]);
    setMovingProducts([]);
  }, [monthlyStartISO]);

  /* ----- Realtime refresh (SUPABASE) — COMMENTED ----- */
  // useEffect(() => {
  //   const ch = supabase.channel("cards-payments-rt");
  //   ch.on(
  //     "postgres_changes",
  //     { event: "*", schema: "public", table: "payments" },
  //     (payload: any) => {
  //       const statusOf = (row: any): string =>
  //         typeof row?.status === "string" ? row.status.toLowerCase() : "";
  //       const newStatus = statusOf(payload.new);
  //       const oldStatus = statusOf(payload.old);
  //       if (
  //         payload.eventType === "INSERT" ||
  //         payload.eventType === "DELETE" ||
  //         newStatus === "received" ||
  //         oldStatus === "received"
  //       ) {
  //         loadTotalSales();
  //       }
  //     }
  //   );
  //   ch.subscribe();
  //   return () => {
  //     supabase.removeChannel(ch);
  //   };
  // }, [monthlyStartISO]);

  // useEffect(() => {
  //   const chDel = supabase.channel("cards-deliveries-rt");
  //   chDel.on(
  //     "postgres_changes",
  //     { event: "*", schema: "public", table: "truck_deliveries" },
  //     (payload: any) => {
  //       const statusNew = payload?.new?.status as string | undefined;
  //       const statusOld = payload?.old?.status as string | undefined;
  //       if (
  //         statusNew === "To Ship" ||
  //         statusOld === "To Ship" ||
  //         payload.eventType === "INSERT" ||
  //         payload.eventType === "DELETE"
  //       ) {
  //         loadLists();
  //       }
  //     }
  //   );
  //   chDel.subscribe();
  //
  //   const chInv = supabase.channel("cards-inventory-rt");
  //   chInv.on(
  //     "postgres_changes",
  //     { event: "*", schema: "public", table: "inventory" },
  //     () => loadLists()
  //   );
  //   chInv.subscribe();
  //
  //   return () => {
  //     supabase.removeChannel(chDel);
  //     supabase.removeChannel(chInv);
  //   };
  // }, []);
  /* -------------------------------------------------- */

  /* -------------------- Helpers -------------------- */
  const currencyPH = (val: number | null) =>
    val === null
      ? "…"
      : new Intl.NumberFormat("en-PH", {
          style: "currency",
          currency: "PHP",
          maximumFractionDigits: 0,
        }).format(val);

  const cardButtonProps = (type: ModalType) => ({
    role: "button" as const,
    tabIndex: 0,
    onClick: () => setModal(type),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter") setModal(type);
    },
    className:
      "bg-white p-5 rounded-xl shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-shadow",
  });

  /* =========================
     RENDER
  ========================== */
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6 w-full overflow-x-auto">
        {/* Total Sales */}
        <div className="bg-white p-5 rounded-xl shadow-sm flex items-start gap-4 overflow-hidden">
          <FaDollarSign className="text-3xl text-green-600 mt-1" />
          <div className="leading-tight">
            <div className="font-semibold text-base md:text-lg">
              Total Sales
            </div>
            <div className="text-sm md:text-base text-gray-600">
              {currencyPH(totalSales)}
            </div>
            <div className="text-[11px] md:text-xs text-gray-400">
              Received payments • last 6 months
            </div>
          </div>
        </div>

        {/* At-Risk Stock */}
        <div {...cardButtonProps("atRisk")}>
          <div className="flex items-center gap-4 mb-2">
            <FaExclamationTriangle className="text-3xl text-red-500" />
            <div className="leading-tight">
              <div className="font-semibold text-base md:text-lg">
                Low / Critical / Out of Stock Items
              </div>
              <div className="text-sm md:text-base text-gray-600">
                {atRiskItems === null
                  ? "Loading…"
                  : pluralize(atRiskItems.length, "item", "items")}
              </div>
            </div>
          </div>
          <div className="text-xs md:text-sm text-gray-400">
            Click to view details
          </div>
        </div>

        {/* Ongoing Deliveries */}
        <div {...cardButtonProps("deliveries")}>
          <div className="flex items-center gap-4 mb-2">
            <FaTruck className="text-3xl text-yellow-600" />
            <div className="leading-tight">
              <div className="font-semibold text-base md:text-lg">
                Ongoing Deliveries
              </div>
              <div className="text-sm md:text-base text-gray-600">
                {ongoingDeliveries === null
                  ? "Loading…"
                  : pluralize(
                      ongoingDeliveries.length,
                      "delivery",
                      "deliveries",
                    )}
              </div>
            </div>
          </div>
          <div className="text-xs md:text-sm text-gray-400">
            Click to view details
          </div>
        </div>

        {/* Existing Customers */}
        <div {...cardButtonProps("customers")}>
          <div className="flex items-center gap-4 mb-2">
            <FaUserFriends className="text-3xl text-[#ffba20]" />
            <div className="leading-tight">
              <div className="font-semibold text-base md:text-lg">
                Existing Customers
              </div>
              <div className="text-sm md:text-base text-gray-600">
                {existingCustomers === null
                  ? "Loading…"
                  : pluralize(
                      existingCustomers.length,
                      "customer",
                      "customers",
                    )}
              </div>
            </div>
          </div>
          <div className="text-xs md:text-sm text-gray-400">
            Click to view details
          </div>
        </div>

        {/* Expiring Soon (30 days) */}
        <div {...cardButtonProps("expNotify")}>
          <div className="flex items-center gap-4 mb-2">
            <FaClock className="text-3xl text-yellow-500" />
            <div className="leading-tight">
              <div className="font-semibold text-base md:text-lg">
                Expiring Items
              </div>
              <div className="text-sm md:text-base text-gray-600">
                {Array.isArray(expiringSoon)
                  ? pluralize(expiringSoon.length, "item", "items")
                  : "Loading…"}
              </div>
              <div className="text-xs md:text-sm text-gray-400">(30 days)</div>
            </div>
          </div>
          <div className="text-xs md:text-sm text-gray-400">
            Click to view details
          </div>
        </div>

        {/* Moving Products Report */}
        <div {...cardButtonProps("moving")}>
          <div className="flex items-center gap-4 mb-2">
            <FaTruck className="text-3xl text-blue-600" />
            <div className="leading-tight">
              <div className="font-semibold text-base md:text-lg">
                Moving Products
              </div>
              {movingProducts.length > 0 ? (
                <>
                  <div className="text-sm md:text-base text-gray-600 font-semibold truncate">
                    {movingProducts[0].product_name}
                  </div>
                  <div className="text-xs md:text-sm text-gray-500">
                    Sold (90d):{" "}
                    <b>{movingProducts[0].units_90d.toLocaleString()}</b>
                  </div>
                </>
              ) : (
                <div className="text-sm md:text-base text-gray-600">
                  No data
                </div>
              )}
            </div>
          </div>
          <div className="text-xs md:text-sm text-gray-400">
            Click to view report
          </div>
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <Modal onClose={() => setModal(null)} title={modalTitle(modal)}>
          {modal === "atRisk" && (
            <ListSection
              emptyText="No Low/Critical/Out-of-Stock items."
              items={
                atRiskItems?.map((i) => {
                  const lvl = (i.stock_level || i.status || "").trim() || "—";
                  return `${i.product_name} — ${lvl}`;
                }) ?? []
              }
            />
          )}

          {modal === "deliveries" && (
            <ListSection
              emptyText="No ongoing deliveries."
              items={ongoingDeliveries?.map((d) => d.destination) ?? []}
            />
          )}

          {modal === "customers" && (
            <ListSection
              emptyText="No existing customers."
              items={existingCustomers?.map((c) => c.name) ?? []}
            />
          )}

          {modal === "expNotify" && (
            <ListSection
              emptyText="No items expiring in 30 days."
              items={
                Array.isArray(expiringSoon)
                  ? expiringSoon.map(
                      (i) =>
                        i.product_name +
                        (i.expiration_date
                          ? ` (expires ${new Date(
                              i.expiration_date,
                            ).toLocaleDateString("en-PH", {
                              month: "short",
                              day: "numeric",
                            })})`
                          : ""),
                    )
                  : []
              }
            />
          )}

          {modal === "moving" && (
            <div className="overflow-x-auto">
              <table className="min-w-[900px] w-full text-sm border rounded-xl shadow">
                <thead>
                  <tr className="bg-[#ffba20] text-black text-left font-bold text-base border-b">
                    <th className="py-2 px-3">#</th>
                    <th className="py-2 px-3">Product</th>
                    <th className="py-2 px-3">Category</th>
                    <th className="py-2 px-3">Subcategory</th>
                    <th className="py-2 px-3 text-right">Sold (90d)</th>
                    <th className="py-2 px-3 text-right">Stock Left</th>
                    <th className="py-2 px-3 text-right">Days of Cover</th>
                    <th className="py-2 px-3 text-right">
                      Velocity (units/day)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {movingProducts.length === 0 ? (
                    <tr>
                      <td className="py-3 px-3 text-gray-500" colSpan={8}>
                        No data
                      </td>
                    </tr>
                  ) : (
                    movingProducts.map((prod, idx) => (
                      <tr
                        key={prod.id}
                        className="border-b hover:bg-gray-50/80"
                      >
                        <td className="py-2 px-3 font-semibold text-center">
                          {idx + 1}
                        </td>
                        <td className="py-2 px-3 font-bold">
                          {prod.product_name}
                        </td>
                        <td className="py-2 px-3">{prod.category}</td>
                        <td className="py-2 px-3">{prod.subcategory}</td>
                        <td className="py-2 px-3 text-right">
                          {prod.units_90d?.toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {prod.current_stock?.toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {prod.est_days_of_cover
                            ? prod.est_days_of_cover.toFixed(1)
                            : "-"}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {prod.pr_units_velocity?.toFixed(2)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              <div className="text-xs text-gray-500 mt-4">
                <b>Days of Cover</b> = Stock Left ÷ average daily sales (last 90
                days). Highest rows are “fast”; lowest rows are “slow”.
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
};

/* ---------- Helpers (Modal + ListSection) ---------- */

function modalTitle(type: ModalType) {
  switch (type) {
    case "atRisk":
      return "Low / Critical / Out-of-Stock Items";
    case "deliveries":
      return "Ongoing Deliveries";
    case "customers":
      return "Existing Customers";
    case "expNotify":
      return "Expiring Soon (Next 30 Days)";
    case "moving":
      return "Moving Products Report (Last 90 Days)";
    default:
      return "";
  }
}

const Modal: React.FC<{
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ title, onClose, children }) => {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-5xl rounded-xl shadow-lg p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded border hover:bg-red-600 text-sm hover:text-white"
          >
            Close
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};

const ListSection: React.FC<{
  items: string[] | null;
  emptyText: string;
}> = ({ items, emptyText }) => {
  if (!items || items.length === 0) {
    return <p className="text-gray-500">{emptyText}</p>;
  }
  return (
    <ul className="space-y-2 text-sm md:text-base text-gray-800 list-disc pl-6">
      {items.map((t, idx) => (
        <li key={`${t}-${idx}`}>{t}</li>
      ))}
    </ul>
  );
};

export default Cards;
