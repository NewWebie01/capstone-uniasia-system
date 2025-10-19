"use client";

import { useEffect, useMemo, useState } from "react";
import supabase from "@/config/supabaseClient";
import { toast } from "sonner";
import { CheckCircle2, XCircle, FileImage, Search, Loader2 } from "lucide-react";
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

/* -------------------- Activity Logger -------------------- */
async function logActivity(action: string, details: any = {}) {
  try {
    const { data } = await supabase.auth.getUser();
    const email = data?.user?.email || "";

    let userRole = "admin";
    if (email) {
      const { data: userRow } = await supabase
        .from("users")
        .select("role")
        .eq("email", email)
        .maybeSingle();
      if (userRow?.role) userRole = userRow.role;
    }

    await supabase.from("activity_logs").insert([
      {
        user_email: email,
        user_role: userRole,
        action,
        details,
        created_at: new Date().toISOString(),
      },
    ]);
  } catch (e) {
    console.error("logActivity failed:", e);
  }
}

/* ---------------------------------- Types --------------------------------- */
type PaymentRow = {
  id: string;
  customer_id: string;
  order_id: string;
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
  id: string;
  code: string | null; // TXN
  name: string | null;
  email: string | null;
};

export default function AdminPaymentsPage() {
  const [loading, setLoading] = useState(true);
  const [meEmail, setMeEmail] = useState<string | null>(null);

  const [customers, setCustomers] = useState<CustomerLite[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);

  // filters
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "pending" | "received" | "rejected">(
    "pending"
  );

  // image modal
  const [imgOpen, setImgOpen] = useState(false);
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [imgMeta, setImgMeta] = useState<{ cheque?: string | null; bank?: string | null } | null>(null);

  // confirmation modal
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmType, setConfirmType] = useState<"receive" | "reject" | null>(null);
  const [targetRow, setTargetRow] = useState<PaymentRow | null>(null);

// row-level lock so BOTH buttons disable after confirming
const [locked, setLocked] = useState<Set<string>>(new Set());

// NEW: prevent double-submit on the confirm modal
const [confirmBusy, setConfirmBusy] = useState(false);


  /* ------------------------------ Load data ------------------------------ */
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        setMeEmail(user?.email ?? null);

        const { data: custs, error: cErr } = await supabase
          .from("customers")
          .select("id, code, name, email")
          .order("date", { ascending: false });
        if (cErr) throw cErr;

        setCustomers(
          (custs ?? []).map((c: any) => ({
            id: String(c.id),
            code: c.code ?? null,
            name: c.name ?? null,
            email: c.email ?? null,
          }))
        );

        const { data: pays, error: pErr } = await supabase
          .from("payments")
          .select(
            "id, customer_id, order_id, amount, method, cheque_number, bank_name, cheque_date, image_url, created_at, status, received_at, received_by"
          )
          .order("created_at", { ascending: false });
        if (pErr) throw pErr;

        setPayments((pays ?? []) as PaymentRow[]);
      } catch (err) {
        console.error(err);
        toast.error("Failed to load payments.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* ------------------------------ Realtime ------------------------------ */
  useEffect(() => {
    const channel = supabase.channel("admin-payments-rt");
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "payments" },
      (payload) => {
        if (payload.eventType === "INSERT") {
          setPayments((prev) => [payload.new as PaymentRow, ...prev]);
        } else if (payload.eventType === "UPDATE") {
          setPayments((prev) =>
            prev.map((p) => (p.id === (payload.new as any).id ? (payload.new as PaymentRow) : p))
          );
        } else if (payload.eventType === "DELETE") {
          setPayments((prev) => prev.filter((p) => p.id !== (payload.old as any).id));
        }
      }
    );
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  /* ------------------------------ Derived ------------------------------- */
  const customerById = useMemo(() => {
    const m = new Map<string, CustomerLite>();
    customers.forEach((c) => m.set(String(c.id), c));
    return m;
  }, [customers]);

  const filtered = useMemo(() => {
    const qx = q.trim().toLowerCase();
    return payments.filter((p) => {
      if (status !== "all" && (p.status || "pending") !== status) return false;
      if (!qx) return true;

      const c = customerById.get(String(p.customer_id));
      const hay = [
        c?.code || "",
        c?.name || "",
        c?.email || "",
        p.bank_name || "",
        p.cheque_number || "",
        p.order_id || "",
        p.amount?.toString?.() || "",
        p.method || "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(qx);
    });
  }, [payments, status, q, customerById]);

  /* ------------------------------ Helpers ------------------------------- */
  function openConfirm(type: "receive" | "reject", row: PaymentRow) {
    setConfirmType(type);
    setTargetRow(row);
    setConfirmOpen(true);
  }

  function openImage(
    url: string,
    meta?: { cheque?: string | null; bank?: string | null }
  ) {
    setImgSrc(url);
    setImgMeta(meta || null);
    setImgOpen(true);
    logActivity("View Payment Cheque", {
      payment_id: meta?.cheque || "",
      bank_name: meta?.bank || "",
      image_url: url,
    });
  }

  async function notifyCustomerByEmail(paymentId: string, action: "receive" | "reject") {
    const res = await fetch("/api/send-payment-confirmation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ paymentId, action }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || "Failed to send email.");
    }
  }

  /* ------------------------------ Actions ------------------------------- */
async function handleConfirm() {
  if (!targetRow || !confirmType) return;
  if (confirmBusy) return;                 // <-- double-click guard
  setConfirmBusy(true);

  // lock the row immediately => both buttons disable
  setLocked(prev => new Set(prev).add(targetRow.id));

        try {
if (confirmType === "receive") {
const { error: rpcErr } = await supabase.rpc("receive_payment_and_apply", {
  p_payment_id: targetRow.id,
  p_admin_email: meEmail,
});
  if (rpcErr) throw rpcErr;

  setPayments(prev =>
    prev.map(p =>
      p.id === targetRow.id
        ? { ...p, status: "received", received_at: new Date().toISOString(), received_by: meEmail }
        : p
    )
  );
  toast.success("Payment received and applied to installments.");
}

 else if (confirmType === "reject") {
      // ===== KEEP your existing REJECT logic =====
      const { data: updated, error } = await supabase
        .from("payments")
        .update({ status: "rejected" })
        .eq("id", targetRow.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!updated) {
        toast.warning("This cheque was already processed by someone else.");
        return;
      }

      setPayments(prev =>
        prev.map(p => (p.id === targetRow.id ? { ...p, status: "rejected" } : p))
      );

      toast.success("Payment rejected.");
    }
  } catch (err: any) {
    console.error(err);
    toast.error(err?.message || "Action failed.");
    // rollback row lock if DB action failed
    setLocked(prev => { const next = new Set(prev); if (targetRow) next.delete(targetRow.id); return next; });
  } finally {
    setConfirmBusy(false);                 // <-- release the guard
    setConfirmOpen(false);
    setTargetRow(null);
    setConfirmType(null);
  }
  }


  /* ---------------------------------- UI ---------------------------------- */
  const cellNowrap =
    "sticky top-0 z-10 py-3 px-3 text-left font-bold text-[13px] whitespace-nowrap";

  return (
    <div className="min-h-[calc(100vh-80px)]">
      <div className="mx-auto w-full max-w-7xl px-6 py-6">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-neutral-800">Payments</h1>
        </div>
        <p className="text-sm text-gray-600 mt-1">
          Review submitted cheques. Mark as <b>Received</b> to post the payment and deduct it from
          the customer’s balance.
        </p>

        {/* Filters */}
        <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative md:col-span-2">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search TXN / name / email / bank / cheque # …"
              className="w-full rounded-lg border border-gray-300 pl-8 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
            className="rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="received">Received</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        {/* Table */}
        <div className="mt-4 rounded-xl ring-1 ring-gray-200 bg-white overflow-hidden">
          <div className="w-full overflow-x-auto overscroll-x-contain">
            <table className="min-w-full bg-white text-sm">
              <thead className="bg-[#ffba20] text-black text-left">
                <tr>
                  <th className={cellNowrap}>Submitted</th>
                  <th className={cellNowrap}>TXN / Customer</th>
                  <th className={cellNowrap}>Amount</th>
                  <th className={cellNowrap}>Bank</th>
                  <th className={cellNowrap}>Cheque #</th>
                  <th className={cellNowrap}>Cheque Date</th>
                  <th className={cellNowrap}>Image</th>
                  <th className={cellNowrap}>Status</th>
                  <th className={cellNowrap}>Actions</th>
                </tr>
              </thead>

              <tbody className="align-middle">
                {filtered.map((p, idx) => {
                  const c = customerById.get(String(p.customer_id));
                  const code = c?.code || "—";
                  const s = (p.status || "pending").toLowerCase();

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

                  const disableAll = locked.has(p.id) || s !== "pending";

                  return (
                    <tr key={p.id} className={idx % 2 ? "bg-neutral-50" : "bg-white"}>
                      <td className="py-2.5 px-3 whitespace-nowrap">{formatPH(p.created_at)}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-mono truncate">{code}</div>
                        <div className="text-[11px] text-gray-600 truncate">
                          {c?.name || "—"} {c?.email ? `• ${c.email}` : ""}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums whitespace-nowrap">
                        {formatCurrency(p.amount)}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap truncate">{p.bank_name ?? "—"}</td>
                      <td className="py-2.5 px-3 whitespace-nowrap truncate">
                        {p.cheque_number ?? "—"}
                      </td>
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
                      <td className="py-2.5 px-3">{statusBadge}</td>
                      <td className="py-2.5 px-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => openConfirm("receive", p)}
                            disabled={disableAll}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            title={disableAll ? "Action not available" : "Mark as Received"}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            <span>Receive</span>
                          </button>
                          <button
                            onClick={() => openConfirm("reject", p)}
                            disabled={disableAll}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            title={disableAll ? "Action not available" : "Reject"}
                          >
                            <XCircle className="h-4 w-4" />
                            <span>Reject</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-neutral-400">
                      {loading ? (
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                        </span>
                      ) : (
                        "No payments found."
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-3 text-xs text-gray-500">
          Only <b>Received</b> payments are deducted from customer balances.
        </div>
      </div>

      {/* Confirm modal */}
      <Dialog open={confirmOpen} onOpenChange={(o) => setConfirmOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirmType === "receive" ? "Mark as Received" : "Reject Cheque"}
            </DialogTitle>
            <DialogDescription>
              {confirmType === "receive"
                ? "This will post the payment and deduct it from the customer’s balance."
                : "This will mark the cheque as rejected and will not deduct any balance."}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 rounded border p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Amount</span>
              <span className="font-mono font-semibold">
                {formatCurrency(targetRow?.amount || 0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Cheque #</span>
              <span className="font-mono">{targetRow?.cheque_number || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Bank</span>
              <span>{targetRow?.bank_name || "—"}</span>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              className="px-4 py-2 rounded border hover:bg-gray-50"
            >
              Cancel
            </button>
<button
  type="button"
  onClick={handleConfirm}
  disabled={confirmBusy} // or: disabled={confirmBusy /* || other conditions */}
  className={`px-4 py-2 rounded text-white ${
    confirmType === "receive"
      ? "bg-green-600 hover:bg-green-700"
      : "bg-red-600 hover:bg-red-700"
  } disabled:opacity-60 disabled:cursor-not-allowed`}
>
  {confirmBusy
    ? "Processing…"
    : confirmType === "receive"
    ? "Confirm Receive"
    : "Confirm Reject"}
</button>

          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image modal */}
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