"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle, Clock, Truck } from "lucide-react";
import { createPagesBrowserClient } from "@supabase/auth-helpers-nextjs";
import { toast } from "sonner";
import { ReceiptText } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

/* =========================
   TYPES
========================= */
type Delivery = {
  id: number;
  destination: string;
  plate_number: string;
  driver: string;
  status: "Scheduled" | "To Ship" | "To Receive" | string;
  schedule_date: string;
  arrival_date: string | null;
  participants?: string[] | null;
  created_at?: string;
  _orders?: OrderWithCustomer[];
};

type Customer = {
  id: number;
  name: string;
  code: string;
  address?: string | null;
  landmark?: string | null;
  contact_person?: string | null;
  phone?: string | null;
  transaction?: string | null;
  date?: string | null;
  created_at?: string | null;
  status?: string | null;
};

type OrderWithCustomer = {
  id: number;
  total_amount: number | null;
  status: string | null;
  truck_delivery_id: number | null;
  terms?: string | null;
  collection?: string | null;
  salesman?: string | null;
  customer: Customer;
  order_items?: Array<{
    quantity: number;
    price: number;
    inventory: {
      product_name: string;
      category: string | null;
      subcategory: string | null;
      status: string | null;
    } | null;
  }>;
};

/* =========================
   PAGE
========================= */
export default function DeliveredPage() {
  const [invoiceDialogOpenId, setInvoiceDialogOpenId] = useState<number | null>(
    null
  );
  const [selectedOrderForInvoice, setSelectedOrderForInvoice] =
    useState<OrderWithCustomer | null>(null);

  const openInvoiceDialogForOrder = (
    deliveryId: number,
    order?: OrderWithCustomer
  ) => {
    setInvoiceDialogOpenId(deliveryId);
    setSelectedOrderForInvoice(order ?? null);
  };
  const closeInvoiceDialog = () => {
    setInvoiceDialogOpenId(null);
    setSelectedOrderForInvoice(null);
  };
  const pesoOrBlank = (v?: number | string | null) => {
    const n = Number(v ?? 0);
    return n > 0 ? `₱${n}` : "";
  };

  const supabase = createPagesBrowserClient();

  // list + paging
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const pageSize = 10;

  // filters
  const [query, setQuery] = useState<string>(""); // matches destination/driver/plate
  const [dateFrom, setDateFrom] = useState<string>(""); // YYYY-MM-DD
  const [dateTo, setDateTo] = useState<string>(""); // YYYY-MM-DD
  const [loading, setLoading] = useState<boolean>(false);

  const isLocked = (status: string) => status === "To Receive";

  // group by schedule_date (for section headers)
  const groupedDeliveries = useMemo(() => {
    return deliveries.reduce<Record<string, Delivery[]>>((acc, delivery) => {
      const key = delivery.schedule_date || "Unscheduled";
      (acc[key] ||= []).push(delivery);
      return acc;
    }, {});
  }, [deliveries]);

  const sortedDateKeys = useMemo(() => {
    return Object.keys(groupedDeliveries).sort((a, b) => {
      const ta = a ? new Date(a).getTime() : 0;
      const tb = b ? new Date(b).getTime() : 0;
      return tb - ta; // newest date section first
    });
  }, [groupedDeliveries]);

  // main fetch
  const fetchDelivered = async (pageNum: number) => {
    setLoading(true);
    try {
      // base query
      let q = supabase
        .from("truck_deliveries")
        .select("*", { count: "exact" })
        .eq("status", "To Receive"); // <- only To Receive

      // filters
      if (dateFrom) q = q.gte("schedule_date", dateFrom);
      if (dateTo) q = q.lte("schedule_date", dateTo);

      if (query.trim()) {
        const qEsc = query.trim().replace(/'/g, "''"); // escape single quotes
        q = q.or(
          `destination.ilike.%${qEsc}%,driver.ilike.%${qEsc}%,plate_number.ilike.%${qEsc}%`
        );
      }

      // sort newest schedules first
      q = q
        .order("schedule_date", { ascending: false })
        .order("created_at", { ascending: false });

      // pagination
      const from = (pageNum - 1) * pageSize;
      const to = from + pageSize - 1;
      q = q.range(from, to);

      const { data: dData, error: dErr, count } = await q;
      if (dErr) {
        console.error("Fetch delivered error:", dErr);
        toast.error("Failed to load delivered deliveries");
        setDeliveries([]);
        setTotalCount(0);
        setLoading(false);
        return;
      }

      const list = (dData as Delivery[]) ?? [];
      setDeliveries(list);
      setTotalCount(count ?? 0);

      // fetch orders for the visible deliveries only
      if (list.length) {
        const ids = list.map((d) => d.id);
        const { data: oData, error: oErr } = await supabase
          .from("orders")
          .select(
            `
    id, total_amount, status, truck_delivery_id, salesman, terms, date_created,
    customer:customer_id (
      id, name, code, address, landmark, contact_person, phone, status, date, created_at
    ),
    order_items (
      quantity, price,
      inventory:inventory_id ( product_name, category, subcategory, status )
    )
  `
          )
          .in("truck_delivery_id", ids)
          .order("date_created", { ascending: false }); // <- change from accepted_at

        if (oErr) {
          console.error("Fetch delivered orders error:", oErr);
          setLoading(false);
          return;
        }

        const fetched = (oData as any[]) ?? [];
        const byDelivery = new Map<number, OrderWithCustomer[]>();
        fetched.forEach((oRaw) => {
          const o: OrderWithCustomer = {
            id: oRaw.id,
            total_amount: oRaw.total_amount,
            status: oRaw.status,
            truck_delivery_id: oRaw.truck_delivery_id,
            terms: oRaw.terms ?? null,
            salesman: oRaw.salesman ?? null,
            customer: oRaw.customer ?? null,
            order_items: oRaw.order_items ?? [],
          };
          if (!o.truck_delivery_id) return;
          if (!byDelivery.has(o.truck_delivery_id))
            byDelivery.set(o.truck_delivery_id, []);
          byDelivery.get(o.truck_delivery_id)!.push(o);
        });

        setDeliveries((prev) =>
          prev.map((d) => ({
            ...d,
            _orders: byDelivery.get(d.id) || [],
          }))
        );
      }
    } finally {
      setLoading(false);
    }
  };

  // initial load + when filters/page change
  useEffect(() => {
    fetchDelivered(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, dateFrom, dateTo]);

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchDelivered(1);
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  /* =========================
     RENDER
  ========================= */
  return (
    <div className="p-6 font-sans antialiased text-slate-800">
      {/* Header */}
      <div className="flex items-end justify-between mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold">Delivery History</h1>
          <p className="text-sm text-slate-500">
            View delivered trucks with filters and pagination.
          </p>
        </div>

        {/* Simple search input */}
        <form onSubmit={onSearch}>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search destination, driver, plate..."
            className="border rounded-md px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="ml-2 px-3 py-2 rounded bg-[#ffba20] text-black font-bold text-sm hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#ffba20]/60"
          >
            Search
          </button>
        </form>
      </div>

      {/* Paging header */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-slate-600">
          {loading
            ? "Loading…"
            : `Showing ${(page - 1) * pageSize + 1}–${Math.min(
                page * pageSize,
                totalCount
              )} of ${totalCount} deliveries`}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            className="px-3 py-1.5 rounded border disabled:opacity-50"
          >
            ← Prev
          </button>
          <span className="text-sm">
            Page {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            className="px-3 py-1.5 rounded border disabled:opacity-50"
          >
            Next →
          </button>
        </div>
      </div>

      {/* Delivered Cards – grouped by schedule_date, read-only */}
      {sortedDateKeys.length === 0 && !loading && (
        <p className="text-sm text-slate-500">No “To Receive” records found.</p>
      )}

      {sortedDateKeys.map((date) => {
        const dayDeliveries = groupedDeliveries[date];
        return (
          <div key={date} className="mb-10">
            <h2 className="text-lg font-bold text-gray-700 mb-3">
              Scheduled on: {date}
            </h2>

            {dayDeliveries.map((delivery) => (
              <motion.div
                key={delivery.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="bg-white p-6 rounded-lg shadow-md mb-6 opacity-80"
              >
                <div className="grid grid-cols-12 gap-6">
                  {/* LEFT: Delivery details */}
                  <div className="col-span-12 lg:col-span-5">
                    <h2 className="text-2xl font-semibold tracking-tight">
                      Delivery to{" "}
                      <span className="text-slate-900">
                        {delivery.destination || (
                          <span className="italic text-gray-400">
                            [No destination]
                          </span>
                        )}
                      </span>
                    </h2>
                    {delivery._orders?.[0]?.customer?.landmark && (
                      <p className="text-sm text-gray-500 mt-1">
                        <strong>Landmark:</strong>{" "}
                        {delivery._orders[0].customer.landmark}
                      </p>
                    )}

                    <div className="mt-3 text-sm leading-6">
                      <div className="grid grid-cols-2 gap-y-2">
                        <div className="text-slate-500 uppercase tracking-wide text-xs">
                          SCHEDULE DATE
                        </div>
                        <div className="font-medium">
                          {delivery.schedule_date}
                        </div>

                        <div className="text-slate-500 uppercase tracking-wide text-xs">
                          PLATE NUMBER
                        </div>
                        <div className="font-medium">
                          {delivery.plate_number}
                        </div>

                        <div className="text-slate-500 uppercase tracking-wide text-xs">
                          DRIVER
                        </div>
                        <div className="font-medium">{delivery.driver}</div>

                        {delivery.arrival_date && (
                          <>
                            <div className="text-slate-500 uppercase tracking-wide text-xs">
                              DATE RECEIVED
                            </div>
                            <div className="font-medium">
                              {delivery.arrival_date}
                            </div>
                          </>
                        )}
                      </div>

                      {(delivery.participants?.length ?? 0) > 0 && (
                        <p className="mt-3 text-sm">
                          <span className="text-slate-500 uppercase tracking-wide text-xs">
                            Other Participants
                          </span>
                          <br />
                          <span className="font-medium">
                            {(delivery.participants || []).join(", ")}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* MIDDLE: Invoices list */}
                  <div className="col-span-12 lg:col-span-5">
                    <h3 className="text-sm font-semibold text-slate-600 mb-2">
                      Invoices on this truck
                    </h3>

                    {delivery._orders && delivery._orders.length > 0 ? (
                      <div className="space-y-3">
                        {delivery._orders.map((o) => (
                          <div
                            key={o.id}
                            className="grid grid-cols-12 items-center gap-3 bg-slate-50 rounded-xl px-3 py-2 border border-slate-100"
                          >
                            <button
                              className="col-span-12 sm:col-span-3 border rounded-lg px-3 py-1.5 font-mono text-xs bg-white hover:bg-slate-50 shadow-sm"
                              onClick={() =>
                                openInvoiceDialogForOrder(delivery.id, o)
                              }
                              title="Open invoice"
                            >
                              {o.customer?.code}
                            </button>

                            <div className="col-span-12 sm:col-span-6">
                              <div className="font-medium truncate">
                                {o.customer?.name}
                              </div>
                              <div className="text-xs text-slate-500 truncate">
                                {o.customer?.address ?? ""}
                              </div>
                              {o.customer?.landmark && (
                                <div className="text-xs text-slate-400 italic truncate">
                                  Landmark: {o.customer.landmark}
                                </div>
                              )}
                            </div>

                            <div className="col-span-12 sm:col-span-3 text-right">
                              <div className="text-[11px] text-slate-500">
                                Order #{o.id}
                              </div>
                              <div className="mt-1 inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium bg-slate-100 text-slate-700">
                                {o.status ?? "pending"}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">
                        No invoices assigned.
                      </p>
                    )}
                  </div>

                  {/* RIGHT: Status (read-only) */}
                  <div className="col-span-12 lg:col-span-2">
                    <div className="flex lg:flex-col gap-2 justify-end lg:justify-start">
                      <div className="inline-flex items-center gap-2">
                        {delivery.status === "Delivered" && (
                          <CheckCircle className="text-green-700" />
                        )}
                        {delivery.status === "To Receive" && (
                          <CheckCircle className="text-emerald-600" />
                        )}
                        {delivery.status === "To Ship" && (
                          <Truck className="text-amber-600" />
                        )}
                        {delivery.status === "Scheduled" && (
                          <Clock className="text-sky-600" />
                        )}

                        <select
                          value={delivery.status}
                          disabled
                          className="border rounded-md px-2 py-1 text-sm bg-gray-100 text-gray-500 cursor-not-allowed"
                        >
                          <option value="To Receive">To Receive</option>
                          <option value="Delivered">Delivered</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        );
      })}
      {/* ANG BUHAY AY WEATHER WEATHER LANG */}
      {/* Pagination footer */}
      <div className="flex items-center justify-between mt-8 border-t pt-4 text-sm">
        <div className="text-slate-600">
          Showing {(page - 1) * pageSize + 1}–
          {Math.min(page * pageSize, totalCount)} of {totalCount} deliveries
        </div>
        <div className="flex gap-2 items-center">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            className="px-3 py-1.5 rounded border disabled:opacity-50"
          >
            ← Prev
          </button>
          <span>
            Page {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            className="px-3 py-1.5 rounded border disabled:opacity-50"
          >
            Next →
          </button>
        </div>
      </div>

      <div className="h-4" />
    </div>
  );
}
