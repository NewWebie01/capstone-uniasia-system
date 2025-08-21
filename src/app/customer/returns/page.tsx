// src/app/customer/returns/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import supabase from "@/config/supabaseClient";
import { toast } from "sonner";

/* ----------------------------- Date helpers ----------------------------- */
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

const daysBetween = (a?: string | Date | null, b?: string | Date | null) => {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const d1 = new Date(a).getTime();
  const d2 = new Date(b).getTime();
  return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
};

/* ------------------------ Return types + normalizer ---------------------- */
type ReturnReason =
  | "Damaged/Defective"
  | "Wrong Item"
  | "Missing Item/Part"
  | "Expired"
  | "Other";

type ReturnRow = {
  id: string;
  code: string;
  status: string;
  reason: ReturnReason;
  note: string | null;
  created_at: string;
  order_id: string;
  return_items: Array<{
    order_item_id: number;
    quantity: number;
    photo_urls: string[] | null;
    inventory: { product_name: string | null } | null;
  }>;
};

const toNum = (v: unknown, fallback = 0) =>
  typeof v === "number" ? v : typeof v === "string" ? Number(v) : fallback;

const toStrOrNull = (v: unknown) =>
  v === null || v === undefined ? null : String(v);

const normalizeReturns = (rows: any[]): ReturnRow[] =>
  (rows ?? []).map((r) => ({
    id: String(r.id),
    code: String(r.code ?? ""),
    status: String(r.status ?? "requested"),
    reason: (r.reason ?? "Other") as ReturnReason,
    note: toStrOrNull(r.note),
    created_at: r.created_at ?? new Date().toISOString(),
    order_id: String(r.order_id),
    return_items: (r.return_items ?? []).map((ri: any) => ({
      order_item_id: toNum(ri.order_item_id),
      quantity: toNum(ri.quantity, 0),
      photo_urls: Array.isArray(ri.photo_urls)
        ? ri.photo_urls.map((x: any) => String(x))
        : null,
      inventory: ri.inventory
        ? { product_name: toStrOrNull(ri.inventory.product_name) }
        : null,
    })),
  }));

/* ---------------------------------- Types --------------------------------- */
type ItemRow = {
  id: number; // order_items.id is integer
  quantity: number;
  price: number | null;
  inventory_id: number | null;
  inventory?: {
    product_name?: string | null;
    category?: string | null;
    subcategory?: string | null;
    status?: string | null;
  } | null;
};

type OrderRow = {
  id: string;
  status: string | null;
  truck_delivery_id?: string | number | null;
  order_items?: ItemRow[];
};

type CustomerTx = {
  id: string;
  code: string | null; // <-- TXN code
  email: string | null;
  name: string | null;
  phone: string | null;
  address: string | null;
  date: string | null;
  orders?: OrderRow[];
};

/* -------------------------------- Component ------------------------------- */
export default function CustomerReturnsPage() {
  const [loading, setLoading] = useState(true);
  const [authEmail, setAuthEmail] = useState<string | null>(null);

  // Data
  const [txns, setTxns] = useState<CustomerTx[]>([]);
  const [returnsList, setReturnsList] = useState<ReturnRow[]>([]);
  const [returnedItemIds, setReturnedItemIds] = useState<Set<number>>(
    new Set()
  );

  // Delivery status per truck_delivery_id
  const [deliveryStatusById, setDeliveryStatusById] = useState<
    Record<string, string>
  >({});
  // Map order_id -> TXN code (for grouping returns)
  const [orderIdToTxn, setOrderIdToTxn] = useState<Record<string, string>>({});

  // Keep ids around for subscriptions
  const deliveryIdsRef = useRef<Set<string>>(new Set());
  const orderIdsRef = useRef<Set<string>>(new Set());

  // Modal state
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sel, setSel] = useState<{
    txn?: CustomerTx;
    order?: OrderRow;
    item?: ItemRow;
  }>({});
  const [reason, setReason] = useState<ReturnReason>("Damaged/Defective");
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);

  /* -------------------------- Initial load (user) ------------------------- */
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
          setReturnsList([]);
          setReturnedItemIds(new Set());
          setDeliveryStatusById({});
          deliveryIdsRef.current = new Set();
          orderIdsRef.current = new Set();
          setOrderIdToTxn({});
          return;
        }

        // 1) customers -> orders -> items (also truck_delivery_id)
        const { data: customers, error } = await supabase
          .from("customers")
          .select(
            `
            id,
            code,
            email,
            name,
            phone,
            address,
            date,
            orders (
              id,
              status,
              truck_delivery_id,
              order_items (
                id,
                quantity,
                price,
                inventory_id,
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
          deliveryIdsRef.current = new Set();
          orderIdsRef.current = new Set();
          setOrderIdToTxn({});
        } else {
          const list = customers as CustomerTx[];
          setTxns(list);

          // gather ids + build order->TXN map
          const dIds = new Set<string>();
          const oIds = new Set<string>();
          const orderToTxn: Record<string, string> = {};

          for (const t of list) {
            for (const o of t.orders ?? []) {
              const orderId = String(o.id);
              oIds.add(orderId);
              orderToTxn[orderId] = String(t.code ?? "—");
              if (o.truck_delivery_id != null)
                dIds.add(String(o.truck_delivery_id));
            }
          }
          deliveryIdsRef.current = dIds;
          orderIdsRef.current = oIds;
          setOrderIdToTxn(orderToTxn);

          // 2) fetch delivery statuses
          if (dIds.size > 0) {
            const { data: deliveries } = await supabase
              .from("truck_deliveries")
              .select("id, status")
              .in("id", Array.from(dIds));

            const map: Record<string, string> = {};
            (deliveries ?? []).forEach((d: any) => {
              map[String(d.id)] = String(d.status ?? "");
            });
            setDeliveryStatusById(map);
          } else {
            setDeliveryStatusById({});
          }

          // 3) load returns for the user’s orders
          await refreshReturns();
        }

        // 4) realtime
        setupRealtime();
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      supabase.removeAllChannels();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------- realtime subscriptions ----------------------- */
  const setupRealtime = () => {
    const ch1 = supabase
      .channel("cust-returns")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "returns" },
        (payload) => {
          const row: any = payload.new ?? payload.old;
          if (row && orderIdsRef.current.has(String(row.order_id))) {
            refreshReturns();
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "return_items" },
        () => {
          refreshReturns();
        }
      )
      .subscribe();

    const ch2 = supabase
      .channel("cust-truck-deliveries")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "truck_deliveries" },
        (payload) => {
          const row: any = payload.new ?? payload.old;
          const id = row?.id != null ? String(row.id) : null;
          if (id && deliveryIdsRef.current.has(id)) {
            setDeliveryStatusById((prev) => ({
              ...prev,
              [id]: String((payload.new as any)?.status ?? row?.status ?? ""),
            }));
          }
        }
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(ch1);
        supabase.removeChannel(ch2);
      } catch {}
    };
  };

  const refreshReturns = async () => {
    const orderIds = Array.from(orderIdsRef.current);
    if (orderIds.length === 0) {
      setReturnsList([]);
      setReturnedItemIds(new Set());
      return;
    }

    const { data: rtns } = await supabase
      .from("returns")
      .select(
        `
        id,
        code,
        status,
        reason,
        note,
        created_at,
        order_id,
        return_items (
          order_item_id,
          quantity,
          photo_urls,
          inventory:inventory_id ( product_name )
        )
      `
      )
      .in("order_id", orderIds)
      .order("created_at", { ascending: false });

    const normalized = normalizeReturns(rtns ?? []);
    setReturnsList(normalized);

    const s = new Set<number>();
    normalized.forEach((r) =>
      r.return_items.forEach((ri) => {
        if (typeof ri.order_item_id === "number") s.add(ri.order_item_id);
      })
    );
    setReturnedItemIds(s);
  };

  /* --------------------- Derived: eligible items --------------------- */
  const eligibleRows = useMemo(() => {
    const out: Array<{ txn: CustomerTx; order: OrderRow; item: ItemRow }> = [];
    const now = new Date();

    for (const t of txns) {
      for (const o of t.orders ?? []) {
        const delivId =
          o.truck_delivery_id != null ? String(o.truck_delivery_id) : null;
        const delivStatus = delivId
          ? (deliveryStatusById[delivId] || "").toLowerCase()
          : "";
        const delivered = delivStatus === "delivered";
        const within7 = daysBetween(t.date, now) <= 7;
        if (!delivered || !within7) continue;

        for (const it of o.order_items ?? []) {
          if (returnedItemIds.has(it.id)) continue;
          out.push({ txn: t, order: o, item: it });
        }
      }
    }
    return out;
  }, [txns, returnedItemIds, deliveryStatusById]);

  /* -------- Group by TXN code -------- */
  const eligibleByTxn = useMemo(() => {
    const groups: Record<
      string,
      Array<{ txn: CustomerTx; order: OrderRow; item: ItemRow }>
    > = {};
    for (const row of eligibleRows) {
      const key = row.txn.code ?? "—";
      (groups[key] ||= []).push(row);
    }
    return groups;
  }, [eligibleRows]);

  const returnsByTxn = useMemo(() => {
    const groups: Record<string, ReturnRow[]> = {};
    for (const r of returnsList) {
      const key = orderIdToTxn[r.order_id] ?? "—";
      (groups[key] ||= []).push(r);
    }
    return groups;
  }, [returnsList, orderIdToTxn]);

  /* --------------------- Modal helpers --------------------- */
  const openModal = (row: {
    txn: CustomerTx;
    order: OrderRow;
    item: ItemRow;
  }) => {
    setSel(row);
    setReason("Damaged/Defective");
    setQty(1);
    setNote("");
    setFiles(null);
    setOpen(true);
  };

  const generateReturnCode = () => {
    const yyyymmdd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `RTN-${yyyymmdd}-${rnd}`;
  };

  const submitReturn = async () => {
    if (!sel.txn || !sel.order || !sel.item) return;

    const { txn, order, item } = sel as {
      txn: CustomerTx;
      order: OrderRow;
      item: ItemRow;
    };

    setSubmitting(true);
    try {
      const code = generateReturnCode();

      // 1) returns
      const { data: userData } = await supabase.auth.getUser();
      const { data: rtn, error: e1 } = await supabase
        .from("returns")
        .insert([
          {
            customer_id: txn.id,
            order_id: order.id,
            code,
            reason,
            note: note || null,
            created_by: userData.user?.id ?? null,
          },
        ])
        .select()
        .single();
      if (e1 || !rtn) throw e1 || new Error("Failed to create return");

      // 2) upload photos (optional)
      let urls: string[] = [];
      if (files && files.length > 0) {
        const bucket = supabase.storage.from("returns");
        const uploaded: string[] = [];
        for (const file of Array.from(files).slice(0, 5)) {
          const path = `${rtn.id}/${Date.now()}_${file.name}`;
          const { data: up, error: upErr } = await bucket.upload(path, file, {
            cacheControl: "3600",
            upsert: false,
          });
          if (upErr) continue;
          const { data: pub } = bucket.getPublicUrl(up.path);
          if (pub?.publicUrl) uploaded.push(pub.publicUrl);
        }
        urls = uploaded;
      }

      // 3) return_items
      const { error: e2 } = await supabase.from("return_items").insert([
        {
          return_id: rtn.id,
          order_item_id: item.id,
          inventory_id: item.inventory_id,
          quantity: qty,
          photo_urls: urls,
        },
      ]);
      if (e2) throw e2;

      toast.success("Return submitted. We’ll review it shortly.");

      // Optimistic UI
      setReturnedItemIds((prev) => new Set(prev).add(item.id));
      setReturnsList((prev) => [
        {
          id: String(rtn.id),
          code: String(rtn.code),
          status: String(rtn.status ?? "requested"),
          reason: rtn.reason ?? "Other",
          note: rtn.note ?? null,
          created_at: rtn.created_at ?? new Date().toISOString(),
          order_id: String(rtn.order_id),
          return_items: [
            {
              order_item_id: item.id,
              quantity: qty,
              photo_urls: urls,
              inventory: { product_name: item.inventory?.product_name ?? null },
            },
          ],
        },
        ...prev,
      ]);

      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to submit return.");
    } finally {
      setSubmitting(false);
    }
  };

  /* --------------------------------- UI --------------------------------- */
  return (
    <div className="p-4">
      <h1 className="text-3xl font-bold mb-4">Returns &amp; Issues</h1>

      {!authEmail && !loading && (
        <div className="bg-white border rounded p-4 shadow-sm">
          <p>Please sign in to view this page.</p>
        </div>
      )}

      {loading && (
        <div className="bg-white border rounded p-4 shadow-sm">
          <p>Loading…</p>
        </div>
      )}

      {!loading && authEmail && (
        <>
          {/* -------- Eligible by TXN -------- */}
          {Object.keys(eligibleByTxn).length === 0 ? (
            <div className="bg-white border rounded-2xl p-4 shadow-sm mb-6">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-lg">
                  Eligible for Return (delivery delivered, within 7 days)
                </h2>
              </div>
              <p className="text-sm text-gray-600 mt-2">
                No items are currently eligible.
              </p>
            </div>
          ) : (
            Object.entries(eligibleByTxn).map(([txnCode, rows]) => (
              <div
                key={txnCode}
                className="bg-white border rounded-2xl p-4 shadow-sm mb-6"
              >
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-lg">
                    Eligible for Return • TXN:{" "}
                    <span className="tracking-wider">{txnCode}</span>
                  </h2>
                  <span className="text-sm text-gray-500">
                    {rows.length} item(s)
                  </span>
                </div>

                <div className="mt-3 border rounded overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="py-2 px-3 text-left">Product</th>
                        <th className="py-2 px-3 text-left">Order Date</th>
                        <th className="py-2 px-3 text-left">Qty</th>
                        <th className="py-2 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ txn, order, item }) => (
                        <tr key={item.id} className="border-t">
                          <td className="py-2 px-3">
                            {item.inventory?.product_name ?? "—"}
                          </td>
                          <td className="py-2 px-3">{formatPH(txn.date)}</td>
                          <td className="py-2 px-3">{item.quantity}</td>
                          <td className="py-2 px-3 text-right">
                            <button
                              className="px-3 py-1 rounded-xl bg-black text-white hover:opacity-90"
                              onClick={() => openModal({ txn, order, item })}
                            >
                              Return / Report issue
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}

          {/* -------- My Returns grouped by TXN -------- */}
          <div className="bg-white border rounded-2xl p-4 shadow-sm">
            <h2 className="font-semibold text-lg mb-2">My Return Requests</h2>

            {Object.keys(returnsByTxn).length === 0 ? (
              <p className="text-sm text-gray-600 mt-2">
                You have no return requests yet.
              </p>
            ) : (
              Object.entries(returnsByTxn).map(([txnCode, list]) => (
                <div key={txnCode} className="mb-5 last:mb-0">
                  <div className="text-sm font-medium text-gray-700 mb-2">
                    TXN: <span className="tracking-wider">{txnCode}</span>
                  </div>

                  <div className="border rounded bg-white overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="py-2 px-3 text-left">Return Code</th>
                          <th className="py-2 px-3 text-left">Status</th>
                          <th className="py-2 px-3 text-left">Filed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((rtn) => (
                          <tr key={rtn.id} className="border-t align-top">
                            <td className="py-2 px-3 font-medium tracking-wider">
                              {rtn.code}
                            </td>
                            <td className="py-2 px-3 capitalize">
                              {rtn.status}
                            </td>
                            <td className="py-2 px-3">
                              {formatPH(rtn.created_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Detailed items for each return (optional; keep existing layout) */}
                  <div className="mt-2 space-y-3">
                    {list.map((rtn) => (
                      <div key={rtn.id} className="border rounded bg-gray-50">
                        <div className="px-3 py-2 text-sm text-gray-700">
                          <span className="font-medium">Reason:</span>{" "}
                          {rtn.reason}
                          {rtn.note ? (
                            <>
                              {" "}
                              • <span className="font-medium">Note:</span>{" "}
                              {rtn.note}
                            </>
                          ) : null}
                        </div>
                        <div className="border-t overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-100">
                              <tr>
                                <th className="py-2 px-3 text-left">Product</th>
                                <th className="py-2 px-3 text-left">Qty</th>
                                <th className="py-2 px-3 text-left">Photos</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rtn.return_items.map((ri, idx) => (
                                <tr key={idx} className="border-t">
                                  <td className="py-2 px-3">
                                    {ri.inventory?.product_name ?? "—"}
                                  </td>
                                  <td className="py-2 px-3">{ri.quantity}</td>
                                  <td className="py-2 px-3">
                                    {ri.photo_urls &&
                                    ri.photo_urls.length > 0 ? (
                                      <div className="flex gap-2 flex-wrap">
                                        {ri.photo_urls.map((u, i) => (
                                          <a
                                            key={i}
                                            href={u}
                                            target="_blank"
                                            className="inline-block"
                                          >
                                            <img
                                              src={u}
                                              alt="evidence"
                                              className="w-12 h-12 object-cover rounded border"
                                            />
                                          </a>
                                        ))}
                                      </div>
                                    ) : (
                                      "—"
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* Modal */}
      {open && sel.item && sel.order && sel.txn && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl ring-1 ring-black/5 p-6">
            <h3 className="text-xl font-semibold">Return / Report issue</h3>
            <p className="text-sm text-gray-600 mt-1">
              {sel.item.inventory?.product_name}
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-sm mb-1">Reason</label>
                <select
                  className="border px-3 py-2 rounded w-full"
                  value={reason}
                  onChange={(e) => setReason(e.target.value as ReturnReason)}
                >
                  <option>Damaged/Defective</option>
                  <option>Wrong Item</option>
                  <option>Missing Item/Part</option>
                  <option>Expired</option>
                  <option>Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm mb-1">
                  Quantity (max {sel.item.quantity})
                </label>
                <input
                  type="number"
                  min={1}
                  max={sel.item.quantity}
                  value={qty}
                  onChange={(e) =>
                    setQty(
                      Math.max(
                        1,
                        Math.min(
                          sel.item!.quantity,
                          Number(e.target.value) || 1
                        )
                      )
                    )
                  }
                  className="border px-3 py-2 rounded w-full"
                />
              </div>

              <div>
                <label className="block text-sm mb-1">Notes (optional)</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  className="border px-3 py-2 rounded w-full"
                  placeholder="Describe the issue to help us resolve it faster."
                />
              </div>

              <div>
                <label className="block text-sm mb-1">
                  Photos (optional, up to 5)
                </label>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => setFiles(e.target.files)}
                  className="block w-full text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 shadow-sm active:translate-y-px transition"
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                onClick={submitReturn}
                className="px-4 py-2 rounded-xl bg-[#ffba20] text-black shadow-lg hover:brightness-95 active:translate-y-px transition"
                disabled={submitting}
              >
                {submitting ? "Submitting..." : "Submit return"}
              </button>
            </div>

            <p className="text-xs text-gray-500 mt-3">
              Returns are accepted within 7 days of purchase for delivered
              orders. We’ll review your request and contact you with the next
              steps.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
