"use client";

import { useState } from "react";
import { motion } from "framer-motion";

type SaleRecord = {
  id: number;
  product: string;
  category: string;
  amount: number;
  date: string;
};

const salesData: SaleRecord[] = [
  {
    id: 1,
    product: "Electric Drill",
    category: "Power Tools",
    amount: 3500,
    date: "2025-04-12",
  },
  {
    id: 2,
    product: "White Latex Paint",
    category: "Paint",
    amount: 1800,
    date: "2025-04-11",
  },
  {
    id: 3,
    product: "Screwdriver Set",
    category: "Hand Tools",
    amount: 950,
    date: "2025-04-10",
  },
  {
    id: 4,
    product: "Hammer",
    category: "Hand Tools",
    amount: 700,
    date: "2025-04-10",
  },
  {
    id: 5,
    product: "Putty Knife",
    category: "Paint",
    amount: 1200,
    date: "2025-04-09",
  },
];

export default function SalesPage() {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredSales = salesData.filter((sale) =>
    sale.product.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalSales = filteredSales.length;
  const totalRevenue = filteredSales.reduce(
    (acc, sale) => acc + sale.amount,
    0
  );
  const totalProfit = totalRevenue * 0.2; // assume 20% profit margin

  return (
    <div className="p-2">
      <motion.h1
        className="text-3xl font-bold mb-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        Sales
      </motion.h1>

      {/* Summary Cards */}
      <motion.div
        className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="bg-white p-4 rounded-xl shadow">
          <p className="text-gray-500">Total Sales</p>
          <p className="text-xl font-bold">{totalSales}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow">
          <p className="text-gray-500">Revenue</p>
          <p className="text-xl font-bold">₱{totalRevenue.toLocaleString()}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow">
          <p className="text-gray-500">Profit</p>
          <p className="text-xl font-bold">₱{totalProfit.toLocaleString()}</p>
        </div>
      </motion.div>

      {/* Search */}
      <motion.input
        type="text"
        placeholder="Search product..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="mb-4 w-full md:w-1/3 px-4 py-2 border rounded shadow-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      />

      {/* Table */}
      <motion.div
        className="overflow-x-auto rounded-lg shadow"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <table className="min-w-full bg-white text-sm">
          <thead className="bg-[#ffba20] text-black text-left">
            <tr>
              <th className="py-3 px-5">Product</th>
              <th className="py-3 px-5">Category</th>
              <th className="py-3 px-5">Amount</th>
              <th className="py-3 px-5">Date</th>
            </tr>
          </thead>
          <tbody>
            {filteredSales.map((sale) => (
              <motion.tr
                key={sale.id}
                className="border-b hover:bg-gray-100"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
              >
                <td className="py-3 px-5">{sale.product}</td>
                <td className="py-3 px-5">{sale.category}</td>
                <td className="py-3 px-5">₱{sale.amount.toLocaleString()}</td>
                <td className="py-3 px-5">{sale.date}</td>
              </motion.tr>
            ))}
          </tbody>
        </table>
        {filteredSales.length === 0 && (
          <div className="p-4 text-center text-gray-500">No sales found.</div>
        )}
      </motion.div>
    </div>
  );
}
