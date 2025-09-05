// src/app/customer/returns/items/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import supabase from "@/config/supabaseClient";

/* ----------------------------- Helpers ----------------------------- */
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

type CustomerTx = {
  id: string;
  code: string | null; // TXN code
  orders?: { id: string }[];
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

const StatusChip = ({ status }: { status: string }) => {
  const s = (status || "").toLowerCase();
  const styles =
    s === "approved"
      ? "bg-green-100 text-green-700 border-green-200"
      : s === "completed"
      ? "bg-emerald-100 text-emerald-700 border-emerald-200"
      : s === "processing" || s === "review"
      ? "bg-blue-100 text-blue-700 border-blue-200"
      : s === "rejected"
      ? "bg-red-100 text-red-700 border-red-200"
      : "bg-gray-100 text-gray-700 border-gray-200";
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs border ${styles}`}
    >
      {status || "—"}
    </span>
  );
};

/* ----------------------------- Page ----------------------------- */
export default function ReturnedItemsPage() {
  const [loading, setLoading] = useState(true);
  const [authEmail, setAuthEmail] = useState<string | null>(null);

  const [returnsList, setReturnsList] = useState<ReturnRow[]>([]);
  const [orderIdToTxn, setOrderIdToTxn] = useState<Record<string, string>>({});
  const orderIdsRef = useRef<Set<string>>(new Set());

  // Include "processing" toggle
  const [includeProcessing, setIncludeProcessing] = useState(false);

  // Simple client search
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // 1) auth
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const email = user?.email ?? null;
        setAuthEmail(email);

        if (!email) {
          setReturnsList([]);
          setOrderIdToTxn({});
          orderIdsRef.current = new Set();
          return;
        }

        // 2) customers -> orders to map order_id -> TXN code
        const { data: customers } = await supabase
          .from("customers")
          .select(
            `
            id,
            code,
            orders (
              id
            )
          `
          )
          .eq("email", email)
          .order("date", { ascending: false });

        const list = (customers ?? []) as CustomerTx[];

        const oIds = new Set<string>();
        const orderToTxn: Record<string, string> = {};
        for (const t of list) {
          for (const o of t.orders ?? []) {
            const oid = String(o.id);
            oIds.add(oid);
            orderToTxn[oid] = String(t.code ?? "—");
          }
        }
        orderIdsRef.current = oIds;
        setOrderIdToTxn(orderToTxn);

        // 3) load returns (approved/completed by default)
        await refreshReturns();
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

  const refreshReturns = async () => {
    const orderIds = Array.from(orderIdsRef.current);
    if (orderIds.length === 0) {
      setReturnsList([]);
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

    setReturnsList(normalizeReturns(rtns ?? []));
  };

  const setupRealtime = () => {
    const ch = supabase
      .channel("cust-returned-items")
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
        () => refreshReturns()
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {}
    };
  };

  // Filter to statuses for "Returned Items"
  const allowedStatuses = useMemo(
    () =>
      includeProcessing
        ? new Set(["approved", "completed", "processing"])
        : new Set(["approved", "completed"]),
    [includeProcessing]
  );

  // Flatten: one row per return_item, with parent return data attached
  type FlatRow = {
    id: string; // return_id + '-' + order_item_id
    returnId: string;
    returnCode: string;
    status: string;
    filedAt: string;
    orderId: string;
    txnCode: string; // via orderIdToTxn
    product: string;
    qty: number;
    photos: string[] | null;
  };

  const flatRows = useMemo<FlatRow[]>(() => {
    const rows: FlatRow[] = [];
    for (const r of returnsList) {
      if (!allowedStatuses.has(r.status.toLowerCase())) continue;
      for (const ri of r.return_items) {
        rows.push({
          id: `${r.id}-${ri.order_item_id}`,
          returnId: r.id,
          returnCode: r.code,
          status: r.status,
          filedAt: r.created_at,
          orderId: r.order_id,
          txnCode: orderIdToTxn[r.order_id] ?? "—",
          product: ri.inventory?.product_name ?? "—",
          qty: ri.quantity ?? 0,
          photos: ri.photo_urls ?? null,
        });
      }
    }
    // simple text search across product, code, txn
    const q = search.trim().toLowerCase();
    return q
      ? rows.filter(
          (x) =>
            x.product.toLowerCase().includes(q) ||
            x.returnCode.toLowerCase().includes(q) ||
            x.txnCode.toLowerCase().includes(q)
        )
      : rows;
  }, [returnsList, orderIdToTxn, allowedStatuses, search]);

  // Group by TXN for compact display
  const groupedByTxn = useMemo(() => {
    const map: Record<string, FlatRow[]> = {};
    for (const r of flatRows) {
      (map[r.txnCode] ||= []).push(r);
    }
    return map;
  }, [flatRows]);

  return (
    <div className="p-4">
      <h1 className="text-3xl font-bold tracking-tight text-neutral-800">
        Returned Items
      </h1>
      <p className="text-sm text-gray-600 mt-1 mb-4">
        View items from your return requests that have been{" "}
        <span className="font-medium">approved</span> or{" "}
        <span className="font-medium">completed</span>.
      </p>

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
          {/* Controls */}
          <div className="bg-white border rounded-2xl p-4 shadow-sm mb-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by product, return code, or TXN…"
                  className="border px-3 py-2 rounded w-72"
                />
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    className="accent-black"
                    checked={includeProcessing}
                    onChange={(e) => setIncludeProcessing(e.target.checked)}
                  />
                  Include “Processing”
                </label>
              </div>
              <div className="text-sm text-gray-500">
                Showing <span className="font-medium">{flatRows.length}</span>{" "}
                item
                {flatRows.length === 1 ? "" : "s"}
              </div>
            </div>
          </div>

          {/* Tables grouped by TXN */}
          {Object.keys(groupedByTxn).length === 0 ? (
            <div className="bg-white border rounded-2xl p-4 shadow-sm">
              <p className="text-sm text-gray-600">No returned items found.</p>
            </div>
          ) : (
            Object.entries(groupedByTxn).map(([txn, rows]) => (
              <div
                key={txn}
                className="bg-white border rounded-2xl p-4 shadow-sm mb-6"
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm">
                    <span className="text-gray-600 mr-1">TXN:</span>
                    <span className="tracking-wider font-medium">{txn}</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {rows.length} item{rows.length === 1 ? "" : "s"}
                  </div>
                </div>

                <div className="mt-3 border rounded overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="py-2 px-3 text-left">Return Code</th>
                        <th className="py-2 px-3 text-left">Filed</th>
                        <th className="py-2 px-3 text-left">Status</th>
                        <th className="py-2 px-3 text-left">Product</th>
                        <th className="py-2 px-3 text-center">Qty</th>
                        <th className="py-2 px-3 text-left">Photos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id} className="border-t align-top">
                          <td className="py-2 px-3 font-medium tracking-wider">
                            {r.returnCode}
                          </td>
                          <td className="py-2 px-3">{formatPH(r.filedAt)}</td>
                          <td className="py-2 px-3">
                            <StatusChip status={r.status} />
                          </td>
                          <td className="py-2 px-3">{r.product}</td>
                          <td className="py-2 px-3 text-center">{r.qty}</td>
                          <td className="py-2 px-3">
                            {r.photos?.length ? (
                              <div className="flex gap-2 flex-wrap">
                                {r.photos.map((u, i) => (
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
            ))
          )}
        </>
      )}
    </div>
  );
}
