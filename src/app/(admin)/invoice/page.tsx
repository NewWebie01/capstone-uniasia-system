"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Printer, ReceiptText, X } from "lucide-react";
import { generatePDFBlob } from "@/utils/exportInvoice";
import { AnimatePresence, motion } from "framer-motion";

const SalesInvoicePage = () => {
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const [openDialogId, setOpenDialogId] = useState<string | null>(null);
  const [searchName, setSearchName] = useState("");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    const fetchCustomers = async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .order("created_at", { ascending: false });

      if (data) setCustomers(data);
    };

    fetchCustomers();
  }, []);

  const filteredCustomers = customers.filter((c) =>
    c.name.toLowerCase().includes(searchName.toLowerCase())
  );

  return (
    <motion.div className="p-4 space-y-6">
      <h1 className="text-3xl font-bold">Sales Invoices</h1>

      {/* Search */}
      <Input
        type="text"
        placeholder="Search by customer name..."
        value={searchName}
        onChange={(e) => setSearchName(e.target.value)}
        className="w-80 rounded border px-4 py-2"
      />

      {/* Invoices */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {filteredCustomers.map((customer) => (
          <Dialog
            key={customer.id}
            open={openDialogId === customer.id}
            onOpenChange={(open) => setOpenDialogId(open ? customer.id : null)}
          >
            <DialogTrigger asChild>
              <Card
                className="cursor-pointer p-4 bg-white shadow hover:shadow-lg"
                onClick={() => setSelectedCustomer(customer)}
              >
                <p className="font-semibold">
                  🧾 Sales Invoice: {customer.code}
                </p>
                <p>🏠 Address: {customer.address}</p>
                <p>📞 Contact: {customer.phone}</p>
              </Card>
            </DialogTrigger>

            <DialogContent className="max-w-5xl print:block print:static">
              {selectedCustomer && (
                <div
                  id={`invoice-${selectedCustomer.id}`}
                  className="bg-white p-6 text-sm"
                >
                  {/* Header */}
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                      <ReceiptText /> Sales Invoice – {selectedCustomer.code}
                    </h2>
                    <button
                      onClick={async () => {
                        const blob = await generatePDFBlob(
                          `invoice-${selectedCustomer.id}`
                        );
                        if (blob) {
                          const url = URL.createObjectURL(blob);
                          setPdfUrl(url);
                          setOpenDialogId(null);
                        }
                      }}
                      className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      <Printer className="w-4 h-4" /> Preview PDF
                    </button>
                  </div>

                  {/* Customer Info */}
                  <div className="grid grid-cols-2 gap-y-1 text-sm">
                    <p>
                      <strong>NAME:</strong> {selectedCustomer.name}
                    </p>
                    <p>
                      <strong>TRANSACTION CODE:</strong> {selectedCustomer.code}
                    </p>
                    <p className="col-span-2">
                      <strong>ADDRESS:</strong> {selectedCustomer.address}
                    </p>
                    <p>
                      <strong>CONTACT PERSON:</strong>{" "}
                      {selectedCustomer.contact_person || "N/A"}
                    </p>
                    <p>
                      <strong>TEL NO:</strong> {selectedCustomer.phone}
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

                  {/* Table */}
                  <div className="overflow-auto mt-4">
                    <table className="w-full text-sm border">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="border px-2 py-1">TRANSACTION DATE</th>
                          <th className="border px-2 py-1">RECEIVED DATE</th>
                          <th className="border px-2 py-1">TRANSACTION</th>
                          <th className="border px-2 py-1">STATUS</th>
                          <th className="border px-2 py-1">CHARGE</th>
                          <th className="border px-2 py-1">CREDIT</th>
                          <th className="border px-2 py-1">BALANCE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedCustomer.transaction?.split(",") || []).map(
                          (txn: string, index: number) => (
                            <tr key={index}>
                              <td className="border px-2 py-1">
                                {
                                  new Date(
                                    selectedCustomer.date ||
                                      selectedCustomer.created_at
                                  )
                                    .toISOString()
                                    .split("T")[0]
                                }
                              </td>
                              <td className="border px-2 py-1">
                                {new Date().toLocaleDateString("en-PH", {
                                  year: "numeric",
                                  month: "long",
                                  day: "numeric",
                                })}
                              </td>
                              <td className="border px-2 py-1">{txn.trim()}</td>
                              <td className="border px-2 py-1">
                                {selectedCustomer.status || "Pending"}
                              </td>
                              <td className="border px-2 py-1">₱5,000</td>
                              <td className="border px-2 py-1">₱0</td>
                              <td className="border px-2 py-1">₱5,000</td>
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        ))}
      </div>

      {/* PDF Preview Modal */}
      <AnimatePresence>
        {pdfUrl && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
          >
            <div className="bg-white p-4 w-[90%] h-[90%] rounded shadow-xl relative">
              <iframe src={pdfUrl} className="w-full h-full" />
              <button
                onClick={() => {
                  URL.revokeObjectURL(pdfUrl);
                  setPdfUrl(null);
                }}
                className="absolute top-3 right-4 text-gray-600 hover:text-black"
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
