// src/app/admin/payments/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import supabase from "@/config/supabaseClient";
import { toast } from "sonner";
import { CheckCircle2, XCircle, FileImage, Search, Loader2, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

/* ----------------------------- Config ----------------------------- */
const BUCKET = "payments-deposit-slips";

/* ----------------------------- Formatters ----------------------------- */
const formatCurrency = (n: number) =>
  (Number(n) || 0).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  });

const formatPH = (
  d?: string | number | Date | null,
  opts: "date" | "datetime" = "date"
) =>
  d
    ? new Intl.DateTimeFormat("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
        ...(opts === "datetime" ? { hour: "numeric", minute: "2-digit", hour12: true } : {}),
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
  order_id: string | null;
  amount: number;
  method: string | null;        // "Deposit Slip" | "Cash" | legacy "Cheque"
  cheque_number: string | null; // used for slip #
  bank_name: string | null;
  cheque_date: string | null;   // deposit date
  image_url: string | null;
  created_at: string | null;
  status?: string | null;       // 'pending' | 'received' | 'rejected'
  received_at?: string | null;
  received_by?: string | null;
};

type CustomerLite = {
  id: string;
  code: string | null; // TXN / customer code
  name: string | null;
  email: string | null; // lowercase
};

/* ---------------- Helpers ---------------- */
function displayMethod(method?: string | null) {
  const m = (method || "").trim();
  if (/^cheque$/i.test(m)) return "Deposit Slip"; // map legacy term
  return m || "—";
}

/* ---------------- Customer notifications (to Customer) via API ---------------- */
async function createCustomerNotifPaymentReceived(paymentId: string, adminEmail: string | null) {
  try {
    const res = await fetch("/api/customer-notifications/payment-received", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentId, adminEmail }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j?.error || "API failed");
    }
  } catch (e: any) {
    console.error("[notif] API error:", e?.message || e);
    toast.error(`Couldn't create customer notification: ${e?.message || "API error"}`);
  }
}

export default function AdminPaymentsPage() {
  const [loading, setLoading] = useState(true);
  const [meEmail, setMeEmail] = useState<string | null>(null);

  const [customers, setCustomers] = useState<CustomerLite[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);

  // filters
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "pending" | "received" | "rejected">("pending");

  // pagination (client-side)
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // image modal
  const [imgOpen, setImgOpen] = useState(false);
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [imgMeta, setImgMeta] = useState<{ slip?: string | null; bank?: string | null } | null>(null);

  // confirmation modal
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmType, setConfirmType] = useState<"receive" | "reject" | null>(null);
  const [targetRow, setTargetRow] = useState<PaymentRow | null>(null);

  // row-level lock so BOTH buttons disable after confirming
  const [locked, setLocked] = useState<Set<string>>(new Set());

  // prevent double-submit on the confirm modal
  const [confirmBusy, setConfirmBusy] = useState(false);

  // -------- New Deposit Slip modal state --------
  const [newOpen, setNewOpen] = useState(false);
  const [newBusy, setNewBusy] = useState(false);
  const [selCustomerId, setSelCustomerId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [bank, setBank] = useState<string>("");
  const [slip, setSlip] = useState<string>("");
  const [depDate, setDepDate] = useState<string>(""); // yyyy-mm-dd
  const [file, setFile] = useState<File | null>(null);

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
            email: c.email ? String(c.email).toLowerCase() : null,
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

  /* ------------------ Autofill Amount from latest TXN ------------------ */
  useEffect(() => {
    if (!selCustomerId) return;

    (async () => {
      try {
        // Latest order for this customer
        const { data: order, error: oErr } = await supabase
          .from("orders")
          .select("id, grand_total, created_at, status")
          .eq("customer_id", selCustomerId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (oErr || !order) {
          setAmount("");
          return;
        }

        // Sum of RECEIVED payments for that order
        const { data: pays, error: pErr } = await supabase
          .from("payments")
          .select("amount")
          .eq("order_id", order.id)
          .eq("status", "received");

        const paid = pErr ? 0 : (pays ?? []).reduce((sum, r: any) => sum + Number(r.amount || 0), 0);
        const remaining = Math.max(0, Number(order.grand_total || 0) - paid);

        setAmount(
          (remaining > 0 ? remaining : Number(order.grand_total || 0)).toFixed(2)
        );
      } catch (e) {
        console.error(e);
        // leave manual
      }
    })();
  }, [selCustomerId]);

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
      const dispMethod = displayMethod(p.method);
      const hay = [
        c?.code || "",
        c?.name || "",
        c?.email || "",
        p.bank_name || "",
        p.cheque_number || "",
        p.order_id || "",
        p.amount?.toString?.() || "",
        dispMethod,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(qx);
    });
  }, [payments, status, q, customerById]);

  // reset to page 1 whenever filters change
  useEffect(() => {
    setPage(1);
  }, [q, status]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageStart = (page - 1) * pageSize;
  const pageEnd = pageStart + pageSize;
  const paginated = filtered.slice(pageStart, pageEnd);

  /* ------------------------------ Helpers ------------------------------- */
  function openConfirm(type: "receive" | "reject", row: PaymentRow) {
    setConfirmType(type);
    setTargetRow(row);
    setConfirmOpen(true);
  }

  function openImage(url: string, meta?: { slip?: string | null; bank?: string | null }) {
    setImgSrc(url);
    setImgMeta(meta || null);
    setImgOpen(true);
    logActivity("View Payment Deposit Slip", {
      slip_number: meta?.slip || "",
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

  /* ------------------------------ Create Payment (Upload) ------------------------------- */
  function resetNewForm() {
    setSelCustomerId("");
    setAmount("");
    setBank("");
    setSlip("");
    setDepDate("");
    setFile(null);
  }

  async function handleCreatePayment() {
    if (!selCustomerId) {
      toast.error("Select a customer.");
      return;
    }
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast.error("Enter a valid amount.");
      return;
    }
    if (!bank.trim()) {
      toast.error("Enter bank name.");
      return;
    }
    if (!slip.trim()) {
      toast.error("Enter slip number.");
      return;
    }
    if (!depDate) {
      toast.error("Choose deposit date.");
      return;
    }
    if (!file) {
      toast.error("Attach an image of the deposit slip.");
      return;
    }

    setNewBusy(true);
    try {
      // 1) Upload to Storage
      const ext = file.name.split(".").pop() || "jpg";
      const key = `slips/${selCustomerId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: upErr } = await supabase.storage.from(BUCKET).upload(key, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || "image/jpeg",
      });
      if (upErr) throw upErr;

      // 2) Get public URL
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(key);
      const imageUrl = pub?.publicUrl || null;

      // 3) Insert pending payment (no order_id; your RPC will handle application)
      const payload = {
        customer_id: selCustomerId,
        order_id: null,
        amount: amt,
        method: "Deposit Slip",
        bank_name: bank.trim(),
        cheque_number: slip.trim(), // using legacy column
        cheque_date: new Date(depDate).toISOString(),
        image_url: imageUrl,
        status: "pending" as const,
        created_at: new Date().toISOString(),
      };

      const { data: inserted, error: insErr } = await supabase
        .from("payments")
        .insert(payload)
        .select("id")
        .maybeSingle();
      if (insErr) throw insErr;

      toast.success("Deposit slip uploaded. Payment is now pending.");
      await logActivity("Upload Deposit Slip", { ...payload, id: inserted?.id });

      setNewOpen(false);
      resetNewForm();
      // Realtime will add the new row to the table
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to upload deposit slip.");
    } finally {
      setNewBusy(false);
    }
  }

  /* ------------------------------ Actions (Confirm) ------------------------------- */
  async function handleConfirm() {
    if (!targetRow || !confirmType) return;
    if (confirmBusy) return;
    setConfirmBusy(true);

    // lock the row immediately => both buttons disable
    setLocked((prev) => new Set(prev).add(targetRow.id));

    try {
      if (confirmType === "receive") {
        const { error: rpcErr } = await supabase.rpc("receive_payment_and_apply", {
          p_payment_id: targetRow.id,
          p_admin_email: meEmail,
        });
        if (rpcErr) throw rpcErr;

        setPayments((prev) =>
          prev.map((p) =>
            p.id === targetRow.id
              ? {
                  ...p,
                  status: "received",
                  received_at: new Date().toISOString(),
                  received_by: meEmail,
                }
              : p
          )
        );

        toast.success("Payment received and applied to installments.");

        await createCustomerNotifPaymentReceived(targetRow.id, meEmail);
        // optional email:
        // await notifyCustomerByEmail(targetRow.id, "receive");
      } else if (confirmType === "reject") {
        const { data: updated, error } = await supabase
          .from("payments")
          .update({ status: "rejected" })
          .eq("id", targetRow.id)
          .eq("status", "pending")
          .select("id")
          .maybeSingle();

        if (error) throw error;
        if (!updated) {
          toast.warning("This deposit slip was already processed by someone else.");
          return;
        }

        setPayments((prev) =>
          prev.map((p) => (p.id === targetRow.id ? { ...p, status: "rejected" } : p))
        );

        toast.success("Payment rejected.");
        // optional email:
        // await notifyCustomerByEmail(targetRow.id, "reject");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Action failed.");
      setLocked((prev) => {
        const next = new Set(prev);
        if (targetRow) next.delete(targetRow.id);
        return next;
      });
    } finally {
      setConfirmBusy(false);
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
        {/* Header with button moved under, left-aligned */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-800">Payments</h1>
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setNewOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-[#ffba20] px-3 py-2 text-sm font-bold text-black hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#ffba20]/60 w-fit"
              title="Upload a new deposit slip"
            >
              <Upload className="h-4 w-4" />
              New Deposit Slip
            </button>
          </div>
        </div>

        <p className="text-sm text-gray-600 mt-3">
          Review submitted <b>deposit slips</b>. Mark as <b>Received</b> to post the payment and deduct it from
          the customer’s balance.
        </p>

        {/* Filters */}
        <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative md:col-span-2">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search TXN / name / email / bank / slip # …"
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

        {/* Pagination header */}
        <div className="flex items-center justify-between mt-4">
          <div className="text-sm text-slate-600">
            {loading ? "Loading…" : `Showing ${paginated.length} of ${filtered.length} filtered payments`}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="px-3 py-1.5 rounded border disabled:opacity-50"
            >
              Prev
            </button>
            <span className="text-sm">
              Page {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="px-3 py-1.5 rounded border disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="mt-3 rounded-xl ring-1 ring-gray-200 bg-white overflow-hidden">
          <div className="w-full overflow-x-auto overscroll-x-contain">
            <table className="min-w-full bg-white text-sm">
              <thead className="bg-[#ffba20] text-black text-left">
                <tr>
                  <th className={cellNowrap}>Submitted</th>
                  <th className={cellNowrap}>TXN / Customer</th>
                  <th className={cellNowrap}>Amount</th>
                  <th className={cellNowrap}>Bank</th>
                  <th className={cellNowrap}>Slip #</th>
                  <th className={cellNowrap}>Deposit Date</th>
                  <th className={cellNowrap}>Image</th>
                  <th className={cellNowrap}>Status</th>
                  <th className={cellNowrap}>Actions</th>
                </tr>
              </thead>

              <tbody className="align-middle">
                {paginated.map((p, idx) => {
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
                      {/* Date only */}
                      <td className="py-2.5 px-3 whitespace-nowrap">{formatPH(p.created_at, "date")}</td>

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
                      <td className="py-2.5 px-3 whitespace-nowrap truncate">{p.cheque_number ?? "—"}</td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {p.cheque_date ? formatPH(p.cheque_date, "date") : "—"}
                      </td>
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

                {paginated.length === 0 && (
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

        {/* Pagination footer */}
        <div className="flex items-center justify-between mt-4">
          <div className="text-xs text-gray-500">
            Only <b>Received</b> payments are deducted from customer balances.
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="px-3 py-1.5 rounded border disabled:opacity-50"
            >
              Prev
            </button>
            <span className="text-sm">
              Page {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="px-3 py-1.5 rounded border disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Confirm modal */}
      <Dialog open={confirmOpen} onOpenChange={(o) => setConfirmOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirmType === "receive" ? "Mark as Received" : "Reject Deposit Slip"}
            </DialogTitle>
            <DialogDescription>
              {confirmType === "receive"
                ? "This will post the payment and deduct it from the customer’s balance."
                : "This will mark the deposit slip as rejected and will not deduct any balance."}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 rounded border p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Amount</span>
              <span className="font-mono font-semibold">{formatCurrency(targetRow?.amount || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Slip #</span>
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
              disabled={confirmBusy}
              className="ml-2 px-4 py-2 rounded bg-[#ffba20] text-black font-bold text-sm hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#ffba20]/60 disabled:opacity-60 disabled:cursor-not-allowed"
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
            <DialogTitle>Deposit Slip Image</DialogTitle>
            <DialogDescription className="text-xs">
              {imgMeta?.bank ? `Bank: ${imgMeta.bank}` : ""} {imgMeta?.slip ? `• Slip #: ${imgMeta.slip}` : ""}
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

      {/* New Deposit Slip modal */}
      <Dialog open={newOpen} onOpenChange={(o) => { setNewOpen(o); if (!o) resetNewForm(); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Upload Deposit Slip</DialogTitle>
            <DialogDescription>
              Create a new pending payment by uploading a customer’s bank deposit slip.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {/* Customer */}
            <div className="grid grid-cols-3 gap-2 items-center">
              <label className="text-sm text-gray-600">Customer</label>
              <div className="col-span-2">
                <select
                  value={selCustomerId}
                  onChange={(e) => setSelCustomerId(e.target.value)}
                  className="w-full rounded border px-3 py-2"
                >
                  <option value="">— Select customer —</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {(c.code ? `${c.code} — ` : "") + (c.name || c.email || c.id)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Amount (auto-filled from latest TXN) */}
            <div className="grid grid-cols-3 gap-2 items-center">
              <label className="text-sm text-gray-600">Amount</label>
              <div className="col-span-2">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded border px-3 py-2"
                />
                <p className="mt-1 text-xs text-gray-500">Auto-filled from latest TXN (remaining balance if available).</p>
              </div>
            </div>

            {/* Bank */}
            <div className="grid grid-cols-3 gap-2 items-center">
              <label className="text-sm text-gray-600">Bank</label>
              <div className="col-span-2">
                <input
                  value={bank}
                  onChange={(e) => setBank(e.target.value)}
                  placeholder="e.g., BDO, BPI"
                  className="w-full rounded border px-3 py-2"
                />
              </div>
            </div>

            {/* Slip # */}
            <div className="grid grid-cols-3 gap-2 items-center">
              <label className="text-sm text-gray-600">Slip #</label>
              <div className="col-span-2">
                <input
                  value={slip}
                  onChange={(e) => setSlip(e.target.value)}
                  placeholder="Deposit slip reference number"
                  className="w-full rounded border px-3 py-2"
                />
              </div>
            </div>

            {/* Deposit Date */}
            <div className="grid grid-cols-3 gap-2 items-center">
              <label className="text-sm text-gray-600">Deposit Date</label>
              <div className="col-span-2">
                <input
                  type="date"
                  value={depDate}
                  onChange={(e) => setDepDate(e.target.value)}
                  className="w-full rounded border px-3 py-2"
                />
              </div>
            </div>

            {/* Image */}
            <div className="grid grid-cols-3 gap-2 items-center">
              <label className="text-sm text-gray-600">Image</label>
              <div className="col-span-2">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="w-full rounded border px-3 py-2 file:mr-3 file:rounded file:border-0 file:bg-gray-100 file:px-3 file:py-2"
                />
                <p className="mt-1 text-xs text-gray-500">Accepted: JPG/PNG/WebP. Max ~5–10MB (per project limits).</p>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <button
              type="button"
              onClick={() => { setNewOpen(false); resetNewForm(); }}
              className="px-4 py-2 rounded border hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreatePayment}
              disabled={newBusy}
              className="ml-2 px-4 py-2 rounded bg-[#ffba20] text-black font-bold text-sm hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#ffba20]/60 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {newBusy ? "Uploading…" : "Upload"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
