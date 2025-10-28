// app/transaction-history/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPagesBrowserClient } from "@supabase/auth-helpers-nextjs";
import * as XLSX from "xlsx";

/* ----------------------------- Types ----------------------------- */
type OrderStatus = "pending" | "rejected" | "completed" | string;

type Transaction = {
  id: string;
  date: string; // v_transaction_history_full.date_completed
  code: string; // v_transaction_history_full.transaction_code
  customer: string | null; // v_transaction_history_full.customer_name
  status: OrderStatus; // v_transaction_history_full.status
  total: number | null; // v_transaction_history_full.grand_total_with_interest
};

/* ---------------------- PH Time Utilities ----------------------- */
const PH_OFFSET_HOURS = 8;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const addHours = (d: Date, h: number) =>
  new Date(d.getTime() + h * 3600 * 1000);

function startOfPHDay(dUTC: Date) {
  const msLocal = dUTC.getTime() + PH_OFFSET_HOURS * 3600 * 1000;
  const localMid = new Date(Math.floor(msLocal / MS_PER_DAY) * MS_PER_DAY);
  return new Date(localMid.getTime() - PH_OFFSET_HOURS * 3600 * 1000);
}
function endOfPHDay(dUTC: Date) {
  return new Date(startOfPHDay(dUTC).getTime() + MS_PER_DAY - 1);
}
function startOfPHWeek(dUTC: Date) {
  const start = startOfPHDay(dUTC);
  const local = addHours(start, PH_OFFSET_HOURS);
  const day = local.getUTCDay();
  const mondayDelta = (day + 6) % 7;
  const localMonday = new Date(local.getTime() - mondayDelta * MS_PER_DAY);
  return addHours(localMonday, -PH_OFFSET_HOURS);
}
function endOfPHWeek(dUTC: Date) {
  return new Date(startOfPHWeek(dUTC).getTime() + 7 * MS_PER_DAY - 1);
}
function startOfPHMonth(dUTC: Date) {
  const local = addHours(dUTC, PH_OFFSET_HOURS);
  const firstLocal = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1)
  );
  return addHours(firstLocal, -PH_OFFSET_HOURS);
}
function endOfPHMonth(dUTC: Date) {
  const local = addHours(dUTC, PH_OFFSET_HOURS);
  const firstNextLocal = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1)
  );
  return new Date(addHours(firstNextLocal, -PH_OFFSET_HOURS).getTime() - 1);
}
function startOfPHYear(dUTC: Date) {
  const local = addHours(dUTC, PH_OFFSET_HOURS);
  const firstLocal = new Date(Date.UTC(local.getUTCFullYear(), 0, 1));
  return addHours(firstLocal, -PH_OFFSET_HOURS);
}
function endOfPHYear(dUTC: Date) {
  const local = addHours(dUTC, PH_OFFSET_HOURS);
  const firstNextLocal = new Date(Date.UTC(local.getUTCFullYear() + 1, 0, 1));
  return new Date(addHours(firstNextLocal, -PH_OFFSET_HOURS).getTime() - 1);
}
function startOfPHDateString(yyyy_mm_dd: string) {
  const [y, m, d] = yyyy_mm_dd.split("-").map((n) => parseInt(n, 10));
  const localMidnightUTC = new Date(Date.UTC(y, m - 1, d));
  return addHours(localMidnightUTC, -PH_OFFSET_HOURS);
}
function endOfPHDateString(yyyy_mm_dd: string) {
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

  // Pagination (10 per page)
  const ITEMS_PER_PAGE = 10;
  const [currentPage, setCurrentPage] = useState(1);

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

  // Debounced refetch timer for realtime
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshSoon = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      loadTransactions();
    }, 400);
  }, []);

  // Shared loader so Realtime can reuse it
  const loadTransactions = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("v_transaction_history_full")
      .select(
        `
        id,
        date_completed,
        transaction_code,
        customer_name,
        status,
        grand_total_with_interest
      `
      )
      .order("date_completed", { ascending: false });

    if (error) {
      console.error("Error loading transactions:", error.message);
      setTransactions([]);
    } else {
      const rows: Transaction[] = (data ?? []).map((o: any) => ({
        id: String(o.id),
        date: o.date_completed,
        code: o.transaction_code ?? "",
        customer: o.customer_name ?? "—",
        status: (o.status ?? "completed") as OrderStatus,
        total: o.grand_total_with_interest ?? null,
      }));
      setTransactions(rows);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    logActivity("Visited Transaction History Page");
  }, []);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadTransactions();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [loadTransactions]);

  // Realtime: listen on ORDERS (source of the view) and refetch the view
  useEffect(() => {
    // We refetch on any INSERT/UPDATE/DELETE because status/paid_amount/total can change the view membership.
    const channel = supabase
      .channel("txn-history-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        () => refreshSoon()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        () => refreshSoon()
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "orders" },
        () => refreshSoon()
      )
      .subscribe();

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      supabase.removeChannel(channel);
    };
  }, [refreshSoon]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return transactions;
    return transactions.filter((t) =>
      [
        formatDate(t.date),
        t.code ?? "",
        t.customer ?? "",
        t.status,
        currency(t.total),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [searchQuery, transactions]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, transactions]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE)),
    [filtered.length]
  );
  const pageStartIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginated = useMemo(
    () => filtered.slice(pageStartIndex, pageStartIndex + ITEMS_PER_PAGE),
    [filtered, pageStartIndex]
  );

  /* ---------------------------- UI ---------------------------- */
  return (
    <div className="px-4 pb-4 pt-1">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="pt-1 text-3xl font-bold mb-1">Transaction History</h1>
          <p className="text-sm text-gray-500 mb-2">
            View <span className="font-medium">completed & fully-paid</span>{" "}
            orders. Search and export by time frame.
          </p>
        </div>
      </div>

      <input
        type="search"
        aria-label="Search by date, code, customer, status, or total"
        placeholder="Search by date, code, customer, status, or total…"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="border px-4 py-2 mb-4 w-full md:w-1/2 rounded-full"
      />

      <button
        className="h-10 px-4 rounded-xl border bg-black text-white hover:opacity-90 text-sm shrink-0"
        onClick={() => {
          setShowExport(true);
          logActivity("Opened Export Transaction History Modal");
        }}
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
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="text-center py-6 text-gray-500">
                  Loading…
                </td>
              </tr>
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-6 text-gray-500">
                  No fully paid transactions found.
                </td>
              </tr>
            ) : (
              paginated.map((t) => (
                <tr key={t.id} className="border-b hover:bg-gray-100">
                  <td className="px-4 py-3">{formatDate(t.date)}</td>
                  <td className="px-4 py-3">{t.code}</td>
                  <td className="px-4 py-3">{t.customer}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-3 text-right">{currency(t.total)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t text-sm">
          <div className="text-gray-600">
            Showing{" "}
            <span className="font-medium">
              {filtered.length === 0 ? 0 : pageStartIndex + 1}
            </span>{" "}
            to{" "}
            <span className="font-medium">
              {Math.min(pageStartIndex + ITEMS_PER_PAGE, filtered.length)}
            </span>{" "}
            of <span className="font-medium">{filtered.length}</span> entries
          </div>

          <div className="flex items-center gap-1">
            <button
              className="px-3 py-1.5 rounded border bg-white hover:bg-gray-50 disabled:opacity-50"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              ← Prev
            </button>
            <span className="px-2">
              Page <strong>{currentPage}</strong> of{" "}
              <strong>{totalPages}</strong>
            </span>
            <button
              className="px-3 py-1.5 rounded border bg-white hover:bg-gray-50 disabled:opacity-50"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              Next →
            </button>
          </div>
        </div>
      </div>

      {/* Export modal */}
      {showExport && (
        <ExportModal
          exportChoice={exportChoice}
          setExportChoice={setExportChoice}
          customStart={customStart}
          setCustomStart={setCustomStart}
          customEnd={customEnd}
          setCustomEnd={setCustomEnd}
          exportError={exportError}
          setExportError={setExportError}
          exporting={exporting}
          onExport={handleExportNow}
          onCancel={() => {
            setShowExport(false);
            setExportChoice("today");
            setCustomStart("");
            setCustomEnd("");
            setExportError("");
            logActivity("Canceled Transaction History Export Modal");
          }}
        />
      )}
    </div>
  );

  /* ---------------------- handlers ---------------------- */
  async function handleExportNow() {
    setExportError("");
    await doExportNow();
  }

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
      const s = startOfPHDay(now),
        e = endOfPHDay(now);
      return { start: s, end: e, label: describeRangeLabel("today", s, e) };
    }
    if (exportChoice === "this_week") {
      const s = startOfPHWeek(now),
        e = endOfPHWeek(now);
      return { start: s, end: e, label: describeRangeLabel("this_week", s, e) };
    }
    if (exportChoice === "this_month") {
      const s = startOfPHMonth(now),
        e = endOfPHMonth(now);
      return {
        start: s,
        end: e,
        label: describeRangeLabel("this_month", s, e),
      };
    }
    if (exportChoice === "this_year") {
      const s = startOfPHYear(now),
        e = endOfPHYear(now);
      return { start: s, end: e, label: describeRangeLabel("this_year", s, e) };
    }
    if (!customStart || !customEnd) return { label: "CUSTOM_INVALID" };
    const s = startOfPHDateString(customStart),
      e = endOfPHDateString(customEnd);
    return { start: s, end: e, label: describeRangeLabel("custom", s, e) };
  }

  async function doExportNow() {
    setExporting(true);
    try {
      const { start, end, label } = resolveRange();

      // Export from the SAME VIEW for consistency
      let q = supabase
        .from("v_transaction_history_full")
        .select(
          `
          date_completed,
          transaction_code,
          customer_name,
          status,
          grand_total_with_interest
        `
        )
        .order("date_completed", { ascending: false });

      if (exportChoice !== "all") {
        if (!start || !end) {
          setExportError("Please provide a valid date range.");
          setExporting(false);
          return;
        }
        const endExclusive = new Date(end.getTime() + 1); // inclusive UI → exclusive query
        q = q
          .gte("date_completed", toPHSqlNoTZ(start))
          .lt("date_completed", toPHSqlNoTZ(endExclusive));
      }

      const { data, error } = await q;
      if (error) throw error;

      const rows = (data ?? []).map((o: any) => [
        formatDate(o.date_completed),
        o.transaction_code ?? "",
        o.customer_name ?? "—",
        String(o.status ?? "completed"),
        currency(o.grand_total_with_interest ?? 0),
      ]);

      const headers = [
        "Date",
        "Transaction Code",
        "Customer",
        "Status",
        "Total (PHP)",
      ];
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Transactions");

      const todayStamp = new Date().toISOString().slice(0, 10);
      const safeLabel = label.replace(/[^\w\-]+/g, "_");
      XLSX.writeFile(wb, `Transaction_History_${safeLabel}_${todayStamp}.xlsx`);

      await logActivity(
        exportChoice === "all"
          ? "Exported Transaction History (Fully Paid, ALL)"
          : `Exported Transaction History (Fully Paid, ${label})`,
        {
          rows: rows.length,
          filter: exportChoice,
          fully_paid_only: true,
          ...(exportChoice !== "all"
            ? { start_utc: start?.toISOString(), end_utc: end?.toISOString() }
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
}

/* ---------------------- Small Components ---------------------- */

function ExportModal(props: {
  exportChoice:
    | "today"
    | "this_week"
    | "this_month"
    | "this_year"
    | "custom"
    | "all";
  setExportChoice: (c: any) => void;
  customStart: string;
  setCustomStart: (s: string) => void;
  customEnd: string;
  setCustomEnd: (s: string) => void;
  exportError: string;
  setExportError: (s: string) => void;
  exporting: boolean;
  onExport: () => void;
  onCancel: () => void;
}) {
  const {
    exportChoice,
    setExportChoice,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
    exportError,
    exporting,
    onExport,
    onCancel,
  } = props;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg">
        <h3 className="text-base font-semibold mb-2 text-center">
          Export Transaction History
        </h3>
        <p className="text-sm text-gray-700 text-center mb-4">
          Choose a time frame (PH timezone). <br />
          <span className="text-xs text-gray-500">
            *Only <strong>Completed & Fully Paid</strong> orders are included.
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
                  exportChoice === (opt.key as any)
                    ? "border-black bg-gray-50"
                    : "hover:bg-gray-50"
                }`}
              >
                <input
                  type="radio"
                  name="exportChoice"
                  value={opt.key}
                  checked={exportChoice === (opt.key as any)}
                  onChange={() => setExportChoice(opt.key as any)}
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
            onClick={onExport}
            disabled={
              exporting ||
              (exportChoice === "custom" && (!customStart || !customEnd))
            }
          >
            {exporting ? "Exporting…" : "Export Now"}
          </button>
          <button
            className="px-4 py-2 rounded bg-gray-100 hover:bg-gray-200 text-sm"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
