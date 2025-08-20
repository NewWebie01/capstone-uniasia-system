"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { toast } from "sonner";

/* ----------------------------- Utilities ----------------------------- */
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

type ReturnItemRow = {
  order_item_id: number;
  quantity: number;
  photo_urls: string[] | null;
  inventory: { product_name: string | null } | null;
};

type ReturnRow = {
  id: string;
  code: string;
  status: string;
  reason: ReturnReason;
  note: string | null;
  created_at: string;
  order_id: string;
  customer?: {
    name: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
  } | null;
  order?: { id: string; status: string | null } | null;
  return_items: ReturnItemRow[];
};

const STATUS_OPTIONS = [
  "all",
  "requested",
  "approved",
  "received",
  "resolved",
  "rejected",
] as const;

/* ----------------------------- Page ----------------------------- */
export default function AdminReturnsPage() {
  const supabase = createClientComponentClient();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ReturnRow[]>([]);
  const [statusFilter, setStatusFilter] =
    useState<(typeof STATUS_OPTIONS)[number]>("all");
  const [search, setSearch] = useState("");

  // detail modal
  const [openId, setOpenId] = useState<string | null>(null);
  const openRow = useMemo(
    () => rows.find((r) => r.id === openId) || null,
    [rows, openId]
  );

  const fetchReturns = async () => {
    setLoading(true);

    // NOTE: only selects from existing columns/tables
    const { data, error } = await supabase
      .from("returns")
      .select(
        `
        id, code, status, reason, note, created_at, order_id, customer_id,
        customer:customer_id ( name, email, phone, address ),
        order:order_id ( id, status ),
        return_items (
          order_item_id, quantity, photo_urls,
          inventory:inventory_id ( product_name )
        )
      `
      )
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to load returns.");
      setRows([]);
    } else {
      setRows((data ?? []) as ReturnRow[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchReturns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    let out = rows;
    if (statusFilter !== "all") {
      out = out.filter((r) => (r.status ?? "").toLowerCase() === statusFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter(
        (r) =>
          r.code.toLowerCase().includes(q) ||
          (r.customer?.name ?? "").toLowerCase().includes(q) ||
          (r.customer?.email ?? "").toLowerCase().includes(q) ||
          (r.customer?.phone ?? "").toLowerCase().includes(q) ||
          r.return_items.some((ri) =>
            (ri.inventory?.product_name ?? "").toLowerCase().includes(q)
          )
      );
    }
    return out;
  }, [rows, statusFilter, search]);

  /* ----------------------------- Actions (status only) ----------------------------- */
  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase
      .from("returns")
      .update({ status })
      .eq("id", id);
    if (error) throw error;
  };

  const approve = async (id: string) => {
    try {
      await updateStatus(id, "approved");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to approve.");
      return;
    }
    toast.success("Approved.");
    fetchReturns();
  };

  const reject = async (id: string) => {
    try {
      await updateStatus(id, "rejected");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to reject.");
      return;
    }
    toast.success("Rejected.");
    fetchReturns();
  };

  const markReceived = async (id: string) => {
    try {
      await updateStatus(id, "received");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to mark received.");
      return;
    }
    toast.success("Marked as received.");
    fetchReturns();
  };

  const resolve = async (id: string) => {
    try {
      await updateStatus(id, "resolved");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to resolve.");
      return;
    }
    toast.success("Resolved.");
    fetchReturns();
  };

  /* ----------------------------- UI ----------------------------- */
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Returns (Admin)</h1>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Status</label>
          <select
            className="border rounded px-3 py-2"
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as (typeof STATUS_OPTIONS)[number])
            }
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <input
          placeholder="Search by code, customer, item…"
          className="border rounded px-3 py-2 w-full sm:max-w-md"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <button
          onClick={fetchReturns}
          className="px-3 py-2 rounded bg-black text-white hover:opacity-90"
        >
          Refresh
        </button>
      </div>

      <div className="border rounded-2xl overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left px-3 py-2">Code</th>
              <th className="text-left px-3 py-2">Customer</th>
              <th className="text-left px-3 py-2">Reason</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-left px-3 py-2">Created</th>
              <th className="text-right px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-t hover:bg-gray-50">
                <td className="px-3 py-2">
                  <button
                    className="font-medium text-blue-700 hover:underline"
                    onClick={() => setOpenId(r.id)}
                  >
                    {r.code}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <div className="truncate max-w-xs">
                    {r.customer?.name ?? "—"}
                    {r.customer?.email ? (
                      <span className="text-gray-500">
                        {" "}
                        ({r.customer.email})
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-2">{r.reason}</td>
                <td className="px-3 py-2 capitalize">{r.status}</td>
                <td className="px-3 py-2">{formatPH(r.created_at)}</td>
                <td className="px-3 py-2 text-right">
                  <div className="flex gap-2 justify-end">
                    {r.status === "requested" && (
                      <>
                        <button
                          onClick={() => approve(r.id)}
                          className="px-3 py-1 rounded bg-emerald-600 text-white hover:opacity-90"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => reject(r.id)}
                          className="px-3 py-1 rounded bg-red-600 text-white hover:opacity-90"
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {r.status === "approved" && (
                      <button
                        onClick={() => markReceived(r.id)}
                        className="px-3 py-1 rounded bg-indigo-600 text-white hover:opacity-90"
                      >
                        Mark received
                      </button>
                    )}
                    {r.status === "received" && (
                      <button
                        onClick={() => resolve(r.id)}
                        className="px-3 py-1 rounded bg-sky-600 text-white hover:opacity-90"
                      >
                        Resolve
                      </button>
                    )}
                    {r.status === "resolved" && (
                      <button
                        onClick={() => setOpenId(r.id)}
                        className="px-3 py-1 rounded border"
                      >
                        Details
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="text-center text-gray-500 py-10">
                  No results.
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={6} className="text-center text-gray-500 py-10">
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Details modal */}
      {openRow && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <div className="font-semibold">
                  {openRow.code} <span className="text-gray-400">•</span>{" "}
                  <span className="capitalize">{openRow.status}</span>
                </div>
                <div className="text-sm text-gray-500">
                  Created: {formatPH(openRow.created_at)}
                </div>
              </div>
              <button
                className="text-gray-600 hover:text-black"
                onClick={() => setOpenId(null)}
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[75vh] overflow-auto">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500">Customer</div>
                  <div className="font-medium">
                    {openRow.customer?.name ?? "—"}
                  </div>
                  <div className="text-sm text-gray-600">
                    {openRow.customer?.email ?? "—"}
                  </div>
                  <div className="text-sm text-gray-600">
                    {openRow.customer?.phone ?? "—"}
                  </div>
                  <div className="text-sm text-gray-600">
                    {openRow.customer?.address ?? "—"}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500">Order</div>
                  <div className="font-medium">{openRow.order?.id ?? "—"}</div>
                  <div className="text-sm text-gray-600">
                    Status: {openRow.order?.status ?? "—"}
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500">Reason</div>
                <div className="font-medium">{openRow.reason}</div>
                {openRow.note && (
                  <>
                    <div className="text-xs text-gray-500 mt-2">
                      Customer note
                    </div>
                    <div className="text-sm">{openRow.note}</div>
                  </>
                )}
              </div>

              <div className="border rounded overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="text-left px-3 py-2">Product</th>
                      <th className="text-left px-3 py-2">Qty</th>
                      <th className="text-left px-3 py-2">Photos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openRow.return_items.map((ri, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2">
                          {ri.inventory?.product_name ?? "—"}
                        </td>
                        <td className="px-3 py-2">{ri.quantity}</td>
                        <td className="px-3 py-2">
                          {ri.photo_urls?.length ? (
                            <div className="flex gap-2 flex-wrap">
                              {ri.photo_urls.map((u, idx) => (
                                <a key={idx} href={u} target="_blank">
                                  <img
                                    src={u}
                                    alt="evidence"
                                    className="w-14 h-14 rounded object-cover border"
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

              {/* Quick actions */}
              <div className="flex flex-wrap gap-2 justify-end">
                {openRow.status === "requested" && (
                  <>
                    <button
                      onClick={() => approve(openRow.id)}
                      className="px-3 py-2 rounded bg-emerald-600 text-white"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => reject(openRow.id)}
                      className="px-3 py-2 rounded bg-red-600 text-white"
                    >
                      Reject
                    </button>
                  </>
                )}
                {openRow.status === "approved" && (
                  <button
                    onClick={() => markReceived(openRow.id)}
                    className="px-3 py-2 rounded bg-indigo-600 text-white"
                  >
                    Mark received
                  </button>
                )}
                {openRow.status === "received" && (
                  <button
                    onClick={() => resolve(openRow.id)}
                    className="px-3 py-2 rounded bg-sky-600 text-white"
                  >
                    Resolve
                  </button>
                )}
                <button
                  onClick={() => setOpenId(null)}
                  className="px-3 py-2 rounded border"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
