"use client";

import React, { useEffect, useState } from "react";
import {
  FaDollarSign,
  FaExclamationTriangle,
  FaTruck,
  FaUserFriends,
  FaClock,
} from "react-icons/fa";
import supabase from "@/config/supabaseClient";

// Types
type InventoryItem = { id: number; product_name: string; quantity: number; expiration_date?: string };
type Delivery = { id: number; destination: string };
type Customer = { id: number; name: string };

// Add "expNotify" to ModalType
type ModalType = "outOfStock" | "deliveries" | "customers" | "expNotify" | null;

const pluralize = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

const Cards: React.FC = () => {
  const [totalSales, setTotalSales] = useState<number | null>(null);
  const [outOfStockItems, setOutOfStockItems] = useState<InventoryItem[] | null>(null);
  const [ongoingDeliveries, setOngoingDeliveries] = useState<Delivery[] | null>(null);
  const [existingCustomers, setExistingCustomers] = useState<Customer[] | null>(null);
  const [expiringSoon, setExpiringSoon] = useState<InventoryItem[] | null>(null);

  const [modal, setModal] = useState<ModalType>(null);

  useEffect(() => {
    (async () => {
      try {
        const [salesRes, invRes, delivRes, custRes] = await Promise.all([
          supabase.from("sales").select("amount"),
          supabase
            .from("inventory")
            .select("id, product_name, quantity, expiration_date")
            .order("product_name", { ascending: true }),
          supabase
            .from("truck_deliveries")
            .select("id, destination")
            .eq("status", "Ongoing")
            .order("destination", { ascending: true }),
          supabase
            .from("customers")
            .select("id, name, customer_type")
            .eq("customer_type", "Existing Customer")
            .order("name", { ascending: true }),
        ]);

        if (!salesRes.error && salesRes.data) {
          const sum = salesRes.data.reduce(
            (acc, r: any) => acc + Number(r.amount ?? 0),
            0
          );
          setTotalSales(sum);
        }

        if (!invRes.error && invRes.data) {
          // Out of stock
          setOutOfStockItems(
            (invRes.data as InventoryItem[]).filter((i) => i.quantity === 0)
          );

          // ExpNotify: Items expiring in 7 days
          const DAYS_AHEAD = 7;
          const today = new Date();
          const until = new Date(Date.now() + DAYS_AHEAD * 86400000);
          setExpiringSoon(
            (invRes.data as InventoryItem[]).filter((i) => {
              if (!i.expiration_date) return false;
              const exp = new Date(i.expiration_date);
              // Use only the date portion for comparison
              exp.setHours(0, 0, 0, 0);
              today.setHours(0, 0, 0, 0);
              until.setHours(0, 0, 0, 0);
              return exp >= today && exp <= until;
            })
          );
        }

        if (!delivRes.error && delivRes.data) setOngoingDeliveries(delivRes.data as Delivery[]);
        if (!custRes.error && custRes.data) {
          // dedupe by name
          const seen = new Set<string>();
          const unique = (custRes.data as Customer[]).filter((c) => {
            if (seen.has(c.name)) return false;
            seen.add(c.name);
            return true;
          });
          setExistingCustomers(unique);
        }
      } catch (e) {
        console.error("Cards fetch error:", e);
      }
    })();
  }, []);

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

  return (
    <>
      <div className="grid grid-cols-5 gap-4 mb-6 w-full overflow-x-auto">
        {/* Total Sales (non-clickable) */}
        <div className="bg-white p-5 rounded-xl shadow-sm flex items-start gap-4 overflow-hidden">
          <FaDollarSign className="text-3xl text-green-600 mt-1" />
          <div className="leading-tight">
            <div className="font-semibold text-base md:text-lg">Total Sales</div>
            <div className="text-sm md:text-base text-gray-600">
              {currencyPH(totalSales)}
            </div>
          </div>
        </div>

        {/* Out of Stock (clickable -> modal) */}
        <div {...cardButtonProps("outOfStock")}>
          <div className="flex items-center gap-4 mb-2">
            <FaExclamationTriangle className="text-3xl text-red-500" />
            <div className="leading-tight">
              <div className="font-semibold text-base md:text-lg">Out of Stock</div>
              <div className="text-sm md:text-base text-gray-600">
                {outOfStockItems === null
                  ? "Loading…"
                  : pluralize(outOfStockItems.length, "item", "items")}
              </div>
            </div>
          </div>
          <div className="text-xs md:text-sm text-gray-400">
            Click to view details
          </div>
        </div>

        {/* Ongoing Deliveries (clickable -> modal) */}
        <div {...cardButtonProps("deliveries")}>
          <div className="flex items-center gap-4 mb-2">
            <FaTruck className="text-3xl text-yellow-600" />
            <div className="leading-tight">
              <div className="font-semibold text-base md:text-lg">Ongoing Deliveries</div>
              <div className="text-sm md:text-base text-gray-600">
                {ongoingDeliveries === null
                  ? "Loading…"
                  : pluralize(ongoingDeliveries.length, "delivery", "deliveries")}
              </div>
            </div>
          </div>
          <div className="text-xs md:text-sm text-gray-400">
            Click to view details
          </div>
        </div>

        {/* Existing Customers (clickable -> modal) */}
        <div {...cardButtonProps("customers")}>
          <div className="flex items-center gap-4 mb-2">
            <FaUserFriends className="text-3xl text-[#ffba20]" />
            <div className="leading-tight">
              <div className="font-semibold text-base md:text-lg">Existing Customers</div>
              <div className="text-sm md:text-base text-gray-600">
                {existingCustomers === null
                  ? "Loading…"
                  : pluralize(existingCustomers.length, "customer", "customers")}
              </div>
            </div>
          </div>
          <div className="text-xs md:text-sm text-gray-400">
            Click to view details
          </div>
        </div>

        {/* ExpNotify (clickable -> modal) */}
        <div {...cardButtonProps("expNotify")}>
          <div className="flex items-center gap-4 mb-2">
            <FaClock className="text-3xl text-yellow-500" />
            <div className="leading-tight">
              <div className="font-semibold text-base md:text-lg">Expiring Items</div>
              <div className="text-sm md:text-base text-gray-600">
                {Array.isArray(expiringSoon)
                  ? pluralize(expiringSoon.length, "item", "items")
                  : "Loading…"}
              </div>
              <div className="text-xs md:text-sm text-gray-400">
                (7 days)
              </div>
            </div>
          </div>
          <div className="text-xs md:text-sm text-gray-400">
            Click to view details
          </div>
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <Modal onClose={() => setModal(null)} title={modalTitle(modal)}>
          {modal === "outOfStock" && (
            <ListSection
              emptyText="No out-of-stock items."
              items={outOfStockItems?.map((i) => i.product_name) ?? []}
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
              emptyText="No items expiring in 7 days."
              items={
                Array.isArray(expiringSoon)
                  ? expiringSoon.map((i) =>
                      i.product_name +
                      (i.expiration_date
                        ? ` (expires ${new Date(i.expiration_date).toLocaleDateString("en-PH", {
                            month: "short",
                            day: "numeric",
                          })})`
                        : "")
                    )
                  : []
              }
            />
          )}
        </Modal>
      )}
    </>
  );
};

/* ---------- Helpers (Modal + ListSection) ---------- */

function modalTitle(type: ModalType) {
  switch (type) {
    case "outOfStock":
      return "Out of Stock Items";
    case "deliveries":
      return "Ongoing Deliveries";
    case "customers":
      return "Existing Customers";
    case "expNotify":
      return "Expiring Soon (Next 7 Days)";
    default:
      return "";
  }
}

const Modal: React.FC<{
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ title, onClose, children }) => {
  // close on ESC
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
        className="bg-white w-full max-w-2xl rounded-xl shadow-lg p-6"
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
        <div className="max-h-[60vh] overflow-y-auto">{children}</div>
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
