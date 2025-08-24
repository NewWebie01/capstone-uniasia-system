"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Eye } from "lucide-react";
import { motion } from "framer-motion";
import supabase from "@/config/supabaseClient";

/* -------------------- Types -------------------- */
type InvoiceItem = {
  id: string;
  qty: number;
  unit: string;
  description: string;
  unitPrice: number;
  discount: number; // percent
};

type CustomerInfo = {
  name: string;
  address?: string;
  code?: string;
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
  } | null;
};

type OrderItemRow = {
  id: string;
  order_id: string;
  inventory_id: string;
  quantity: number;
  price: number | null;
  inventory?: {
    product_name: string | null;
    unit?: string | null;
    unit_price?: number | null;
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
  customers: { name: string | null; address: string | null } | null;
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

// ---------- PDF Export Helper (html2canvas + jsPDF) ----------
type PaperKey = "a4" | "letter" | "legal";

// paper sizes in points (1pt = 1/72in)
const PAPER_SPECS: Record<PaperKey, { width: number; height: number; margin: number; filename: string }> = {
  a4:     { width: 595.28,  height: 841.89,  margin: 28.35, filename: "A4" },      // 210×297mm
  letter: { width: 612,     height: 792,     margin: 36,    filename: "Letter" },  // 8.5×11in
  legal:  { width: 612,     height: 936,     margin: 36,    filename: "Legal" },   // 8.5×13in
};

async function exportNodeToPDF(
  node: HTMLElement,
  paper: PaperKey,
  filenameBase: string
) {
  const [{ jsPDF }, html2canvas] = await Promise.all([
    import("jspdf"),
    import("html2canvas")
  ]);

  // Render the node to a canvas
  const canvas = await html2canvas.default(node, {
    scale: 2,            // sharper text
    backgroundColor: "#ffffff",
    useCORS: true,       // allows external images if CORS-enabled
    logging: false,
    windowWidth: document.documentElement.scrollWidth,
  });

  const spec = PAPER_SPECS[paper];
  const pdf = new jsPDF({
    unit: "pt",
    format: [spec.width, spec.height],
    compress: true,
    hotfixes: ["px_scaling"]
  });

  const pageW = spec.width - spec.margin * 2;
  const pageH = spec.height - spec.margin * 2;

  // Scale the canvas to fit page width, then paginate vertically if needed
  const imgW = pageW;
  const imgH = (canvas.height * imgW) / canvas.width;

  const imgData = canvas.toDataURL("image/png", 1.0);

  let remaining = imgH;
  let y = spec.margin;

  // First page
  pdf.addImage(imgData, "PNG", spec.margin, y, imgW, imgH, undefined, "FAST");

  // If content is taller than one page, add extra pages by shifting the source
  if (imgH > pageH) {
    // Create a temp canvas we can "window" through the big image with
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = Math.floor((pageH / imgH) * canvas.height);
    const ctx = pageCanvas.getContext("2d")!;
    const sliceH = pageCanvas.height;

    let sY = Math.floor((pageH / imgH) * canvas.height); // source Y start for 2nd page

    while (remaining > pageH) {
      pdf.addPage([spec.width, spec.height]);
      // draw slice
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
      pdf.addImage(sliceData, "PNG", spec.margin, spec.margin, imgW, pageH, undefined, "FAST");

      sY += sliceH;
      remaining -= pageH;
    }
  }

  const safeName = filenameBase.replace(/[^\w\-]+/g, "_");
  pdf.save(`${safeName}_${PAPER_SPECS[paper].filename}.pdf`);
}


/* -------------------- Delivery Receipt -------------------- */
function DeliveryReceiptLikeInvoice({
  customer,
  initialItems,
  initialDate,
  terms,
  salesman,
  poNo,
  totals,
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
}) {
  const rows = initialItems || [];

  const subtotal = rows.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const totalDiscount = rows.reduce((s, i) => {
    const line = i.qty * i.unitPrice;
    return s + (line * (i.discount || 0)) / 100;
  }, 0);
  const afterDiscount = subtotal - totalDiscount;
  const computedSalesTax = afterDiscount * TAX_RATE;
  const computedGrandTotal = afterDiscount + computedSalesTax;

  const salesTaxOut =
    typeof totals?.salesTax === "number" ? totals!.salesTax : computedSalesTax;
  const grandTotalOut =
    typeof totals?.grandTotalWithInterest === "number"
      ? totals!.grandTotalWithInterest
      : computedGrandTotal;
  const perTermOut =
    typeof totals?.perTermAmount === "number" ? totals!.perTermAmount : 0;

  return (
    <div className="w-full max-w-4xl mx-auto bg-white p-6 rounded shadow print:shadow-none print:p-8 print:max-w-none print:w-[100%] text-black">
      {/* Header */}
      <div className="flex flex-col items-center justify-center mb-2">
        <h2 className="text-xl font-bold tracking-tight">UNIASIA</h2>
        <div className="text-xs font-medium">JASON S. TO – Proprietor</div>
        <div className="my-2">
          <span className="px-2 py-1 border rounded border-neutral-400 font-semibold text-sm bg-neutral-50">
            DELIVERY RECEIPT
          </span>
        </div>
      </div>

      {/* Details */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs mb-2">
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
        </div>
      </div>

      {/* Items */}
      <div className="border border-gray-300 rounded mt-2 overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr style={{ background: "#ffba20" }} className="text-black">
              <th className="px-2 py-1 text-left">QTY</th>
              <th className="px-2 py-1 text-left">UNIT</th>
              <th className="px-2 py-1 text-left">ITEM DESCRIPTION</th>
              <th className="px-2 py-1 text-right">UNIT PRICE</th>
              <th className="px-2 py-1 text-right">DISCOUNT/ADD (%)</th>
              <th className="px-2 py-1 text-right">AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => {
              const line = item.qty * item.unitPrice;
              const lineAfter = line - (line * (item.discount || 0)) / 100;
              return (
                <tr key={item.id} className="border-t last:border-b">
                  <td className="px-2 py-1">{item.qty}</td>
                  <td className="px-2 py-1">{item.unit}</td>
                  <td className="px-2 py-1">
                    <span className="font-semibold">{item.description}</span>
                  </td>
                  <td className="px-2 py-1 text-right">
                    {formatCurrency(item.unitPrice)}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {item.discount || 0}%
                  </td>
                  <td className="px-2 py-1 text-right">
                    {formatCurrency(lineAfter)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Notes + Summary */}
      <div className="flex flex-row gap-4 mt-4 print:gap-2">
        <div className="w-2/3 text-xs">
          <b>NOTE:</b>
          <ul className="list-decimal ml-6 space-y-0.5">
            <li>
              All goods are checked in good condition and complete after
              received and signed.
            </li>
            <li>Cash advances to salesman not allowed.</li>
            <li>All checks payable to By–Grace Trading only.</li>
          </ul>
        </div>

        <div className="flex flex-col items-end text-xs mt-4 w-1/3">
          <table className="text-right w-full">
            <tbody>
              <tr>
                <td className="font-semibold py-0.5">
                  Subtotal (Before Discount):
                </td>
                <td className="pl-2">{formatCurrency(subtotal)}</td>
              </tr>
              <tr>
                <td className="font-semibold py-0.5">
                  Less/Add (Discount/Markup):
                </td>
                <td className="pl-2">{formatCurrency(totalDiscount)}</td>
              </tr>
              <tr>
                <td className="font-semibold py-0.5">Sales Tax (12%):</td>
                <td className="pl-2">{formatCurrency(salesTaxOut)}</td>
              </tr>
              <tr>
                <td className="font-bold py-1.5">Grand Total:</td>
                <td className="pl-2 font-bold text-green-700">
                  {formatCurrency(grandTotalOut)}
                </td>
              </tr>
              {perTermOut > 0 && (
                <tr>
                  <td className="font-semibold py-0.5">Per Term:</td>
                  <td className="pl-2 font-bold text-blue-700">
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

/* -------------------- Page -------------------- */
export default function InvoiceMergedPage() {
  const params = useParams<{ id?: string }>();
  const router = useRouter();
  const orderId = params?.id;

  // print state
  const [paperSize, setPaperSize] =
    useState<"a4" | "letter" | "legal">("a4");

  // list state
  const [orders, setOrders] = useState<OrderForList[]>([]);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  // modal header state
  const [items, setItems] = useState<InvoiceItem[] | null>(null);
  const [customerForOrder, setCustomerForOrder] =
    useState<CustomerInfo | null>(null);
  const [initialDate, setInitialDate] = useState<string | null>(null);
  const [currentTerms, setCurrentTerms] = useState<string | null>(null);
  const [currentSalesman, setCurrentSalesman] = useState<string | null>(null);
  const [currentPoNumber, setCurrentPoNumber] = useState<string | null>(null);
  const [currentDateCompleted, setCurrentDateCompleted] =
    useState<string | null>(null);
  const [loadingItems, setLoadingItems] = useState(false);

  // detail route state
  const [detailCustomer, setDetailCustomer] =
    useState<CustomerInfo | null>(null);
  const [detailItems, setDetailItems] = useState<InvoiceItem[] | null>(null);
  const [detailDate, setDetailDate] = useState<string | null>(null);
  const [detailTerms, setDetailTerms] = useState<string | null>(null);
  const [detailSalesman, setDetailSalesman] = useState<string | null>(null);
  const [detailPoNumber, setDetailPoNumber] = useState<string | null>(null);
  const [detailDateCompleted, setDetailDateCompleted] =
    useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);

  // saved totals (for both modal & detail)
  const [grandTotalWithInterest, setGrandTotalWithInterest] =
    useState<number>(0);
  const [perTermAmount, setPerTermAmount] = useState<number>(0);
  const [salesTaxSaved, setSalesTaxSaved] = useState<number>(0);

  /* -------- Global print cleanups -------- */
  const GlobalPrintCSS = () => (
    <style jsx global>{`
      @media print {
        button,
        [role='dialog'] header .close,
        .no-print {
          display: none !important;
        }
        .print-page {
          break-after: always;
        }
      }
    `}</style>
  );

  /* -------- Fetch list of orders (with customer) -------- */
  useEffect(() => {
    if (orderId) return;
    (async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(`
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
            code
          )
        `)
        .order("date_created", { ascending: false });

      if (error) {
        console.error("Invoice list fetch error:", {
          message: (error as any).message,
          details: (error as any).details,
          hint: (error as any).hint,
        });
        setOrders([]);
        return;
      }
      setOrders((data || []) as unknown as OrderForList[]);
    })();
  }, [orderId]);

  /* -------- Search / filter (show completed only) -------- */
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

  /* -------- Open invoice from list (modal) -------- */
  const openInvoice = async (order: OrderForList) => {
    setOpenId(order.id);
    setLoadingItems(true);

    // header info
    setCustomerForOrder({
      name: order.customer?.name || "—",
      address: order.customer?.address || "",
      code: order.customer?.code || "",
    });
    setInitialDate(order.date_created ? order.date_created.slice(0, 10) : null);
    setCurrentTerms(order.terms || null);
    setCurrentSalesman(order.salesman || null);
    setCurrentPoNumber(order.po_number || null);
    setCurrentDateCompleted(order.date_completed || null);

    // fetch items
    const { data: rows, error } = await supabase
      .from("order_items")
      .select(`
        id,
        order_id,
        inventory_id,
        quantity,
        price,
        inventory:inventory_id (
          product_name,
          unit,
          unit_price
        )
      `)
      .eq("order_id", order.id);

    // fetch saved totals (same row as order)
    const { data: orderRow, error: orderErr } = await supabase
      .from("orders")
      .select(`
        grand_total_with_interest,
        per_term_amount,
        sales_tax
      `)
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
          discount: 0, // change when you add a discount column
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

  /* -------- Detail route (/invoice/[id]) -------- */
  useEffect(() => {
    if (!orderId) return;
    setLoadingDetail(true);
    (async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          id,
          date_created,
          date_completed,
          terms,
          salesman,
          po_number,
          grand_total_with_interest,
          per_term_amount,
          interest_percent,
          sales_tax,
          customers:customer_id ( name, address ),
          order_items (
            id,
            quantity,
            price,
            inventory:inventory_id ( product_name, unit, unit_price )
          )
        `)
        .eq("id", orderId)
        .single();

      if (!error && data) {
        const row = data as unknown as OrderDetailRow;

        setDetailCustomer({
          name: row.customers?.name || "—",
          address: row.customers?.address || "",
        });
        setDetailDate(row.date_created ? row.date_created.slice(0, 10) : null);
        setDetailTerms(row.terms || null);
        setDetailSalesman(row.salesman || null);
        setDetailPoNumber(row.po_number || null);
        setDetailDateCompleted(row.date_completed || null);

        const mapped: InvoiceItem[] = (row.order_items || []).map((it) => ({
          id: it.id,
          qty: Number(it.quantity || 0),
          unit: it.inventory?.unit || "pcs",
          description: it.inventory?.product_name || "",
          unitPrice: Number(it.price ?? it.inventory?.unit_price ?? 0),
          discount: 0,
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
          <DeliveryReceiptLikeInvoice
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
          />
        </div>
      </div>
    );
  }

  // Default: list + modal
  return (
    <motion.div
      className="relative min-h-screen bg-gradient-to-br from-amber-50 via-white to-yellow-100 py-10 px-4"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <GlobalPrintCSS />
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="mb-4">
          <h1 className="text-3xl font-extrabold text-neutral-800 tracking-tight mb-2">
            Sales Invoices
          </h1>
          <p className="text-neutral-500 mb-4 text-sm">
            Manage and view all issued sales invoices.
          </p>
          <div className="flex items-center gap-2 max-w-xs">
            <span className="text-neutral-400">
              <svg
                width="18"
                height="18"
                fill="none"
                className="inline mr-1"
                viewBox="0 0 20 20"
              >
                <path
                  d="M9 16a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm8.293 2.293-3.387-3.387A8.966 8.966 0 0 1 9 18C4.03 18 0 13.97 0 9S4.03 0 9 0s9 4.03 9 9a8.966 8.966 0 0 1-1.32 4.906l3.387 3.387a1 1 0 0 1-1.414 1.414ZM2 9a7 7 0 1 1 14 0A7 7 0 0 1 2 9Z"
                  fill="currentColor"
                />
              </svg>
            </span>
            <input
              type="text"
              placeholder="Search by customer name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-neutral-200 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 bg-white transition"
            />
          </div>
        </div>

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
                      <td className="px-6 py-3">
                        {order.salesman || "—"}
                      </td>
                      <td className="px-6 py-3">
                        {order.po_number || "—"}
                      </td>
                      <td className="px-6 py-3">
                        {formatDate(order.date_completed)}
                      </td>
                      <td className="px-6 py-3 text-center">
                        <DialogTrigger asChild>
                          <button
                            className="inline-flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg shadow transition"
                            onClick={() => openInvoice(order)}
                          >
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
                            <div className="text-sm text-neutral-600">
                              <span className="font-bold text-neutral-800">
                                TXN:
                              </span>{" "}
                              {order.customer?.code || order.id}
                            </div>

                            <div className="flex items-center gap-2">
                              <label className="text-[11px] text-neutral-500">
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
                                <option value="a4">
                                  A4 (210×297mm)
                                </option>
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
    const node = document.getElementById(`invoice-capture-${order.id}`);
    if (!node) return;
    const txn = (order.customer?.code || order.id || "invoice").toString();
    await exportNodeToPDF(node, paperSize, `UNIASIA_${txn}`);
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
                            <DeliveryReceiptLikeInvoice
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
