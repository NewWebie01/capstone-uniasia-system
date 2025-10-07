"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import supabase from "@/config/supabaseClient";
import { toast } from "sonner";
import { Clock, FileImage, ReceiptText, Search, Info } from "lucide-react";

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
  status?: string | null;       // 'pending' | 'received' | 'rejected'
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
  const [authEmail, setAuthEmail] = useState<string | null>(null);

  const [customers, setCustomers] = useState<CustomerLite[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const paymentsSubKey = useRef<string>("");

  // Filters
  const [q, setQ] = useState("");
  const [method, setMethod] = useState<"All" | "Cheque" | "Cash">("All");

  /* ------------------------------ Initial load ----------------------------- */
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
          setCustomers([]);
          setPayments([]);
          return;
        }

        // Load my transaction rows (customers keyed by email)
        const { data: custs, error: cErr } = await supabase
          .from("customers")
          .select("id, code, email")
          .eq("email", email)
          .order("date", { ascending: false });

        if (cErr) throw cErr;

        const custList = (custs as CustomerLite[]) || [];
        setCustomers(custList);

        // Fetch ONLY received payments for these customer ids
        const ids = custList.map((c) => String(c.id));
        if (ids.length) {
          const { data: pays, error: pErr } = await supabase
            .from("payments")
            .select(
              "id, customer_id, order_id, amount, method, cheque_number, bank_name, cheque_date, image_url, created_at, status, received_at, received_by"
            )
            .in("customer_id", ids)
            .eq("status", "received") // ← only show after admin marks as received
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

    const channel = supabase.channel("realtime-payments-history");
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "payments", filter },
      (payload) => {
        const newRow = payload.new as PaymentRow | undefined;
        const oldRow = payload.old as PaymentRow | undefined;

        if (payload.eventType === "INSERT") {
          // Only add if it's received
          if ((newRow?.status || "").toLowerCase() === "received") {
            setPayments((prev) => [newRow!, ...prev]);
          }
        } else if (payload.eventType === "UPDATE") {
          const newStatus = (newRow?.status || "").toLowerCase();
          const oldStatus = (oldRow?.status || "").toLowerCase();

          if (oldStatus !== "received" && newStatus === "received") {
            // became received → add (or replace if existed)
            setPayments((prev) => {
              const exists = prev.some((p) => p.id === newRow!.id);
              return exists
                ? prev.map((p) => (p.id === newRow!.id ? newRow! : p))
                : [newRow!, ...prev];
            });
          } else if (oldStatus === "received" && newStatus !== "received") {
            // left received → remove
            setPayments((prev) => prev.filter((p) => p.id !== oldRow!.id));
          } else if (newStatus === "received") {
            // stayed received → update
            setPayments((prev) => prev.map((p) => (p.id === newRow!.id ? newRow! : p)));
          }
        } else if (payload.eventType === "DELETE") {
          // If a received row got deleted, remove it
          if ((oldRow?.status || "").toLowerCase() === "received") {
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
      // method filter
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

  const totalPaid = useMemo(
    () => filtered.reduce((s, r) => s + (Number(r.amount) || 0), 0),
    [filtered]
  );

  /* ---------------------------------- UI ---------------------------------- */
  return (
    <div className="min-h-[calc(100vh-80px)]">
      <div className="mx-auto w-full max-w-6xl px-6 py-6">
        <div className="flex items-center gap-3">
          <ReceiptText className="h-7 w-7 text-amber-600" />
          <h1 className="text-3xl font-bold tracking-tight text-neutral-800">
            Payment History
          </h1>
        </div>
        <p className="text-sm text-gray-600 mt-1">
          Payments appear here after an admin <b>marks your cheque as Received</b>.
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
          <table className="w-full text-sm align-middle">
            <thead>
              <tr
                className="text-black uppercase tracking-wider text-[11px]"
                style={{ background: "#ffba20" }}
              >
                <th className="py-2.5 px-3 text-left font-bold">Date</th>
                <th className="py-2.5 px-3 text-left font-bold">TXN Code</th>
                <th className="py-2.5 px-3 text-right font-bold">Amount</th>
                <th className="py-2.5 px-3 text-left font-bold">Method</th>
                <th className="py-2.5 px-3 text-left font-bold">Cheque #</th>
                <th className="py-2.5 px-3 text-left font-bold">Bank</th>
                <th className="py-2.5 px-3 text-left font-bold">Cheque Date</th>
                <th className="py-2.5 px-3 text-left font-bold">Image</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, idx) => {
                const code = codeByCustomerId.get(String(p.customer_id)) || "—";
                return (
                  <tr key={p.id} className={idx % 2 ? "bg-neutral-50" : "bg-white"}>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {formatPH(p.received_at || p.created_at)}
                    </td>
                    <td className="py-2.5 px-3 font-mono">{code}</td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      {formatCurrency(p.amount)}
                    </td>
                    <td className="py-2.5 px-3">{p.method ?? "—"}</td>
                    <td className="py-2.5 px-3">{p.cheque_number ?? "—"}</td>
                    <td className="py-2.5 px-3">{p.bank_name ?? "—"}</td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {p.cheque_date ? formatPH(p.cheque_date, "date") : "—"}
                    </td>
                    <td className="py-2.5 px-3">
                      {p.image_url ? (
                        <a
                          href={p.image_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded border hover:bg-gray-50"
                        >
                          <FileImage className="h-4 w-4" />
                          <span>View</span>
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-neutral-400">
                    {loading ? "Loading…" : "No received payments yet."}
                  </td>
                </tr>
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="bg-neutral-50 border-t">
                  <td className="py-2.5 px-3 font-semibold">Total</td>
                  <td />
                  <td className="py-2.5 px-3 text-right font-bold font-mono">
                    {formatCurrency(totalPaid)}
                  </td>
                  <td colSpan={5} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Hint */}
        <div className="mt-4 flex items-start gap-2 text-sm text-gray-600">
          <Info className="h-4 w-4 mt-0.5" />
          <span>
            Only <b>Received</b> payments are shown. When an admin approves a cheque,
            it will appear here automatically.
          </span>
        </div>
      </div>
    </div>
  );
}
