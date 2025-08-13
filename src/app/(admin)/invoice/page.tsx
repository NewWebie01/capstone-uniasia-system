"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { ReceiptText } from "lucide-react";
import { motion } from "framer-motion";

import DeliveryReceiptLikeInvoice, {
  type InvoiceItem,
  type CustomerInfo,
} from "@/components/DeliveryReceiptLikeInvoice";

// ---------- Types match your schema ----------
type Customer = {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  contact_person?: string;
  code?: string; // <-- TXN lives here (from customers table)
};

type Order = {
  id: string;
  customer_id: string;
  total_amount?: number;
  status?: string;
  date_created?: string;
  salesman?: string;
  terms?: string;
  credit_limit?: number | string;
  collection?: string;
  // code?: string; // not used for display
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

  // dialog state
  const [openId, setOpenId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<InvoiceItem[] | null>(null);
  const [customerForOrder, setCustomerForOrder] = useState<CustomerInfo | null>(
    null
  );
  const [initialDate, setInitialDate] = useState<string | undefined>(undefined);
  const [loadingItems, setLoadingItems] = useState(false);

  // 1) fetch customers (INCLUDE code/txn)
  useEffect(() => {
    const run = async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, address, phone, contact_person, code") // <-- code added
        .order("created_at", { ascending: false });

      if (!error && data) setCustomers(data as Customer[]);
    };
    run();
  }, []);

  // 2) fetch orders
  useEffect(() => {
    const run = async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .order("date_created", { ascending: false });

      if (!error && data) setOrders(data as Order[]);
    };
    run();
  }, []);

  // quick map for lookup
  const customerMap = useMemo(() => {
    const m = new Map<string, Customer>();
    customers.forEach((c) => m.set(c.id, c));
    return m;
  }, [customers]);

  // filter by customer name
  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) =>
      (customerMap.get(o.customer_id)?.name ?? "").toLowerCase().includes(q)
    );
  }, [orders, customerMap, search]);

  // open a card -> load items and prep invoice props
  const openInvoice = async (order: Order) => {
    setSelectedOrder(order);
    setOpenId(order.id);
    setLoadingItems(true);

    const cust = customerMap.get(order.customer_id);
    setCustomerForOrder({
      name: cust?.name ?? "—",
      address: cust?.address ?? "",
    });
    setInitialDate(
      order.date_created ? order.date_created.slice(0, 10) : undefined
    );

    const { data: rows, error } = await supabase
      .from("order_items")
      .select(
        `
        id, order_id, inventory_id, quantity, price,
        inventory:inventory_id ( product_name, unit, unit_price )
      `
      )
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

  return (
    <motion.div className="p-6 space-y-6 bg-gradient-to-b from-amber-50 to-amber-200/40 min-h-screen">
      <h1 className="text-2xl font-bold">Sales Invoices</h1>

      <div className="w-full max-w-md">
        <input
          type="text"
          placeholder="Search by customer name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-2 rounded-md shadow bg-white focus:outline-none focus:ring-2 focus:ring-black transition"
        />
      </div>

      {/* one card PER ORDER — shows TXN from customers.code */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredOrders.map((order) => {
          const c = customerMap.get(order.customer_id);
          const txn = c?.code || order.id; // fallback to id if no code yet
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
              <DialogTrigger asChild>
                <Card
                  className="cursor-pointer p-4 bg-white shadow hover:shadow-lg transition"
                  onClick={() => openInvoice(order)}
                >
                  <p className="font-semibold flex items-center gap-2">
                    <ReceiptText className="w-4 h-4" />
                    Sales Invoice: {txn}
                  </p>
                  <p className="mt-1">
                    CUSTOMER NAME: {c?.name ?? "Unknown customer"}
                  </p>
                  <p>ADDRESS: {c?.address ?? "—"}</p>
                  <p>CONTACT NUMBER: {c?.phone ?? "—"}</p>
                </Card>
              </DialogTrigger>

              <DialogContent className="max-w-5xl print:block print:static">
                {!selectedOrder || openId !== order.id ? (
                  <div className="p-6 text-sm text-neutral-600">Loading…</div>
                ) : loadingItems || !items || !customerForOrder ? (
                  <div className="p-6 text-sm text-neutral-600">
                    Fetching items…
                  </div>
                ) : (
                  <div className="bg-white">
                    {/* small header line showing TXN from customers.code */}
                    <div className="flex items-center justify-between px-2 pt-2 pb-1">
                      <div className="text-sm text-neutral-700">
                        <span className="font-semibold">TXN:</span> {txn}
                      </div>
                      <div className="text-xs text-neutral-500">
                        Order ID: {order.id}
                      </div>
                    </div>

                    <div className="p-2">
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
      </div>

      {!filteredOrders.length && (
        <div className="text-sm text-neutral-600">No invoices found.</div>
      )}
    </motion.div>
  );
}
