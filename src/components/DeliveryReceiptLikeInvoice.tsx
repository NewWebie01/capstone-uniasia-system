"use client";

import { useMemo, useState } from "react";

export type InvoiceItem = {
  id: string;
  qty: number;
  unit: string;
  description: string;
  unitPrice: number; // per-unit price
  discount: number; // per-line currency
};

export type CustomerInfo = {
  name: string;
  address?: string;
};

export function peso(n: number) {
  const v = isNaN(n) ? 0 : n;
  return `₱${v.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function DeliveryReceiptLikeInvoice({
  customer,
  initialItems,
  initialDate,
}: {
  customer: CustomerInfo;
  initialItems: InvoiceItem[];
  initialDate?: string;
}) {
  const [poNo, setPoNo] = useState("");
  const [forwarder, setForwarder] = useState("");
  const [salesman, setSalesman] = useState("");
  const [terms, setTerms] = useState("Net 30");
  const [dateStr, setDateStr] = useState(
    initialDate ?? new Date().toISOString().slice(0, 10)
  );
  const [items, setItems] = useState<InvoiceItem[]>(
    initialItems?.length
      ? initialItems
      : [
          {
            id: "tmp",
            qty: 1,
            unit: "pcs",
            description: "",
            unitPrice: 0,
            discount: 0,
          },
        ]
  );

  // --- Compute Totals ---
  const subtotal = useMemo(() => {
    return items.reduce(
      (sum, it) => sum + it.qty * it.unitPrice,
      0
    );
  }, [items]);

  const totalDiscount = useMemo(() => {
    return items.reduce(
      (sum, it) => sum + (it.discount || 0),
      0
    );
  }, [items]);

  const salesTax = useMemo(() => {
    return (subtotal - totalDiscount) * 0.12;
  }, [subtotal, totalDiscount]);

  const grandTotal = useMemo(() => {
    return subtotal - totalDiscount + salesTax;
  }, [subtotal, totalDiscount, salesTax]);

  const updateItem = <K extends keyof InvoiceItem>(
    id: string,
    key: K,
    value: InvoiceItem[K]
  ) =>
    setItems((p) => p.map((r) => (r.id === id ? { ...r, [key]: value } : r)));

  return (
    <div className="bg-white text-[13px] leading-tight text-neutral-900 print:text-black">
      <div className="text-center mb-2">
        <h1 className="text-xl font-extrabold tracking-wide">UNIASIA</h1>
        <div className="text-[11px] -mt-1">JASON S. TO - Proprietor</div>
      </div>
      <div className="text-center mb-3">
        <div className="inline-block border border-neutral-300 px-3 py-1 text-[13px] font-extrabold tracking-wide">
          DELIVERY RECEIPT
        </div>
      </div>

      {/* Header */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-1 mb-3">
        <div className="flex gap-2 items-end">
          <span className="w-28 font-semibold">CUSTOMER:</span>
          <span className="flex-1 border-b border-neutral-300">
            {customer?.name ?? "—"}
          </span>
        </div>
        <div className="flex gap-2 items-end">
          <span className="w-28 font-semibold">DATE:</span>
          <input
            type="date"
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
            className="flex-1 border-b border-neutral-300 outline-none"
          />
        </div>

        <div className="flex gap-2 items-end">
          <span className="w-28 font-semibold">ADDRESS:</span>
          <span className="flex-1 border-b border-neutral-300">
            {customer?.address ?? ""}
          </span>
        </div>
        <div className="flex gap-2 items-end">
          <span className="w-28 font-semibold">TERMS:</span>
          <input
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            className="flex-1 border-b border-neutral-300 outline-none"
          />
        </div>

        <div className="flex gap-2 items-end">
          <span className="w-28 font-semibold">FORWARDER:</span>
          <input
            value={forwarder}
            onChange={(e) => setForwarder(e.target.value)}
            className="flex-1 border-b border-neutral-300 outline-none"
          />
        </div>
        <div className="flex gap-2 items-end">
          <span className="w-28 font-semibold">P.O NO:</span>
          <input
            value={poNo}
            onChange={(e) => setPoNo(e.target.value)}
            className="flex-1 border-b border-neutral-300 outline-none"
          />
        </div>

        <div className="flex gap-2 items-end">
          <span className="w-28 font-semibold">SALESMAN:</span>
          <input
            value={salesman}
            onChange={(e) => setSalesman(e.target.value)}
            className="flex-1 border-b border-neutral-300 outline-none"
          />
        </div>
      </div>

      {/* Table */}
      <div className="border border-neutral-300">
        <table className="w-full text-[12.5px]">
          <thead className="bg-neutral-100">
            <tr className="[&>th]:border [&>th]:border-neutral-300 [&>th]:px-2 [&>th]:py-1 text-left">
              <th className="w-14">QTY</th>
              <th className="w-16">UNIT</th>
              <th>ITEM DESCRIPTION</th>
              <th className="w-28 text-right">UNIT PRICE</th>
              <th className="w-24 text-right">DISCOUNT</th>
              <th className="w-28 text-right">AMOUNT</th>
              <th className="w-28 text-right">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => {
              const amount = r.qty * r.unitPrice;
              const total = amount - (r.discount || 0);
              return (
                <tr
                  key={r.id}
                  className="[&>td]:border [&>td]:border-neutral-300 [&>td]:px-2 [&>td]:py-1 align-top"
                >
                  <td>
                    <input
                      type="number"
                      className="w-full text-right outline-none"
                      value={r.qty}
                      onChange={(e) =>
                        updateItem(r.id, "qty", Number(e.target.value || 0))
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="w-full outline-none"
                      value={r.unit}
                      onChange={(e) => updateItem(r.id, "unit", e.target.value)}
                    />
                  </td>
                  <td>
                    <textarea
                      className="w-full outline-none resize-none min-h-[36px]"
                      value={r.description}
                      onChange={(e) =>
                        updateItem(r.id, "description", e.target.value)
                      }
                    />
                  </td>
                  <td className="text-right">
                    <input
                      type="number"
                      className="w-full text-right outline-none"
                      value={r.unitPrice}
                      onChange={(e) =>
                        updateItem(
                          r.id,
                          "unitPrice",
                          Number(e.target.value || 0)
                        )
                      }
                    />
                  </td>
                  <td className="text-right">
                    <input
                      type="number"
                      className="w-full text-right outline-none"
                      value={r.discount}
                      onChange={(e) =>
                        updateItem(
                          r.id,
                          "discount",
                          Number(e.target.value || 0)
                        )
                      }
                    />
                  </td>
                  <td className="text-right">{peso(amount)}</td>
                  <td className="text-right">{peso(total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Notes + NEW Totals */}
      <div className="grid grid-cols-2 mt-4">
        <div className="pr-4">
          <div className="text-[11px] leading-snug mt-2">
            <p className="font-semibold">NOTE:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>
                All goods are checked in good condition and complete after
                received and signed.
              </li>
              <li>Cash advances to salesman not allowed.</li>
              <li>All checks payable to By-Grace Trading only.</li>
            </ol>
          </div>
        </div>
        <div className="pl-6">
          <div className="w-full border border-neutral-300">
            <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-300">
              <span className="font-semibold">Subtotal (Before Discount)</span>
              <span className="font-bold">{peso(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-300">
              <span className="font-semibold">Less/Add (Discount/Markup)</span>
              <span className="font-bold text-orange-500">
                – {peso(totalDiscount)}
              </span>
            </div>
            <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-300">
              <span className="font-semibold">Sales Tax (12%)</span>
              <span className="font-bold">{peso(salesTax)}</span>
            </div>
            <div className="flex items-center justify-between px-3 py-2 bg-neutral-100">
              <span className="font-extrabold">TOTAL ORDER AMOUNT</span>
              <span className="font-extrabold text-green-700">
                {peso(grandTotal)}
              </span>
            </div>
          </div>
          <div className="text-[11px] mt-3">
            Checked and received by: ______________________________
          </div>
        </div>
      </div>
    </div>
  );
}