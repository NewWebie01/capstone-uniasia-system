"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Eye } from "lucide-react";
import { motion } from "framer-motion";
import supabase from "@/config/supabaseClient";

/* -------------------- Activity Logger -------------------- */
async function logActivity(action: string, details: any = {}) {
  try {
    const { data } = await supabase.auth.getUser();
    await supabase.from("activity_logs").insert([
      {
        user_email: data?.user?.email || "",
        user_role: "admin",
        action,
        details,
        created_at: new Date().toISOString(),
      },
    ]);
  } catch (e) {
    console.error("logActivity failed:", e);
  }
}

/* -------------------- Types -------------------- */
type InvoiceItem = {
  id: string;
  qty: number;
  unit: string;
  description: string;
  unitPrice: number;
  discount: number; // percent
  inStock?: boolean;
};

type CustomerInfo = {
  name: string;
  address?: string;
  code?: string;
  email?: string;
  phone?: string;
  area?: string;
};

type OrderForList = {
  id: string;
  status: string | null;
  date_created: string | null;
  date_completed: string | null;
  salesman: string | null;
  terms: string | null;
  po_number: string | null;
  customer: {
    id: string;
    name: string | null;
    address: string | null;
    code: string | null;
    email?: string | null;
    phone?: string | null;
    area?: string | null;
  } | null;
};

type OrderItemRow = {
  id: string;
  order_id: string;
  inventory_id: string;
  quantity: number;
  price: number | null;
  discount_percent?: number | null;  
  inventory?: {
    product_name: string | null;
    unit?: string | null;
    unit_price?: number | null;
    quantity?: number | null;
  } | null;
};

type OrderDetailRow = {
  id: string;
  date_created: string | null;
  date_completed: string | null;
  terms: string | null;
  salesman: string | null;
  po_number: string | null;
  grand_total_with_interest: number | null;
  per_term_amount: number | null;
  interest_percent: number | null;
  sales_tax: number | null;
  status?: string | null;
  customers: { 
    name: string | null; 
    address: string | null; 
    email?: string | null; 
    phone?: string | null; 
    area?: string | null;
  } | null;
  order_items: OrderItemRow[];
};

/* -------------------- Helpers -------------------- */
function formatCurrency(n: number) {
  return n.toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  });
}
function formatDate(date?: string | null) {
  if (!date) return "—";
  try {
    return new Date(date).toLocaleDateString("en-PH", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  } catch {
    return "—";
  }
}
const TAX_RATE = 0.12;

function statusColor(status?: string | null) {
  const v = (status || "").toLowerCase();
  if (v === "completed") return "bg-green-100 text-green-700 border-green-300";
  if (v === "pending") return "bg-yellow-100 text-yellow-700 border-yellow-300";
  if (v === "accepted") return "bg-blue-100 text-blue-700 border-blue-300";
  if (v === "rejected" || v === "cancelled")
    return "bg-red-100 text-red-700 border-red-300";
  return "bg-gray-100 text-gray-600 border-gray-300";
}

// ---------- PDF Export Helper (html2canvas + jsPDF) ----------
type PaperKey = "a4" | "letter" | "legal";
const PAPER_SPECS: Record<
  PaperKey,
  { width: number; height: number; margin: number; filename: string }
> = {
  a4: { width: 595.28, height: 841.89, margin: 28.35, filename: "A4" },
  letter: { width: 612, height: 792, margin: 36, filename: "Letter" },
  legal: { width: 612, height: 936, margin: 36, filename: "Legal" },
};

async function exportNodeToPDF(
  node: HTMLElement,
  paper: PaperKey,
  filenameBase: string
) {
  const [{ jsPDF }, html2canvas] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);
  const canvas = await html2canvas.default(node, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    logging: false,
    windowWidth: document.documentElement.scrollWidth,
  });

  const spec = PAPER_SPECS[paper];
  const pdf = new jsPDF({
    unit: "pt",
    format: [spec.width, spec.height],
    compress: true,
    hotfixes: ["px_scaling"],
  });

  const pageW = spec.width - spec.margin * 2;
  const pageH = spec.height - spec.margin * 2;
  const imgW = pageW;
  const imgH = (canvas.height * imgW) / canvas.width;
  const imgData = canvas.toDataURL("image/png", 1.0);

  let remaining = imgH;
  let y = spec.margin;
  pdf.addImage(imgData, "PNG", spec.margin, y, imgW, imgH, undefined, "FAST");

  if (imgH > pageH) {
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = Math.floor((pageH / imgH) * canvas.height);
    const ctx = pageCanvas.getContext("2d")!;
    const sliceH = pageCanvas.height;
    let sY = Math.floor((pageH / imgH) * canvas.height);

    while (remaining > pageH) {
      pdf.addPage([spec.width, spec.height]);
      ctx.clearRect(0, 0, pageCanvas.width, pageCanvas.height);
      ctx.drawImage(
        canvas,
        0,
        sY,
        canvas.width,
        Math.min(sliceH, canvas.height - sY),
        0,
        0,
        pageCanvas.width,
        Math.min(sliceH, canvas.height - sY)
      );
      const sliceData = pageCanvas.toDataURL("image/png", 1.0);
      pdf.addImage(
        sliceData,
        "PNG",
        spec.margin,
        spec.margin,
        imgW,
        pageH,
        undefined,
        "FAST"
      );
      sY += sliceH;
      remaining -= pageH;
    }
  }
  const safeName = filenameBase.replace(/[^\w\-]+/g, "_");
  pdf.save(`${safeName}_${PAPER_SPECS[paper].filename}.pdf`);
}

/* -------------------- Modern Delivery Receipt -------------------- */
function DeliveryReceiptModern({
  customer,
  initialItems,
  initialDate,
  terms,
  salesman,
  poNo,
  totals,
  txn,
  status,
}: {
  customer: CustomerInfo;
  initialItems: InvoiceItem[];
  initialDate?: string | null;
  terms?: string | null;
  salesman?: string | null;
  poNo?: string | null;
  totals?: {
    salesTax?: number;
    grandTotalWithInterest?: number;
    perTermAmount?: number;
  };
  txn?: string;
  status?: string | null;
}) {
  // Only count items NOT marked as out of stock (inStock !== false)
  const rows = initialItems || [];
  const inStockRows = rows.filter(i => i.inStock !== false);

  const subtotal = inStockRows.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const totalDiscount = inStockRows.reduce((s, i) => {
    const line = i.qty * i.unitPrice;
    return s + (line * (i.discount || 0)) / 100;
  }, 0);
  const afterDiscount = subtotal - totalDiscount;
  const computedSalesTax = afterDiscount * TAX_RATE;

  const salesTaxOut =
    typeof totals?.salesTax === "number" ? totals!.salesTax : computedSalesTax;
  const isCredit = (terms || "").toLowerCase().includes("net");

  const computedGrandTotal = afterDiscount + salesTaxOut;
  const grandTotalOut =
    isCredit && typeof totals?.grandTotalWithInterest === "number" && totals.grandTotalWithInterest > 0
      ? totals.grandTotalWithInterest
      : computedGrandTotal;
  const perTermOut =
    typeof totals?.perTermAmount === "number" ? totals!.perTermAmount : 0;

  // INTEREST calculation
  const interestAmount =
    isCredit && typeof totals?.grandTotalWithInterest === "number"
      ? totals.grandTotalWithInterest - (afterDiscount + salesTaxOut)
      : 0;
  const interestPercent =
    afterDiscount + salesTaxOut > 0 && interestAmount > 0
      ? (interestAmount / (afterDiscount + salesTaxOut)) * 100
      : 0;

  return (
    <div className="w-full max-w-4xl mx-auto bg-white p-7 rounded-xl shadow print:shadow-none print:p-8 print:max-w-none print:w-[100%] text-black">
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
              <span className="text-green-700 font-bold px-2 py-0.5">
                Completed
              </span>
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
              <th className="px-2.5 py-1.5 text-center font-bold align-middle">ITEM DESCRIPTION</th>
              <th className="px-2.5 py-1.5 text-center font-bold align-middle">REMARKS</th>
              <th className="px-2.5 py-1.5 text-center font-bold align-middle">UNIT PRICE</th>
              <th className="px-2.5 py-1.5 text-center font-bold align-middle">DISCOUNT/ADD (%)</th>
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
              return (
                <tr
                  key={item.id}
                  className={idx % 2 === 0 ? "bg-white" : "bg-neutral-50"}
                >
                  <td className="px-2.5 py-1.5 font-mono text-center align-middle">{item.qty}</td>
                  <td className="px-2.5 py-1.5 font-mono text-center align-middle">{item.unit}</td>
                  <td className="px-2.5 py-1.5 text-left align-middle">
                    <span className="font-semibold">{item.description}</span>
                  </td>
                  <td className="px-2.5 py-1.5 text-center align-middle">
                    {item.inStock === true ? "✓" : item.inStock === false ? "✗" : ""}
                  </td>
                  <td className="px-2.5 py-1.5 text-center font-mono align-middle whitespace-nowrap">{formatCurrency(item.unitPrice)}</td>
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
        <div className="flex flex-col items-end text-xs mt-1 w-1/3">
          <table className="text-right w-full">
            <tbody>
              <tr>
                <td className="font-semibold py-0.5">
                  Subtotal (Before Discount):
                </td>
                <td className="pl-2 font-mono">{formatCurrency(subtotal)}</td>
              </tr>
              <tr>
                <td className="font-semibold py-0.5">
                  Discount
                </td>
                <td className="pl-2 font-mono text-red-600 font-bold">
                  -{formatCurrency(totalDiscount)}
                </td>
              </tr>
              <tr>
                <td className="font-semibold py-0.5">Sales Tax (12%):</td>
                <td className="pl-2 font-mono">
                  {formatCurrency(salesTaxOut)}
                </td>
              </tr>
              <tr>
                <td className="font-semibold py-0.5">
                  Interest
                  {interestPercent > 0 ? ` (${interestPercent.toFixed(2)}%)` : ""}
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
              {perTermOut > 0 && (
                <tr>
                  <td className="font-semibold py-0.5">Per Term:</td>
                  <td className="pl-2 font-bold text-blue-700 font-mono">
                    {formatCurrency(perTermOut)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* -------------------- Main Page (with Modal) -------------------- */
export default function InvoiceMergedPage() {
  const params = useParams<{ id?: string }>();
  const router = useRouter();
  const orderId = params?.id;

  const [paperSize, setPaperSize] = useState<"a4" | "letter" | "legal">("a4");
  const [orders, setOrders] = useState<OrderForList[]>([]);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  // modal header state
  const [items, setItems] = useState<InvoiceItem[] | null>(null);
  const [customerForOrder, setCustomerForOrder] = useState<CustomerInfo | null>(null);
  const [initialDate, setInitialDate] = useState<string | null>(null);
  const [currentTerms, setCurrentTerms] = useState<string | null>(null);
  const [currentSalesman, setCurrentSalesman] = useState<string | null>(null);
  const [currentPoNumber, setCurrentPoNumber] = useState<string | null>(null);
  const [currentDateCompleted, setCurrentDateCompleted] = useState<string | null>(null);
  const [currentStatus, setCurrentStatus] = useState<string | null>(null);
  const [loadingItems, setLoadingItems] = useState(false);

  // detail route state
  const [detailCustomer, setDetailCustomer] = useState<CustomerInfo | null>(null);
  const [detailItems, setDetailItems] = useState<InvoiceItem[] | null>(null);
  const [detailDate, setDetailDate] = useState<string | null>(null);
  const [detailTerms, setDetailTerms] = useState<string | null>(null);
  const [detailSalesman, setDetailSalesman] = useState<string | null>(null);
  const [detailPoNumber, setDetailPoNumber] = useState<string | null>(null);
  const [detailDateCompleted, setDetailDateCompleted] = useState<string | null>(null);
  const [detailStatus, setDetailStatus] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);

  // saved totals (for both modal & detail)
  const [grandTotalWithInterest, setGrandTotalWithInterest] = useState<number>(0);
  const [perTermAmount, setPerTermAmount] = useState<number>(0);
  const [salesTaxSaved, setSalesTaxSaved] = useState<number>(0);

  const GlobalPrintCSS = () => (
    <style jsx global>{`
      @media print {
        button,
        [role="dialog"] header .close,
        .no-print {
          display: none !important;
        }
        .print-page {
          break-after: always;
        }
      }
    `}</style>
  );

  // -------- Fetch list of orders (with customer) --------
  useEffect(() => {
    if (orderId) return;
    (async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          `
          id,
          status,
          date_created,
          date_completed,
          salesman,
          terms,
          po_number,
          customer:customer_id (
            id,
            name,
            address,
            code,
            email,
            phone,
            area
          )
        `
        )
        .order("date_created", { ascending: false });

      if (error) {
        console.error("Invoice list fetch error:", error);
        setOrders([]);
        return;
      }
      setOrders((data || []) as unknown as OrderForList[]);
    })();
  }, [orderId]);

  // -------- Search / filter (show completed only) --------
  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    const completed = orders.filter(
      (o) => (o.status || "").toLowerCase() === "completed"
    );
    if (!q) return completed;
    return completed.filter((o) =>
      (o.customer?.name || "").toLowerCase().includes(q)
    );
  }, [orders, search]);

  // -------- Open invoice from list (modal) --------
  const openInvoice = async (order: OrderForList) => {
    setOpenId(order.id);
    setLoadingItems(true);

    // ✅ log "Viewed Invoice"
    const txn = order.customer?.code || order.id;
    await logActivity("Viewed Invoice", {
      order_id: order.id,
      txn,
      customer: order.customer?.name || null,
    });

    setCustomerForOrder({
      name: order.customer?.name || "—",
      address: order.customer?.address || "",
      code: order.customer?.code || "",
      email: order.customer?.email || "",
      phone: order.customer?.phone || "",
      area: order.customer?.area || "",
    });
    setInitialDate(order.date_created ? order.date_created.slice(0, 10) : null);
    setCurrentTerms(order.terms || null);
    setCurrentSalesman(order.salesman || null);
    setCurrentPoNumber(order.po_number || null);
    setCurrentDateCompleted(order.date_completed || null);
    setCurrentStatus(order.status || null);

    // fetch items
    const { data: rows, error } = await supabase
      .from("order_items")
      .select(`
        id,
        order_id,
        inventory_id,
        quantity,
        price,
        discount_percent,
        inventory:inventory_id (
          product_name,
          unit,
          unit_price,
          quantity
        )
      `)
      .eq("order_id", order.id);

    // fetch saved totals (same row as order)
    const { data: orderRow, error: orderErr } = await supabase
      .from("orders")
      .select(
        `
        grand_total_with_interest,
        per_term_amount,
        sales_tax
      `
      )
      .eq("id", order.id)
      .single();

    if (orderErr) {
      console.error("Invoice order totals fetch error:", orderErr);
    }
    setGrandTotalWithInterest(Number(orderRow?.grand_total_with_interest || 0));
    setPerTermAmount(Number(orderRow?.per_term_amount || 0));
    setSalesTaxSaved(Number(orderRow?.sales_tax || 0));

    if (!error && rows) {
      const mapped: InvoiceItem[] = (rows as unknown as OrderItemRow[]).map(
        (r) => ({
          id: r.id,
          qty: Number(r.quantity || 0),
          unit: r.inventory?.unit || "pcs",
          description: r.inventory?.product_name || "",
          unitPrice: Number(r.price ?? r.inventory?.unit_price ?? 0),
          discount: Number(r.discount_percent ?? 0),
          inStock: (r.inventory?.quantity ?? 0) > 0,
        })
      );
      setItems(mapped);
    } else {
      if (error) console.error("Invoice items fetch error:", error);
      setItems([
        {
          id: "empty",
          qty: 1,
          unit: "pcs",
          description: "No items found.",
          unitPrice: 0,
          discount: 0,
        },
      ]);
    }
    setLoadingItems(false);
  };

  // -------- Detail route (/invoice/[id]) --------
  useEffect(() => {
    if (!orderId) return;
    setLoadingDetail(true);
    (async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          `
          id,
          status,
          date_created,
          date_completed,
          terms,
          salesman,
          po_number,
          grand_total_with_interest,
          per_term_amount,
          interest_percent,
          sales_tax,
          customers:customer_id (
            name,
            address,
            email,
            phone,
            area
          ),
          order_items (
            id,
            quantity,
            price,
            discount_percent,
            inventory:inventory_id ( product_name, unit, unit_price, quantity )
          )
        `
        )
        .eq("id", orderId)
        .single();

      if (!error && data) {
        const row = data as unknown as OrderDetailRow;

        setDetailCustomer({
          name: row.customers?.name || "—",
          address: row.customers?.address || "",
          email: row.customers?.email || "",
          phone: row.customers?.phone || "",
          area: row.customers?.area || "",
        });
        setDetailDate(row.date_created ? row.date_created.slice(0, 10) : null);
        setDetailTerms(row.terms || null);
        setDetailSalesman(row.salesman || null);
        setDetailPoNumber(row.po_number || null);
        setDetailDateCompleted(row.date_completed || null);
        setDetailStatus(row.status || null);

        const mapped: InvoiceItem[] = (row.order_items || []).map((it) => ({
          id: it.id,
          qty: Number(it.quantity || 0),
          unit: it.inventory?.unit || "pcs",
          description: it.inventory?.product_name || "",
          unitPrice: Number(it.price ?? it.inventory?.unit_price ?? 0),
          discount: Number(it.discount_percent ?? 0),
          inStock: (it.inventory?.quantity ?? 0) > 0,
        }));

        setDetailItems(
          mapped.length
            ? mapped
            : [
                {
                  id: "empty",
                  qty: 1,
                  unit: "pcs",
                  description: "No items found.",
                  unitPrice: 0,
                  discount: 0,
                },
              ]
        );

        setGrandTotalWithInterest(Number(row.grand_total_with_interest || 0));
        setPerTermAmount(Number(row.per_term_amount || 0));
        setSalesTaxSaved(Number(row.sales_tax || 0));
      } else {
        if (error) console.error("Invoice detail fetch error:", error);
        setDetailCustomer({ name: "—", address: "" });
        setDetailItems([
          {
            id: "fallback",
            qty: 1,
            unit: "pcs",
            description: "Invoice not found.",
            unitPrice: 0,
            discount: 0,
          },
        ]);
        setDetailTerms(null);
        setDetailSalesman(null);
        setDetailPoNumber(null);
        setDetailDateCompleted(null);
        setDetailStatus(null);
        setGrandTotalWithInterest(0);
        setPerTermAmount(0);
        setSalesTaxSaved(0);
      }
      setLoadingDetail(false);
    })();
  }, [orderId]);

  /* -------------------- Render -------------------- */

  // Standalone /invoice/[id]
  if (orderId) {
    if (loadingDetail || !detailItems || !detailCustomer) {
      return (
        <div className="min-h-screen grid place-items-center text-sm text-neutral-600">
          Loading invoice…
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-gradient-to-br from-neutral-100 via-amber-50 to-white p-6 print:bg-white">
        <GlobalPrintCSS />
        <div className="mx-auto max-w-4xl bg-white/90 rounded-xl shadow-lg p-6 print:shadow-none print:bg-white">
          <div className="mb-4 flex items-center justify-between">
            <button
              className="text-sm underline underline-offset-2 text-neutral-600 hover:text-neutral-800"
              onClick={() => router.push("/invoice")}
            >
              ← Back to list
            </button>
            <div className="text-xs text-right">
              <div>
                <b>Date Completed:</b> {formatDate(detailDateCompleted)}
              </div>
            </div>
          </div>
          <DeliveryReceiptModern
            customer={detailCustomer}
            initialItems={detailItems}
            initialDate={detailDate}
            terms={detailTerms || undefined}
            salesman={detailSalesman || undefined}
            poNo={detailPoNumber || undefined}
            totals={{
              salesTax: salesTaxSaved,
              grandTotalWithInterest,
              perTermAmount,
            }}
            txn={orderId}
            status={detailStatus}
          />
        </div>
      </div>
    );
  }

  // Default: list + modal
  return (
    <motion.div
      className="relative min-h-screen px-4 pb-6 pt-1"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <GlobalPrintCSS />
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="mb-4">
          <h1 className="pt-1 text-3xl font-bold text-neutral-800 tracking-tight">
            Sales Invoices
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Review completed invoices, preview delivery receipts, and export
            PDFs.
          </p>

          <div className="w-full max-w-3xl mt-4">
            <input
              type="text"
              placeholder="Search by customer name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-neutral-200 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 bg-white transition"
            />
          </div>
        </div>

        <style jsx>{`
          /* Force vertical middle in all table cells inside this invoice only */
          .invoice table th,
          .invoice table td {
            vertical-align: middle !important;
          }
        `}</style>
        <motion.div
          className="overflow-x-auto rounded-2xl shadow-lg bg-white/90"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <table className="min-w-full text-sm font-medium">
            <thead>
              <tr
                style={{ background: "#ffba20" }}
                className="text-neutral-700 sticky top-0 z-10"
              >
                <th className="px-6 py-3 text-left font-semibold">
                  Sales Invoice (TXN)
                </th>
                <th className="px-6 py-3 text-left font-semibold">
                  Customer Name
                </th>
                <th className="px-6 py-3 text-left font-semibold">Salesman</th>
                <th className="px-6 py-3 text-left font-semibold">P.O. No</th>
                <th className="px-6 py-3 text-left font-semibold">
                  Date Completed
                </th>
                <th className="px-6 py-3 text-center font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filteredOrders.map((order) => {
                const txn = order.customer?.code || order.id;
                return (
                  <Dialog
                    key={order.id}
                    open={openId === order.id}
                    onOpenChange={(open) => {
                      if (!open) {
                        setOpenId(null);
                        setItems(null);
                      } else {
                        openInvoice(order);
                      }
                    }}
                  >
                    <tr className="hover:bg-blue-50/40 transition cursor-pointer">
                      <td className="px-6 py-3 font-mono tracking-tight">
                        {txn}
                      </td>
                      <td className="px-6 py-3">
                        {order.customer?.name ?? "Unknown"}
                      </td>
                      <td className="px-6 py-3">{order.salesman || "—"}</td>
                      <td className="px-6 py-3">{order.po_number || "—"}</td>
                      <td className="px-6 py-3">
                        {formatDate(order.date_completed)}
                      </td>
                      <td className="px-6 py-3 text-center">
                        <DialogTrigger asChild>
                          <button className="inline-flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg shadow transition">
                            <Eye className="w-4 h-4" />
                            View
                          </button>
                        </DialogTrigger>
                      </td>
                    </tr>
                    <DialogContent className="max-w-4xl max-h-[80vh] bg-white/95 rounded-xl shadow-2xl overflow-y-auto border border-neutral-100 p-0">
                      {!items || !customerForOrder ? (
                        <div className="p-8 text-sm">Fetching items…</div>
                      ) : (
                        <div>
                          {/* Modal header with TXN, paper size, print */}
                          <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-neutral-100">
                            <div className="flex items-center gap-3">
                              <span
                                className={`text-xs font-bold px-2 py-1 border rounded-lg ${statusColor(
                                  order.status
                                )} shadow-sm`}
                              >
                                Status:{" "}
                                {order.status
                                  ? order.status.charAt(0).toUpperCase() +
                                    order.status.slice(1)
                                  : "—"}
                              </span>
                              <label className="text-[11px] text-neutral-500 ml-3">
                                Paper:
                              </label>
                              <select
                                value={paperSize}
                                onChange={(e) =>
                                  setPaperSize(e.target.value as any)
                                }
                                className="border rounded px-2 py-1 text-xs"
                                title="Paper size for printing"
                              >
                                <option value="a4">A4 (210×297mm)</option>
                                <option value="letter">
                                  Short / Letter (8.5×11in)
                                </option>
                                <option value="legal">
                                  Long / Legal (8.5×13in)
                                </option>
                              </select>
                              <button
                                className="bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700"
                                onClick={async () => {
                                  const node = document.getElementById(
                                    `invoice-capture-${order.id}`
                                  );
                                  if (!node) return;
                                  await exportNodeToPDF(
                                    node,
                                    paperSize,
                                    `UNIASIA_${txn}`
                                  );

                                  // ✅ log "Exported Invoice PDF"
                                  await logActivity("Exported Invoice PDF", {
                                    order_id: order.id,
                                    txn,
                                    paper: paperSize,
                                    items: items?.length ?? 0,
                                    sales_tax: salesTaxSaved,
                                    grand_total_with_interest:
                                      grandTotalWithInterest,
                                    per_term_amount: perTermAmount,
                                  });
                                }}
                              >
                                PRINT PDF
                              </button>
                            </div>
                          </div>
                          <div className="px-4 pt-2 pb-4 text-xs text-right text-neutral-700">
                            <span>
                              <b>Date Completed:</b>{" "}
                              {formatDate(currentDateCompleted)}
                            </span>
                          </div>
                          <div
                            id={`invoice-capture-${order.id}`}
                            className="p-4"
                          >
                            <DeliveryReceiptModern
                              customer={customerForOrder}
                              initialItems={items}
                              initialDate={initialDate}
                              terms={currentTerms || undefined}
                              salesman={currentSalesman || undefined}
                              poNo={currentPoNumber || undefined}
                              totals={{
                                salesTax: salesTaxSaved,
                                grandTotalWithInterest,
                                perTermAmount,
                              }}
                              txn={txn}
                              status={order.status}
                            />
                          </div>
                          {/* Dynamic @page for print */}
                          {paperSize === "a4" && (
                            <style>{`
                              @media print {
                                @page { size: A4; margin: 12mm; }
                                html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                              }
                            `}</style>
                          )}
                          {paperSize === "letter" && (
                            <style>{`
                              @media print {
                                @page { size: 8.5in 11in; margin: 0.5in; }
                                html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                              }
                            `}</style>
                          )}
                          {paperSize === "legal" && (
                            <style>{`
                              @media print {
                                @page { size: 8.5in 13in; margin: 0.5in; }
                                html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                              }
                            `}</style>
                          )}
                        </div>
                      )}
                    </DialogContent>
                  </Dialog>
                );
              })}
              {!filteredOrders.length && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-neutral-400">
                    No invoices found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </motion.div>
      </div>
    </motion.div>
  );
}
