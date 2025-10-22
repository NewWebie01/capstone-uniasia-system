// src/app/customer/returns/items/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import supabase from "@/config/supabaseClient";
import { toast } from "sonner";

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
  const [search, setSearch] = useState("");

  /* ------------------- Fetch customer + returns ------------------- */
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
          setReturnsList([]);
          setOrderIdToTxn({});
          orderIdsRef.current = new Set();
          return;
        }

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

        await refreshReturns();
        setupRealtime();
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      supabase.removeAllChannels();
    };
  }, []);

  /* ---------------------- Refresh returns ---------------------- */
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

  /* ---------------------- Realtime updates ---------------------- */
  const setupRealtime = () => {
    const ch = supabase
      .channel("cust-returned-items")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "returns" },
        async (payload) => {
          const row: any = payload.new ?? payload.old;
          if (row && orderIdsRef.current.has(String(row.order_id))) {
            await refreshReturns();

            // ✅ When a customer creates a return -> send admin notification
            if (payload.eventType === "INSERT") {
              try {
                const reason = row.reason || "Other";
                const note = row.note || "";
                const txn = orderIdToTxn[row.order_id] || "—";

                await supabase.from("system_notifications").insert([
                  {
                    type: "return",
                    title: "📦 Return Request Submitted",
                    message: `A customer submitted a return request for TXN ${txn}. Reason: ${reason}`,
                    order_id: row.order_id,
                    source: "customer",
                    read: false,
                    metadata: { reason, note },
                  },
                ]);

                toast.success("Return request sent and admin notified!");
              } catch (err) {
                console.warn("Return notification failed:", err);
              }
            }
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

  /* -------------------- Display filtered returns -------------------- */
  const allowedStatuses = useMemo(() => new Set(["approved", "completed"]), []);
  type FlatRow = {
    id: string;
    returnId: string;
    returnCode: string;
    status: string;
    filedAt: string;
    orderId: string;
    txnCode: string;
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

  const groupedByTxn = useMemo(() => {
    const map: Record<string, FlatRow[]> = {};
    for (const r of flatRows) {
      (map[r.txnCode] ||= []).push(r);
    }
    return map;
  }, [flatRows]);

  /* ---------------- Pagination ---------------- */
  const txnGroups = useMemo(() => Object.entries(groupedByTxn), [groupedByTxn]);
  const [currentPage, setCurrentPage] = useState(1);
  const groupsPerPage = 5;

  useEffect(() => setCurrentPage(1), [txnGroups.length]);
  const totalPages = Math.max(1, Math.ceil(txnGroups.length / groupsPerPage));
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const pageStart = (currentPage - 1) * groupsPerPage;
  const pagedGroups = txnGroups.slice(pageStart, pageStart + groupsPerPage);
  const goToPage = (p: number) =>
    setCurrentPage(Math.max(1, Math.min(totalPages, p)));

  /* ---------------------- Render ---------------------- */
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
          <div className="mb-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by product, return code, or TXN…"
                className="border px-3 py-2 rounded w-72"
              />
              <div className="text-sm text-gray-500">
                Showing <span className="font-medium">{flatRows.length}</span>{" "}
                item{flatRows.length === 1 ? "" : "s"}
              </div>
            </div>
          </div>

          {/* Tables */}
          {pagedGroups.length === 0 ? (
            <div className="bg-white border rounded-2xl p-4 shadow-sm">
              <p className="text-sm text-gray-600">No returned items found.</p>
            </div>
          ) : (
            pagedGroups.map(([txn, rows]) => (
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

          {/* Pagination */}
          {txnGroups.length > groupsPerPage && (
            <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-4 py-2 rounded border bg-white disabled:opacity-50"
              >
                Prev
              </button>
              <div className="text-sm font-medium">
                Page {currentPage} of {totalPages}
              </div>
              <button
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className="px-4 py-2 rounded border bg-white disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
