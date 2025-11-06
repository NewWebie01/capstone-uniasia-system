// src/app/customer/page.tsx
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import supabase from "@/config/supabaseClient";
import {
  useCart,
  InventoryItem as SharedInventoryItem,
  CartItem as SharedCartItem,
} from "@/context/CartContext";

/* ----------------------------- Limits ----------------------------- */
const MAX_QTY = 1000;
const clampQty = (n: number) => Math.max(1, Math.min(MAX_QTY, Math.floor(n) || 1));

/* ---------------------- Cart-wide limits (silent) ---------------------- */
const TRUCK_LIMITS = {
  maxTotalWeightKg: 10_000, // total cart weight cap
  maxDistinctItems: 60,     // how many different SKUs per order
};
const LIMIT_TOAST =
  "Exceeds items per transaction. Please split into another transaction.";

/* ----------------------------- Date formatter ----------------------------- */
const formatPH = (d?: string | number | Date) =>
  new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Manila",
  }).format(d ? new Date(d) : new Date());

/* ----------------------------- Helpers ----------------------------- */
const isOutOfStock = (i: SharedInventoryItem) =>
  (i.status || "").toLowerCase().includes("out") || Number(i.quantity ?? 0) <= 0;

function lineTotal(ci: SharedCartItem) {
  return (Number(ci.item.unit_price ?? 0) || 0) * ci.quantity;
}
function cartSum(list: SharedCartItem[]) {
  return list.reduce((s, ci) => s + lineTotal(ci), 0);
}

/* --------------------------- Weight helpers (NEW) --------------------------- */
function unitWeightKg(i: SharedInventoryItem): number {
  const unit = (i.unit || "").trim();
  if (unit === "Kg") return 1; // 1 'unit' = 1kg

  // Map common units to pieces count if available; fallback to provided pieces_per_unit
  const piecesPerUnit =
    Number(
      i.pieces_per_unit ??
        (unit === "Piece" ? 1 : unit === "Dozen" ? 12 : 0)
    ) || 0;

  const weightPerPiece = Number(i.weight_per_piece_kg ?? 0);
  const w =
    piecesPerUnit > 0 && weightPerPiece > 0 ? piecesPerUnit * weightPerPiece : 0;
  return Number.isFinite(w) ? w : 0;
}

function cartTotalWeightKg(list: SharedCartItem[]) {
  return list.reduce(
    (sum, ci) => sum + unitWeightKg(ci.item) * ci.quantity,
    0
  );
}

/**
 * Can we add `qty` of `item` to the `current` cart without violating:
 *  - distinct item count
 *  - weight cap
 */
function canAddItemWithQty(
  current: SharedCartItem[],
  item: SharedInventoryItem,
  qty: number
): { ok: true } | { ok: false; reason: "distinct" | "weight" | "weight-missing"; message: string } {
  const nextDistinct = current.some((ci) => ci.item.id === item.id)
    ? current.length
    : current.length + 1;
  if (nextDistinct > TRUCK_LIMITS.maxDistinctItems) {
    return { ok: false, reason: "distinct", message: LIMIT_TOAST };
  }

  const perUnitKg = unitWeightKg(item);
  if (perUnitKg <= 0) {
    return { ok: false, reason: "weight-missing", message: LIMIT_TOAST };
  }

  const nextWeight = cartTotalWeightKg(current) + perUnitKg * qty;
  if (nextWeight > TRUCK_LIMITS.maxTotalWeightKg) {
    return { ok: false, reason: "weight", message: LIMIT_TOAST };
  }

  return { ok: true };
}

/* -------------------------------- Component ------------------------------- */
export default function CustomerInventoryPage() {
  const { cart: sharedCart, addItem, updateQty, removeItem, cartTotal: sharedCartTotal } = useCart();
  const router = useRouter();

  const [inventory, setInventory] = useState<SharedInventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");

  // modal state for Add to Cart inline
  const [showAddModal, setShowAddModal] = useState(false);
  const [selected, setSelected] = useState<SharedInventoryItem | null>(null);
  const [modalQty, setModalQty] = useState<number>(1);

  // floating cart modal state
  const [showCartModal, setShowCartModal] = useState(false);

  // pagination
  const itemsPerPage = 10;
  const [currentPage, setCurrentPage] = useState(1);

  const fetchInventory = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("inventory")
      .select(
        "id, product_name, category, subcategory, quantity, unit_price, status, image_url, unit, pieces_per_unit, weight_per_piece_kg"
      )
      .limit(1000);

    if (error) {
      console.error("Error fetching inventory:", error);
      toast.error("Could not load inventory.");
    } else {
      const cleaned = (data ?? []).map((r: any) => ({
        id: r.id,
        product_name: r.product_name ?? "",
        category: r.category ?? "",
        subcategory: r.subcategory ?? "",
        quantity: Number(r.quantity ?? 0),
        unit_price: Number(r.unit_price ?? 0),
        status: r.status ?? "",
        image_url: r.image_url ?? null,
        unit: r.unit ?? null,
        pieces_per_unit: r.pieces_per_unit ?? null,
        weight_per_piece_kg: r.weight_per_piece_kg ?? null,
      }));
      setInventory(cleaned);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchInventory();

    const invChannel: RealtimeChannel = supabase
      .channel("realtime:inventory")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inventory" },
        () => fetchInventory()
      )
      .subscribe();

    return () => void supabase.removeChannel(invChannel);
  }, [fetchInventory]);

  const categoriesList = useMemo(
    () => Array.from(new Set(inventory.map((i) => i.category || ""))).sort(),
    [inventory]
  );

  const filteredInventory = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return inventory.filter((i) => {
      const matchesSearch =
        i.product_name.toLowerCase().includes(q) ||
        (i.category || "").toLowerCase().includes(q) ||
        (i.subcategory || "").toLowerCase().includes(q);
      const matchesCategory =
        categoryFilter === "" || (i.category || "") === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [inventory, searchTerm, categoryFilter]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredInventory.length / itemsPerPage)
  );
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const pageStart = (currentPage - 1) * itemsPerPage;
  const pageEnd = pageStart + itemsPerPage;
  const pageItems = useMemo(
    () => filteredInventory.slice(pageStart, pageEnd),
    [filteredInventory, pageStart, pageEnd]
  );

  const goToPage = (p: number) =>
    setCurrentPage(Math.max(1, Math.min(totalPages, p)));

  /* ------------------ Modal behaviors ------------------ */
  const openAddModal = (item: SharedInventoryItem) => {
    if (isOutOfStock(item)) {
      toast.error("This item is out of stock.");
      return;
    }
    setSelected(item);
    setModalQty(1);
    setShowAddModal(true);
    document.body.style.overflow = "hidden";
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setSelected(null);
    document.body.style.overflow = "";
  };

  const confirmAddToCart = () => {
    if (!selected) {
      toast.error("No item selected.");
      return;
    }

    // 1) Clamp qty
    const qty = clampQty(modalQty);
    if (modalQty > MAX_QTY) {
      toast.error(
        `Maximum ${MAX_QTY} per item. For more, please submit another transaction.`
      );
    }

    // 2) Enforce weight & distinct limits BEFORE add
    const check = canAddItemWithQty(sharedCart, selected, qty);
    if (!check.ok) {
      toast.error(LIMIT_TOAST);
      return;
    }

    // 3) If item already exists, also ensure increasing its qty won't violate the weight cap
    const existing = sharedCart.find((ci) => ci.item.id === selected.id);
    if (existing) {
      const perUnitKg = unitWeightKg(selected);
      if (perUnitKg <= 0) {
        toast.error(LIMIT_TOAST);
        return;
      }
      const weightWithoutThis =
        cartTotalWeightKg(sharedCart) - perUnitKg * existing.quantity;
      const remainingKg =
        TRUCK_LIMITS.maxTotalWeightKg - weightWithoutThis;
      const maxQtyByWeight = Math.max(0, Math.floor(remainingKg / perUnitKg));
      if (qty + existing.quantity > maxQtyByWeight) {
        toast.error(LIMIT_TOAST);
        return;
      }
    }

    addItem(selected, qty);
    toast.success("Item added to cart.");
    closeAddModal();
  };

  /* ------------------ Floating cart derived ------------------ */
  const totalItems = sharedCart.reduce((s, ci) => s + ci.quantity, 0);
  const cartTotal = Number(sharedCartTotal ?? 0) || cartSum(sharedCart);

  const overDistinctLimit = sharedCart.length > TRUCK_LIMITS.maxDistinctItems;
  const overWeightLimit =
    cartTotalWeightKg(sharedCart) > TRUCK_LIMITS.maxTotalWeightKg;

  const canProceedCheckout = !overDistinctLimit && !overWeightLimit;

  return (
    <div className="p-4">
      <header className="h-14 flex items-center gap-3">
        <motion.h1
          className="text-3xl font-bold tracking-tight text-neutral-800"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
        >
          Product Catalog
        </motion.h1>
      </header>

      <p className="text-neutral-500 mb-4 text-sm">
        Browse available products, check categories, and add items to your cart for ordering.
      </p>

      <div className="mb-4 flex flex-col sm:flex-row gap-3 sm:items-center">
        <input
          type="text"
          placeholder="Search by product, category, or subcategory..."
          className="border border-gray-300 rounded px-3 py-2 w-full sm:max-w-xs focus:outline-none focus:ring-2 focus:ring-yellow-500"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <select
          className="border border-gray-300 rounded px-3 py-2 w-full sm:w-auto focus:outline-none focus:ring-2 focus:ring-yellow-500"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">All Categories</option>
          {categoriesList.map((cat) => (
            <option key={cat} value={cat}>
              {cat || "Uncategorized"}
            </option>
          ))}
        </select>
      </div>

      <section className="py-2">
        <div className="max-w-7xl mx-auto">
          {loading ? (
            <p>Loading products...</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
              {pageItems.map((item, index) => {
                const isOut = isOutOfStock(item);
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.04 }}
                    whileHover={{ y: -4 }}
                    className="group bg-white rounded-lg shadow hover:shadow-lg overflow-hidden border border-gray-100 flex flex-col justify-between cursor-pointer"
                  >
                    <div onClick={() => openAddModal(item)}>
                      <div className="relative w-full h-40 bg-gray-100 overflow-hidden">
                        {item.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.image_url}
                            alt={item.product_name}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
                            No Image
                          </div>
                        )}
                        <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-black/10 to-transparent" />
                      </div>

                      <div className="p-3">
                        <h3
                          className="text-sm font-medium text-gray-800 line-clamp-2 mb-1"
                          title={item.product_name}
                        >
                          {item.product_name}
                        </h3>

                        <p className="text-xs text-gray-500 mb-1">
                          {item.category} • {item.subcategory || "General"}
                        </p>

                        <p className="font-semibold text-[#ffba20]">
                          ₱{Number(item.unit_price || 0).toLocaleString("en-PH", {
                            minimumFractionDigits: 2,
                          })}
                        </p>

                        <p
                          className={`text-xs mt-1 ${
                            isOut ? "text-red-500" : "text-green-600"
                          }`}
                        >
                          {item.status}
                        </p>
                      </div>
                    </div>

                    <div
                      className="p-3 pt-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => openAddModal(item)}
                        className={`w-full text-sm font-medium py-2 rounded-md ${
                          isOut
                            ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                            : "bg-[#181918] text-white hover:text-[#ffba20]"
                        } transition`}
                        disabled={isOut}
                      >
                        Add to Cart
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}

          {/* Pagination controls */}
          {!loading && (
            <div className="mt-6 flex items-center justify-between">
              <div>
                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-3 py-1 rounded border mr-2 disabled:opacity-50"
                >
                  Prev
                </button>
                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  className="px-3 py-1 rounded border disabled:opacity-50"
                >
                  Next
                </button>
              </div>
              <div className="text-sm text-gray-700">
                Page {currentPage} of {totalPages}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Floating cart (bottom-right) */}
      <div className="fixed right-4 bottom-4 z-50">
        <div className="relative">
          <button
            onClick={() => setShowCartModal(true)}
            className="flex items-center gap-3 px-4 py-3 rounded-full shadow-xl bg-[#181918] text-white hover:bg-black focus:outline-none"
            title="Open cart"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M3 3h2l.4 2M7 13h10l4-8H5.4"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="10" cy="20" r="1" fill="white" />
              <circle cx="19" cy="20" r="1" fill="white" />
            </svg>
            <div className="text-sm text-left">
              <div className="font-medium leading-none">{totalItems} items</div>
              <div className="text-xs">{formatPH()}</div>
            </div>
            <div className="ml-2 px-3 py-1 rounded bg-[#ffba20] text-black font-semibold">
              {cartTotal.toLocaleString("en-PH", {
                style: "currency",
                currency: "PHP",
                minimumFractionDigits: 2,
              })}
            </div>
          </button>
        </div>
      </div>

      {/* Inline Add to Cart Modal (larger image, cleaner layout) */}
      {showAddModal && selected && (
        <div className="fixed inset-0 z-60 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden">
            <div className="grid md:grid-cols-2 grid-cols-1">
              {/* Left: Product Image */}
              <div className="bg-gray-50 flex items-center justify-center p-6">
                {selected.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selected.image_url}
                    alt={selected.product_name}
                    className="w-full h-full object-contain max-h-[400px]"
                  />
                ) : (
                  <div className="w-full h-[300px] flex items-center justify-center text-gray-400 text-sm">
                    No Image Available
                  </div>
                )}
              </div>

              {/* Right: Details */}
              <div className="flex flex-col justify-between p-6">
                <div>
                  {/* Header */}
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-xl font-semibold text-gray-900 leading-tight">
                      {selected.product_name}
                    </h3>
                    <button
                      onClick={closeAddModal}
                      className="text-gray-500 hover:text-gray-700"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="text-sm text-gray-500 mb-2">
                    {selected.category ?? "Uncategorized"}
                    {selected.subcategory ? ` • ${selected.subcategory}` : ""}
                  </div>

                  {/* Price + Status */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="text-2xl font-bold text-[#ffba20]">
                      ₱
                      {Number(selected.unit_price ?? 0).toLocaleString(
                        "en-PH",
                        { minimumFractionDigits: 2 }
                      )}
                    </div>
                    <div
                      className={`text-sm ${
                        isOutOfStock(selected)
                          ? "text-red-500"
                          : "text-green-600"
                      }`}
                    >
                      {selected.status ?? ""}
                    </div>
                  </div>

                  {/* Unit Info */}
                  <div className="text-sm text-gray-600 space-y-1 mb-6">
                    {selected.unit && (
                      <div>
                        <span className="font-medium text-gray-800">Unit:</span>{" "}
                        {selected.unit}
                      </div>
                    )}
                    {selected.pieces_per_unit != null && (
                      <div>
                        <span className="font-medium text-gray-800">
                          Pieces / Unit:
                        </span>{" "}
                        {selected.pieces_per_unit}
                      </div>
                    )}
                    {selected.weight_per_piece_kg != null && (
                      <div>
                        <span className="font-medium text-gray-800">
                          Weight / Piece:
                        </span>{" "}
                        {String(selected.weight_per_piece_kg)} kg
                      </div>
                    )}
                  </div>

                  {/* Quantity Controls */}
                  <div>
                    <label className="text-sm text-gray-600">Quantity</label>
                    <div className="mt-2 flex items-center gap-3">
                      <button
                        onClick={() => setModalQty((q) => clampQty(q - 1))}
                        className="px-3 py-1 rounded border"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        value={modalQty}
                        min={1}
                        onChange={(e) =>
                          setModalQty(clampQty(Number(e.target.value) || 1))
                        }
                        className="w-20 text-center border rounded px-2 py-1"
                      />
                      <button
                        onClick={() => setModalQty((q) => clampQty(q + 1))}
                        className="px-3 py-1 rounded border"
                      >
                        +
                      </button>
                    </div>



                  </div>
                </div>

                {/* Buttons */}
                <div className="mt-6 flex gap-3">
                  <button
                    onClick={confirmAddToCart}
                    className="flex-1 px-4 py-2 rounded bg-[#ffba20] font-semibold"
                  >
                    Add to Cart
                  </button>
                  <button
                    onClick={closeAddModal}
                    className="flex-1 px-4 py-2 rounded border"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 🛒 Floating Cart Modal */}
      {showCartModal && (
        <div className="fixed inset-0 z-60 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-auto max-h-[90vh]">
            <div className="px-6 py-4 border-b flex justify-between items-center">
              <h2 className="text-lg font-semibold">Your Cart</h2>
              <button
                onClick={() => setShowCartModal(false)}
                className="text-gray-600 text-lg"
              >
                ✕
              </button>
            </div>

            <div className="p-6">
              {/* Limit warnings */}
              {(overDistinctLimit || overWeightLimit) && (
                <div className="mb-4 rounded-md bg-yellow-50 text-yellow-800 border border-yellow-200 px-4 py-3 text-sm">
                  <div className="font-medium mb-1">Order limit reached</div>
                  <ul className="list-disc ml-5 space-y-1">
                    {overDistinctLimit && (
                      <li>
                        Too many different items. Max{" "}
                        {TRUCK_LIMITS.maxDistinctItems} SKUs per transaction.
                      </li>
                    )}
                    {overWeightLimit && (
                      <li>
                        Cart exceeds weight limit of{" "}
                        {TRUCK_LIMITS.maxTotalWeightKg.toLocaleString()} kg.
                      </li>
                    )}
                  </ul>
                  <div className="mt-1">Please remove some items to continue.</div>
                </div>
              )}

              {sharedCart.length === 0 ? (
                <p className="text-gray-500 text-center py-10">
                  Your cart is empty.
                </p>
              ) : (
                <>
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="py-2">Product</th>
                        <th className="py-2">Qty</th>
                        <th className="py-2">Unit Price</th>
                        <th className="py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sharedCart.map((ci, i) => (
                        <tr key={i} className="border-b">
                          <td className="py-2">
                            <div className="flex items-center gap-3">
                              <div className="text-sm font-medium">
                                {ci.item.product_name}
                              </div>
                              <div className="text-xs text-gray-500">
                                {ci.item.category ?? ""}
                              </div>
                            </div>
                          </td>

                          <td className="py-2 text-center">{ci.quantity}</td>

                          <td className="py-2">
                            ₱
                            {Number(ci.item.unit_price || 0).toLocaleString(
                              "en-PH",
                              { minimumFractionDigits: 2 }
                            )}
                          </td>

                          <td className="py-2 text-right">
                            <div>
                              ₱
                              {lineTotal(ci).toLocaleString("en-PH", {
                                minimumFractionDigits: 2,
                              })}
                            </div>

                            {/* Remove button */}
                            <button
                              onClick={() => {
                                removeItem(ci.item.id);
                                toast.success("Item removed from cart.");
                              }}
                              className="mt-2 px-3 py-1 text-xs rounded bg-red-500 text-white"
                              title="Remove item"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>



                  <div className="flex justify-end mt-6">
                    <div className="text-right">
                      <div className="font-medium">Total:</div>
                      <div className="text-2xl font-bold text-[#ffba20]">
                        ₱
                        {cartTotal.toLocaleString("en-PH", {
                          minimumFractionDigits: 2,
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex justify-end gap-3">
                    <button
                      onClick={() => setShowCartModal(false)}
                      className="px-4 py-2 rounded border"
                    >
                      Close
                    </button>
                    <button
                      onClick={() => {
                        if (!canProceedCheckout) {
                          toast.error(LIMIT_TOAST);
                          return;
                        }
                        setShowCartModal(false);
                        router.push("/customer/checkout");
                      }}
                      className={`px-4 py-2 rounded ${
                        canProceedCheckout
                          ? "bg-[#181918] text-white hover:text-[#ffba20]"
                          : "bg-gray-300 text-gray-600 cursor-not-allowed"
                      }`}
                      disabled={!canProceedCheckout}
                      title={
                        canProceedCheckout
                          ? "Proceed to checkout"
                          : "Please resolve cart limits first"
                      }
                    >
                      Checkout
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
