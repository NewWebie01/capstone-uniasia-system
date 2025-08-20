// src/app/customer/track/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import supabase from "@/config/supabaseClient";

/* ----------------------------- Date formatter ----------------------------- */
const formatPH = (d?: string | number | Date | null) =>
  d
    ? new Intl.DateTimeFormat("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: "Asia/Manila",
      }).format(new Date(d))
    : "—";

/* ---------------------------------- Types --------------------------------- */
type ItemRow = {
  quantity: number;
  price: number;
  inventory?: {
    product_name?: string | null;
    category?: string | null;
    subcategory?: string | null;
    status?: string | null;
  } | null;
};

type OrderRow = {
  id: number;
  total_amount: number | null;
  status: string | null;
  truck_delivery_id?: number | null;
  order_items?: ItemRow[];
};

type CustomerTx = {
  id: number;
  name: string | null;
  code: string | null; // TXN
  contact_person?: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  date: string | null;
  orders?: OrderRow[];
};

type Delivery = {
  id: number;
  status: string | null;
  schedule_date: string | null;
  date_received?: string | null;
  driver?: string | null;
  participants?: string[] | null;
};

export default function TrackPage() {
  const [loading, setLoading] = useState(true);
  const [authEmail, setAuthEmail] = useState<string | null>(null);

  // all transactions (each is one “purchase” a.k.a customers row)
  const [txns, setTxns] = useState<CustomerTx[]>([]);
  // deliveries indexed by id
  const [deliveriesById, setDeliveriesById] = useState<
    Record<number, Delivery>
  >({});

  const hasData = useMemo(() => txns.length > 0, [txns.length]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const email = user?.email ?? null;
        setAuthEmail(email);

        if (!email) {
          setTxns([]);
          setDeliveriesById({});
          return;
        }

        // 1) Fetch ALL customer transactions for this email
        const { data: customers, error } = await supabase
          .from("customers")
          .select(
            `
            id,
            name,
            code,
            contact_person,
            email,
            phone,
            address,
            date,
            orders (
              id,
              total_amount,
              status,
              truck_delivery_id,
              order_items (
                quantity,
                price,
                inventory:inventory_id (
                  product_name,
                  category,
                  subcategory,
                  status
                )
              )
            )
          `
          )
          .eq("email", email)
          .order("date", { ascending: false });

        if (error || !customers) {
          setTxns([]);
          setDeliveriesById({});
          return;
        }

        const txList = customers as CustomerTx[];
        setTxns(txList);

        // 2) Collect unique truck_delivery_ids across all orders
        const ids = new Set<number>();
        for (const t of txList) {
          for (const o of t.orders ?? []) {
            if (o?.truck_delivery_id != null) {
              ids.add(o.truck_delivery_id as number);
            }
          }
        }

        // 3) Fetch deliveries in one go
        if (ids.size > 0) {
          const idArray = Array.from(ids);
          const { data: delivs, error: dErr } = await supabase
            .from("truck_deliveries")
            .select(
              "id, status, schedule_date, date_received, driver, participants"
            )
            .in("id", idArray);

          if (!dErr && delivs) {
            const map: Record<number, Delivery> = {};
            for (const d of delivs as Delivery[]) map[d.id] = d;
            setDeliveriesById(map);
          } else {
            setDeliveriesById({});
          }
        } else {
          setDeliveriesById({});
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-3xl font-bold mb-4">Track Your Delivery</h1>

      {/* States */}
      {!authEmail && !loading && (
        <div className="bg-white border rounded p-4 shadow-sm">
          <p>Please sign in to view your orders.</p>
        </div>
      )}

      {loading && (
        <div className="bg-white border rounded p-4 shadow-sm">
          <p>Loading your orders…</p>
        </div>
      )}

      {!loading && authEmail && !hasData && (
        <div className="bg-white border rounded p-4 shadow-sm">
          <p>
            No orders found for <span className="font-medium">{authEmail}</span>
            .
          </p>
        </div>
      )}

      {/* All transactions for this user */}
      {!loading &&
        hasData &&
        txns.map((t) => {
          const orderList = t.orders ?? [];
          // If there’s exactly one order per transaction (your create flow), this array is length 1;
          // still render generically in case you add multi-order later.
          return (
            <div key={t.id} className="bg-gray-50 border rounded p-4 mb-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <h3 className="font-semibold text-md">TXN: {t.code ?? "—"}</h3>
                <div className="text-sm text-gray-600">
                  Date: {formatPH(t.date)}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm mt-2">
                <p>
                  <span className="font-medium">Name:</span> {t.name ?? "—"}
                </p>
                <p>
                  <span className="font-medium">Delivery Status:</span>{" "}
                  {/* show first order’s delivery status if present; otherwise order status */}
                  {(() => {
                    const o = orderList[0];
                    const d = o?.truck_delivery_id
                      ? deliveriesById[o.truck_delivery_id]
                      : undefined;
                    return d?.status ?? o?.status ?? "—";
                  })()}
                </p>
                <p className="md:col-span-2">
                  <span className="font-medium">Address:</span>{" "}
                  {t.address ?? "—"}
                </p>
                <p>
                  <span className="font-medium">Contact:</span> {t.phone ?? "—"}
                </p>
                <p>
                  <span className="font-medium">Email:</span> {t.email ?? "—"}
                </p>
              </div>

              {/* Orders within the transaction */}
              {orderList.map((o) => {
                const deliv = o.truck_delivery_id
                  ? deliveriesById[o.truck_delivery_id]
                  : undefined;

                return (
                  <div key={o.id} className="mt-4">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                      <h4 className="font-semibold">Order #{o.id}</h4>
                      <div className="text-sm">
                        <span className="font-medium">Status:</span>{" "}
                        {deliv?.status ?? o.status ?? "—"}
                      </div>
                    </div>

                    {/* Items */}
                    <div className="mt-2 border rounded bg-white overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-200">
                          <tr>
                            <th className="py-2 px-3 text-left">Product</th>
                            <th className="py-2 px-3 text-left">Category</th>
                            <th className="py-2 px-3 text-left">Subcategory</th>
                            <th className="py-2 px-3 text-left">Qty</th>
                            <th className="py-2 px-3 text-left">Inv. Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(o.order_items ?? []).map((it, idx) => (
                            <tr key={idx} className="border-t">
                              <td className="py-2 px-3">
                                {it.inventory?.product_name ?? "—"}
                              </td>
                              <td className="py-2 px-3">
                                {it.inventory?.category ?? "—"}
                              </td>
                              <td className="py-2 px-3">
                                {it.inventory?.subcategory ?? "—"}
                              </td>
                              <td className="py-2 px-3">{it.quantity}</td>
                              <td className="py-2 px-3">
                                {it.inventory?.status ?? "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Delivery card (if available) */}
                    {deliv && (
                      <div className="mt-3 bg-white border rounded p-3 shadow-sm text-sm">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <p>
                            <span className="font-medium">
                              Delivery Status:
                            </span>{" "}
                            {deliv.status ?? "—"}
                          </p>
                          <p>
                            <span className="font-medium">Schedule Date:</span>{" "}
                            {formatPH(deliv.schedule_date)}
                          </p>
                          <p>
                            <span className="font-medium">Date Received:</span>{" "}
                            {formatPH(deliv.date_received ?? null)}
                          </p>
                          <p>
                            <span className="font-medium">Driver:</span>{" "}
                            {deliv.driver ?? "—"}
                          </p>
                          <p className="md:col-span-2">
                            <span className="font-medium">Participants:</span>{" "}
                            {Array.isArray(deliv.participants) &&
                            deliv.participants.length > 0
                              ? deliv.participants.join(", ")
                              : "—"}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
    </div>
  );
}
