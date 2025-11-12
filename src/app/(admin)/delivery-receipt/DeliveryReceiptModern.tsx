"use client";

import { useState } from "react";
import { toast } from "sonner";
import supabase from "@/config/supabaseClient";

// --------- Types (reuse in your invoice page) ----------
export type InvoiceItem = {
  id: string;
  qty: number;
  unit: string;
  description: string;
  unitPrice: number;
  discount: number; // percent
  inStock?: boolean;
  orderedQty?: number; // original order qty
  remarks?: string;
};

export type CustomerInfo = {
  name: string;
  address?: string;
  code?: string;
  email?: string;
  phone?: string;
  area?: string;
};

type DeliveryReceiptModernProps = {
  customer: CustomerInfo;
  initialItems: InvoiceItem[];
  setItems?: React.Dispatch<React.SetStateAction<InvoiceItem[] | null>>;
  initialDate?: string | null;
  terms?: string | null;
  salesman?: string | null;
  poNo?: string | null;
  totals?: {
    salesTax?: number;
    grandTotalWithInterest?: number;
    perTermAmount?: number;
    shippingFee?: number; // not taxed
  };
  txn?: string;
  status?: string | null;

  // Optional parent-controlled edit state
  editMode?: boolean;
  savingAll?: boolean;
  editedRemarks?: Record<string, string>;
  setEditedRemarks?: React.Dispatch<React.SetStateAction<Record<string, string>>>;
};

export default function DeliveryReceiptModern({
  customer,
  initialItems,
  setItems,
  initialDate,
  terms,
  salesman,
  poNo,
  totals,
  txn,
  status,
  editMode: editModeProp,
  savingAll: savingAllProp,
  editedRemarks: editedRemarksProp,
  setEditedRemarks: setEditedRemarksProp,
}: DeliveryReceiptModernProps) {
  // Internal fallbacks when parent doesn't control
  const [editModeLocal, setEditModeLocal] = useState(false);
  const [editedRemarksLocal, setEditedRemarksLocal] = useState<Record<string, string>>({});
  const [savingAllLocal, setSavingAllLocal] = useState(false);

  const editMode = editModeProp ?? editModeLocal;
  const savingAll = savingAllProp ?? savingAllLocal;
  const editedRemarks = editedRemarksProp ?? editedRemarksLocal;
  const setEditedRemarks = setEditedRemarksProp ?? setEditedRemarksLocal;

  const getDefaultRemarks = (item: InvoiceItem) => (item.remarks ? item.remarks : "");

  function startEdit() {
    const remap: Record<string, string> = {};
    (initialItems || []).forEach((it) => (remap[it.id] = it.remarks ?? getDefaultRemarks(it)));
    setEditedRemarks(remap);
    if (!editModeProp) setEditModeLocal(true);
  }

  async function saveAllRemarks() {
    if (!setItems || !editedRemarks || !Object.keys(editedRemarks).length || !editMode) return;
    setSavingAllLocal(true);
    await Promise.all(
      Object.entries(editedRemarks).map(([id, remark]) =>
        supabase.from("order_items").update({ remarks: remark }).eq("id", id)
      )
    );
    setItems((prev) =>
      prev
        ? prev.map((it) =>
            editedRemarks[it.id] !== undefined ? { ...it, remarks: editedRemarks[it.id] } : it
          )
        : prev
    );
    if (!editModeProp) setEditModeLocal(false);
    setSavingAllLocal(false);
    toast.success("Saved!");
  }

  // ---- Helpers ----
  const nOrNull = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  // --- Calculations (line math stays purely informational) ---
  const rows = initialItems || [];
  const inStockRows = rows.filter((i) => i.inStock !== false);

  const subtotal = inStockRows.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const totalDiscount = inStockRows.reduce((s, i) => {
    const line = i.qty * i.unitPrice;
    return s + (line * (i.discount || 0)) / 100;
  }, 0);
  const afterDiscount = subtotal - totalDiscount;

  const TAX_RATE = 0.12;
  const computedSalesTax = afterDiscount * TAX_RATE;

  const savedSalesTax = nOrNull(totals?.salesTax);
  const salesTaxOut = savedSalesTax ?? computedSalesTax;

  const savedGrand = nOrNull(totals?.grandTotalWithInterest);
  const computedGrandTotal = afterDiscount + salesTaxOut;

  // IMPORTANT: Prefer saved GTWI if provided; otherwise fall back to computed
  const grandTotalOut = savedGrand ?? computedGrandTotal;

  const perTermOut = nOrNull(totals?.perTermAmount) ?? 0;

  const shippingFee = nOrNull(totals?.shippingFee) ?? 0; // not taxed

  // Interest is the delta between saved grand total and (afterDiscount + VAT)
  const baseBeforeInterest = afterDiscount + salesTaxOut;
  const rawInterest = grandTotalOut - baseBeforeInterest;
  const interestAmount = Math.max(0, rawInterest);
  const interestPercent =
    baseBeforeInterest > 0 && interestAmount > 0 ? (interestAmount / baseBeforeInterest) * 100 : 0;

  // Final amount due = grand total (incl VAT/interest) + shipping fee (not taxed)
 const finalAmountDue = grandTotalOut;

  // Currency format
  function formatCurrency(n: number) {
    return n.toLocaleString("en-PH", {
      style: "currency",
      currency: "PHP",
      minimumFractionDigits: 2,
    });
  }

  return (
    <div className="w-full max-w-4xl mx-auto bg-white p-7 rounded-xl shadow print:shadow-none print:p-8 print:max-w-none print:w-[100%] text-black">
      {/* Hide all .no-print elements in PDF */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
        }
      `}</style>

      {/* Header */}
      <div className="relative mb-10">
        <div className="flex flex-col items-center justify-center text-center">
          <h2 className="text-4xl font-extrabold tracking-tight text-neutral-900 mb-1 -mt-3">
            UNIASIA
          </h2>
          <div className="text-base font-small text-neutral-500 mb-2">
            SITIO II MANGGAHAN BAHAY PARE, MEYCAUAYAN CITY BULACAN
          </div>
          <div className="text-x2 font-bold text-yellow-600 tracking-widest mb-1">
            DELIVERY RECEIPT
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs mb-4 border border-neutral-300 rounded-lg p-3">
        <div>
          <div>
            <b>CUSTOMER:</b> {customer?.name || "—"}
          </div>
          <div>
            <b>ADDRESS:</b> {customer?.address || "—"}
          </div>
          <div>
            <b>FORWARDER:</b>
          </div>
          <div>
            <b>SALESMAN:</b> {salesman || "—"}
          </div>
          {customer?.email && (
            <div>
              <b>EMAIL:</b> {customer.email}
            </div>
          )}
          {customer?.phone && (
            <div>
              <b>PHONE:</b> {customer.phone}
            </div>
          )}
          {customer?.area && (
            <div>
              <b>AREA:</b> {customer.area}
            </div>
          )}
        </div>
        <div>
          <div>
            <b>DATE:</b> {initialDate ? initialDate : "—"}
          </div>
          <div>
            <b>TERMS:</b> {terms || "—"}
          </div>
          <div>
            <b>P.O NO:</b> {poNo || "—"}
          </div>
          {status?.toLowerCase() === "completed" && (
            <div>
              <b>STATUS:</b>{" "}
              <span className="text-green-700 font-bold px-2 py-0.5">Completed</span>
            </div>
          )}
        </div>
      </div>

      {/* Items */}
      <div className="border border-neutral-300 rounded-lg overflow-x-auto mt-2 mb-2">
        <table className="min-w-full text-xs align-middle">
          <thead>
            <tr
              className="text-black uppercase tracking-wider text-[11px]"
              style={{ background: "#ffba20" }}
            >
              <th className="px-2.5 py-1.5 text-center font-bold align-middle">QTY</th>
              <th className="px-2.5 py-1.5 text-center font-bold align-middle">UNIT</th>
              <th className="px-2.5 py-1.5 text-center font-bold align-middle">
                ITEM DESCRIPTION
              </th>
              <th className="px-2.5 py-1.5 text-center font-bold align-middle">REMARKS</th>
              <th className="px-2.5 py-1.5 text-center font-bold align-middle">UNIT PRICE</th>
              <th className="px-2.5 py-1.5 text-center font-bold align-middle">
                DISCOUNT/ADD (%)
              </th>
              <th className="px-2.5 py-1.5 text-center font-bold align-middle">AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-8 text-neutral-400">
                  No items found.
                </td>
              </tr>
            )}
            {rows.map((item, idx) => {
              const line = item.qty * item.unitPrice;
              const lineAfter = line - (line * (item.discount || 0)) / 100;
              const displayRemark = getDefaultRemarks(item);

              return (
                <tr key={item.id} className={idx % 2 === 0 ? "bg-white" : "bg-neutral-50"}>
                  <td className="px-2.5 py-1.5 font-mono text-center align-middle">{item.qty}</td>
                  <td className="px-2.5 py-1.5 font-mono text-center align-middle">{item.unit}</td>
                  <td className="px-2.5 py-1.5 text-center align-middle">
                    <span className="font-semibold">{item.description}</span>
                  </td>

                  {/* Remarks (editable in edit mode) */}
                  <td className="px-2.5 py-1.5 text-center align-middle">
                    {editMode ? (
                      <input
                        type="text"
                        value={editedRemarks[item.id] ?? ""}
                        onChange={(e) =>
                          setEditedRemarks((r) => ({
                            ...r,
                            [item.id]: e.target.value,
                          }))
                        }
                        className="border px-1 py-0.5 rounded text-xs w-32"
                        disabled={savingAll}
                      />
                    ) : (
                      displayRemark
                    )}
                  </td>

                  <td className="px-2.5 py-1.5 text-center font-mono align-middle whitespace-nowrap">
                    {formatCurrency(item.unitPrice)}
                  </td>
                  <td className="px-2.5 py-1.5 text-center font-mono align-middle whitespace-nowrap">
                    {item.discount && item.discount !== 0 ? `${item.discount}%` : ""}
                  </td>
                  <td className="px-2.5 py-1.5 text-center font-mono font-bold align-middle whitespace-nowrap">
                    {item.inStock === false ? formatCurrency(0) : formatCurrency(lineAfter)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Notes + Summary */}
      <div className="flex flex-row gap-4 mt-5 print:gap-2">
        <div className="w-2/3 text-xs pr-4">
          <b>NOTE:</b>
          <ul className="list-decimal ml-6 space-y-0.5 mt-1">
            <li>All goods are checked in good condition and complete after received and signed.</li>
            <li>Cash advances to salesman not allowed.</li>
            <li>All checks payable to By–Grace Trading only.</li>
          </ul>
        </div>

        {/* Summary panel */}
        <div className="flex flex-col items-end text-xs mt-1 w-1/3">
          <table className="text-right w-full">
            <tbody>
              <tr>
                <td className="font-semibold py-0.5">Subtotal (Before Discount):</td>
                <td className="pl-2 font-mono">{formatCurrency(subtotal)}</td>
              </tr>
              <tr>
                <td className="font-semibold py-0.5">Discount</td>
                <td className="pl-2 font-mono text-red-600 font-bold">
                  -{formatCurrency(totalDiscount)}
                </td>
              </tr>
              <tr>
                <td className="font-semibold py-0.5">Sales Tax (12%):</td>
                <td className="pl-2 font-mono">{formatCurrency(salesTaxOut)}</td>
              </tr>
              <tr>
                <td className="font-semibold py-0.5">
                  Interest{interestPercent > 0 ? ` (${interestPercent.toFixed(2)}%)` : ""}
                </td>
                <td className="pl-2 font-mono text-blue-600 font-bold">
                  {interestAmount > 0 ? formatCurrency(interestAmount) : "—"}
                </td>
              </tr>
              <tr>
                <td className="font-bold py-1.5">Grand Total:</td>
                <td className="pl-2 font-bold text-green-700 font-mono">
                  {formatCurrency(grandTotalOut)}
                </td>
              </tr>

              {/* Shipping fee row (NOT taxed) */}
              <tr>
                <td className="font-semibold py-0.5">Shipping Fee</td>
                <td className="pl-2 font-mono">{formatCurrency(shippingFee)}</td>
              </tr>

              {perTermOut > 0 && (
                <tr>
                  <td className="font-semibold py-0.5">Per Term:</td>
                  <td className="pl-2 font-bold text-blue-700 font-mono">
                    {formatCurrency(perTermOut)}
                  </td>
                </tr>
              )}

              {/* Final amount due = grand total (incl VAT/interest) + shipping fee */}
              <tr>
                <td className="font-extrabold py-1.5 text-base">Total Amount Due</td>
                <td className="pl-2 font-extrabold text-base text-green-800 font-mono">
                  {formatCurrency(finalAmountDue)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit/Save buttons (hidden in print) */}
      {setItems && !editModeProp && (
        <div className="flex justify-end mt-5 no-print">
          {!editMode ? (
            <button
              className="text-xs bg-yellow-400 hover:bg-yellow-500 text-black font-bold px-4 py-1 rounded shadow"
              onClick={startEdit}
            >
              ✏️ Edit Receipt
            </button>
          ) : (
            <button
              className="text-xs bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-1 rounded shadow"
              disabled={savingAll}
              onClick={saveAllRemarks}
            >
              💾 Save Changes
            </button>
          )}
        </div>
      )}
    </div>
  );
}
