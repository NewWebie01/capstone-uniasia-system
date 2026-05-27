// src/app/customer/payments-history/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import supabase from "@/config/supabaseClient";
import { toast } from "sonner";
import { FileImage, Search, Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

/* ----------------------------- Formatters ----------------------------- */
const formatCurrency = (n: number) =>
  (Number(n) || 0).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  });

const formatPH = (
  d?: string | number | Date | null,
  opts: "date" | "datetime" = "datetime"
) =>
  d
    ? new Intl.DateTimeFormat("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
        ...(opts === "datetime"
          ? { hour: "numeric", minute: "2-digit", hour12: true }
          : {}),
        timeZone: "Asia/Manila",
      }).format(new Date(d))
    : "—";

/* ---------------------------------- Types --------------------------------- */
type PaymentRow = {
  id: string;
  customer_id: string | number;
  order_id: string | number;
  amount: number;
  method: string | null; // "Cash" | "Deposit Slip" | legacy "Cheque"
  cheque_number: string | null; // kept for compatibility (now “slip #”)
  bank_name: string | null;
  image_url: string | null;
  created_at: string | null;
  status?: string | null; // 'pending' | 'received' | 'rejected'
  received_at?: string | null;
  received_by?: string | null;
};

type CustomerLite = {
  id: string | number;
  code: string | null; // TXN code (customer code)
  email: string | null;
  name: string | null;
};

/* ------------------------------- Helpers ------------------------------- */
function displayMethod(method?: string | null) {
  const m = (method || "").trim();
  // Map legacy "Cheque" → "Deposit Slip" for display and filtering
  if (/^cheque$/i.test(m)) return "Deposit Slip";
  return m || "—";
}

/* --------------------------------- Page ---------------------------------- */
export default function PaymentHistoryPage() {
  const [loading, setLoading] = useState(true);

  // Master data
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [customersById, setCustomersById] = useState<Map<string, CustomerLite>>(
    () => new Map()
  );

  // Realtime guard
  const paymentsSubbed = useRef(false);

  // Filters
  const [q, setQ] = useState("");
  const [method, setMethod] = useState<"All" | "Deposit Slip" | "Cash">("All");
  const [status, setStatus] = useState<
    "All" | "Pending" | "Received" | "Rejected"
  >("All");

  // Image modal
  const [imgOpen, setImgOpen] = useState(false);
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [imgMeta, setImgMeta] = useState<{
    slip?: string | null;
    bank?: string | null;
  } | null>(null);

  // Build code map from customersById
  const codeByCustomerId = useMemo(() => {
    const m = new Map<string, string>();
    customersById.forEach((c, key) => m.set(key, c.code ?? "—"));
    return m;
  }, [customersById]);

  /* ------------------------------ Helpers ------------------------------ */
  // After we fetch (or receive) a set of payments, ensure we have their customer codes
  async function ensureCustomerCodes(customerIds: (string | number)[]) {
    const missing: string[] = [];
    for (const rawId of customerIds) {
      const key = String(rawId);
      if (!customersById.has(key)) missing.push(key);
    }
    if (!missing.length) return;

    const { data, error } = await supabase
      .from("customers")
      .select("id, code, email, name")
      .in("id", missing);

    if (error) {
      console.error(error);
      return;
    }
    const next = new Map(customersById);
    (data as CustomerLite[] | null)?.forEach((c) => next.set(String(c.id), c));
    setCustomersById(next);
  }

  /* ------------------------------ Initial load ----------------------------- */
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // Fetch ALL payments (no per-user filtering)
        const { data: pays, error: pErr } = await supabase
          .from("payments")
          .select(
            "id, customer_id, order_id, amount, method, cheque_number, bank_name, image_url, created_at, status, received_at, received_by"
          )
          .order("created_at", { ascending: false });

        if (pErr) throw pErr;

        const rows = (pays as PaymentRow[]) || [];
        setPayments(rows);

        // Load customer codes for all present customer_ids
        const ids = Array.from(new Set(rows.map((r) => String(r.customer_id))));
        await ensureCustomerCodes(ids);
      } catch (err) {
        console.error(err);
        toast.error("Failed to load payments.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* ------------------------------ Realtime (ALL payments) ------------------------------ */
  useEffect(() => {
    if (paymentsSubbed.current) return;
    paymentsSubbed.current = true;

    const channel = supabase.channel("realtime-payments-history-all");

    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "payments" },
      async (payload) => {
        const newRow = payload.new as PaymentRow | undefined;
        const oldRow = payload.old as PaymentRow | undefined;

        if (payload.eventType === "INSERT") {
          if (newRow) {
            setPayments((prev) => [newRow, ...prev]);
            await ensureCustomerCodes([newRow.customer_id]);
          }
        } else if (payload.eventType === "UPDATE") {
          if (newRow) {
            setPayments((prev) =>
              prev.map((p) => (p.id === newRow.id ? newRow : p))
            );
            await ensureCustomerCodes([newRow.customer_id]);
          }
        } else if (payload.eventType === "DELETE") {
          if (oldRow) {
            setPayments((prev) => prev.filter((p) => p.id !== oldRow.id));
          }
        }
      }
    );

    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  /* ------------------------------ Derived view ------------------------------ */
  const filtered = useMemo(() => {
    const qx = q.trim().toLowerCase();

    return payments.filter((p) => {
      // Method filter
      const dispMethod = displayMethod(p.method);
      if (method !== "All" && dispMethod !== method) return false;

      // Status filter
      const s = (p.status || "").toLowerCase();
      if (
        status !== "All" &&
        !(
          (status === "Pending" && s === "pending") ||
          (status === "Received" && s === "received") ||
          (status === "Rejected" && s === "rejected")
        )
      ) {
        return false;
      }

      // Search across customer name, TXN code, method, bank, slip, order_id, amount
      if (!qx) return true;

      const code = codeByCustomerId.get(String(p.customer_id)) || "";
      const cust = customersById.get(String(p.customer_id));
      const customerName = cust?.name || "";

      const hay = [
        customerName,
        code,
        dispMethod,
        p.bank_name || "",
        p.cheque_number || "",
        p.order_id?.toString?.() || "",
        p.amount?.toString?.() || "",
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(qx);
    });
  }, [payments, q, method, status, codeByCustomerId, customersById]);

  /* ------------------------------ Image modal helpers ------------------------------ */
  function openImage(
    url: string,
    meta?: { slip?: string | null; bank?: string | null }
  ) {
    setImgSrc(url);
    setImgMeta(meta || null);
    setImgOpen(true);
  }

  const cellNowrap =
    "sticky top-0 z-10 py-3 px-3 text-left font-bold text-[13px] whitespace-nowrap";

  /* ---------------------------------- UI ---------------------------------- */
  return (
    <div className="min-h-[calc(100vh-80px)]">
      <div className="mx-auto w-full max-w-6xl px-6 py-6">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-neutral-800">
            Payments History (All Customers)
          </h1>
        </div>
        <p className="text-sm text-gray-600 mt-1">
          View <b>all</b> customer payments — Cash and Deposit Slips — with live
          updates.
        </p>

        {/* Filters */}
        <div className="mt-4 flex flex-col md:flex-row gap-3 md:items-center">
          <div className="flex-1 relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search customer / TXN / bank / slip # / amount…"
              className="w-full rounded-lg border border-gray-300 pl-8 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as any)}
            className="w-full md:w-[180px] rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option>All</option>
            <option>Deposit Slip</option>
            <option>Cash</option>
          </select>

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
            className="w-full md:w-[180px] rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option>All</option>
            <option>Pending</option>
            <option>Received</option>
            <option>Rejected</option>
          </select>
        </div>

        {/* Table */}
        <div className="mt-4 rounded-xl overflow-hidden ring-1 ring-gray-200 bg-white">
          <div className="w-full overflow-x-auto overscroll-x-contain">
            <table className="min-w-full bg-white text-sm">
              <thead className="bg-[#ffba20] text-black text-left">
                <tr>
                  <th className={cellNowrap}>Date of Payment</th>
                  <th className={cellNowrap}>Customer</th>
                  <th className={cellNowrap}>Invoice No.</th>
                  <th className={cellNowrap}>Amount</th>
                  <th className={cellNowrap}>Method</th>
                  <th className={cellNowrap}>Ref / Cheque No.</th>
                  <th className={cellNowrap}>Bank</th>
                  <th className={cellNowrap}>Image</th>
                  <th className={cellNowrap}>Status</th>
                </tr>
              </thead>

              <tbody className="align-middle">
                {filtered.map((p, idx) => {
                  const code =
                    codeByCustomerId.get(String(p.customer_id)) || "—";
                  const cust = customersById.get(String(p.customer_id));
                  const customerLabel = cust?.name || code || "—";

                  const s = (p.status || "").toLowerCase();
                  const statusBadge = (
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        s === "received"
                          ? "bg-green-100 text-green-800"
                          : s === "rejected"
                          ? "bg-red-100 text-red-800"
                          : "bg-yellow-100 text-yellow-900"
                      }`}
                    >
                      {s ? s.charAt(0).toUpperCase() + s.slice(1) : "—"}
                    </span>
                  );

                  const dispMethod = displayMethod(p.method);

                  return (
                    <tr
                      key={p.id}
                      className={idx % 2 ? "bg-neutral-50" : "bg-white"}
                    >
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {formatPH(p.received_at || p.created_at, "date")}
                      </td>

                      <td className="py-2.5 px-3 whitespace-nowrap font-medium">
                        {customerLabel}
                      </td>

                      <td className="py-2.5 px-3 font-mono">{code}</td>

                      <td className="py-2.5 px-3 font-mono tabular-nums whitespace-nowrap">
                        {formatCurrency(p.amount)}
                      </td>

                      <td className="py-2.5 px-3">{dispMethod}</td>

                      <td className="py-2.5 px-3">{p.cheque_number ?? "—"}</td>

                      <td className="py-2.5 px-3">{p.bank_name ?? "—"}</td>

                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {p.image_url ? (
                          <button
                            type="button"
                            onClick={() =>
                              openImage(p.image_url!, {
                                slip: p.cheque_number,
                                bank: p.bank_name,
                              })
                            }
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border hover:bg-gray-50"
                          >
                            <FileImage className="h-4 w-4" />
                            <span>View</span>
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>

                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {statusBadge}
                      </td>
                    </tr>
                  );
                })}

                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={9}
                      className="py-10 text-center text-neutral-400"
                    >
                      {loading ? "Loading…" : "No payments found."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Hint */}
        <div className="mt-4 flex items-start gap-2 text-sm text-gray-600">
          <Info className="h-4 w-4 mt-0.5" />
          <span>
            This list includes <b>all</b> payments from every customer (Pending,
            Received, and Rejected). Use the filters above to narrow results.
          </span>
        </div>
      </div>

      {/* Image Modal */}
      <Dialog open={imgOpen} onOpenChange={setImgOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Deposit Slip Image</DialogTitle>
            <DialogDescription className="text-xs">
              {imgMeta?.bank ? `Bank: ${imgMeta.bank}` : ""}{" "}
              {imgMeta?.slip ? `• Slip #: ${imgMeta.slip}` : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg overflow-hidden border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imgSrc || ""}
              alt="Deposit Slip"
              className="w-full h-auto object-contain max-h-[70vh] bg-black/5"
            />
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={() => setImgOpen(false)}
              className="px-4 py-2 rounded border hover:bg-gray-50"
            >
              Close
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
