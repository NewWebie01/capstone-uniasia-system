// app/transaction-history/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createPagesBrowserClient } from "@supabase/auth-helpers-nextjs";

type OrderStatus = "pending" | "rejected" | "completed" | string;

type Transaction = {
  id: string;
  date: string;
  code: string; // generated TXN code
  customer: string | null;
  status: OrderStatus;
  total_amount: number | null;
};

export default function TransactionHistoryPage() {
  const supabase = createPagesBrowserClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

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
        .order("date_created", { ascending: false });

      if (error) {
        console.error("Error loading orders:", error);
        setTransactions([]);
        setLoading(false);
        return;
      }

      const rows: Transaction[] = (data ?? []).map((o: any) => {
        // generate a transaction code: TXN-YYYYMMDD-xxxxx
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
  }, [supabase]);

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

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Transaction History</h1>

      <input
        type="search"
        aria-label="Search by date, code, customer, status, or amount"
        placeholder="Search by date, code, customer, status, or amount…"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="border px-4 py-2 mb-4 w-full md:w-1/2 rounded-full"
      />

      <div className="overflow-x-auto rounded-lg shadow bg-white">
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
                  No transactions found.
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
    </div>
  );
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
