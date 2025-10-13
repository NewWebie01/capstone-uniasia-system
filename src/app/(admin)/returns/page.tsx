// src/app/returns/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import supabase from "@/config/supabaseClient";
import { toast } from "sonner";

/* ============== Activity Log helper ============== */
async function logActivity(action: string, details: any = {}) {
  try {
    const { data } = await supabase.auth.getUser();
    const userEmail = data?.user?.email || "";
    await supabase.from("activity_logs").insert([
      {
        user_email: userEmail,
        user_role: "admin",
        action,
        details,
        created_at: new Date().toISOString(),
      },
    ]);
  } catch (e) {
    console.error("logActivity failed:", e);
  }
}

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
    code?: string | null;
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
          code: toStrOrNull(r.customer.code),
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

const StatusChip = ({ status }: { status?: string | null }) => {
  const s = (status || "").toLowerCase();
  const styles =
    s === "approved"
      ? "bg-green-100 text-green-700 border-green-200"
      : s === "rejected"
      ? "bg-red-100 text-red-700 border-red-200"
      : s === "received"
      ? "bg-emerald-100 text-emerald-700 border-emerald-200"
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

/* ============== Custom Select (styled dropdown) ============== */

type SelectOption = { label: string; value: string };
const STATUS_OPTIONS: SelectOption[] = [
  { label: "All statuses", value: "" },
  { label: "requested", value: "requested" },
  { label: "approved", value: "approved" },
  { label: "rejected", value: "rejected" },
  { label: "received", value: "received" },
];

function useClickOutside<T extends HTMLElement>(onClickOutside: () => void) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!(e.target instanceof Node)) return;
      if (!ref.current.contains(e.target)) onClickOutside();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClickOutside]);
  return ref;
}

function StatusSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
  const selected =
    STATUS_OPTIONS.find((o) => o.value === value) ?? STATUS_OPTIONS[0];

  return (
    <div ref={ref} className="relative w-56">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="w-full text-left px-3 py-2 rounded-xl border bg-white hover:bg-gray-50 focus:outline-none ring-0 focus:ring-2 focus:ring-[#ffba20] transition"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selected.label}
        <span className="float-right opacity-70">▾</span>
      </button>

      {open && (
        <div
          className="absolute z-20 mt-1 w-full rounded-xl border bg-white shadow-xl overflow-hidden"
          role="listbox"
        >
          {STATUS_OPTIONS.map((opt) => {
            const active = opt.value === value;
            return (
              <div
                key={opt.value || "all"}
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                  logActivity("Filter Returns Status", {
                    filter: opt.value,
                  });
                }}
                className={`px-3 py-2 cursor-pointer transition ${
                  active
                    ? "bg-[#ffba20]/20 text-black"
                    : "hover:bg-gray-50 text-gray-800"
                }`}
              >
                {opt.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============== Page ============== */

const QUICK_STATUSES = [
  "all",
  "requested",
  "approved",
  "rejected",
  "received",
] as const;
type QuickStatus = (typeof QUICK_STATUSES)[number];

export default function AdminReturnsPage() {
  const [rows, setRows] = useState<ReturnRow[]>([]);
  const [loading, setLoading] = useState(true);

  // filters
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [quick, setQuick] = useState<QuickStatus>("all");

  // details modal
  const [selected, setSelected] = useState<ReturnRow | null>(null);

  // confirm modal for status change
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<{
    id: string;
    code: string;
    current: string;
    next: "approved" | "rejected" | "received";
  } | null>(null);
  const [updating, setUpdating] = useState(false);

  // pagination
  const [page, setPage] = useState(1);
  const perPage = 10;

  // realtime channel guard
  const subscribedRef = useRef(false);

  const fetchReturns = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("returns")
        .select(
          `
          id, code, status, reason, note, created_at, order_id,
          customer:customers!returns_customer_id_fkey ( code, name, email, phone, address ),
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
    if (!subscribedRef.current) {
      subscribedRef.current = true;
      const ch = supabase
        .channel("admin-returns")
        .on(
          "postgres_changes",
          { schema: "public", table: "returns", event: "*" },
          () => fetchReturns()
        )
        .on(
          "postgres_changes",
          { schema: "public", table: "return_items", event: "*" },
          () => fetchReturns()
        )
        .subscribe();

      return () => {
        try {
          supabase.removeChannel(ch);
          subscribedRef.current = false;
        } catch {}
      };
    }
  }, []);

  useEffect(() => {
    setPage(1);
  }, [q, statusFilter, quick]);

  const filtered = useMemo(() => {
    const text = q.trim().toLowerCase();
    let out = rows;

    if (quick !== "all") {
      out = out.filter((r) => (r.status || "").toLowerCase() === quick);
    }
    if (statusFilter) {
      out = out.filter((r) => (r.status || "").toLowerCase() === statusFilter);
    }
    if (text) {
      out = out.filter((r) => {
        const customerStr = `${r.customer?.name ?? ""} ${
          r.customer?.email ?? ""
        } ${r.customer?.phone ?? ""} ${r.customer?.address ?? ""} ${
          r.customer?.code ?? ""
        }`.toLowerCase();
        return (
          r.code.toLowerCase().includes(text) ||
          customerStr.includes(text) ||
          (r.order?.id ?? "").toLowerCase().includes(text)
        );
      });
    }
    return out;
  }, [rows, q, statusFilter, quick]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageRows = useMemo(() => {
    const start = (page - 1) * perPage;
    return filtered.slice(start, start + perPage);
  }, [filtered, page]);

  const isReceived = (status?: string | null) =>
    (status || "").toLowerCase() === "received";
  const isApproved = (status?: string | null) =>
    (status || "").toLowerCase() === "approved";

  // Guard: don't open modal if attempting to set to same status
  const openConfirm = (
    id: string,
    code: string,
    current: string,
    next: "approved" | "rejected" | "received"
  ) => {
    const curr = (current || "").toLowerCase();
    const nxt = (next || "").toLowerCase();
    if (curr === nxt) return;
    setConfirmTarget({ id, code, current, next });
    setConfirmOpen(true);

    // Log button click for status change attempt
    logActivity("Open Status Change Modal", {
      return_id: id,
      code,
      from: current,
      to: next,
    });
  };

  const updateStatus = async (
    id: string,
    status: "approved" | "rejected" | "received"
  ) => {
    const prev = rows;
    const prevRow = rows.find((r) => r.id === id);
    const prevStatus = prevRow?.status ?? "";

    setUpdating(true);
    setRows((r) => r.map((x) => (x.id === id ? { ...x, status } : x)));
    setSelected((s) => (s && s.id === id ? { ...s, status } : s));

    const { error } = await supabase
      .from("returns")
      .update({ status })
      .eq("id", id);

    setUpdating(false);
    setConfirmOpen(false);
    setConfirmTarget(null);

    if (error) {
      setRows(prev);
      setSelected((s) =>
        s && s.id === id ? prev.find((p) => p.id === id) || s : s
      );
      toast.error(error.message);
    } else {
      toast.success(`Status changed to ${status}`);
      // ✅ Log status update (already implemented)
      const code = prevRow?.code || id;
      await logActivity("Updated Return Status", {
        return_id: id,
        code,
        from: prevStatus,
        to: status,
        changed_at: new Date().toISOString(),
      });
    }
  };

  // Log quick tab clicks
  const handleQuickTab = (s: QuickStatus) => {
    setQuick(s);
    logActivity("Quick Tab Filter", { quick_tab: s });
  };

  // Log search/filter input changes (optional, for completeness)
  const handleSearchChange = (val: string) => {
    setQ(val);
    logActivity("Search Returns", { query: val });
  };

  // Log pagination
  const handlePageChange = (n: number) => {
    setPage(n);
    logActivity("Change Returns Page", { page: n });
  };

  // Log View details
  const handleView = (rtn: ReturnRow) => {
    setSelected(rtn);
    logActivity("View Return Details", {
      return_id: rtn.id,
      code: rtn.code,
      status: rtn.status,
    });
  };

  // Log modal Close
  const handleCloseModal = (rtn: ReturnRow) => {
    setSelected(null);
    logActivity("Close Return Details Modal", {
      return_id: rtn.id,
      code: rtn.code,
      status: rtn.status,
    });
  };

  return (
    <div className="px-4 pb-6 pt-1">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="pt-1 text-3xl font-bold mb-1">Returns</h1>
          <p className="text-sm text-gray-500 mb-2">
            Track and manage product return requests from customers.
          </p>
        </div>
      </div>

      {/* Quick tabs */}
      <div className="bg-white border rounded-2xl p-3 shadow-sm mb-3">
        <div className="flex flex-wrap gap-2">
          {QUICK_STATUSES.map((s) => {
            const active = quick === s;
            const label = s[0].toUpperCase() + s.slice(1);
            return (
              <button
                key={s}
                onClick={() => handleQuickTab(s)}
                className={`px-3 py-1.5 rounded-full text-xs border transition ${
                  active
                    ? "bg-[#ffba20] border-[#ffba20] text-black"
                    : "bg-white hover:bg-gray-50"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border rounded-2xl p-4 shadow-sm mb-4">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="w-[22rem] max-w-full">
              <input
                className="border rounded-xl px-3 py-2 w-full bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#ffba20] transition"
                placeholder="Search by return code / name / email / phone / TXN"
                value={q}
                onChange={(e) => handleSearchChange(e.target.value)}
              />
            </div>
            <StatusSelect value={statusFilter} onChange={setStatusFilter} />
          </div>
          <div className="text-sm text-gray-600">
            Showing <span className="font-medium">{filtered.length}</span>{" "}
            record{filtered.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#ffba20]/90 text-black">
              <tr className="[&>th]:py-2 [&>th]:px-3 text-left">
                <th className="min-w-[140px]">Return code</th>
                <th className="min-w-[110px]">Status</th>
                <th className="min-w-[150px]">TXN</th>
                <th className="min-w-[180px]">Customer</th>
                <th className="min-w-[110px]">Items</th>
                <th className="min-w-[160px]">Filed</th>
                <th className="min-w-[200px]" aria-label="Actions">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td className="py-3 px-3" colSpan={7}>
                    Loading…
                  </td>
                </tr>
              )}

              {!loading && pageRows.length === 0 && (
                <tr>
                  <td className="py-3 px-3 text-gray-600" colSpan={7}>
                    No returns found.
                  </td>
                </tr>
              )}

              {!loading &&
                pageRows.map((rtn) => {
                  const itemsCount = rtn.return_items.length;
                  const lockedReceived = isReceived(rtn.status);
                  const lockedReject = lockedReceived || isApproved(rtn.status);
                  return (
                    <tr key={rtn.id} className="border-t hover:bg-gray-50">
                      <td className="py-2 px-3">
                        <button
                          onClick={() => handleView(rtn)}
                          className="text-blue-600 hover:underline font-medium"
                          title="View details"
                        >
                          {rtn.code}
                        </button>
                      </td>
                      <td className="py-2 px-3">
                        <StatusChip status={rtn.status} />
                      </td>
                      <td className="py-2 px-3 tracking-wider">
                        {rtn.customer?.code ?? "—"}
                      </td>
                      <td className="py-2 px-3">
                        {rtn.customer?.name ?? "—"}
                        <div className="text-xs text-gray-500">
                          {rtn.customer?.email ?? "—"}
                        </div>
                      </td>
                      <td className="py-2 px-3">{itemsCount}</td>
                      <td className="py-2 px-3">{formatPH(rtn.created_at)}</td>
                      <td className="py-2 px-3">
                        <div className="flex flex-wrap gap-1">
                          <button
                            onClick={() =>
                              openConfirm(
                                rtn.id,
                                rtn.code,
                                rtn.status,
                                "approved"
                              )
                            }
                            className={`px-2.5 py-1.5 rounded-xl border text-xs hover:bg-green-50 ${
                              lockedReceived
                                ? "opacity-50 cursor-not-allowed"
                                : ""
                            }`}
                            disabled={lockedReceived}
                            title={
                              lockedReceived ? "Already received" : "Approve"
                            }
                          >
                            Approve
                          </button>
                          <button
                            onClick={() =>
                              openConfirm(
                                rtn.id,
                                rtn.code,
                                rtn.status,
                                "rejected"
                              )
                            }
                            className={`px-2.5 py-1.5 rounded-xl border text-xs hover:bg-red-50 ${
                              lockedReject
                                ? "opacity-50 cursor-not-allowed"
                                : ""
                            }`}
                            disabled={lockedReject}
                            title={
                              lockedReject
                                ? isApproved(rtn.status)
                                  ? "Already approved"
                                  : "Already received"
                                : "Reject"
                            }
                          >
                            Reject
                          </button>
                          <button
                            onClick={() =>
                              openConfirm(
                                rtn.id,
                                rtn.code,
                                rtn.status,
                                "received"
                              )
                            }
                            className={`px-2.5 py-1.5 rounded-xl border text-xs hover:bg-gray-50 ${
                              lockedReceived
                                ? "opacity-50 cursor-not-allowed"
                                : ""
                            }`}
                            title={
                              lockedReceived
                                ? "Already received"
                                : "Mark Received"
                            }
                            disabled={lockedReceived}
                          >
                            Received
                          </button>
                          <button
                            onClick={() => handleView(rtn)}
                            className="px-2.5 py-1.5 rounded-xl border text-xs hover:bg-gray-50"
                          >
                            View
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        <div className="flex items-center justify-between px-3 py-2 border-t bg-white text-sm">
          <div>
            Page <span className="font-medium">{page}</span> of{" "}
            <span className="font-medium">{totalPages}</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              className="px-2 py-1 rounded border hover:bg-gray-50 disabled:opacity-50"
              onClick={() => handlePageChange(Math.max(1, page - 1))}
              disabled={page === 1}
            >
              Prev
            </button>
            {Array.from({ length: totalPages }).map((_, i) => {
              const n = i + 1;
              const active = n === page;
              return (
                <button
                  key={n}
                  onClick={() => handlePageChange(n)}
                  className={`px-2 py-1 rounded border text-xs ${
                    active
                      ? "bg-[#ffba20] border-[#ffba20] text-black"
                      : "hover:bg-gray-50"
                  }`}
                >
                  {n}
                </button>
              );
            })}
            <button
              className="px-2 py-1 rounded border hover:bg-gray-50 disabled:opacity-50"
              onClick={() => handlePageChange(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Details Modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => handleCloseModal(selected)}
        >
          <div
            className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl ring-1 ring-black/5 p-0 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 pt-5 pb-4 border-b bg-white">
              <div className="flex items-start justify-between gap-3">
                <div className="space-x-2">
                  <span className="font-semibold text-xl">{selected.code}</span>
                  <span className="text-gray-300">•</span>
                  <StatusChip status={selected.status} />
                </div>
                <div className="text-sm text-gray-600">
                  Filed: {formatPH(selected.created_at)}
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="p-6">
              {/* Info cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-xl border bg-white p-4">
                  <div className="text-xs text-gray-500 mb-1">Customer</div>
                  <div className="font-medium">
                    {selected.customer?.name ?? "—"}
                  </div>
                  <div className="text-gray-700">
                    {selected.customer?.email ?? "—"}
                  </div>
                  <div className="text-gray-700">
                    {selected.customer?.phone ?? "—"}
                  </div>
                  <div className="text-gray-700">
                    {selected.customer?.address ?? "—"}
                  </div>
                  <div className="text-xs text-gray-500 mt-3">TXN</div>
                  <div className="font-medium tracking-wider">
                    {selected.customer?.code ?? "—"}
                  </div>
                </div>

                <div className="rounded-xl border bg-white p-4">
                  <div className="text-xs text-gray-500 mb-1">Order</div>
                  {/* Order ID intentionally hidden */}
                  <div className="text-gray-700">
                    Status: {selected.order?.status ?? "—"}
                  </div>
                </div>

                <div className="rounded-xl border bg-white p-4">
                  <div className="text-xs text-gray-500 mb-1">Reason</div>
                  <div className="font-medium">{selected.reason}</div>
                  {selected.note && (
                    <>
                      <div className="text-xs text-gray-500 mt-3">Note</div>
                      <div className="text-gray-800 whitespace-pre-wrap">
                        {selected.note}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Items */}
              <div className="mt-6 rounded-xl border overflow-hidden">
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
                      <tr key={idx} className="border-t align-top">
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
              <div className="mt-6 flex flex-wrap gap-2 justify-end">
                <button
                  onClick={() => handleCloseModal(selected)}
                  className="px-4 py-2 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 shadow-sm"
                >
                  Close
                </button>
                <button
                  onClick={() =>
                    openConfirm(
                      selected.id,
                      selected.code,
                      selected.status,
                      "approved"
                    )
                  }
                  className={`px-4 py-2 rounded-xl bg-green-600 text-white hover:opacity-90 ${
                    isReceived(selected.status)
                      ? "opacity-50 cursor-not-allowed"
                      : ""
                  }`}
                  disabled={isReceived(selected.status)}
                >
                  Approve
                </button>
                <button
                  onClick={() =>
                    openConfirm(
                      selected.id,
                      selected.code,
                      selected.status,
                      "rejected"
                    )
                  }
                  className={`px-4 py-2 rounded-xl bg-red-600 text-white hover:opacity-90 ${
                    isReceived(selected.status) || isApproved(selected.status)
                      ? "opacity-50 cursor-not-allowed"
                      : ""
                  }`}
                  disabled={
                    isReceived(selected.status) || isApproved(selected.status)
                  }
                  title={
                    isApproved(selected.status)
                      ? "Already approved"
                      : isReceived(selected.status)
                      ? "Already received"
                      : "Reject"
                  }
                >
                  Reject
                </button>
                <button
                  onClick={() =>
                    openConfirm(
                      selected.id,
                      selected.code,
                      selected.status,
                      "received"
                    )
                  }
                  className={`px-4 py-2 rounded-xl bg-black text-white hover:opacity-90 ${
                    isReceived(selected.status)
                      ? "opacity-50 cursor-not-allowed"
                      : ""
                  }`}
                  disabled={isReceived(selected.status)}
                >
                  Mark Received
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Status Change Modal */}
      {confirmOpen && confirmTarget && (
        <div
          className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => !updating && setConfirmOpen(false)}
        >
          <div
            className="bg-white w-full max-w-md rounded-2xl shadow-2xl ring-1 ring-black/5 p-0 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-5 pb-4 border-b">
              <h3 className="text-lg font-semibold">Change status?</h3>
              <p className="text-sm text-gray-600 mt-1">
                You are about to change the status of{" "}
                <span className="font-medium tracking-wider">
                  {confirmTarget.code}
                </span>
                .
              </p>
            </div>

            <div className="p-6">
              <div className="rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b">
                      <td className="px-3 py-2 text-gray-600 w-32">Current</td>
                      <td className="px-3 py-2">
                        <StatusChip status={confirmTarget.current} />
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 text-gray-600">New</td>
                      <td className="px-3 py-2">
                        <StatusChip status={confirmTarget.next} />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {confirmTarget.next === "received" && (
                <div className="mt-3 text-xs text-gray-700 bg-amber-50 border border-amber-200 rounded-md p-2">
                  Note: Once marked as <b>received</b>, this return becomes{" "}
                  <b>non-editable</b>. You will not be able to approve or reject
                  it afterward.
                </div>
              )}

              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={() => {
                    setConfirmOpen(false);
                    logActivity("Cancel Status Change Modal", {
                      ...confirmTarget,
                    });
                  }}
                  className="px-4 py-2 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 shadow-sm"
                  disabled={updating}
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    await updateStatus(confirmTarget.id, confirmTarget.next);
                    logActivity("Confirm Status Change", {
                      ...confirmTarget,
                      confirmed_at: new Date().toISOString(),
                    });
                  }}
                  className="px-4 py-2 rounded-xl bg-black text-white hover:opacity-90 disabled:opacity-50"
                  disabled={updating}
                >
                  {updating ? "Applying…" : "Confirm"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
