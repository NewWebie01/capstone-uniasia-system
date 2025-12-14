"use client";

import * as React from "react";

/* ---------------------- Types (keep exports) ---------------------- */
export type InvoiceItem = {
  id: string;
  qty: number;
  orderedQty?: number;
  unit: string;
  description: string;
  unitPrice: number;
  discount?: number; // percent (0-100)
  inStock?: boolean;
  remarks?: string;
};

export type CustomerInfo = {
  name: string;
  address: string;
  code?: string;
  email?: string;
  phone?: string;
  area?: string;
};

type Totals = {
  salesTax?: number; // peso value saved
  grandTotalWithInterest?: number; // peso value saved
  perTermAmount?: number; // peso value saved
  shippingFee?: number; // peso value fetched
};

type Props = {
  customer: CustomerInfo;
  initialItems: InvoiceItem[];
  initialDate?: string | null;

  terms?: string;
  salesman?: string;
  poNo?: string;

  txn?: string;
  status?: string | null;

  totals?: Totals;

  /* --- keep your edit functions --- */
  editMode?: boolean;
  savingAll?: boolean;
  editedRemarks?: Record<string, string>;
  setEditedRemarks?: React.Dispatch<React.SetStateAction<Record<string, string>>>;
};

const peso = (n: number) =>
  (Number(n) || 0).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  });

const fmtDate = (d?: string | null) => {
  if (!d) return "—";
  try {
    // accepts "YYYY-MM-DD" or ISO
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "—";
    return dt.toLocaleDateString("en-PH", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  } catch {
    return "—";
  }
};

function clampPct(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-100, Math.min(100, n));
}

function lineSubtotal(it: InvoiceItem) {
  return (Number(it.qty) || 0) * (Number(it.unitPrice) || 0);
}

function lineDiscountPeso(it: InvoiceItem) {
  const pct = clampPct(it.discount ?? 0);
  return lineSubtotal(it) * (pct / 100);
}

function lineNet(it: InvoiceItem) {
  return lineSubtotal(it) - lineDiscountPeso(it);
}

export default function DeliveryReceiptModern({
  customer,
  initialItems,
  initialDate,
  terms,
  salesman,
  poNo,
  txn,
  status,
  totals,
  editMode,
  savingAll,
  editedRemarks,
  setEditedRemarks,
}: Props) {
  const items = Array.isArray(initialItems) ? initialItems : [];

  const subtotal = React.useMemo(
    () => items.reduce((sum, it) => sum + lineSubtotal(it), 0),
    [items]
  );

  const totalDiscountPeso = React.useMemo(
    () => items.reduce((sum, it) => sum + lineDiscountPeso(it), 0),
    [items]
  );

  const netBeforeSavedTotals = React.useMemo(
    () => items.reduce((sum, it) => sum + lineNet(it), 0),
    [items]
  );

  // Your InvoicePage passes saved totals. We keep using them.
  const shippingFee = Number(totals?.shippingFee || 0);
  const salesTax = Number(totals?.salesTax || 0);
  const grandTotalWithInterest = Number(totals?.grandTotalWithInterest || 0);

  // If saved grand total is 0 (older records), fall back to computed net + shipping + tax.
  const computedFallbackAmountDue = Math.max(
    0,
    netBeforeSavedTotals + shippingFee + salesTax
  );
  const amountDue =
    grandTotalWithInterest > 0 ? grandTotalWithInterest : computedFallbackAmountDue;

  const overallLessPct =
    subtotal > 0 ? Math.round((Math.abs(totalDiscountPeso) / subtotal) * 100) : 0;

  // “Forwarder” is not in your props; keep blank to match form.
  const forwarder = "";

  // receipt number: use txn if you want; this scanned sample shows “No: ####”
  const receiptNo = txn || "";

  return (
    <div className="invoice w-full bg-white text-black">
      {/* outer border like the scanned form */}
      <div className="border border-black">
        {/* HEADER */}
        <div className="px-4 pt-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xl font-extrabold tracking-wide leading-none">
                DELIVERY RECEIPT
              </div>
            </div>

            <div className="text-right">
              <div className="text-sm font-bold">
                No.&nbsp;&nbsp;
                <span className="inline-block min-w-[90px] text-right">
                  {receiptNo || "—"}
                </span>
              </div>
            </div>
          </div>

          {/* Customer / Date */}
          <div className="mt-3 grid grid-cols-12 gap-2 text-sm">
            <div className="col-span-8 flex items-end gap-2">
              <div className="whitespace-nowrap">Customer:</div>
              <div className="flex-1 border-b border-black pb-[2px] font-medium">
                {customer?.name || "—"}
              </div>
            </div>
            <div className="col-span-4 flex items-end gap-2">
              <div className="whitespace-nowrap">Date:</div>
              <div className="flex-1 border-b border-black pb-[2px] font-medium text-right">
                {fmtDate(initialDate)}
              </div>
            </div>

            {/* Address / Terms */}
            <div className="col-span-8 flex items-end gap-2">
              <div className="whitespace-nowrap">Address:</div>
              <div className="flex-1 border-b border-black pb-[2px] font-medium">
                {customer?.address || "—"}
              </div>
            </div>
            <div className="col-span-4 flex items-end gap-2">
              <div className="whitespace-nowrap">Terms:</div>
              <div className="flex-1 border-b border-black pb-[2px] font-medium text-right">
                {terms || "—"}
              </div>
            </div>

            {/* Forwarder / PO */}
            <div className="col-span-8 flex items-end gap-2">
              <div className="whitespace-nowrap">Forwarder:</div>
              <div className="flex-1 border-b border-black pb-[2px] font-medium">
                {forwarder}
              </div>
            </div>
            <div className="col-span-4 flex items-end gap-2">
              <div className="whitespace-nowrap">P.O. No.:</div>
              <div className="flex-1 border-b border-black pb-[2px] font-medium text-right">
                {poNo || "—"}
              </div>
            </div>

            {/* Salesman */}
            <div className="col-span-12 flex items-end gap-2">
              <div className="whitespace-nowrap">Salesman:</div>
              <div className="flex-1 border-b border-black pb-[2px] font-medium">
                {salesman || "—"}
              </div>
            </div>
          </div>
        </div>

        {/* TABLE */}
        <div className="mt-3 border-t border-black">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b border-black">
                <th className="w-[70px] border-r border-black px-2 py-2 text-left font-bold">
                  QTY.
                </th>
                <th className="w-[90px] border-r border-black px-2 py-2 text-left font-bold">
                  UNIT
                </th>
                <th className="border-r border-black px-2 py-2 text-center font-bold">
                  ITEM DESCRIPTION
                </th>
                <th className="w-[110px] border-r border-black px-2 py-2 text-center font-bold leading-tight">
                  UNIT<br />PRICE
                </th>
                <th className="w-[90px] border-r border-black px-2 py-2 text-center font-bold">
                  Discount
                </th>
                <th className="w-[110px] border-r border-black px-2 py-2 text-center font-bold">
                  Amount
                </th>
                <th className="w-[120px] px-2 py-2 text-center font-bold">
                  TOTAL
                </th>
              </tr>
            </thead>

            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-2 py-6 text-center text-neutral-600">
                    No items found.
                  </td>
                </tr>
              ) : (
                items.map((it) => {
                  const sub = lineSubtotal(it);
                  const discPeso = lineDiscountPeso(it);
                  const net = lineNet(it);
                  const discPct = clampPct(it.discount ?? 0);

                  const remarkValue =
                    (editedRemarks && editedRemarks[it.id] !== undefined
                      ? editedRemarks[it.id]
                      : it.remarks) || "";

                  return (
                    <tr key={it.id} className="align-top">
                      <td className="border-r border-black px-2 py-2">
                        {Number(it.qty) || 0}
                      </td>
                      <td className="border-r border-black px-2 py-2">
                        {it.unit || "—"}
                      </td>

                      <td className="border-r border-black px-2 py-2">
                        <div className="font-medium leading-tight">
                          {it.description || "—"}
                        </div>

                        {/* Remarks lives inside description column like handwritten notes */}
                        <div className="mt-1">
                          {editMode ? (
                            <input
                              value={remarkValue}
                              onChange={(e) => {
                                if (!setEditedRemarks) return;
                                setEditedRemarks((prev) => ({
                                  ...(prev || {}),
                                  [it.id]: e.target.value,
                                }));
                              }}
                              disabled={!!savingAll}
                              placeholder="Remarks..."
                              className="w-full text-xs px-2 py-1 border border-black/40 rounded-sm focus:outline-none focus:border-black"
                            />
                          ) : remarkValue ? (
                            <div className="text-xs italic">Remarks: {remarkValue}</div>
                          ) : null}
                        </div>
                      </td>

                      <td className="border-r border-black px-2 py-2 text-right tabular-nums">
                        {peso(Number(it.unitPrice || 0)).replace("₱", "")}
                      </td>
                      <td className="border-r border-black px-2 py-2 text-right tabular-nums">
                        {discPct ? `${discPct.toFixed(0)}%` : ""}
                      </td>
                      <td className="border-r border-black px-2 py-2 text-right tabular-nums">
                        {/* Amount column = discount peso (like “Less”) */}
                        {discPct ? peso(Math.abs(discPeso)).replace("₱", "") : ""}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {peso(net).replace("₱", "")}
                      </td>
                    </tr>
                  );
                })
              )}

              {/* spacer rows to mimic the big empty area of the form */}
              {Array.from({ length: Math.max(0, 12 - items.length) }).map((_, i) => (
                <tr key={`sp-${i}`}>
                  <td className="border-r border-black px-2 py-3">&nbsp;</td>
                  <td className="border-r border-black px-2 py-3">&nbsp;</td>
                  <td className="border-r border-black px-2 py-3">&nbsp;</td>
                  <td className="border-r border-black px-2 py-3">&nbsp;</td>
                  <td className="border-r border-black px-2 py-3">&nbsp;</td>
                  <td className="border-r border-black px-2 py-3">&nbsp;</td>
                  <td className="px-2 py-3 text-right tabular-nums">0.00</td>
                </tr>
              ))}

              {/* “NOTE” inside the table like the scanned form */}
              
            </tbody>
          </table>
          {/* NOTE OUTSIDE TABLE (matches original receipt) */}
<div className="border-t border-black px-3 py-2 text-xs">
  <b>NOTE:</b> All Checks Payable to BY GRACE TRADING
</div>
        </div>

        {/* TOTALS BOX (bottom-right) */}
        <div className="grid grid-cols-12 border-t border-black">
          <div className="col-span-7 p-3 text-xs">
            <div className="font-bold">NOTE:</div>
            <ol className="list-decimal pl-5 space-y-1">
              <li>All goods are checked in good condition and complete after received and signed.</li>
              <li>Cash Advances to Salesman not allowed</li>
              <li>All Check payable to By-Grace Trading Only</li>
            </ol>
          </div>

          <div className="col-span-5 border-l border-black">
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-black">
                  <td className="px-3 py-2 font-bold">Total Amount</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {peso(subtotal).replace("₱", "")}
                  </td>
                </tr>
                <tr className="border-b border-black">
                  <td className="px-3 py-2 font-bold">
                    Less&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;%&nbsp;
                    <span className="font-normal">{overallLessPct ? overallLessPct : ""}</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {overallLessPct ? peso(Math.abs(totalDiscountPeso)).replace("₱", "") : ""}
                  </td>
                </tr>
                <tr>
                  <td className="px-3 py-2 font-bold">Amount Due</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold">
                    {peso(amountDue).replace("₱", "")}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* SIGNATURE */}
        <div className="px-4 py-4 border-t border-black">
          <div className="flex items-end justify-between text-sm">
            <div className="text-xs">
              {status ? (
                <span className="inline-block border border-black px-2 py-1">
                  Status: <b>{status}</b>
                </span>
              ) : null}
            </div>

            <div className="w-[360px]">
              <div className="text-sm mb-1">Checked and received by:</div>
              <div className="border-b border-black h-8" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
