// src/app/reports/cash-ledger/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import supabase from "@/config/supabaseClient";
import { toast } from "sonner";

type LedgerRow = {
  sort_date: string; // timestamptz
  type: string; // "Cash In" | "Cash Out"
  description: string | null; // customer / supplier name
  debit: number | null;
  credit: number | null;
  ref_table: string | null; // "payments" | "supplier_payments"
  ref_id: string | null;
};

const peso = (n: number) =>
  (Number(n) || 0).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  });

const formatPHDate = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-PH", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
};

const toISOStart = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString();
};
const toISOEnd = (d: Date) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x.toISOString();
};

export default function CashLedgerPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  // range
  const [quick, setQuick] = useState<"this_month" | "today" | "custom">(
    "this_month"
  );
  const [fromDate, setFromDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [toDate, setToDate] = useState(() => new Date());

  const [rows, setRows] = useState<LedgerRow[]>([]);

  useEffect(() => {
    if (quick === "today") {
      const now = new Date();
      setFromDate(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
      setToDate(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
    }
    if (quick === "this_month") {
      const now = new Date();
      setFromDate(new Date(now.getFullYear(), now.getMonth(), 1));
      setToDate(new Date());
    }
  }, [quick]);

  async function fetchLedger() {
    try {
      setLoading(true);
      const fromISO = toISOStart(fromDate);
      const toISO = toISOEnd(toDate);

      const { data, error } = await supabase
        .from("v_company_cash_ledger")
        .select("sort_date,type,description,debit,credit,ref_table,ref_id")
        .gte("sort_date", fromISO)
        .lte("sort_date", toISO)
        .order("sort_date", { ascending: true });

      if (error) throw error;

      setRows((data as LedgerRow[]) ?? []);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Failed to load cash ledger.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchLedger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate]);

  const { cashIn, cashOut, netCash, endingBalance, runningBalances } =
    useMemo(() => {
      let running = 0;
      const rb: number[] = [];

      const _cashIn = rows.reduce((sum, r) => sum + (Number(r.credit) || 0), 0);
      const _cashOut = rows.reduce((sum, r) => sum + (Number(r.debit) || 0), 0);

      rows.forEach((r) => {
        running += (Number(r.credit) || 0) - (Number(r.debit) || 0);
        rb.push(running);
      });

      return {
        cashIn: _cashIn,
        cashOut: _cashOut,
        netCash: _cashIn - _cashOut,
        endingBalance: running,
        runningBalances: rb,
      };
    }, [rows]);

  async function openSource(r: LedgerRow) {
    try {
      if (r.ref_table === "supplier_payments" && r.ref_id) {
        const { data, error } = await supabase
          .from("supplier_payments")
          .select("purchase_id")
          .eq("id", r.ref_id)
          .maybeSingle();

        if (error) throw error;

        if (data?.purchase_id) {
          router.push(`/purchase-products?purchaseId=${data.purchase_id}`);
        } else {
          router.push(`/purchase-products?from=ledger&supplier_payment_id=${r.ref_id}`);
        }
        return;
      }

      if (r.ref_table === "payments" && r.ref_id) {
        router.push(`/admin/payments?paymentId=${r.ref_id}`);
        return;
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to open source.");
    }
  }

  return (
    <div className="w-full">
      {/* Header row (matches your screenshot layout) */}
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-black">
            Company Cash Ledger
          </h1>
          <p className="text-sm text-black/60">
            Cash In = payments received • Cash Out = supplier payments • Running
            Balance = Cash on hand (computed)
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white"
            onClick={() => router.push("/purchase-products?from=cash-ledger=1")}
            title="Encode supplier payment (cash out) via Purchase Products"
          >
            + Add Supplier Payment (Cash Out)
          </button>

          <button
            className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-black/5"
            onClick={fetchLedger}
            disabled={loading}
            title="Reload ledger"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Controls (same compact card style as your screenshot) */}
      <div className="mb-4 rounded-xl bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-black/70">
              Quick Range
            </label>
            <select
              className="w-full rounded-lg border px-3 py-2 text-sm"
              value={quick}
              onChange={(e) => setQuick(e.target.value as any)}
            >
              <option value="this_month">This Month</option>
              <option value="today">Today</option>
              <option value="custom">Custom</option>
            </select>
            <p className="mt-1 text-[11px] text-black/50">
              Auto-updates date range. Switch to Custom to edit manually.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-black/70">
              Date From
            </label>
            <input
              type="date"
              className="w-full rounded-lg border px-3 py-2 text-sm"
              value={fromDate.toISOString().slice(0, 10)}
              onChange={(e) => {
                setQuick("custom");
                setFromDate(new Date(e.target.value + "T00:00:00"));
              }}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-black/70">
              Date To
            </label>
            <input
              type="date"
              className="w-full rounded-lg border px-3 py-2 text-sm"
              value={toDate.toISOString().slice(0, 10)}
              onChange={(e) => {
                setQuick("custom");
                setToDate(new Date(e.target.value + "T00:00:00"));
              }}
            />
          </div>
        </div>
      </div>

      {/* Cards */}
     <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-5">
  <div className="rounded-xl bg-white p-4 shadow-sm">
    <p className="text-xs font-semibold text-black/60">Cash In</p>
    <p className="text-2xl font-extrabold">{peso(cashIn)}</p>
  </div>

  <div className="rounded-xl bg-white p-4 shadow-sm">
    <p className="text-xs font-semibold text-black/60">Cash Out</p>
    <p className="text-2xl font-extrabold">{peso(cashOut)}</p>
  </div>

  <div className="rounded-xl bg-white p-4 shadow-sm">
    <p className="text-xs font-semibold text-black/60">Net Cash</p>
    <p className="text-2xl font-extrabold">{peso(netCash)}</p>
  </div>

  <div className="rounded-xl bg-yellow-50 p-4 shadow-sm">
    <p className="text-xs font-semibold text-black/60">Ending Balance</p>
    <p className="text-2xl font-extrabold">{peso(endingBalance)}</p>
  </div>


  <div className="rounded-xl bg-emerald-50 p-4 shadow-sm">
    <p className="text-xs font-semibold text-black/60">Money Remains</p>
    <p className="text-2xl font-extrabold">{peso(endingBalance)}</p>
    <p className="text-[11px] text-black/50 mt-1">Cash on hand (computed)</p>
  </div>
</div>


      {/* Table (with separate Running Balance column ✅) */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className="bg-amber-400 px-4 py-3">
          <div className="grid grid-cols-7 gap-3 text-xs font-extrabold uppercase tracking-wide text-black">
            <div>Date</div>
            <div>Type</div>
            <div className="col-span-2">Description</div>
            <div className="text-right">Debit (Out)</div>
            <div className="text-right">Credit (In)</div>
            <div className="text-right">Running Balance</div>
          </div>
        </div>

        {loading ? (
          <div className="p-6 text-center text-sm text-black/60">
            Loading entries…
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-center text-sm text-black/60">
            No entries for this date range.
          </div>
        ) : (
          <div className="divide-y">
            {rows.map((r, idx) => {
              const isIn = (r.type || "").toLowerCase().includes("in");
              const badge = isIn
                ? "bg-emerald-100 text-emerald-800"
                : "bg-rose-100 text-rose-800";

              return (
                <div
                  key={`${r.ref_table}-${r.ref_id}-${idx}`}
                  className="px-4 py-4 cursor-pointer hover:bg-black/5"
                  onClick={() => openSource(r)}
                  title="Click to open source record"
                >
                  <div className="grid grid-cols-7 items-start gap-3">
                    <div className="text-sm font-semibold text-black">
                      {formatPHDate(r.sort_date)}
                    </div>

                    <div>
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${badge}`}
                        title={r.type}
                      >
                        {r.type}
                      </span>
                    </div>

                    <div className="col-span-2">
                      <p className="text-sm font-bold text-black">
                        {r.description || "—"}
                      </p>
                      <p className="mt-1 text-[11px] text-black/50">
                        Ref: {r.ref_table || "—"} • {r.ref_id || "—"}
                      </p>
                    </div>

                    <div className="text-right text-sm font-semibold">
                      {peso(Number(r.debit) || 0)}
                    </div>

                    <div className="text-right text-sm font-semibold">
                      {peso(Number(r.credit) || 0)}
                    </div>

                    <div className="text-right text-sm font-extrabold">
                      {peso(runningBalances[idx] ?? 0)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
