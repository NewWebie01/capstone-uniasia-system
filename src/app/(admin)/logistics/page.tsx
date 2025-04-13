"use client";

import { PackageCheck, Truck, Warehouse } from "lucide-react";
import { motion } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

const logisticsData = [
  {
    id: "HW001",
    item: "Hammer (Steel Grip)",
    category: "Hardware Tool",
    stock: 56,
    location: "Warehouse A",
    status: "In Transit",
  },
  {
    id: "PN002",
    item: "White Latex Paint 4L",
    category: "Paint",
    stock: 24,
    location: "Warehouse B",
    status: "Delivered",
  },
  {
    id: "HW003",
    item: "Electric Drill Set",
    category: "Hardware Tool",
    stock: 15,
    location: "Warehouse A",
    status: "Pending",
  },
  {
    id: "PN004",
    item: "Primer Paint 1L",
    category: "Paint",
    stock: 40,
    location: "Warehouse C",
    status: "In Transit",
  },
];

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

const LogisticsPage = () => {
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
        Logistics
      </motion.h1>

      {/* Logistics Cards */}
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
        {logisticsData.map((item) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <Card className="border-muted">
              <CardHeader className="flex items-center justify-between">
                <CardTitle className="text-base">{item.item}</CardTitle>
                {getStatusIcon(item.status)}
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <div>
                  <span className="font-medium">Category:</span> {item.category}
                </div>
                <div>
                  <span className="font-medium">Stock:</span> {item.stock} units
                </div>
                <div>
                  <span className="font-medium">Location:</span> {item.location}
                </div>
                <div>
                  <span className="font-medium">Status:</span>{" "}
                  <span
                    className={`font-semibold ${
                      item.status === "Delivered"
                        ? "text-green-500"
                        : item.status === "In Transit"
                        ? "text-blue-500"
                        : "text-yellow-500"
                    }`}
                  >
                    {item.status}
                  </span>
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
