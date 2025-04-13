// components/InventoryChart.tsx
"use client";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

const inventoryData = [
  { category: "Processors", stock: 120 },
  { category: "GPUs", stock: 80 },
  { category: "RAM", stock: 150 },
  { category: "SSDs", stock: 95 },
  { category: "Power Supplies", stock: 60 },
];

const InventoryChart = () => {
  return (
    <div className="bg-white p-6 rounded-xl shadow-sm w-full">
      <h2 className="text-lg font-semibold mb-4 text-gray-700">
        Inventory Overview
      </h2>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={inventoryData}
          margin={{ top: 10, right: 20, left: 0, bottom: 30 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="category" angle={-10} textAnchor="end" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="stock" fill="#001E80" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default InventoryChart;
