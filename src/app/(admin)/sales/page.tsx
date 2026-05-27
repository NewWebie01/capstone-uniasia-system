// src/app/(admin)/sales/page.tsx
"use client";

import { Suspense } from "react";
import { useEffect, useState, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PageLoader from "@/components/PageLoader";
import { toast } from "sonner";
import { on, off } from "@/utils/eventEmitter";

import {
  formatPHDate,
  formatPHTime,
  formatPHISODate,
  getPHISOString,
} from "@/lib/datetimePH";

/* ----------------------------- Helpers ----------------------------- */
const peso = (n: number) =>
  (Number(n) || 0).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  });

/* =========================
   TYPES
========================= */
type InventoryItem = {
  id: number;
  sku: string;
  product_name: string;
  category: string;
  subcategory: string;
  unit: string;
  quantity: number;
  unit_price: number;
  cost_price?: number | null;
  amount: number;
  profit?: number | null;
};

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

type OrderWithDetails = {
  id: string;
  total_amount: number;
  status: string;
  date_created: string;
  payment_terms?: number | null;
  interest_percent?: number | null;
  customers: {
    name: string;
    email: string;
    phone: string;
    address: string;
    contact_person?: string;
    code?: string | null;
    area?: string;
    date?: string;
    transaction?: string;
    status?: string;
    payment_type?: string;
    customer_type?: string;
    order_count?: number;
  };
  order_items: {
    id: any; 
    quantity: number;
    price: number;
    discount_percent?: number | null;
    remarks?: string | null; 
    inventory: {
      id: number;
      sku: string;
      product_name: string;
      category: string;
      subcategory: string;
      unit: string;
      quantity: number;
      unit_price: number;
      cost_price?: number | null;
      amount?: number | null;
    };
  }[];
};

type PickingOrder = { orderId: string; status: "accepted" | "rejected" };

type InvSortKey =
  | "sku"
  | "product_name"
  | "category"
  | "subcategory"
  | "unit"
  | "quantity"
  | "cost_price"
  | "total";

/* =========================
   RECEIPT-LIKE SALES ORDER
========================= */
function ReceiptLikeSalesOrder({
  selectedOrder,
  poNumber,
  setPoNumber,
  processor,
  repName,
  setRepName,
  localForwarder,
  setLocalForwarder,
  commitForwarder,
  numberOfTerms,
  isSalesTaxOn,
  setIsSalesTaxOn,
  editedQuantities,
  editedDiscounts,
  setEditedDiscounts,
  fieldErrors,
  setFieldErrors,
  subtotalBeforeDiscount,
  totalDiscount,
  salesTaxValue,
  displayAmountDue,
  receiptEditMode,
  setReceiptEditMode,
  savingReceiptNotes,
  editedReceiptNotes,
  setEditedReceiptNotes,
  saveReceiptNotes,
  setEditedQuantities,
  removedLines,
  setRemovedLines,
}: any) {
  const safe = (v: any) =>
    v === null || v === undefined || v === "" ? "—" : v;

  const PRINT_ROWS = 30;
  const its = selectedOrder?.order_items || [];
  const rows = Array.from(
    { length: Math.max(PRINT_ROWS, its.length) },
    (_, i) => its[i] ?? null
  );

  const termsText =
    selectedOrder?.customers?.payment_type === "Credit"
      ? `Net ${numberOfTerms} Monthly`
      : safe(selectedOrder?.customers?.payment_type);

  const colWidths = [
    "52px", "52px", "56%", "86px", "110px", "92px", "92px",
  ];

  return (
    <div
      className="w-full bg-white text-black"
      style={{ fontFamily: "Times New Roman, serif" }}
    >
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .receipt-sheet { box-shadow: none !important; border: none !important; margin: 0 !important; width: 100% !important; }
          body { background: white !important; }
        }
      `}</style>

      <div className="receipt-sheet border border-black p-6">
        {/* HEADER */}
        <div className="relative text-center">
          <div className="text-[30px] font-bold tracking-wide">SALES ORDER</div>
          <div className="no-print absolute right-0 top-0 flex items-center gap-2">
            {!receiptEditMode ? (
              <button
                className="px-4 py-2 rounded-md bg-black text-white hover:bg-neutral-800 text-sm"
                onClick={() => setReceiptEditMode(true)}
                type="button"
              >
                Edit Receipt
              </button>
            ) : (
              <>
                <button
                  className={`px-4 py-2 rounded-md text-white text-sm ${
                    savingReceiptNotes
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-700"
                  }`}
                  onClick={saveReceiptNotes}
                  disabled={savingReceiptNotes}
                  type="button"
                >
                  {savingReceiptNotes ? "Saving…" : "Save Notes"}
                </button>

                <button
                  className="px-4 py-2 rounded-md bg-gray-300 hover:bg-gray-400 text-sm"
                  onClick={() => setReceiptEditMode(false)}
                  disabled={savingReceiptNotes}
                  type="button"
                >
                  Cancel Edit
                </button>
              </>
            )}
          </div>
        </div>

        {/* TOP META */}
        <div className="mt-4 grid grid-cols-1 gap-2 text-[15px]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex items-end gap-2">
              <span className="min-w-[80px]">Customer:</span>
              <div className="flex-1 border-b border-black pb-[2px]">
                {safe(selectedOrder?.customers?.name)}
              </div>
            </div>

            <div className="flex items-end gap-2">
              <span className="min-w-[50px]">Date:</span>
              <div className="flex-1 border-b border-black pb-[2px]">
                {safe(formatPHISODate(new Date()))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex items-end gap-2">
              <span className="min-w-[80px]">Address:</span>
              <div className="flex-1 border-b border-black pb-[2px]">
                {safe(selectedOrder?.customers?.address)}
              </div>
            </div>

            <div className="flex items-end gap-2">
              <span className="min-w-[60px]">Terms:</span>
              <div className="flex-1 border-b border-black pb-[2px]">
                {termsText}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex items-end gap-2">
              <span className="min-w-[80px]">Forwarder:</span>
              <div className="flex-1 border-b border-black pb-[2px]">
                <input
                  value={localForwarder}
                  onChange={(e) => setLocalForwarder(e.target.value)}
                  onBlur={() => commitForwarder(localForwarder)}
                  className="w-full outline-none bg-transparent"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-end gap-2">
                <span className="min-w-[60px]">P.O. No.:</span>
                <div className="flex-1 border-b border-black pb-[2px]">
                  <input
                    inputMode="numeric"
                    pattern="\d*"
                    maxLength={6}
                    value={poNumber}
                    onChange={(e) => {
                      const digitsOnly = e.target.value
                        .replace(/\D/g, "")
                        .slice(0, 6);
                      setPoNumber(digitsOnly);
                      if (fieldErrors?.poNumber) {
                        setFieldErrors((f: any) => ({ ...f, poNumber: false }));
                      }
                    }}
                    onPaste={(e) => {
                      e.preventDefault();
                      const text = (e.clipboardData.getData("text") || "")
                        .replace(/\D/g, "")
                        .slice(0, 6);
                      setPoNumber(text);
                      if (fieldErrors?.poNumber) {
                        setFieldErrors((f: any) => ({ ...f, poNumber: false }));
                      }
                    }}
                    className={`w-full outline-none bg-transparent tracking-widest tabular-nums ${
                      fieldErrors?.poNumber ? "text-red-700" : ""
                    }`}
                    placeholder="000000"
                  />
                </div>
              </div>

              <div className="flex items-end gap-2">
                <span className="min-w-[70px]">Salesman:</span>
                <div className="flex-1 border-b border-black pb-[2px]">
                  <input
                    value={repName || ""}
                    onChange={(e) => {
                      setRepName(e.target.value);
                      if (fieldErrors?.repName) {
                        setFieldErrors((f: any) => ({ ...f, repName: false }));
                      }
                    }}
                    className={`w-full outline-none bg-transparent ${
                      fieldErrors?.repName ? "text-red-700" : ""
                    }`}
                    placeholder="Enter salesman name"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="text-[11px] opacity-80">
            Processed By: <b>{processor?.name || "Local Admin"}</b> (
            {processor?.email || "admin@uniasia.local"})
          </div>
        </div>

        {/* ITEMS TABLE */}
        <div className="mt-4 border border-black">
          <table className="w-full">
            <colgroup>
              {colWidths.map((w: string, i: number) => (
                <col key={i} style={{ width: w }} />
              ))}
            </colgroup>

            <thead className="text-[12px]">
              <tr className="border-b border-black">
                <th className="border-r border-black px-2 py-1 text-left">QTY</th>
                <th className="border-r border-black px-2 py-1 text-left">UNIT</th>
                <th className="border-r border-black px-2 py-1 text-left">ITEM DESCRIPTION</th>
                <th className="border-r border-black px-2 py-1 text-right whitespace-nowrap">UNIT PRICE</th>
                <th className="border-r border-black px-2 py-1 text-right whitespace-nowrap">DISCOUNT (%)</th>
                <th className="border-r border-black px-2 py-1 text-right whitespace-nowrap">AMOUNT</th>
                <th className="px-2 py-1 text-right whitespace-nowrap">TOTAL</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row: any, idx: number) => {
                if (!row) {
                  return (
                    <tr key={`blank-${idx}`} className="h-[20px]">
                      <td className="border-r border-black px-2 py-1" />
                      <td className="border-r border-black px-2 py-1" />
                      <td className="border-r border-black px-2 py-1" />
                      <td className="border-r border-black px-2 py-1" />
                      <td className="border-r border-black px-2 py-1" />
                      <td className="border-r border-black px-2 py-1" />
                      <td className="px-2 py-1" />
                    </tr>
                  );
                }

                const isRemoved = !!removedLines?.[idx];
                const orderedQty = Number(row.quantity || 0);
                const inStock = Number(row.inventory?.quantity || 0);
                const qty = isRemoved ? 0 : editedQuantities[idx] ?? orderedQty;
                const unit = row.inventory?.unit || "—";
                const desc = row.inventory?.product_name || "—";
                const unitPrice = Number(row.price || 0);

                const rawPct = editedDiscounts[idx] ?? 0;
                const pct = Math.max(0, Math.min(100, Number(rawPct) || 0));
                const lineAmount = qty * unitPrice * (1 - pct / 100);

                const rowId = String(row.id);
                const noteValue =
                  (editedReceiptNotes && editedReceiptNotes[rowId] !== undefined
                    ? editedReceiptNotes[rowId]
                    : row.remarks) || "";

                return (
                  <tr
                    key={`item-${idx}`}
                    className={`h-[20px] align-top ${
                      isRemoved ? "opacity-40" : ""
                    }`}
                  >
                    <td className="border-r border-black px-2 py-1">
                      <div className="flex flex-col gap-0.5">
                        <input
                          type="number"
                          min={0}
                          max={inStock}
                          value={String(qty)}
                          disabled={isRemoved}
                          onChange={(e) => {
                            const raw = Number(e.target.value);
                            const next = Number.isFinite(raw) ? raw : 0;
                            const clamped = Math.max(
                              0,
                              Math.min(next, inStock)
                            );
                            setEditedQuantities((prev: number[]) => {
                              const arr = [...(prev || [])];
                              arr[idx] = clamped;
                              return arr;
                            });
                            setRemovedLines((prev: boolean[]) => {
                              const arr = [...(prev || [])];
                              arr[idx] = clamped === 0;
                              return arr;
                            });
                          }}
                          className="w-[52px] bg-transparent outline-none text-left tabular-nums border-b border-black"
                        />
                        <div className="no-print flex justify-center">
                          {!isRemoved ? (
                            <button
                              type="button"
                              className="mt-[2px] text-[9px] leading-none text-red-600 underline hover:text-red-700"
                              onClick={() => {
                                setRemovedLines((prev: boolean[]) => {
                                  const arr = [...(prev || [])];
                                  arr[idx] = true;
                                  return arr;
                                });
                                setEditedQuantities((prev: number[]) => {
                                  const arr = [...(prev || [])];
                                  arr[idx] = 0;
                                  return arr;
                                });
                              }}
                            >
                              Remove
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="mt-[2px] text-[9px] leading-none text-blue-600 underline hover:text-blue-700"
                              onClick={() => {
                                setRemovedLines((prev: boolean[]) => {
                                  const arr = [...(prev || [])];
                                  arr[idx] = false;
                                  return arr;
                                });
                                setEditedQuantities((prev: number[]) => {
                                  const arr = [...(prev || [])];
                                  arr[idx] = Math.max(
                                    0,
                                    Math.min(orderedQty, inStock)
                                  );
                                  return arr;
                                });
                              }}
                            >
                              Undo
                            </button>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="border-r border-black px-2 py-1">{unit}</td>

                    <td className="border-r border-black px-2 py-1">
                      <div className="font-medium leading-tight">{desc}</div>
                      <div className="mt-1">
                        {receiptEditMode ? (
                          <input
                            value={noteValue}
                            onChange={(e) => {
                              if (!setEditedReceiptNotes) return;
                              setEditedReceiptNotes((prev: any) => ({
                                ...(prev || {}),
                                [rowId]: e.target.value,
                              }));
                            }}
                            disabled={!!savingReceiptNotes}
                            placeholder="Notes / Remarks..."
                            className="w-full text-[11px] px-2 py-1 border border-black/40 rounded-sm focus:outline-none focus:border-black bg-transparent"
                          />
                        ) : noteValue ? (
                          <div className="text-[11px] italic">
                            Notes: {noteValue}
                          </div>
                        ) : null}
                      </div>
                    </td>

                    <td className="border-r border-black px-2 py-1 text-right tabular-nums whitespace-nowrap">
                      {peso(unitPrice)}
                    </td>

                    <td className="border-r border-black px-2 py-1 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          value={pct === 0 ? "" : String(pct)}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw.trim() === "") {
                              setEditedDiscounts((prev: number[]) => {
                                const next = [...prev];
                                next[idx] = 0;
                                return next;
                              });
                              return;
                            }
                            let p = parseFloat(raw);
                            if (isNaN(p)) p = 0;
                            p = Math.max(0, Math.min(100, Math.floor(p)));
                            setEditedDiscounts((prev: number[]) => {
                              const next = [...prev];
                              next[idx] = p;
                              return next;
                            });
                          }}
                          className="w-[60px] bg-transparent outline-none text-right tabular-nums border-b border-black"
                          placeholder="—"
                        />
                        <span className="tabular-nums">%</span>
                      </div>
                    </td>

                    <td className="border-r border-black px-2 py-1 text-right tabular-nums whitespace-nowrap">
                      {peso(lineAmount)}
                    </td>

                    <td className="px-2 py-1 text-right tabular-nums whitespace-nowrap">
                      {peso(lineAmount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* BOTTOM TOTALS */}
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4 text-[12px]">
          <div />

          <div className="border border-black">
            <div className="grid grid-cols-2 border-b border-black">
              <div className="px-2 py-1 font-bold">Total Amount</div>
              <div className="px-2 py-1 text-right">
                {peso(subtotalBeforeDiscount)}
              </div>
            </div>

            <div className="grid grid-cols-2 border-b border-black">
              <div className="px-2 py-1 font-bold">Less</div>
              <div className="px-2 py-1 text-right">
                {totalDiscount ? `-${peso(Math.abs(totalDiscount))}` : peso(0)}
              </div>
            </div>

            <div className="grid grid-cols-2 border-b border-black">
              <div className="px-2 py-1 font-bold">Sales Tax (12%)</div>
              <div className="px-2 py-1 text-right">
                {isSalesTaxOn ? peso(salesTaxValue) : peso(0)}
              </div>
            </div>

            <div className="grid grid-cols-2">
              <div className="px-2 py-1 font-bold">Amount Due</div>
              <div className="px-2 py-1 text-right font-bold">
                {peso(displayAmountDue)}
              </div>
            </div>
          </div>
        </div>

        <div className="no-print mt-2 flex items-center gap-2 text-[12px]">
          <input
            type="checkbox"
            checked={isSalesTaxOn}
            onChange={() => setIsSalesTaxOn(!isSalesTaxOn)}
            className="accent-black"
            id="tax"
          />
          <label htmlFor="tax">Include Sales Tax (12%)</label>
        </div>
      </div>
    </div>
  );
}

function SalesPageContent() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [orders, setOrders] = useState<OrderWithDetails[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const [selectedOrder, setSelectedOrder] = useState<OrderWithDetails | null>(
    null
  );
  const [showSalesOrderModal, setShowSalesOrderModal] = useState(false);
  const [showFinalConfirm, setShowFinalConfirm] = useState(false);

  const orderRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const pendingOrdersSectionRef = useRef<HTMLDivElement>(null);

  const [editedQuantities, setEditedQuantities] = useState<number[]>([]);
  const [editedDiscounts, setEditedDiscounts] = useState<number[]>([]);
  const [removedLines, setRemovedLines] = useState<boolean[]>([]);
  const [pickingStatus, setPickingStatus] = useState<PickingOrder[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);

  const [numberOfTerms, setNumberOfTerms] = useState(1);
  const [interestPercent, setInterestPercent] = useState(0);

  const [poNumber, setPoNumber] = useState("");
  const [repName, setRepName] = useState(""); 
  const [isSalesTaxOn, setIsSalesTaxOn] = useState(true);
  const [isCompletingOrder, setIsCompletingOrder] = useState(false);
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);
  const [orderToReject, setOrderToReject] = useState<OrderWithDetails | null>(
    null
  );
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [forwarder, setForwarder] = useState("");

  const [localForwarder, setLocalForwarder] = useState("");

  const [receiptEditMode, setReceiptEditMode] = useState(false);
  const [savingReceiptNotes, setSavingReceiptNotes] = useState(false);
  const [editedReceiptNotes, setEditedReceiptNotes] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    setLocalForwarder(forwarder || "");
  }, [forwarder, selectedOrder?.id]);

  const commitForwarder = (v: string) => setForwarder(v);

  const [showLogsModal, setShowLogsModal] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [logOrderId, setLogOrderId] = useState<string | null>(null);

  type Processor = { name: string; email: string; role: string | null };
  const [processor, setProcessor] = useState<Processor | null>(null);

  const [invSortKey, setInvSortKey] = useState<InvSortKey>("product_name");
  const [invSortDir, setInvSortDir] = useState<"asc" | "desc">("asc");
  const INV_ROWS_PER_PAGE = 10;
  const [invPage, setInvPage] = useState(1);

  const nameOnly = (s: string) =>
    (s || "")
      .replace(/[^A-Za-z\s]/g, "")
      .trim()
      .slice(0, 30);

  // SUPABASE REMOVED: Replaced auth fetch with a local offline mock
  useEffect(() => {
    setProcessor({
      name: "Local Admin",
      email: "admin@uniasia.local",
      role: "admin",
    });
  }, []);

  useEffect(() => {
    try {
      const id = sessionStorage.getItem("scroll-to-order-id");
      if (id) {
        sessionStorage.removeItem("scroll-to-order-id");
        setPendingScrollId(id);
      }
    } catch {}
  }, []);

  useEffect(() => {
    const handler = (id: string) => setPendingScrollId(id);
    on("scroll-to-order", handler);
    return () => off("scroll-to-order", handler);
  }, []);

  // SUPABASE REMOVED: Log fetch disabled
  async function fetchActivityLogs(orderId: string) {
    toast.error("Activity logs disabled in Offline Mode.");
  }

  const [movingProducts, setMovingProducts] = useState<MovingProduct[]>([]);
  const [showMovingReport, setShowMovingReport] = useState(false);

  const fetchItems = async () => {
    try {
      const res = await fetch('/api/sales-local/inventory');
      const json = await res.json();
      if (json.data) {
        setItems(json.data);
      }
    } catch (error) {
      toast.error("Failed to load local inventory.");
    }
  };

  const fetchOrders = async () => {
    try {
      const res = await fetch('/api/sales-local/orders');
      const json = await res.json();
      if (json.data) {
        setOrders(json.data);
      }
    } catch (error) {
      toast.error("Failed to load local orders.");
    }
  };

  const fetchMovingProducts = async () => {
    try {
      // NOTE: API Route needed for moving products
    } catch (error) {
      console.log("Moving products route not ready.");
    }
  };

  const ordersPerPage = 10;

  const interestFromTerms = (terms: number) => {
    if (!terms || terms <= 0) return 0;
    if (terms <= 1) return 2;
    if (terms <= 3) return 6;
    if (terms <= 6) return 12;
    if (terms <= 12) return 24;
    return Math.min(30, Math.round((terms / 12) * 24));
  };

  const totals = useMemo(() => {
    if (!selectedOrder) {
      return {
        subtotalBeforeDiscount: 0,
        totalDiscount: 0,
        subtotalAfterDiscount: 0,
        tax: 0,
        effectiveInterestPercent: 0,
        interestAmount: 0,
        grandTotal: 0,
        perTerm: 0,
      };
    }

    const subtotalBeforeDiscountCalc = selectedOrder.order_items.reduce(
      (sum, item, idx) => {
        if (item.inventory.quantity === 0) return sum;
        const qty = editedQuantities[idx] ?? item.quantity;
        return sum + qty * item.price;
      },
      0
    );

    const totalDiscountCalc = selectedOrder.order_items.reduce(
      (sum, item, idx) => {
        if (item.inventory.quantity === 0) return sum;
        const qty = editedQuantities[idx] ?? item.quantity;
        const percent = editedDiscounts[idx] ?? 0;
        return sum + qty * item.price * (percent / 100);
      },
      0
    );

    const subtotalAfterDiscount = Math.max(
      0,
      subtotalBeforeDiscountCalc - totalDiscountCalc
    );

    const tax = isSalesTaxOn ? subtotalAfterDiscount * 0.12 : 0;
    const baseTotal = subtotalAfterDiscount + tax;

    const isCredit = selectedOrder.customers.payment_type === "Credit";
    const effectiveInterestPercent = isCredit
      ? interestPercent || interestFromTerms(numberOfTerms)
      : 0;

    const interestAmount = baseTotal * (effectiveInterestPercent / 100);
    const grandTotal = baseTotal + interestAmount;
    const perTerm =
      isCredit && numberOfTerms > 0 ? grandTotal / numberOfTerms : grandTotal;

    return {
      subtotalBeforeDiscount: subtotalBeforeDiscountCalc,
      totalDiscount: totalDiscountCalc,
      subtotalAfterDiscount,
      tax,
      effectiveInterestPercent,
      interestAmount,
      grandTotal,
      perTerm,
    };
  }, [
    selectedOrder,
    editedQuantities,
    editedDiscounts,
    isSalesTaxOn,
    numberOfTerms,
    interestPercent,
  ]);

  const hasInsufficientStock = useMemo(() => {
    if (!selectedOrder) return false;
    return selectedOrder.order_items.some((item, idx) => {
      const qtyRequested = editedQuantities[idx] ?? item.quantity;
      const inStock = Number(item.inventory.quantity || 0);
      return inStock === 0 || qtyRequested > inStock;
    });
  }, [selectedOrder, editedQuantities]);

  const computedOrderTotal = totals.subtotalAfterDiscount;
  const salesTaxValue = totals.tax;
  const getGrandTotalWithInterest = () => totals.grandTotal;
  const getPerTermAmount = () => totals.perTerm;
  const subtotalBeforeDiscount = totals.subtotalBeforeDiscount;
  const totalDiscount = totals.totalDiscount;

  function scrollToOrder(orderId: string) {
    const el = orderRefs.current[orderId];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-blue-500");
      setTimeout(() => el.classList.remove("ring-2", "ring-blue-500"), 1200);
    }
  }

  const completedOrders = useMemo(
    () => orders.filter((o) => o.status === "completed").length,
    [orders]
  );

  const displayAmountDue = useMemo(
    () => totals.grandTotal,
    [totals.grandTotal]
  );

  const pendingOrAccepted = useMemo(
    () =>
      orders.filter((o) => o.status === "pending" || o.status === "accepted"),
    [orders]
  );

  const pendingOrders = useMemo(
    () => orders.filter((o) => o.status === "pending").length,
    [orders]
  );

  useEffect(() => {
    setInvPage(1);
  }, [searchQuery]);

  useEffect(() => {
    fetchItems();
    fetchOrders();
    fetchMovingProducts();

    const refreshInterval = setInterval(() => {
      fetchItems();
      fetchOrders();
      fetchMovingProducts();
    }, 10000);

    return () => clearInterval(refreshInterval);
  }, []);

  const resetSalesForm = () => {
    setPoNumber("");
    setRepName(""); 
    setForwarder("");
    setLocalForwarder("");
    setNumberOfTerms(1);
    setInterestPercent(0);
    setIsSalesTaxOn(true);
    setEditedQuantities([]);
    setEditedDiscounts([]);
    setFieldErrors({ poNumber: false, repName: false });

    setReceiptEditMode(false);
    setSavingReceiptNotes(false);
    setEditedReceiptNotes({});
    setRemovedLines([]);
  };

  useEffect(() => {
    if (!showSalesOrderModal) resetSalesForm();
  }, [showSalesOrderModal]);

  const isOrderAccepted = (orderId: string) =>
    pickingStatus.some((p) => p.orderId === orderId && p.status === "accepted");

  const [fieldErrors, setFieldErrors] = useState<{ [key: string]: boolean }>({
    poNumber: false,
    repName: false,
  });

  const filteredInventory = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => {
      const hay =
        `${it.product_name} ${it.sku} ${it.category} ${it.subcategory}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, searchQuery]);

  const sortedInventory = useMemo(() => {
    const arr = [...filteredInventory];
    const dir = invSortDir === "asc" ? 1 : -1;

    const getVal = (it: InventoryItem, key: InvSortKey): any => {
      if (key === "total")
        return (Number(it.cost_price) || 0) * (Number(it.quantity) || 0);
      if (key === "cost_price") return it.cost_price ?? null;
      return (it as any)[key];
    };

    arr.sort((a, b) => {
      const va = getVal(a, invSortKey);
      const vb = getVal(b, invSortKey);

      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;

      if (typeof va === "number" && typeof vb === "number")
        return (va - vb) * dir;

      const sa = String(va).toLowerCase();
      const sb = String(vb).toLowerCase();
      if (sa < sb) return -1 * dir;
      if (sa > sb) return 1 * dir;
      return 0;
    });

    return arr;
  }, [filteredInventory, invSortKey, invSortDir]);

  const invTotalRows = sortedInventory.length;
  const invTotalPages = Math.max(
    1,
    Math.ceil(invTotalRows / INV_ROWS_PER_PAGE)
  );
  const invClampedPage = Math.min(invPage, invTotalPages);
  const invStart = (invClampedPage - 1) * INV_ROWS_PER_PAGE;
  const invEnd = Math.min(invStart + INV_ROWS_PER_PAGE, invTotalRows);
  const pagedInventory = useMemo(
    () => sortedInventory.slice(invStart, invEnd),
    [sortedInventory, invStart, invEnd]
  );

  const toggleInvSort = (key: InvSortKey) => {
    setInvPage(1);
    setInvSortKey((prevKey) => {
      if (prevKey === key) {
        setInvSortDir((prevDir) => (prevDir === "asc" ? "desc" : "asc"));
        return prevKey;
      } else {
        setInvSortDir("asc");
        return key;
      }
    });
  };

  const sortIcon = (key: InvSortKey) => {
    if (invSortKey !== key) return "↕";
    return invSortDir === "asc" ? "▲" : "▼";
  };

  // SUPABASE REMOVED: Mock save behavior
  const saveReceiptNotes = async () => {
    if (!selectedOrder) return;
    if (savingReceiptNotes) return;

    setSavingReceiptNotes(true);
    setTimeout(() => {
      toast.success("Receipt notes saved (Offline Mode)!");
      setReceiptEditMode(false);
      setSavingReceiptNotes(false);
    }, 500);
  };

  /* ======= 3. MUTATIONS (Accept / Reject / Complete) ======= 
     SUPABASE REMOVED: These functions now only update the UI visually 
     so you can test the frontend workflow. You will need to build 
     API POST routes for these to actually save to XAMPP later.
  =============================================================*/
  
  const handleAcceptOrder = async (order: OrderWithDetails) => {
    toast.success("Order accepted (Offline UI Mode)");
    
    setSelectedOrder(order);
    setRepName("");
    setEditedQuantities(order.order_items.map((it) => it.quantity));
    setEditedDiscounts(order.order_items.map((it) => it.discount_percent ?? 0));
    setRemovedLines(order.order_items.map(() => false));

    setNumberOfTerms(order.payment_terms || 1);
    setInterestPercent(
      order.interest_percent || interestFromTerms(order.payment_terms || 1)
    );

    const initialNotes: Record<string, string> = {};
    (order.order_items || []).forEach((oi) => {
      if (oi?.id != null)
        initialNotes[String(oi.id)] = (oi.remarks ?? "") as string;
    });
    setEditedReceiptNotes(initialNotes);
    setReceiptEditMode(false);

    setShowSalesOrderModal(true);
    setPickingStatus((prev) => [
      ...prev,
      { orderId: order.id, status: "accepted" },
    ]);
  };

  const handleRejectOrder = async (order: OrderWithDetails) => {
    toast.success("Order rejected (Offline UI Mode)");
    
    setPickingStatus((prev) => [
      ...prev,
      { orderId: order.id, status: "rejected" },
    ]);
    
    // Visually remove it from the list
    setOrders((prev) => prev.filter((o) => o.id !== order.id));
  };

  const handleOrderComplete = async () => {
    if (!selectedOrder || isCompletingOrder) return;

    setFieldErrors({ poNumber: false, repName: false });
    const errors: Record<string, boolean> = {};
    if (!poNumber || !poNumber.trim()) errors.poNumber = true;
    if (!repName || !repName.trim()) errors.repName = true;
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      toast.error("Please fill all required fields!");
      return;
    }

    setIsCompletingOrder(true);
    
    // Simulate network delay
    setTimeout(() => {
      toast.success("Order successfully completed (Offline UI Mode)!");
      
      setShowSalesOrderModal(false);
      setShowFinalConfirm(false);
      resetSalesForm();
      
      setPickingStatus((prev) =>
        prev.filter((p) => p.orderId !== selectedOrder.id)
      );
      
      // Visually remove it from the list
      setOrders((prev) => prev.filter((o) => o.id !== selectedOrder.id));
      
      setSelectedOrder(null);
      setIsCompletingOrder(false);
    }, 1000);
  };

  /* ======= UI ======= */
  const pagedOrders = useMemo(() => {
    return pendingOrAccepted.slice(
      (currentPage - 1) * ordersPerPage,
      currentPage * ordersPerPage
    );
  }, [pendingOrAccepted, currentPage]);

  const totalPages = Math.max(
    1,
    Math.ceil(pendingOrAccepted.length / ordersPerPage)
  );

  return (
    <div className="p-6">
      {isCompletingOrder && <PageLoader label="Completing order…" />}

      {/* Header */}
      <div className="mb-6 -mt-4">
        <h1 className="text-3xl font-bold tracking-tight text-neutral-800">
          Sales Processing
        </h1>
        <p className="text-sm text-gray-500 mt-2">
          Manage customer orders, picking lists, and sales confirmations.
        </p>
      </div>

      <input
        type="text"
        placeholder="Search inventory (name, SKU, category, subcategory)…"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="mb-4 w-full md:w-1/3 px-4 py-2 border rounded"
      />

      {/* Cards Section */}
      <div className="flex flex-wrap gap-4 mb-8">
        {/* Moving Products Report (combined) */}
        <div
          className="bg-white rounded-2xl shadow p-5 min-w-[210px] flex-1 max-w-xs cursor-pointer hover:shadow-lg hover:-translate-y-1 transition"
          title="Click to view Moving Products Report"
          onClick={() => setShowMovingReport(true)}
        >
          <div className="text-xs text-gray-500 font-semibold mb-2">
            Moving Products Report
          </div>
          {movingProducts.length > 0 ? (
            <>
              <div className="text-base font-bold text-blue-700 mb-1 underline hover:text-blue-900 transition">
                {movingProducts[0].product_name}
              </div>
              <div className="text-sm text-gray-600">
                Sold in last 90d:{" "}
                <b>{movingProducts[0].units_90d.toLocaleString()}</b> units
                <br />
                Stock Left:{" "}
                <b>{movingProducts[0].current_stock.toLocaleString()}</b>
              </div>
            </>
          ) : (
            <div className="text-sm text-gray-400">No data</div>
          )}
        </div>

        {/* Total Orders */}
        <div className="bg-white rounded-2xl shadow p-5 min-w-[210px] flex-1 max-w-xs">
          <div className="text-xs text-gray-500 font-semibold mb-2">
            Total Orders
          </div>
          <div className="text-2xl font-bold text-black mb-1">
            {orders.length}
          </div>
        </div>

        {/* Completed Orders */}
        <div className="bg-white rounded-2xl shadow p-5 min-w-[210px] flex-1 max-w-xs">
          <div className="text-xs text-gray-500 font-semibold mb-2">
            Completed Orders
          </div>
          <div className="text-2xl font-bold text-blue-700 mb-1">
            {completedOrders}
          </div>
        </div>

        {/* Pending Orders (jump) */}
        <div
          className="bg-white rounded-2xl shadow p-5 min-w-[210px] flex-1 max-w-xs cursor-pointer hover:shadow-lg hover:-translate-y-1 transition"
          title="Jump to Pending Orders"
          onClick={() => {
            if (pendingOrders > 0) {
              document
                .getElementById("pending-orders-section")
                ?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                });
            } else {
              toast.info("No Available Orders");
            }
          }}
        >
          <div className="text-xs text-gray-500 font-semibold mb-2">
            Pending Orders
          </div>
          <div className="text-2xl font-bold text-orange-500 mb-1">
            {pendingOrders}
          </div>
        </div>
      </div>

      {/* --- MOVING PRODUCTS REPORT MODAL (combined fast/slow) --- */}
      <AnimatePresence>
        {showMovingReport && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed z-50 inset-0 flex items-center justify-center bg-black/40"
            onClick={() => setShowMovingReport(false)}
          >
            <motion.div
              initial={{ scale: 0.97 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.97 }}
              transition={{ type: "spring", stiffness: 400, damping: 32 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-[98vw] md:max-w-5xl p-0 md:p-8 border overflow-x-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <span className="text-xl font-bold text-black">
                  Moving Products Report{" "}
                  <span className="font-normal text-base text-gray-600">
                    (last 90 days)
                  </span>
                </span>
                <button
                  className="w-8 h-8 text-gray-400 hover:bg-gray-100 rounded-full flex items-center justify-center text-xl"
                  onClick={() => setShowMovingReport(false)}
                  title="Close"
                >
                  ×
                </button>
              </div>
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
                    {movingProducts.map((prod, idx) => (
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
                          {prod.units_90d.toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {prod.current_stock.toLocaleString()}
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
                    ))}
                  </tbody>
                </table>
                <div className="text-xs text-gray-500 mt-4">
                  <b>Days of Cover</b> = Stock Left ÷ average daily sales (last
                  90 days). Highest rows are “fast”; lowest rows are “slow”.
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Inventory Table (with sorting & pagination) */}
      <div className="overflow-x-auto rounded-lg shadow mb-2">
        <table className="min-w-full bg-white text-sm">
          <thead className="bg-[#ffba20] text-black text-left">
            <tr>
              {[
                { key: "sku", label: "SKU" },
                { key: "product_name", label: "Product" },
                { key: "category", label: "Category" },
                { key: "subcategory", label: "Subcategory" },
                { key: "unit", label: "Unit" },
                { key: "quantity", label: "Quantity", align: "right" },
                { key: "cost_price", label: "Cost Price", align: "right" },
                { key: "total", label: "Total", align: "right" },
              ].map((h) => (
                <th
                  key={h.key}
                  className={`py-2 px-4 ${
                    h.align === "right" ? "text-right" : ""
                  }`}
                >
                  <button
                    onClick={() => toggleInvSort(h.key as InvSortKey)}
                    className="inline-flex items-center gap-1 font-semibold hover:opacity-80"
                    title={`Sort by ${h.label}`}
                    aria-label={`Sort by ${h.label}`}
                  >
                    <span>{h.label}</span>
                    <span className="text-xs">
                      {sortIcon(h.key as InvSortKey)}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {pagedInventory.map((it) => (
              <tr
                key={it.id}
                className={
                  "border-b hover:bg-gray-100 " +
                  (it.quantity === 0
                    ? "bg-red-100 text-red-700 font-semibold"
                    : "")
                }
              >
                <td className="py-2 px-4">{it.sku}</td>
                <td className="py-2 px-4">{it.product_name}</td>
                <td className="py-2 px-4">{it.category}</td>
                <td className="py-2 px-4">{it.subcategory}</td>
                <td className="py-2 px-4">{it.unit}</td>
                <td className="py-2 px-4 text-right">{it.quantity}</td>

                <td className="py-2 px-4 text-right">
                  {it.cost_price !== undefined && it.cost_price !== null
                    ? peso(it.cost_price)
                    : "—"}
                </td>

                <td className="py-2 px-4 text-right">
                  {peso(
                    (Number(it.cost_price) || 0) * (Number(it.quantity) || 0)
                  )}
                </td>
              </tr>
            ))}

            {pagedInventory.length === 0 && (
              <tr>
                <td className="py-4 px-4 text-center text-gray-500" colSpan={8}>
                  No inventory found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Inventory pagination controls */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-6">
        <div className="text-sm text-gray-600">
          Rows {invTotalRows === 0 ? 0 : invStart + 1}–{invEnd} of{" "}
          {invTotalRows}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setInvPage((p) => Math.max(1, p - 1))}
            disabled={invClampedPage === 1}
            className={`px-3 py-1.5 rounded ${
              invClampedPage === 1
                ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            ← Prev
          </button>
          <span className="text-sm font-semibold text-gray-700">
            Page {invClampedPage} of {invTotalPages}
          </span>
          <button
            onClick={() => setInvPage((p) => (p < invTotalPages ? p + 1 : p))}
            disabled={invClampedPage >= invTotalPages}
            className={`px-3 py-1.5 rounded ${
              invClampedPage >= invTotalPages
                ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            Next →
          </button>
        </div>
      </div>

      {/* Orders List */}
      <div
        className="mt-10"
        id="pending-orders-section"
        ref={pendingOrdersSectionRef}
      >
        <h2 className="text-2xl font-bold mb-4">Customer Orders (Pending)</h2>

        {pendingOrAccepted.length === 0 && (
          <div className="text-gray-500 italic mb-6">
            No pending or accepted orders.
          </div>
        )}

        {pagedOrders.map((order) => {
          const isAccepted = isOrderAccepted(order.id);
          const isRejected = pickingStatus.some(
            (p) => p.orderId === order.id && p.status === "rejected"
          );

          return (
            <div
              key={order.id}
              id={`order-card-${order.id}`}
              ref={(el) => {
                orderRefs.current[order.id] = el;
              }}
              className={`border p-4 mb-4 rounded shadow bg-white text-base transition-all duration-500 ${
                isAccepted ? "border-blue-600 border-2" : ""
              }`}
            >
              <div className="flex justify-between items-center mb-2">
                <span className="font-bold text-xl">
                  Transaction ID:{" "}
                  <span className="text-blue-700">
                    {order.customers.code ?? "—"}
                  </span>
                </span>
                <span
                  className={`font-bold px-3 py-1 rounded text-base ml-4 ${
                    order.customers.payment_type === "Credit"
                      ? "bg-blue-200 text-blue-800"
                      : order.customers.payment_type === "Cash"
                      ? "bg-green-200 text-green-700"
                      : "bg-orange-200 text-orange-700"
                  }`}
                >
                  {order.customers.payment_type || "N/A"}
                </span>
              </div>

              {isAccepted && (
                <div className="mb-2 flex items-center">
                  <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-base font-semibold shadow-sm">
                    Processing by Admin
                  </span>
                </div>
              )}

              <p className="font-bold">Customer: {order.customers.name}</p>
              <p>Email: {order.customers.email}</p>
              <p>Phone: {order.customers.phone}</p>
              <p>Address: {order.customers.address}</p>
              <p>Status: {order.status}</p>
              <p>
                Order Date &amp; Time: {formatPHDate(order.date_created)}{" "}
                {formatPHTime(order.date_created)}
              </p>

              <ul className="mt-2 list-disc list-inside">
                {order.order_items.map((item, idx) => (
                  <li key={idx}>
                    {item.inventory.product_name} - {item.quantity} pcs
                    <br />
                    <span className="text-sm text-gray-600">
                      Ordered: {peso(item.price)} | Now:{" "}
                      {peso(item.inventory.unit_price)}
                    </span>
                  </li>
                ))}
              </ul>

              <p className="mt-2 font-bold text-lg">
                Total: {peso(order.total_amount)}
              </p>

              {order.status !== "completed" && order.status !== "rejected" && (
                <div className="flex gap-2 mt-2">
                  {!isAccepted && !isRejected && (
                    <>
                      <button
                        onClick={() => handleAcceptOrder(order)}
                        className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 text-base"
                      >
                        Accept Order
                      </button>
                      <button
                        onClick={() => {
                          setShowRejectConfirm(true);
                          setOrderToReject(order);
                        }}
                        className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 text-base"
                      >
                        Reject Order
                      </button>
                    </>
                  )}

                  {isAccepted && (
                    <button
                      onClick={() => {
                        setPickingStatus((prev) =>
                          prev.filter((p) => p.orderId !== order.id)
                        );
                        setEditedQuantities([]);
                        setEditedDiscounts([]);
                        setSelectedOrder(null);
                        setShowSalesOrderModal(false);
                        resetSalesForm();
                      }}
                      className="bg-gray-400 text-white px-4 py-2 rounded hover:bg-gray-500"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Orders Pagination */}
        <div className="flex justify-between items-center mt-6">
          <button
            onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
            disabled={currentPage === 1}
            className={`px-4 py-2 rounded ${
              currentPage === 1
                ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            ← Prev
          </button>
          <span className="text-base font-semibold text-gray-700">
            Page {Math.min(currentPage, totalPages)} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage((p) => (p < totalPages ? p + 1 : p))}
            disabled={currentPage >= totalPages}
            className={`px-4 py-2 rounded ${
              currentPage >= totalPages
                ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            Next →
          </button>
        </div>
      </div>

      {/* SALES ORDER MODAL */}
      {showSalesOrderModal && selectedOrder && (
        <div
          className="fixed inset-0 bg-black/40 flex justify-center items-start z-50 overflow-y-auto"
          onClick={() => {
            setShowSalesOrderModal(false);
            resetSalesForm();
            setSelectedOrder(null);
          }}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-[96vw] h-[94vh] mx-auto flex flex-col px-6 py-6 my-4 max-w-5xl overflow-y-auto mt-16"
            onClick={(e) => e.stopPropagation()}
          >
            <ReceiptLikeSalesOrder
              selectedOrder={selectedOrder}
              poNumber={poNumber}
              setPoNumber={setPoNumber}
              processor={processor}
              repName={repName}
              setRepName={setRepName}
              localForwarder={localForwarder}
              setLocalForwarder={setLocalForwarder}
              commitForwarder={commitForwarder}
              numberOfTerms={numberOfTerms}
              isSalesTaxOn={isSalesTaxOn}
              setIsSalesTaxOn={setIsSalesTaxOn}
              editedQuantities={editedQuantities}
              editedDiscounts={editedDiscounts}
              setEditedDiscounts={setEditedDiscounts}
              fieldErrors={fieldErrors}
              setFieldErrors={setFieldErrors}
              subtotalBeforeDiscount={subtotalBeforeDiscount}
              totalDiscount={totalDiscount}
              salesTaxValue={salesTaxValue}
              displayAmountDue={displayAmountDue}
              receiptEditMode={receiptEditMode}
              setReceiptEditMode={setReceiptEditMode}
              savingReceiptNotes={savingReceiptNotes}
              editedReceiptNotes={editedReceiptNotes}
              setEditedReceiptNotes={setEditedReceiptNotes}
              saveReceiptNotes={saveReceiptNotes}
              removedLines={removedLines}
              setRemovedLines={setRemovedLines}
              setEditedQuantities={setEditedQuantities}
            />

            {/* Bottom Actions */}
            <div className="no-print flex justify-center gap-6 mt-6">
              <button
                className={`px-10 py-3 rounded-xl text-lg font-semibold shadow transition
                  ${
                    hasInsufficientStock
                      ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                      : "bg-green-600 text-white hover:bg-green-700"
                  }`}
                onClick={() => {
                  if (hasInsufficientStock) {
                    toast.error(
                      "Cannot proceed: at least one item is out of stock or exceeds available stock."
                    );
                    return;
                  }
                  setShowFinalConfirm(true);
                }}
                disabled={hasInsufficientStock}
              >
                Confirm
              </button>

              <button
                className="bg-gray-400 text-white px-10 py-3 rounded-xl text-lg font-semibold shadow hover:bg-gray-500 transition"
                onClick={() => {
                  setShowSalesOrderModal(false);
                  resetSalesForm();
                  setSelectedOrder(null);
                }}
              >
                Back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FINAL CONFIRMATION */}
      {showFinalConfirm && selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl mx-auto p-10 text-center">
            <div className="text-xl font-bold mb-6 text-gray-800">
              Are you sure you want to{" "}
              <span className="text-green-700">COMPLETE</span> this order?
            </div>
            <div className="text-base mb-6">
              This will deduct the items from inventory, mark the order as
              completed, and record the sales transaction.
            </div>
            <div className="flex justify-center gap-10 mt-4">
              <button
                className={`px-8 py-3 rounded-xl text-lg font-semibold shadow flex items-center justify-center transition
                  ${
                    isCompletingOrder || hasInsufficientStock
                      ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                      : "bg-green-600 text-white hover:bg-green-700"
                  }`}
                onClick={() => {
                  if (hasInsufficientStock) {
                    toast.error("Cannot proceed: fix stock issues first.");
                    return;
                  }
                  handleOrderComplete();
                }}
                disabled={isCompletingOrder || hasInsufficientStock}
                aria-busy={isCompletingOrder}
              >
                {isCompletingOrder ? (
                  <>
                    <span className="inline-block h-5 w-5 rounded-full border-2 border-white/70 border-t-transparent animate-spin mr-2" />
                    Processing…
                  </>
                ) : (
                  "Yes, Confirm Order"
                )}
              </button>

              <button
                className={`bg-gray-400 text-white px-8 py-3 rounded-xl text-lg font-semibold shadow transition ${
                  isCompletingOrder
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:bg-gray-500"
                }`}
                onClick={() => setShowFinalConfirm(false)}
                disabled={isCompletingOrder}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REJECT CONFIRM */}
      {showRejectConfirm && orderToReject && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-auto p-8 text-center">
            <div className="text-xl font-bold mb-6 text-gray-800">
              Are you sure you want to{" "}
              <span className="text-red-600">REJECT</span> this order?
            </div>
            <div className="text-base mb-6">
              This will permanently reject the order and notify the customer.
            </div>
            <div className="flex justify-center gap-8 mt-4">
              <button
                className="bg-red-600 text-white px-8 py-3 rounded-xl text-lg font-semibold shadow hover:bg-red-700 transition"
                onClick={async () => {
                  await handleRejectOrder(orderToReject);
                  setShowRejectConfirm(false);
                  setOrderToReject(null);
                }}
              >
                Yes, Reject Order
              </button>
              <button
                className="bg-gray-400 text-white px-8 py-3 rounded-xl text-lg font-semibold shadow hover:bg-gray-500 transition"
                onClick={() => {
                  setShowRejectConfirm(false);
                  setOrderToReject(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SalesPage() {
  return (
    <Suspense fallback={<PageLoader label="Loading sales…" />}>
      <SalesPageContent />
    </Suspense>
  );
}
