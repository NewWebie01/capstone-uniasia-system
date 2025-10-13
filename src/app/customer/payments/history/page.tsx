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
  method: string | null;
  cheque_number: string | null;
  bank_name: string | null;
  cheque_date: string | null;
  image_url: string | null;
  created_at: string | null;
  status?: string | null; // 'pending' | 'received' | 'rejected'
  received_at?: string | null;
  received_by?: string | null;
};

type CustomerLite = {
  id: string | number;
  code: string | null; // TXN
  email: string | null;
};

/* --------------------------------- Page ---------------------------------- */
export default function PaymentHistoryPage() {
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<CustomerLite[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const paymentsSubKey = useRef<string>("");

  // Filters
  const [q, setQ] = useState("");
  const [method, setMethod] = useState<"All" | "Cheque" | "Cash">("All");

  // Image modal
  const [imgOpen, setImgOpen] = useState(false);
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [imgMeta, setImgMeta] = useState<{ cheque?: string | null; bank?: string | null } | null>(
    null
  );

  /* ------------------------------ Initial load ----------------------------- */
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const email = user?.email ?? null;
        if (!email) {
          setCustomers([]);
          setPayments([]);
          return;
        }

        const { data: custs, error: cErr } = await supabase
          .from("customers")
          .select("id, code, email")
          .eq("email", email)
          .order("date", { ascending: false });
        if (cErr) throw cErr;

        const custList = (custs as CustomerLite[]) || [];
        setCustomers(custList);

        const ids = custList.map((c) => String(c.id));
        if (ids.length) {
          const { data: pays, error: pErr } = await supabase
            .from("payments")
            .select(
              "id, customer_id, order_id, amount, method, cheque_number, bank_name, cheque_date, image_url, created_at, status, received_at, received_by"
            )
            .in("customer_id", ids)
            .in("status", ["received", "rejected"]) // <-- include both
            .order("created_at", { ascending: false });
          if (pErr) throw pErr;
          setPayments((pays as PaymentRow[]) || []);
        } else {
          setPayments([]);
        }
      } catch (err) {
        console.error(err);
        toast.error("Failed to load payment history.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* ------------------------------ Realtime ------------------------------ */
  useEffect(() => {
    const ids = customers.map((c) => String(c.id));
    const key = `payments-hist:${ids.join(",")}`;
    if (!ids.length || paymentsSubKey.current === key) return;
    paymentsSubKey.current = key;

    const filter = `customer_id=in.(${ids
      .map((v) => (typeof v === "string" ? `"${v}"` : String(v)))
      .join(",")})`;

    const included = new Set(["received", "rejected"]);

    const channel = supabase.channel("realtime-payments-history");
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "payments", filter },
      (payload) => {
        const newRow = payload.new as PaymentRow | undefined;
        const oldRow = payload.old as PaymentRow | undefined;

        const newStatus = (newRow?.status || "").toLowerCase();
        const oldStatus = (oldRow?.status || "").toLowerCase();

        if (payload.eventType === "INSERT") {
          if (included.has(newStatus)) {
            setPayments((prev) => [newRow!, ...prev]);
          }
        } else if (payload.eventType === "UPDATE") {
          const newIn = included.has(newStatus);
          const oldIn = included.has(oldStatus);

          if (!oldIn && newIn) {
            setPayments((prev) => {
              const exists = prev.some((p) => p.id === newRow!.id);
              return exists
                ? prev.map((p) => (p.id === newRow!.id ? newRow! : p))
                : [newRow!, ...prev];
            });
          } else if (oldIn && !newIn) {
            setPayments((prev) => prev.filter((p) => p.id !== oldRow!.id));
          } else if (newIn && oldIn) {
            setPayments((prev) => prev.map((p) => (p.id === newRow!.id ? newRow! : p)));
          }
        } else if (payload.eventType === "DELETE") {
          if (included.has(oldStatus)) {
            setPayments((prev) => prev.filter((p) => p.id !== oldRow!.id));
          }
        }
      }
    );
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [customers]);

  /* ------------------------------ Derived view ------------------------------ */
  const codeByCustomerId = useMemo(() => {
    const m = new Map<string, string>();
    customers.forEach((c) => m.set(String(c.id), c.code ?? "—"));
    return m;
  }, [customers]);

  const filtered = useMemo(() => {
    const qx = q.trim().toLowerCase();
    return payments.filter((p) => {
      if (method !== "All" && (p.method || "Cheque") !== method) return false;
      if (!qx) return true;

      const code = codeByCustomerId.get(String(p.customer_id)) || "";
      const hay = [
        code,
        p.method || "",
        p.bank_name || "",
        p.cheque_number || "",
        p.order_id?.toString?.() || "",
        p.amount?.toString?.() || "",
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(qx);
    });
  }, [payments, q, method, codeByCustomerId]);

  /* ------------------------------ Image modal helpers ------------------------------ */
  function openImage(url: string, meta?: { cheque?: string | null; bank?: string | null }) {
    setImgSrc(url);
    setImgMeta(meta || null);
    setImgOpen(true);
  }

  const cellNowrap =
    "sticky top-0 z-10 py-3 px-3 text-left font-bold text-[13px] whitespace-nowrap";

  /* ---------------------------------- UI ---------------------------------- */
  return (
    <div className="min-h[calc(100vh-80px)]">
      <div className="mx-auto w-full max-w-6xl px-6 py-6">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-neutral-800">
            Payment History
          </h1>
        </div>
        <p className="text-sm text-gray-600 mt-1">
          Cheques appear here after an admin marks them as <b>Received</b> or <b>Rejected</b>.
        </p>

        {/* Filters */}
        <div className="mt-4 flex flex-col md:flex-row gap-3 md:items-center">
          <div className="flex-1 relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search TXN / bank / cheque # / amount…"
              className="w-full rounded-lg border border-gray-300 pl-8 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as any)}
            className="w-full md:w-[180px] rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option>All</option>
            <option>Cheque</option>
            <option>Cash</option>
          </select>
        </div>

        {/* Table */}
        <div className="mt-4 rounded-xl overflow-hidden ring-1 ring-gray-200 bg-white">
          <div className="w-full overflow-x-auto overscroll-x-contain">
            <table className="min-w-full bg-white text-sm">
              <thead className="bg-[#ffba20] text-black text-left">
                <tr>
                  <th className={cellNowrap}>Date</th>
                  <th className={cellNowrap}>TXN Code</th>
                  <th className={cellNowrap}>Amount</th>
                  <th className={cellNowrap}>Method</th>
                  <th className={cellNowrap}>Cheque #</th>
                  <th className={cellNowrap}>Bank</th>
                  <th className={cellNowrap}>Cheque Date</th>
                  <th className={cellNowrap}>Image</th>
                  <th className={cellNowrap}>Status</th>
                </tr>
              </thead>

              <tbody className="align-middle">
                {filtered.map((p, idx) => {
                  const code = codeByCustomerId.get(String(p.customer_id)) || "—";
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
                      {s === "received" ? "Received" : s === "rejected" ? "Rejected" : "Pending"}
                    </span>
                  );

                  return (
                    <tr key={p.id} className={idx % 2 ? "bg-neutral-50" : "bg-white"}>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {formatPH(p.received_at || p.created_at)}
                      </td>
                      <td className="py-2.5 px-3 font-mono">{code}</td>
                      <td className="py-2.5 px-3 font-mono tabular-nums whitespace-nowrap">
                        {formatCurrency(p.amount)}
                      </td>
                      <td className="py-2.5 px-3">{p.method ?? "—"}</td>
                      <td className="py-2.5 px-3">{p.cheque_number ?? "—"}</td>
                      <td className="py-2.5 px-3">{p.bank_name ?? "—"}</td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {p.cheque_date ? formatPH(p.cheque_date, "date") : "—"}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {p.image_url ? (
                          <button
                            type="button"
                            onClick={() =>
                              openImage(p.image_url!, {
                                cheque: p.cheque_number,
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
                      <td className="py-2.5 px-3 whitespace-nowrap">{statusBadge}</td>
                    </tr>
                  );
                })}

                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-neutral-400">
                      {loading ? "Loading…" : "No reviewed cheques yet."}
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
            This page shows cheques after admin review — both <b>Received</b> and <b>Rejected</b>.
          </span>
        </div>
      </div>

      {/* Image Modal */}
      <Dialog open={imgOpen} onOpenChange={setImgOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Cheque Image</DialogTitle>
            <DialogDescription className="text-xs">
              {imgMeta?.bank ? `Bank: ${imgMeta.bank}` : ""}{" "}
              {imgMeta?.cheque ? `• Cheque #: ${imgMeta.cheque}` : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg overflow-hidden border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imgSrc || ""}
              alt="Cheque"
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
