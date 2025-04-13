"use client";

import { BarChart, DollarSign, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

const salesData = [
  {
    id: "S001",
    product: "Hammer (Steel Grip)",
    quantity: 120,
    revenue: 2400,
    status: "Completed",
    date: "2025-04-01",
  },
  {
    id: "S002",
    product: "Electric Drill Set",
    quantity: 45,
    revenue: 6750,
    status: "Completed",
    date: "2025-04-02",
  },
  {
    id: "S003",
    product: "White Latex Paint 4L",
    quantity: 250,
    revenue: 5000,
    status: "Pending",
    date: "2025-04-03",
  },
  {
    id: "S004",
    product: "Cordless Screwdriver",
    quantity: 30,
    revenue: 1800,
    status: "Completed",
    date: "2025-04-04",
  },
];

const getStatusIcon = (status: string) => {
  switch (status) {
    case "Completed":
      return <DollarSign className="text-green-500" />;
    case "Pending":
      return <TrendingUp className="text-yellow-500" />;
    default:
      return null;
  }
};

const SalesReportPage = () => {
  return (
    <motion.div
      className="p-2"
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: {
          transition: {
            staggerChildren: 0.15,
          },
        },
      }}
    >
      {/* Header */}
      <motion.h1
        className="text-3xl font-bold mb-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        Sales Report
      </motion.h1>

      {/* Sales Data Cards */}
      <motion.div
        className="grid gap-6 md:grid-cols-2 xl:grid-cols-3"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: {
            transition: {
              staggerChildren: 0.15,
            },
          },
        }}
      >
        {salesData.map((sale) => (
          <motion.div
            key={sale.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <Card className="border-muted">
              <CardHeader className="flex items-center justify-between">
                <CardTitle className="text-base">{sale.product}</CardTitle>
                {getStatusIcon(sale.status)}
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <div>
                  <span className="font-medium">Quantity Sold:</span>{" "}
                  {sale.quantity} units
                </div>
                <div>
                  <span className="font-medium">Revenue:</span> ${sale.revenue}
                </div>
                <div>
                  <span className="font-medium">Sale Date:</span> {sale.date}
                </div>
                <div>
                  <span className="font-medium">Status:</span>{" "}
                  <span
                    className={`font-semibold ${
                      sale.status === "Completed"
                        ? "text-green-500"
                        : "text-yellow-500"
                    }`}
                  >
                    {sale.status}
                  </span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Sales Summary */}
      <motion.div
        className="mt-8 p-6 bg-white border shadow-md rounded-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Sales Summary</h2>
          <BarChart className="text-gray-500" />
        </div>
        <div className="flex justify-between">
          <div>
            <span className="font-medium">Total Revenue:</span> $
            {salesData
              .reduce((acc, sale) => acc + sale.revenue, 0)
              .toLocaleString()}
          </div>
          <div>
            <span className="font-medium">Total Sales:</span> {salesData.length}{" "}
            transactions
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default SalesReportPage;
