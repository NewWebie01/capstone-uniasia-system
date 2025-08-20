"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import DeliveryReceiptLikeInvoice, {
  type InvoiceItem,
  type CustomerInfo,
} from "@/components/DeliveryReceiptLikeInvoice";
import { generatePDFBlob as generatePDFBlobById } from "@/utils/exportInvoice";

type Customer = {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  contact_person?: string;
  code?: string;
};

type Order = {
  id: string;
  customer_id: string;
  total_amount?: number;
  status?: string;
  date_created?: string;
  salesman?: string;
  terms?: string;
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

export default function InvoicePage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<InvoiceItem[] | null>(null);
  const [customerForOrder, setCustomerForOrder] = useState<CustomerInfo | null>(
    null
  );
  const [initialDate, setInitialDate] = useState<string | undefined>(undefined);
  const [loadingItems, setLoadingItems] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("customers")
      .select("id, name, address, phone, contact_person, code")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) setCustomers(data);
      });
  }, []);

  useEffect(() => {
    supabase
      .from("orders")
      .select("*")
      .order("date_created", { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) setOrders(data);
      });
  }, []);

  const customerMap = useMemo(() => {
    const map = new Map<string, Customer>();
    customers.forEach((c) => map.set(c.id, c));
    return map;
  }, [customers]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) =>
      (customerMap.get(o.customer_id)?.name ?? "").toLowerCase().includes(q)
    );
  }, [orders, customerMap, search]);

  const openInvoice = async (order: Order) => {
    setSelectedOrder(order);
    setOpenId(order.id);
    setLoadingItems(true);

    const cust = customerMap.get(order.customer_id);
    setCustomerForOrder({
      name: cust?.name ?? "—",
      address: cust?.address ?? "",
    });
    setInitialDate(order.date_created?.slice(0, 10));

    const { data: rows, error } = await supabase
      .from("order_items")
      .select(`
        id, order_id, inventory_id, quantity, price,
        inventory:inventory_id ( product_name, unit, unit_price )
      `)
      .eq("order_id", order.id);

    if (!error) {
      const mapped: InvoiceItem[] = (rows as unknown as OrderItemRow[]).map(
        (r) => ({
          id: r.id,
          qty: Number(r.quantity || 0),
          unit: r.inventory?.unit ?? "pcs",
          description: r.inventory?.product_name ?? "",
          unitPrice: Number(r.price ?? r.inventory?.unit_price ?? 0),
          discount: 0,
        })
      );
      setItems(mapped);
    } else {
      setItems([
        {
          id: "fallback",
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

  async function generatePDFBlob(nodeId: string): Promise<Blob | null> {
    return await generatePDFBlobById(nodeId);
  }

  const handlePreviewPDF = async (orderId: string) => {
    const blob = await generatePDFBlob(`invoice-capture-${orderId}`);
    if (!blob) return alert("Failed to generate PDF.");
    const url = URL.createObjectURL(blob);
    setPdfUrl(url);
  };

  return (
    <motion.div className="p-6 space-y-6 from-amber-50 to-amber-200/40 min-h-screen">
      <h1 className="text-2xl font-bold">Sales Invoices</h1>

      <div className="max-w-md">
        <input
          type="text"
          placeholder="Search by customer name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-2 rounded-md shadow bg-white focus:outline-none focus:ring-2 focus:ring-black"
        />
      </div>

      {/* Table View */}
<div className="overflow-x-auto rounded-lg shadow bg-white">
  <table className="min-w-full text-sm">
    <thead className="bg-[#ffba20] text-black text-left">
      <tr>
        <th className="px-4 py-2">Sales Invoice (TXN)</th>
        <th className="px-4 py-2">Customer Name</th>
        <th className="px-4 py-2 text-center">Action</th>
      </tr>
    </thead>
    <tbody className="divide-y divide-gray-200">
      {filteredOrders.map((order) => {
        const c = customerMap.get(order.customer_id);
        const txn = c?.code || order.id;
        return (
          <Dialog
            key={order.id}
            open={openId === order.id}
            onOpenChange={(open) => {
              if (!open) {
                setOpenId(null);
                setSelectedOrder(null);
                setItems(null);
              } else {
                openInvoice(order);
              }
            }}
          >
            <tr className="hover:bg-gray-50 transition">
              <td className="px-4 py-2">{txn}</td>
              <td className="px-4 py-2">{c?.name ?? "Unknown"}</td>
              <td className="px-4 py-2 text-center">
                <DialogTrigger asChild>
                  <button
                    className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                    onClick={() => openInvoice(order)} // ✅ keep this so data loads
                  >
                    View
                  </button>
                </DialogTrigger>
              </td>
            </tr>

            <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
              {!selectedOrder || openId !== order.id ? (
                <div className="p-6 text-sm">Loading…</div>
              ) : loadingItems || !items || !customerForOrder ? (
                <div className="p-6 text-sm">Fetching items…</div>
              ) : (
                <div>
                  <div className="flex items-center justify-between px-2 pt-2 pb-1">
                    <div className="text-sm">TXN: {txn}</div>
                    <button
                      className="bg-blue-600 text-white px-3 py-1.5 rounded"
                      onClick={() => handlePreviewPDF(order.id)}
                    >
                      Preview PDF
                    </button>
                  </div>
                  <div id={`invoice-capture-${order.id}`} className="p-2">
                    <DeliveryReceiptLikeInvoice
                      customer={customerForOrder}
                      initialItems={items}
                      initialDate={initialDate}
                    />
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        );
      })}
      {!filteredOrders.length && (
        <tr>
          <td colSpan={3} className="text-center py-4 text-neutral-500">
            No invoices found.
          </td>
        </tr>
      )}
    </tbody>
  </table>
</div>


      {/* PDF Preview Modal */}
      <AnimatePresence>
        {pdfUrl && (
          <motion.div
            initial={{ opacity: 0.0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center"
          >
            <div className="bg-white w-[92%] h-[92%] rounded shadow-xl relative overflow-hidden">
              <iframe src={pdfUrl} className="w-full h-full" />
              <button
                onClick={() => {
                  if (pdfUrl) URL.revokeObjectURL(pdfUrl);
                  setPdfUrl(null);
                }}
                className="absolute top-3 right-4 px-3 py-1.5 bg-neutral-200 hover:bg-neutral-300"
              >
                <X className="w-4 h-4" /> 
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}