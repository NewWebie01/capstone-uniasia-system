// src/app/returns/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import supabase from "@/config/supabaseClient";
import { toast } from "sonner";

/* ============== Types & helpers ============== */

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

  customer: {
    name: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
  } | null;

  order: {
    id: string;
    status: string | null;
  } | null;

  return_items: Array<{
    order_item_id: number;
    quantity: number;
    photo_urls: string[] | null;
    inventory: { product_name: string | null } | null;
  }>;
};

const toNum = (v: unknown, fb = 0) =>
  typeof v === "number" ? v : typeof v === "string" ? Number(v) : fb;

const toStrOrNull = (v: unknown) =>
  v === null || v === undefined ? null : String(v);

const normalizeAdminReturns = (rows: any[]): ReturnRow[] =>
  (rows ?? []).map((r) => ({
    id: String(r.id),
    code: String(r.code ?? ""),
    status: String(r.status ?? "requested"),
    reason: (r.reason ?? "Other") as ReturnReason,
    note: toStrOrNull(r.note),
    created_at: r.created_at ?? new Date().toISOString(),
    order_id: String(r.order_id),

    customer: r.customer
      ? {
          name: toStrOrNull(r.customer.name),
          email: toStrOrNull(r.customer.email),
          phone: toStrOrNull(r.customer.phone),
          address: toStrOrNull(r.customer.address),
        }
      : null,

    order: r.order
      ? {
          id: String(r.order.id),
          status: toStrOrNull(r.order.status),
        }
      : null,

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

const formatPH = (d: string | Date) =>
  new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Manila",
  }).format(new Date(d));

/* ============== Page ============== */

export default function AdminReturnsPage() {
  const [rows, setRows] = useState<ReturnRow[]>([]);
  const [loading, setLoading] = useState(true);

  // table filters
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  // modal
  const [selected, setSelected] = useState<ReturnRow | null>(null);

  const fetchReturns = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("returns")
        .select(
          `
          id, code, status, reason, note, created_at, order_id,
          customer:customers!returns_customer_id_fkey ( name, email, phone, address ),
          order:orders!returns_order_id_fkey ( id, status ),
          return_items (
            order_item_id,
            quantity,
            photo_urls,
            inventory:inventory_id ( product_name )
          )
        `
        )
        .order("created_at", { ascending: false });

      if (error) {
        toast.error(error.message);
        setRows([]);
      } else {
        setRows(normalizeAdminReturns((data as any[]) ?? []));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReturns();
  }, []);

  const filtered = useMemo(() => {
    const text = q.trim().toLowerCase();
    let out = rows;

    if (statusFilter) {
      out = out.filter((r) => (r.status || "").toLowerCase() === statusFilter);
    }
    if (text) {
      out = out.filter((r) => {
        const customer = `${r.customer?.name ?? ""} ${
          r.customer?.email ?? ""
        } ${r.customer?.phone ?? ""} ${
          r.customer?.address ?? ""
        }`.toLowerCase();
        return (
          r.code.toLowerCase().includes(text) ||
          customer.includes(text) ||
          (r.order?.id ?? "").toLowerCase().includes(text)
        );
      });
    }
    return out;
  }, [rows, q, statusFilter]);

  const updateStatus = async (id: string, status: string) => {
    const prev = rows;
    setRows((r) => r.map((x) => (x.id === id ? { ...x, status } : x)));
    setSelected((s) => (s && s.id === id ? { ...s, status } : s));
    const { error } = await supabase
      .from("returns")
      .update({ status })
      .eq("id", id);
    if (error) {
      setRows(prev);
      setSelected((s) =>
        s && s.id === id ? prev.find((p) => p.id === id) || s : s
      );
      toast.error(error.message);
    } else {
      toast.success(`Status changed to ${status}`);
    }
  };

  return (
    <div className="p-4">
      <h1 className="text-3xl font-bold mb-4">Returns</h1>

      {/* Filters */}
      <div className="bg-white border rounded-2xl p-4 shadow-sm mb-4">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <input
            className="border rounded px-3 py-2 w-full sm:max-w-xs"
            placeholder="Search by return code / name / email / phone"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="border rounded px-3 py-2 w-full sm:w-auto"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="requested">requested</option>
            <option value="approved">approved</option>
            <option value="rejected">rejected</option>
            <option value="received">received</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#ffba20] text-black">
              <tr>
                <th className="py-2 px-3 text-left">Return code</th>
                <th className="py-2 px-3 text-left">Status</th>
                <th className="py-2 px-3 text-left">Date</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td className="py-3 px-3" colSpan={3}>
                    Loading…
                  </td>
                </tr>
              )}

              {!loading && filtered.length === 0 && (
                <tr>
                  <td className="py-3 px-3 text-gray-600" colSpan={3}>
                    No returns found.
                  </td>
                </tr>
              )}

              {!loading &&
                filtered.map((rtn) => (
                  <tr key={rtn.id} className="border-t hover:bg-gray-50">
                    <td className="py-2 px-3">
                      <button
                        onClick={() => setSelected(rtn)}
                        className="text-blue-600 hover:underline font-medium"
                        title="View details"
                      >
                        {rtn.code}
                      </button>
                    </td>
                    <td className="py-2 px-3 capitalize">{rtn.status}</td>
                    <td className="py-2 px-3">{formatPH(rtn.created_at)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal with full details */}
      {selected && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl ring-1 ring-black/5 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div className="space-x-2">
                <span className="font-semibold text-lg">{selected.code}</span>
                <span className="text-gray-400">•</span>
                <span className="capitalize">{selected.status}</span>
              </div>
              <div className="text-sm text-gray-600">
                Filed: {formatPH(selected.created_at)}
              </div>
            </div>

            {/* Customer + Order + Reason */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4 text-sm">
              <div className="bg-gray-50 rounded p-3">
                <div className="text-xs text-gray-500">Customer</div>
                <div className="font-medium">
                  {selected.customer?.name ?? "—"}
                </div>
                <div className="text-gray-600">
                  {selected.customer?.email ?? "—"}
                </div>
                <div className="text-gray-600">
                  {selected.customer?.phone ?? "—"}
                </div>
                <div className="text-gray-600">
                  {selected.customer?.address ?? "—"}
                </div>
              </div>

              <div className="bg-gray-50 rounded p-3">
                <div className="text-xs text-gray-500">Order</div>
                <div className="font-medium">{selected.order?.id ?? "—"}</div>
                <div className="text-gray-600">
                  Status: {selected.order?.status ?? "—"}
                </div>
              </div>

              <div className="bg-gray-50 rounded p-3">
                <div className="text-xs text-gray-500">Reason</div>
                <div className="font-medium">{selected.reason}</div>
                {selected.note && (
                  <>
                    <div className="text-xs text-gray-500 mt-2">Note</div>
                    <div className="text-gray-700">{selected.note}</div>
                  </>
                )}
              </div>
            </div>

            {/* Items */}
            <div className="mt-4 border rounded overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-[#ffba20] text-black">
                  <tr>
                    <th className="py-2 px-3 text-left">Product</th>
                    <th className="py-2 px-3 text-left">Qty</th>
                    <th className="py-2 px-3 text-left">Photos</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.return_items.map((ri, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="py-2 px-3">
                        {ri.inventory?.product_name ?? "—"}
                      </td>
                      <td className="py-2 px-3">{ri.quantity}</td>
                      <td className="py-2 px-3">
                        {ri.photo_urls && ri.photo_urls.length > 0 ? (
                          <div className="flex gap-2 flex-wrap">
                            {ri.photo_urls.map((u, i) => (
                              <a key={i} href={u} target="_blank">
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

            {/* Actions */}
            <div className="mt-4 flex flex-wrap gap-2 justify-end">
              <button
                onClick={() => setSelected(null)}
                className="px-4 py-2 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 shadow-sm"
              >
                Close
              </button>
              <button
                onClick={() => updateStatus(selected.id, "approved")}
                className="px-4 py-2 rounded-xl bg-green-600 text-white hover:opacity-90"
              >
                Approve
              </button>
              <button
                onClick={() => updateStatus(selected.id, "rejected")}
                className="px-4 py-2 rounded-xl bg-red-600 text-white hover:opacity-90"
              >
                Reject
              </button>
              <button
                onClick={() => updateStatus(selected.id, "received")}
                className="px-4 py-2 rounded-xl bg-black text-white hover:opacity-90"
              >
                Mark Received
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
