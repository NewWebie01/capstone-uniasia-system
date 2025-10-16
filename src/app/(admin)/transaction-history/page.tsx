// app/transaction-history/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createPagesBrowserClient } from "@supabase/auth-helpers-nextjs";
import * as XLSX from "xlsx";

/* ----------------------------- Types ----------------------------- */
type OrderStatus = "pending" | "rejected" | "completed" | string;

type Transaction = {
  id: string;
  date: string;
  code: string; // generated TXN code
  customer: string | null;
  status: OrderStatus;
  total_amount: number | null;
};

/* ---------------------- PH Time Utilities ----------------------- */
const PH_OFFSET_HOURS = 8;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const addHours = (d: Date, h: number) =>
  new Date(d.getTime() + h * 3600 * 1000);

function startOfPHDay(dUTC: Date): Date {
  const msLocal = dUTC.getTime() + PH_OFFSET_HOURS * 3600 * 1000;
  const localMid = new Date(Math.floor(msLocal / MS_PER_DAY) * MS_PER_DAY);
  return new Date(localMid.getTime() - PH_OFFSET_HOURS * 3600 * 1000);
}
function endOfPHDay(dUTC: Date): Date {
  return new Date(startOfPHDay(dUTC).getTime() + MS_PER_DAY - 1);
}
function startOfPHWeek(dUTC: Date): Date {
  const start = startOfPHDay(dUTC);
  const local = addHours(start, PH_OFFSET_HOURS);
  const day = local.getUTCDay();
  const mondayDelta = (day + 6) % 7;
  const localMonday = new Date(local.getTime() - mondayDelta * MS_PER_DAY);
  return addHours(localMonday, -PH_OFFSET_HOURS);
}
function endOfPHWeek(dUTC: Date): Date {
  return new Date(startOfPHWeek(dUTC).getTime() + 7 * MS_PER_DAY - 1);
}
function startOfPHMonth(dUTC: Date): Date {
  const local = addHours(dUTC, PH_OFFSET_HOURS);
  const firstLocal = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1)
  );
  return addHours(firstLocal, -PH_OFFSET_HOURS);
}
function endOfPHMonth(dUTC: Date): Date {
  const local = addHours(dUTC, PH_OFFSET_HOURS);
  const firstNextLocal = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1)
  );
  return new Date(addHours(firstNextLocal, -PH_OFFSET_HOURS).getTime() - 1);
}
function startOfPHYear(dUTC: Date): Date {
  const local = addHours(dUTC, PH_OFFSET_HOURS);
  const firstLocal = new Date(Date.UTC(local.getUTCFullYear(), 0, 1));
  return addHours(firstLocal, -PH_OFFSET_HOURS);
}
function endOfPHYear(dUTC: Date): Date {
  const local = addHours(dUTC, PH_OFFSET_HOURS);
  const firstNextLocal = new Date(Date.UTC(local.getUTCFullYear() + 1, 0, 1));
  return new Date(addHours(firstNextLocal, -PH_OFFSET_HOURS).getTime() - 1);
}
function startOfPHDateString(yyyy_mm_dd: string): Date {
  const [y, m, d] = yyyy_mm_dd.split("-").map((n) => parseInt(n, 10));
  const localMidnightUTC = new Date(Date.UTC(y, m - 1, d));
  return addHours(localMidnightUTC, -PH_OFFSET_HOURS);
}
function endOfPHDateString(yyyy_mm_dd: string): Date {
  return new Date(startOfPHDateString(yyyy_mm_dd).getTime() + MS_PER_DAY - 1);
}
function fmtPHDateISO(d: Date) {
  return addHours(d, PH_OFFSET_HOURS).toISOString().slice(0, 10);
}
function toPHSqlNoTZ(d: Date) {
  const ph = new Date(d.getTime() + PH_OFFSET_HOURS * 3600 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const Y = ph.getUTCFullYear();
  const M = pad(ph.getUTCMonth() + 1);
  const D = pad(ph.getUTCDate());
  const h = pad(ph.getUTCHours());
  const m = pad(ph.getUTCMinutes());
  const s = pad(ph.getUTCSeconds());
  return `${Y}-${M}-${D} ${h}:${m}:${s}`;
}

/* ------------------ helpers ------------------ */
function formatDate(value: string) {
  const d = new Date(value);
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}
function formatDateTimePH(value: string) {
  const d = new Date(value);
  d.setHours(d.getHours() + PH_OFFSET_HOURS);
  return d.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Manila",
  });
}
function currency(value: number | null | undefined) {
  const n = value ?? 0;
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 2,
  });
}
function StatusBadge({ status }: { status: OrderStatus }) {
  const s = String(status).toLowerCase();
  const styles =
    s === "completed"
      ? "bg-green-100 text-green-700 border-green-200"
      : s === "rejected"
      ? "bg-red-100 text-red-700 border-red-200"
      : "bg-yellow-100 text-yellow-700 border-yellow-200";

  const label =
    s === "completed" ? "Completed" : s === "rejected" ? "Rejected" : "Pending";

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-medium ${styles}`}
    >
      {label}
    </span>
  );
}

/* ---------------------- Activity Logger ---------------------- */
const supabase = createPagesBrowserClient();

async function logActivity(action: string, details: any = {}) {
  try {
    const { data } = await supabase.auth.getUser();
    const userEmail = data?.user?.email || "";
    let userRole = "admin";
    if (userEmail) {
      const { data: u } = await supabase
        .from("users")
        .select("role")
        .eq("email", userEmail)
        .single();
      if (u?.role) userRole = u.role;
    }
    await supabase.from("activity_logs").insert([
      {
        user_email: userEmail,
        user_role: userRole,
        action,
        details,
        created_at: new Date().toISOString(),
      },
    ]);
  } catch {}
}

/* --------------------------- Page --------------------------- */
export default function TransactionHistoryPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Export modal state
  type ExportChoice =
    | "today"
    | "this_week"
    | "this_month"
    | "this_year"
    | "custom"
    | "all";
  const [showExport, setShowExport] = useState(false);
  const [exportChoice, setExportChoice] = useState<ExportChoice>("today");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  // --- Re-auth (password gate) ---
  const [showReauth, setShowReauth] = useState(false);
  const [reauthEmail, setReauthEmail] = useState<string>("");
  const [reauthPassword, setReauthPassword] = useState("");
  const [reauthing, setReauthing] = useState(false);
  const [reauthError, setReauthError] = useState("");
  const [lastReauthAt, setLastReauthAt] = useState<number | null>(null);
  const REAUTH_TTL_MS = 0.5 * 60 * 1000;
  const needsReauth = () =>
    !lastReauthAt || Date.now() - lastReauthAt > REAUTH_TTL_MS;

  // Activity: On page load
  useEffect(() => {
    logActivity("Visited Transaction History Page");
  }, []);

  // Load initial list (COMPLETED ONLY)
  useEffect(() => {
    async function load() {
      setLoading(true);

      const { data, error } = await supabase
        .from("orders")
        .select(
          `
          id,
          date_created,
          total_amount,
          status,
          customers (
            name
          )
        `
        )
        .eq("status", "completed") // <<< Completed-only filter
        .order("date_created", { ascending: false });

      if (error) {
        setTransactions([]);
        setLoading(false);
        return;
      }

      const rows: Transaction[] = (data ?? []).map((o: any) => {
        const date = new Date(o.date_created);
        const dateCode = date.toISOString().split("T")[0].replace(/-/g, "");
        const shortId = String(o.id).split("-")[0].toUpperCase();
        const txnCode = `TXN-${dateCode}-${shortId}`;
        return {
          id: String(o.id),
          date: o.date_created,
          code: txnCode,
          customer: o?.customers?.name ?? "—",
          status: (o?.status ?? "pending") as OrderStatus,
          total_amount: o.total_amount ?? null,
        };
      });

      setTransactions(rows);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return transactions;
    return transactions.filter((t) =>
      [
        formatDate(t.date),
        t.code ?? "",
        t.customer ?? "",
        t.status,
        currency(t.total_amount),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [searchQuery, transactions]);

  /* ---------------------- Export Helpers ---------------------- */
  function describeRangeLabel(choice: ExportChoice, s?: Date, e?: Date) {
    switch (choice) {
      case "today":
        return `TODAY_${fmtPHDateISO(s!)}`;
      case "this_week":
        return `THIS_WEEK_${fmtPHDateISO(s!)}_to_${fmtPHDateISO(e!)}`;
      case "this_month":
        return `THIS_MONTH_${fmtPHDateISO(s!)}_to_${fmtPHDateISO(e!)}`;
      case "this_year":
        return `THIS_YEAR_${fmtPHDateISO(s!)}_to_${fmtPHDateISO(e!)}`;
      case "custom":
        return `CUSTOM_${fmtPHDateISO(s!)}_to_${fmtPHDateISO(e!)}`;
      default:
        return "ALL";
    }
  }

  function resolveRange(): { start?: Date; end?: Date; label: string } {
    const now = new Date();
    if (exportChoice === "all") return { label: "ALL" };

    if (exportChoice === "today") {
      const s = startOfPHDay(now);
      const e = endOfPHDay(now);
      return { start: s, end: e, label: describeRangeLabel("today", s, e) };
    }
    if (exportChoice === "this_week") {
      const s = startOfPHWeek(now);
      const e = endOfPHWeek(now);
      return { start: s, end: e, label: describeRangeLabel("this_week", s, e) };
    }
    if (exportChoice === "this_month") {
      const s = startOfPHMonth(now);
      const e = endOfPHMonth(now);
      return {
        start: s,
        end: e,
        label: describeRangeLabel("this_month", s, e),
      };
    }
    if (exportChoice === "this_year") {
      const s = startOfPHYear(now);
      const e = endOfPHYear(now);
      return { start: s, end: e, label: describeRangeLabel("this_year", s, e) };
    }
    if (!customStart || !customEnd) return { label: "CUSTOM_INVALID" };
    const s = startOfPHDateString(customStart);
    const e = endOfPHDateString(customEnd);
    return { start: s, end: e, label: describeRangeLabel("custom", s, e) };
  }

  // --- Logging on search ---
  function handleSearchInput(e: React.ChangeEvent<HTMLInputElement>) {
    setSearchQuery(e.target.value);
    if (e.target.value.trim()) {
      logActivity("Searched Transaction History", { query: e.target.value });
    }
  }

  // --- Logging on opening Export modal ---
  function openExportModal() {
    setShowExport(true);
    logActivity("Opened Export Transaction History Modal");
  }

  // --- Logging on cancel Export modal ---
  function cancelExportModal() {
    setShowExport(false);
    setExportChoice("today");
    setCustomStart("");
    setCustomEnd("");
    setExportError("");
    logActivity("Canceled Transaction History Export Modal");
  }

  // Gate: ask for password unless recently verified
  async function handleExportNow() {
    setExportError("");
    if (needsReauth()) {
      const { data } = await supabase.auth.getUser();
      setReauthEmail(data?.user?.email || "");
      setShowReauth(true);
      return;
    }
    await doExportNow();
  }

  async function confirmReauth() {
    setReauthError("");
    setReauthing(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: reauthEmail,
        password: reauthPassword,
      });
      if (error) throw error;

      setLastReauthAt(Date.now());
      setShowReauth(false);
      setReauthPassword("");

      await doExportNow();
    } catch (e: any) {
      setReauthError(e?.message || "Authentication failed.");
    } finally {
      setReauthing(false);
    }
  }

  async function doExportNow() {
    setExporting(true);
    try {
      const { start, end, label } = resolveRange();

      let q = supabase
        .from("orders")
        .select(
          `
    id,
    date_created,
    total_amount,
    status,
    customers(name)
  `
        )
        .eq("status", "completed") // <<< Completed-only filter for export
        .order("date_created", { ascending: false });

      if (exportChoice !== "all") {
        if (!start || !end) {
          setExportError("Please provide a valid date range.");
          setExporting(false);
          return;
        }
        const endExclusive = new Date(end.getTime() + 1);
        const startPH = toPHSqlNoTZ(start);
        const endPH = toPHSqlNoTZ(endExclusive);
        q = q.gte("date_created", startPH).lt("date_created", endPH);
      }

      const { data, error } = await q;
      if (error) throw error;

      const rows = (data ?? []).map((o: any) => {
        const date = new Date(o.date_created);
        const dateCode = date.toISOString().split("T")[0].replace(/-/g, "");
        const shortId = String(o.id).split("-")[0].toUpperCase();
        const txnCode = `TXN-${dateCode}-${shortId}`;
        return [
          txnCode,
          o?.customers?.name ?? "—",
          (o?.status ?? "pending") as string,
          currency(o.total_amount ?? 0),
          formatDateTimePH(o.date_created),
        ];
      });

      const headers = [
        "Transaction Code",
        "Customer",
        "Status",
        "Total Amount (PHP)",
        "Created (PH)",
      ];
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Transactions");

      const todayStamp = new Date().toISOString().slice(0, 10);
      const safeLabel = label.replace(/[^\w\-]+/g, "_");
      XLSX.writeFile(wb, `Transaction_History_${safeLabel}_${todayStamp}.xlsx`);

      // ---- Log export activity ----
      await logActivity(
        exportChoice === "all"
          ? "Exported Transaction History (Completed Only, ALL)"
          : `Exported Transaction History (Completed Only, ${label})`,
        {
          rows: rows.length,
          filter: exportChoice,
          completed_only: true,
          ...(exportChoice !== "all"
            ? {
                start_utc: start?.toISOString(),
                end_utc: end?.toISOString(),
              }
            : {}),
        }
      );

      setShowExport(false);
    } catch (err: any) {
      setExportError(err?.message || "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  /* ---------------------------- UI ---------------------------- */
  return (
    <div className="px-4 pb-4 pt-1">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="pt-1 text-3xl font-bold mb-1">Transaction History</h1>
          <p className="text-sm text-gray-500 mb-2">
            View <span className="font-medium">completed</span> orders with
            their totals, search, and export by time frame.
          </p>
        </div>
      </div>

      <input
        type="search"
        aria-label="Search by date, code, customer, status, or amount"
        placeholder="Search by date, code, customer, status, or amount…"
        value={searchQuery}
        onChange={handleSearchInput}
        className="border px-4 py-2 mb-4 w-full md:w-1/2 rounded-full"
      />

      <button
        className="h-10 px-4 rounded-xl border bg-black text-white hover:opacity-90 text-sm shrink-0"
        onClick={openExportModal}
      >
        Export
      </button>

      <div className="overflow-x-auto rounded-lg shadow bg-white mt-3">
        <table className="min-w-full text-sm">
          <thead className="bg-[#ffba20] text-black text-left">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Transaction Code</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Total Amount</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-6 text-center text-gray-500" colSpan={5}>
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-center text-gray-500" colSpan={5}>
                  No completed transactions found.
                </td>
              </tr>
            ) : (
              filtered.map((t) => (
                <tr key={t.id} className="border-b hover:bg-gray-100">
                  <td className="px-4 py-3">{formatDate(t.date)}</td>
                  <td className="px-4 py-3">{t.code}</td>
                  <td className="px-4 py-3">{t.customer}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {currency(t.total_amount)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Export modal */}
      {showExport && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg">
            <h3 className="text-base font-semibold mb-2 text-center">
              Export Transaction History
            </h3>
            <p className="text-sm text-gray-700 text-center mb-4">
              Choose a time frame (PH timezone). <br />
              <span className="text-xs text-gray-500">
                *Only <strong>Completed</strong> orders are included.
              </span>
            </p>

            <div className="space-y-3 mb-4">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: "today", label: "Today" },
                  { key: "this_week", label: "This Week" },
                  { key: "this_month", label: "This Month" },
                  { key: "this_year", label: "This Year" },
                  { key: "custom", label: "Custom Range" },
                  { key: "all", label: "All" },
                ].map((opt) => (
                  <label
                    key={opt.key}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer ${
                      exportChoice === (opt.key as ExportChoice)
                        ? "border-black bg-gray-50"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="exportChoice"
                      value={opt.key}
                      checked={exportChoice === (opt.key as ExportChoice)}
                      onChange={() => setExportChoice(opt.key as ExportChoice)}
                    />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                ))}
              </div>

              {exportChoice === "custom" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">
                      Start date (PH)
                    </label>
                    <input
                      type="date"
                      className="border rounded-lg px-3 py-2 w-full"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">
                      End date (PH)
                    </label>
                    <input
                      type="date"
                      className="border rounded-lg px-3 py-2 w-full"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {exportError && (
                <div className="text-xs text-red-600">{exportError}</div>
              )}
            </div>

            <div className="flex gap-3 justify-center">
              <button
                className="px-4 py-2 rounded bg-black text-white hover:opacity-90 text-sm disabled:opacity-50"
                onClick={handleExportNow}
                disabled={
                  exporting ||
                  (exportChoice === "custom" && (!customStart || !customEnd))
                }
              >
                {exporting ? "Exporting…" : "Export Now"}
              </button>
              <button
                className="px-4 py-2 rounded bg-gray-100 hover:bg-gray-200 text-sm"
                onClick={cancelExportModal}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Re-auth modal */}
      {showReauth && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <h3 className="text-base font-semibold mb-2 text-center">
              Confirm Your Identity
            </h3>
            <p className="text-sm text-gray-700 text-center mb-4">
              For security, please re-enter your password to export
              transactions.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={reauthEmail}
                  disabled
                  aria-disabled="true"
                  tabIndex={-1}
                  className="border rounded-lg px-3 py-2 w-full bg-gray-100 text-gray-500 cursor-not-allowed opacity-70"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  className="border rounded-lg px-3 py-2 w-full"
                  value={reauthPassword}
                  onChange={(e) => setReauthPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoFocus
                />
              </div>
              {reauthError && (
                <div className="text-xs text-red-600">{reauthError}</div>
              )}
            </div>

            <div className="flex gap-3 justify-center mt-5">
              <button
                className="px-4 py-2 rounded bg-black text-white hover:opacity-90 text-sm disabled:opacity-50"
                onClick={confirmReauth}
                disabled={reauthing || !reauthPassword}
              >
                {reauthing ? "Verifying…" : "Verify & Continue"}
              </button>
              <button
                className="px-4 py-2 rounded bg-gray-100 hover:bg-gray-200 text-sm"
                onClick={() => {
                  setShowReauth(false);
                  setReauthPassword("");
                  setReauthError("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
