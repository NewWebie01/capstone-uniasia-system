"use client";

import { PackageCheck, Truck, Warehouse } from "lucide-react";
import { motion } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

// Mock delivery data (each delivery has multiple items)
const deliveryData = [
  {
    deliveryId: "DEL-001",
    cargoExpense: 2500,
    status: "In Transit",
    items: [
      { name: "Hammer (Steel Grip)", quantity: 20 },
      { name: "White Latex Paint 4L", quantity: 10 },
    ],
  },
  {
    deliveryId: "DEL-002",
    cargoExpense: 1850,
    status: "Delivered",
    items: [
      { name: "Electric Drill Set", quantity: 5 },
      { name: "Primer Paint 1L", quantity: 12 },
    ],
  },
  {
    deliveryId: "DEL-003",
    cargoExpense: 1400,
    status: "Pending",
    items: [{ name: "Paint Thinner 1L", quantity: 15 }],
  },
];

// Status icon component
const getStatusIcon = (status: string) => {
  switch (status) {
    case "Delivered":
      return <PackageCheck className="text-green-500" />;
    case "In Transit":
      return <Truck className="text-blue-500" />;
    case "Pending":
      return <Warehouse className="text-yellow-500" />;
    default:
      return null;
  }
};

// Main component
const LogisticsPage = () => {
  return (
    <motion.div
      className="p-4"
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
      <motion.h1
        className="text-3xl font-bold mb-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        Delivery Overview
      </motion.h1>

      {/* Delivery Cards */}
      <motion.div className="space-y-6">
        {deliveryData.map((delivery) => (
          <motion.div
            key={delivery.deliveryId}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Card className="rounded-2xl shadow-md border-muted">
              <CardHeader className="flex items-center justify-between">
                <CardTitle className="text-lg font-semibold">
                  Delivery ID: {delivery.deliveryId}
                </CardTitle>
                {getStatusIcon(delivery.status)}
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div>
                  <span className="font-medium">Status:</span>{" "}
                  <span
                    className={`font-semibold ${
                      delivery.status === "Delivered"
                        ? "text-green-500"
                        : delivery.status === "In Transit"
                        ? "text-blue-500"
                        : "text-yellow-500"
                    }`}
                  >
                    {delivery.status}
                  </span>
                </div>
                <div>
                  <span className="font-medium">Cargo Expense:</span> ₱
                  {delivery.cargoExpense.toLocaleString()}
                </div>
                <div>
                  <span className="font-medium">Items:</span>
                  <ul className="ml-4 list-disc">
                    {delivery.items.map((item, idx) => (
                      <li key={idx}>
                        {item.quantity} × {item.name}
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  );
};

export default LogisticsPage;
