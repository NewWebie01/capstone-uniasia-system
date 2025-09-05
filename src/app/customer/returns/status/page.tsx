// src/app/customer/returns/status/page.tsx
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

type OrderRow = { id: string };
type CustomerTx = {
  id: string;
  code: string | null;
  orders?: OrderRow[];
};

const StatusChip = ({ status }: { status: string }) => {
  const s = (status || "").toLowerCase();
  const styles =
    s === "approved"
      ? "bg-green-100 text-green-700 border-green-200"
      : s === "rejected"
      ? "bg-red-100 text-red-700 border-red-200"
      : s === "processing" || s === "review"
      ? "bg-blue-100 text-blue-700 border-blue-200"
      : "bg-gray-100 text-gray-700 border-gray-200";
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs border ${styles}`}
    >
      {status || "—"}
    </span>
  );
};

/* -------------------------------- Page -------------------------------- */
export default function ReturnItemStatusPage() {
  const [loading, setLoading] = useState(true);
  const [authEmail, setAuthEmail] = useState<string | null>(null);

  const [returnsList, setReturnsList] = useState<ReturnRow[]>([]);
  const [orderIdToTxn, setOrderIdToTxn] = useState<Record<string, string>>({});
  const orderIdsRef = useRef<Set<string>>(new Set());

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggleExpanded = (id: string) =>
    setExpanded((p) => ({ ...p, [id]: !p[id] }));

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // auth
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

        // fetch customers -> orders (to know which order_ids belong to the user + TXN code per order)
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
    const ch1 = supabase
      .channel("cust-returns-status")
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
        supabase.removeChannel(ch1);
      } catch {}
    };
  };

  const returnsByTxn = useMemo(() => {
    const groups: Record<string, ReturnRow[]> = {};
    for (const r of returnsList) {
      const key = orderIdToTxn[r.order_id] ?? "—";
      (groups[key] ||= []).push(r);
    }
    return groups;
  }, [returnsList, orderIdToTxn]);

  return (
    <div className="p-4">
      <h1 className="text-3xl font-bold tracking-tight text-neutral-800">
        Return Item Status
      </h1>
      <p className="text-sm text-gray-600 mt-1 mb-4">
        View and track the status of your submitted return requests.
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
        <div className="bg-white border rounded-2xl p-4 shadow-sm">
          <h2 className="font-semibold text-lg mb-2">My Return Requests</h2>

          {Object.keys(returnsByTxn).length === 0 ? (
            <p className="text-sm text-gray-600 mt-2">
              You have no return requests yet.
            </p>
          ) : (
            Object.entries(returnsByTxn).map(([txnCode, list]) => (
              <div
                key={txnCode}
                className="mb-6 last:mb-0 rounded-xl border bg-white overflow-hidden"
              >
                <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
                  <div className="text-sm">
                    <span className="text-gray-600 mr-1">TXN:</span>
                    <span className="tracking-wider font-medium">
                      {txnCode}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {list.length} return(s)
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr className="[&>th]:py-2 [&>th]:px-3 text-left">
                        <th>Return Code</th>
                        <th>Filed</th>
                        <th>Status</th>
                        <th className="text-center">Items</th>
                        <th className="text-right">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {list.map((rtn) => {
                        const isOpen = !!expanded[rtn.id];
                        const totalItems = rtn.return_items?.length ?? 0;
                        return (
                          <React.Fragment key={rtn.id}>
                            <tr className="hover:bg-gray-50">
                              <td className="py-2 px-3 font-medium tracking-wider">
                                {rtn.code}
                              </td>
                              <td className="py-2 px-3">
                                {formatPH(rtn.created_at)}
                              </td>
                              <td className="py-2 px-3">
                                <StatusChip status={rtn.status} />
                              </td>
                              <td className="py-2 px-3 text-center">
                                {totalItems}
                              </td>
                              <td className="py-2 px-3 text-right">
                                <button
                                  onClick={() => toggleExpanded(rtn.id)}
                                  className="text-xs px-2 py-1 rounded-lg border hover:bg-gray-50"
                                >
                                  {isOpen ? "Hide" : "View"}
                                </button>
                              </td>
                            </tr>

                            {isOpen && (
                              <tr className="bg-gray-50">
                                <td colSpan={5} className="px-3 py-3">
                                  <div className="rounded-lg border bg-white overflow-x-auto">
                                    <table className="w-full text-sm">
                                      <thead className="bg-gray-100">
                                        <tr className="[&>th]:py-2 [&>th]:px-3 text-left">
                                          <th>Product</th>
                                          <th className="w-24">Qty</th>
                                          <th>Photos</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y">
                                        {rtn.return_items.map((ri, idx) => (
                                          <tr key={idx} className="align-top">
                                            <td className="py-2 px-3">
                                              {ri.inventory?.product_name ??
                                                "—"}
                                            </td>
                                            <td className="py-2 px-3">
                                              {ri.quantity}
                                            </td>
                                            <td className="py-2 px-3">
                                              {ri.photo_urls?.length ? (
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

                                  <div className="text-xs text-gray-600 mt-2">
                                    <span className="font-medium">Reason:</span>{" "}
                                    {rtn.reason}
                                    {rtn.note ? (
                                      <>
                                        {" "}
                                        &middot;{" "}
                                        <span className="font-medium">
                                          Note:
                                        </span>{" "}
                                        {rtn.note}
                                      </>
                                    ) : null}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
