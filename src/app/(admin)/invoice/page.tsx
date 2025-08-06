"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
//import { exportInvoiceToPDF } from "@/utils/exportInvoice";
import { generatePDFBlob } from "@/utils/exportInvoice";
import {
  DollarSign,
  TrendingUp,
  ReceiptText,
  Printer,
  Filter,
  CalendarDays,
} from "lucide-react";

// Sample sales data
const salesData = [
  {
    id: "S001",
    product: "Hammer (Steel Grip)",
    quantity: 120,
    revenue: 2400,
    status: "Completed",
    date: "2025-04-01",
    customer: "Angelo Rosario",
  },
  {
    id: "S002",
    product: "Electric Drill Set",
    quantity: 45,
    revenue: 6750,
    status: "Completed",
    date: "2025-04-02",
    customer: "Maria Santos",
  },
  {
    id: "S003",
    product: "White Latex Paint 4L",
    quantity: 250,
    revenue: 5000,
    status: "Pending",
    date: "2025-04-03",
    customer: "Juan Dela Cruz",
  },
  {
    id: "S004",
    product: "Cordless Screwdriver",
    quantity: 30,
    revenue: 1800,
    status: "Completed",
    date: "2025-04-04",
    customer: "Pedro Reyes",
  },
];

// Mock transaction history per invoice
const mockTransactions = [
  {
    date: "2025-04-01",
    transaction: "Hammer (Steel Grip)",
    status: "Completed",
    charge: 2400,
    credit: 0,
    balance: 2400,
  },
  {
    date: "2025-04-03",
    transaction: "White Latex Paint 4L",
    status: "Pending",
    charge: 5000,
    credit: 0,
    balance: 5000,
  },
];

const SalesInvoicePage = () => {
  const [selectedSale, setSelectedSale] = useState<any | null>(null);
  const [searchName, setSearchName] = useState("");
  const [searchDate, setSearchDate] = useState("");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const filteredSales = salesData.filter((sale) => {
    return (
      sale.customer.toLowerCase().includes(searchName.toLowerCase()) &&
      sale.date.includes(searchDate)
    );
  });

  return (
    <motion.div className="p-4 space-y-6" initial="hidden" animate="visible">
      <motion.h1 className="text-3xl font-bold">Sales Invoices</motion.h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-2">
          <Filter className="text-muted-foreground" />
          <Input
            type="text"
            placeholder="Filter by Customer Name"
            value={searchName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setSearchName(e.target.value)
            }
            className="max-w-xs"
          />
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays className="text-muted-foreground" />
          <Input
            type="date"
            value={searchDate}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setSearchDate(e.target.value)
            }
          />
        </div>
      </div>

      {/* Compact Invoice Cards */}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
        {filteredSales.map((sale) => (
          <Dialog key={sale.id}>
            <DialogTrigger asChild>
              <Card
                onClick={() => setSelectedSale(sale)}
                className="cursor-pointer hover:shadow-md transition-shadow duration-300 border-muted bg-white p-4 text-sm space-y-1"
              >
                <p className="font-semibold">
                  🧾 Sales Invoice: {sale.id}_
                  {sale.customer.split(" ").join("_")}
                </p>
                <p>🏠 Address: 123 Sample St., Cebu City</p>
                <p>💳 Balance: ₱{sale.revenue.toLocaleString()}</p>
              </Card>
            </DialogTrigger>

            <DialogContent className="max-w-5xl print:block print:static">
              <div
                id={`invoice-content-${sale.id}`}
                className="bg-white p-6 rounded-md text-sm"
              >
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <ReceiptText /> Sales Invoice - {sale.id}
                  </h2>
                  <button
                    className="flex items-center gap-2 text-sm px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700"
                    onClick={async () => {
                      const blob = await generatePDFBlob(
                        `invoice-content-${sale.id}`
                      );
                      if (blob) {
                        const url = URL.createObjectURL(blob);
                        setPdfUrl(url);
                      }
                    }}
                  >
                    <Printer className="w-4 h-4" />
                    Preview PDF
                  </button>
                </div>

                {/* Customer Info */}
                <div className="grid grid-cols-2 text-sm gap-y-1">
                  <p>
                    <strong>NAME:</strong> {sale.customer}
                  </p>
                  <p>
                    <strong>CODE:</strong> CUST-{sale.id}
                  </p>
                  <p className="col-span-2">
                    <strong>ADDRESS:</strong> 123 Sample St., Cebu City
                  </p>
                  <p>
                    <strong>CONTACT PERSON:</strong> Maria Santos
                  </p>
                  <p>
                    <strong>TEL NO:</strong> (032) 123-4567
                  </p>
                  <p>
                    <strong>TERMS:</strong> Net 30
                  </p>
                  <p>
                    <strong>COLLECTION:</strong> On Delivery
                  </p>
                  <p>
                    <strong>CREDIT LIMIT:</strong> ₱20,000
                  </p>
                  <p>
                    <strong>SALESMAN:</strong> Pedro Reyes
                  </p>
                </div>

                {/* Table of Transactions */}
                <div className="overflow-auto mt-4">
                  <table className="w-full text-sm border print:w-full">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="border px-2 py-1">DATE</th>
                        <th className="border px-2 py-1">TRANSACTION</th>
                        <th className="border px-2 py-1">STATUS</th>
                        <th className="border px-2 py-1">CHARGE</th>
                        <th className="border px-2 py-1">CREDIT</th>
                        <th className="border px-2 py-1">BALANCE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mockTransactions.map((txn, idx) => (
                        <tr key={idx}>
                          <td className="border px-2 py-1">{txn.date}</td>
                          <td className="border px-2 py-1">
                            {txn.transaction}
                          </td>
                          <td className="border px-2 py-1">{txn.status}</td>
                          <td className="border px-2 py-1">
                            ₱{txn.charge.toLocaleString()}
                          </td>
                          <td className="border px-2 py-1">
                            ₱{txn.credit.toLocaleString()}
                          </td>
                          <td className="border px-2 py-1">
                            ₱{txn.balance.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        ))}
      </div>
    </motion.div>
  );
};

export default SalesInvoicePage;
