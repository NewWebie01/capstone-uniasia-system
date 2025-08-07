"use client";

import { useState } from "react";

type Transaction = {
  date: string;
  accountId: string;
  title: string;
  type: string;
  method: string;
  amount: string;
  status: string;
};

const dummyTransactions: Transaction[] = [
  {
    date: "2025-08-07",
    accountId: "ACC-001",
    title: "Payment Received",
    type: "Deposit",
    method: "WIRE",
    amount: "₱23,021.00",
    status: "Pending Receipt",
  },
  {
    date: "2025-08-06",
    accountId: "ACC-002",
    title: "Cash Deposit",
    type: "Deposit",
    method: "CHECK",
    amount: "₱234.00",
    status: "Pending Receipt",
  },
  {
    date: "2025-08-05",
    accountId: "ACC-003",
    title: "Order Refund",
    type: "Withdrawal",
    method: "WIRE",
    amount: "₱61.00",
    status: "Not Confirmed",
  },
  {
    date: "2025-08-04",
    accountId: "ACC-004",
    title: "Supplier Payment",
    type: "Withdrawal",
    method: "WIRE",
    amount: "₱1,000.00",
    status: "Not Confirmed",
  },
];

export default function TransactionHistoryPage() {
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = dummyTransactions.filter((t) =>
    `${t.accountId} ${t.title} ${t.type} ${t.method} ${t.amount} ${t.status}`
      .toLowerCase()
      .includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">Transaction History</h1>

      <input
        className="border px-4 py-2 mb-4 w-full md:w-1/3 rounded-full"
        placeholder="Search by ID, title, amount..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      <div className="overflow-x-auto rounded-lg shadow">
        <table className="min-w-full bg-white text-sm rounded-md overflow-hidden">
          <thead className="bg-[#ffba20] text-black text-left">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Account ID</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Method</th>
              <th className="px-4 py-3">Amount / Position</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((tx, index) => (
              <tr key={index} className="border-b hover:bg-gray-100">
                <td className="px-4 py-3">{tx.date}</td>
                <td className="px-4 py-3">{tx.accountId}</td>
                <td className="px-4 py-3">{tx.title}</td>
                <td className="px-4 py-3">{tx.type}</td>
                <td className="px-4 py-3">{tx.method}</td>
                <td className="px-4 py-3">{tx.amount}</td>
                <td className="px-4 py-3">{tx.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
