// app/transaction-history/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createPagesBrowserClient } from "@supabase/auth-helpers-nextjs";

type Transaction = {
  id: string;
  date_created: string;
  code: string;
  customer: string; // now shows customers.name
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
          customers (
            name,
            contact_person,
            code
          )
        `
        )
        .order("date_created", { ascending: false });

      if (error) {
        console.error("Error loading orders:", error);
        setLoading(false);
        return;
      }

      const rows = (data ?? []).map((o: any) => ({
        id: o.id as string,
        date_created: o.date_created as string,
        code: o?.customers?.code ?? "—",
        customer: o?.customers?.name ?? "—", // <-- use name here
      }));

      setTransactions(rows);
      setLoading(false);
    }

    load();
  }, [supabase]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return transactions;
    return transactions.filter((t) =>
      [formatDate(t.date_created), t.code, t.customer]
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
        aria-label="Search by date, code or customer"
        placeholder="Search by date, code or customer…"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="border px-4 py-2 mb-4 w-full md:w-1/3 rounded-full"
      />

      <div className="overflow-x-auto rounded-lg shadow bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-[#ffba20] text-black text-left">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Transaction Code</th>
              <th className="px-4 py-3">Customer Name</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-6 text-center text-gray-500" colSpan={3}>
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-center text-gray-500" colSpan={3}>
                  No transactions found.
                </td>
              </tr>
            ) : (
              filtered.map((t) => (
                <tr key={t.id} className="border-b hover:bg-gray-100">
                  <td className="px-4 py-3">{formatDate(t.date_created)}</td>
                  <td className="px-4 py-3">{t.code}</td>
                  <td className="px-4 py-3">{t.customer}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Format without UTC shifting; PH locale-friendly */
function formatDate(value: string) {
  const d = new Date(value);
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}
