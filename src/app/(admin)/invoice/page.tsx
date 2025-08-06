"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { generatePDFBlob } from "@/utils/exportInvoice";
import {
  DollarSign,
  TrendingUp,
  ReceiptText,
  Printer,
  Filter,
  CalendarDays,
  X,
} from "lucide-react";

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
];

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
  const [openDialogId, setOpenDialogId] = useState<string | null>(null);

  const filteredSales = salesData.filter((sale) => {
    return (
      sale.customer.toLowerCase().includes(searchName.toLowerCase()) &&
      sale.date.includes(searchDate)
    );
  });

  return (
    <motion.div className="p-4 space-y-6">
      <motion.h1 className="text-3xl font-bold">Sales Invoices</motion.h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-2">
          <Filter className="text-muted-foreground" />
          <Input
            type="text"
            placeholder="Filter by Customer Name"
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            className="max-w-xs"
          />
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays className="text-muted-foreground" />
          <Input
            type="date"
            value={searchDate}
            onChange={(e) => setSearchDate(e.target.value)}
          />
        </div>
      </div>

      {/* Compact Cards */}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
        {filteredSales.map((sale) => (
          <Dialog
            key={sale.id}
            open={openDialogId === sale.id}
            onOpenChange={(open) => setOpenDialogId(open ? sale.id : null)}
          >
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
                        setOpenDialogId(null);
                      }
                    }}
                  >
                    <Printer className="w-4 h-4" /> Preview PDF
                  </button>
                </div>

                {/* Invoice Info */}
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

                <div className="overflow-auto mt-4">
                  <table className="w-full text-sm border">
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

      {/* PDF Preview Modal with Transition */}
      <AnimatePresence>
        {pdfUrl && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
          >
            <div className="bg-white p-4 w-[90%] h-[90%] rounded shadow-xl relative">
              <iframe
                src={pdfUrl}
                title="Invoice Preview"
                className="w-full h-full border"
              />
              <button
                onClick={() => {
                  URL.revokeObjectURL(pdfUrl);
                  setPdfUrl(null);
                }}
                className="absolute top-3 right-4 bg-transparent text-gray-600 hover:text-black"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default SalesInvoicePage;
