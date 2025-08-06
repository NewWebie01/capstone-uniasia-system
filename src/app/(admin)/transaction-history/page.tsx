"use client";

import { CheckCircle, XCircle, Activity } from "lucide-react";
import { motion } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

const activityLogData = [
  {
    id: "A001",
    action: "User Login",
    user: "John Doe",
    date: "2025-04-01 10:30 AM",
    status: "Success",
  },
  {
    id: "A002",
    action: "Password Change",
    user: "Jane Smith",
    date: "2025-04-01 11:15 AM",
    status: "Success",
  },
  {
    id: "A003",
    action: "Failed Login Attempt",
    user: "Bob Johnson",
    date: "2025-04-01 01:00 PM",
    status: "Failed",
  },
  {
    id: "A004",
    action: "Data Export",
    user: "Alice Williams",
    date: "2025-04-01 03:45 PM",
    status: "Success",
  },
];

const getStatusIcon = (status: string) => {
  switch (status) {
    case "Success":
      return <CheckCircle className="text-green-500" />;
    case "Failed":
      return <XCircle className="text-red-500" />;
    default:
      return null;
  }
};

const ActivityLogPage = () => {
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
        Activity Log
      </motion.h1>

      {/* Activity Log Cards */}
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
        {activityLogData.map((log) => (
          <motion.div
            key={log.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <Card className="border-muted">
              <CardHeader className="flex items-center justify-between">
                <CardTitle className="text-base">{log.action}</CardTitle>
                {getStatusIcon(log.status)}
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <div>
                  <span className="font-medium">User:</span> {log.user}
                </div>
                <div>
                  <span className="font-medium">Date:</span> {log.date}
                </div>
                <div>
                  <span className="font-medium">Status:</span>{" "}
                  <span
                    className={`font-semibold ${
                      log.status === "Success"
                        ? "text-green-500"
                        : "text-red-500"
                    }`}
                  >
                    {log.status}
                  </span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Activity Summary */}
      <motion.div
        className="mt-8 p-6 bg-white border shadow-md rounded-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Activity Summary</h2>
          <Activity className="text-gray-500" />
        </div>
        <div className="flex justify-between">
          <div>
            <span className="font-medium">Total Activities:</span>{" "}
            {activityLogData.length}
          </div>
          <div>
            <span className="font-medium">Success:</span>{" "}
            {activityLogData.filter((log) => log.status === "Success").length}
          </div>
          <div>
            <span className="font-medium">Failed:</span>{" "}
            {activityLogData.filter((log) => log.status === "Failed").length}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default ActivityLogPage;
