"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Printer, ReceiptText, X } from "lucide-react";
import { generatePDFBlob } from "@/utils/exportInvoice";
import { AnimatePresence, motion } from "framer-motion";

// ---------- Types ----------
type Customer = {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  contact_person?: string;
  // Add more fields as needed
};

type Order = {
  id: string;
  customer_id: string;
  code?: string;
  transaction?: string;
  status?: string;
  total_amount?: number;
  date_created?: string;
  salesman?: string;
  terms?: string;
  credit_limit?: number | string;
  collection?: string;
  // Add more fields as needed
};

// ---------- Component ----------
const SalesInvoicePage = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [openDialogId, setOpenDialogId] = useState<string | null>(null);
  const [searchName, setSearchName] = useState("");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [formValues, setFormValues] = useState({
    salesman: "",
    terms: "",
    credit_limit: "",
    collection: "",
  });

  // Fetch customers
  useEffect(() => {
    const fetchCustomers = async () => {
      const { data } = await supabase
        .from("customers")
        .select("*")
        .order("created_at", { ascending: false });
      if (data) setCustomers(data as Customer[]);
    };
    fetchCustomers();
  }, []);

  // Fetch orders
  useEffect(() => {
    const fetchOrders = async () => {
      const { data } = await supabase
        .from("orders")
        .select("*")
        .order("date_created", { ascending: false });
      if (data) setOrders(data as Order[]);
    };
    fetchOrders();
  }, []);

  // Sync formValues when selectedOrder changes
  useEffect(() => {
    if (selectedOrder) {
      setFormValues({
        salesman: selectedOrder.salesman || "",
        terms: selectedOrder.terms || "",
        credit_limit: selectedOrder.credit_limit?.toString() || "",
        collection: selectedOrder.collection || "",
      });
      setEditMode(false);
    }
  }, [selectedOrder]);

  // Filter customers
  const filteredCustomers = customers.filter((c) =>
    c.name?.toLowerCase().includes(searchName.toLowerCase())
  );

  // Helper: orders for customer
  const getOrdersForCustomer = (customerId: string) =>
    orders.filter((order) => order.customer_id === customerId);

  return (
    <motion.div className="p-4 space-y-6">
      <h1 className="text-3xl font-bold">Sales Invoices</h1>

      {/* Search */}
      <div className="w-full max-w-md">
        <input
          type="text"
          placeholder="Search by customer name..."
          value={searchName}
          onChange={(e) => setSearchName(e.target.value)}
          className="w-full px-4 py-2 rounded-md shadow bg-white focus:outline-none focus:ring-2 focus:ring-black transition"
        />
      </div>

      {/* Customer cards & order dialogs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {filteredCustomers.map((customer) => {
          const customerOrders = getOrdersForCustomer(customer.id);
          return customerOrders.map((order) => (
            <Dialog
              key={order.id}
              open={openDialogId === order.id}
              onOpenChange={(open) => {
                setOpenDialogId(open ? order.id : null);
                setSelectedOrder(open ? order : null);
              }}
            >
              <DialogTrigger asChild>
                <Card
                  className="cursor-pointer p-4 bg-white shadow hover:shadow-lg"
                  onClick={() => setSelectedOrder(order)}
                >
                  <p className="font-semibold">
                    🧾 Sales Invoice: {order.code || order.id}
                  </p>
                  <p>🏠 Address: {customer.address}</p>
                  <p>📞 Contact: {customer.phone}</p>
                </Card>
              </DialogTrigger>
              <DialogContent className="max-w-5xl print:block print:static">
                {selectedOrder && selectedOrder.id === order.id && (
                  <div
                    id={`invoice-${selectedOrder.id}`}
                    className="bg-white p-6 text-sm"
                  >
                    {/* Header */}
                    <div className="flex justify-between items-center mb-4">
                      <h2 className="text-xl font-bold flex items-center gap-2">
                        <ReceiptText /> Sales Invoice –{" "}
                        {selectedOrder.code || selectedOrder.id}
                      </h2>
                      <div className="flex flex-col items-end gap-2">
                        <button
                          onClick={async () => {
                            const blob = await generatePDFBlob(
                              `invoice-${selectedOrder.id}`
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
                        {!editMode ? (
                          <button
                            className="flex items-center gap-2 px-3 py-1.5 bg-yellow-600 text-white rounded hover:bg-yellow-700"
                            onClick={() => setEditMode(true)}
                          >
                            Edit
                          </button>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              className="px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700"
                              onClick={async () => {
                                const { error } = await supabase
                                  .from("orders")
                                  .update({
                                    salesman: formValues.salesman,
                                    terms: formValues.terms,
                                    credit_limit: formValues.credit_limit,
                                    collection: formValues.collection,
                                  })
                                  .eq("id", selectedOrder.id);

                                if (!error) {
                                  setEditMode(false);
                                  // update UI locally:
                                  setOrders((prevOrders) =>
                                    prevOrders.map((o) =>
                                      o.id === selectedOrder.id
                                        ? { ...o, ...formValues }
                                        : o
                                    )
                                  );
                                } else {
                                  alert("Failed to save! " + error.message);
                                }
                              }}
                            >
                              Save
                            </button>
                            <button
                              className="px-3 py-1.5 bg-gray-400 text-white rounded hover:bg-gray-500"
                              onClick={() => {
                                setFormValues({
                                  salesman: selectedOrder.salesman || "",
                                  terms: selectedOrder.terms || "",
                                  credit_limit:
                                    selectedOrder.credit_limit?.toString() ||
                                    "",
                                  collection: selectedOrder.collection || "",
                                });
                                setEditMode(false);
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Info grid */}
                    <div className="grid grid-cols-2 gap-y-1 text-sm">
                      <p>
                        <strong>NAME:</strong> {customer.name}
                      </p>
                      <p>
                        <strong>TRANSACTION CODE:</strong>{" "}
                        {selectedOrder.code || selectedOrder.id}
                      </p>
                      <p className="col-span-2">
                        <strong>ADDRESS:</strong> {customer.address}
                      </p>
                      <p>
                        <strong>CONTACT PERSON:</strong>{" "}
                        {customer.contact_person || "N/A"}
                      </p>
                      <p>
                        <strong>TEL NO:</strong> {customer.phone}
                      </p>
                      <p>
                        <strong>TERMS:</strong>{" "}
                        {editMode ? (
                          <input
                            className="border rounded px-2 py-1"
                            value={formValues.terms}
                            onChange={(e) =>
                              setFormValues((v) => ({
                                ...v,
                                terms: e.target.value,
                              }))
                            }
                          />
                        ) : (
                          formValues.terms
                        )}
                      </p>
                      <p>
                        <strong>COLLECTION:</strong>{" "}
                        {editMode ? (
                          <input
                            className="border rounded px-2 py-1"
                            value={formValues.collection}
                            onChange={(e) =>
                              setFormValues((v) => ({
                                ...v,
                                collection: e.target.value,
                              }))
                            }
                          />
                        ) : (
                          formValues.collection
                        )}
                      </p>
                      <p>
                        <strong>CREDIT LIMIT:</strong>{" "}
                        {editMode ? (
                          <input
                            className="border rounded px-2 py-1"
                            value={formValues.credit_limit}
                            onChange={(e) =>
                              setFormValues((v) => ({
                                ...v,
                                credit_limit: e.target.value,
                              }))
                            }
                            type="number"
                            min="0"
                          />
                        ) : formValues.credit_limit ? (
                          `₱${Number(formValues.credit_limit).toLocaleString()}`
                        ) : (
                          ""
                        )}
                      </p>
                      <p>
                        <strong>SALESMAN:</strong>{" "}
                        {editMode ? (
                          <input
                            className="border rounded px-2 py-1"
                            value={formValues.salesman}
                            onChange={(e) =>
                              setFormValues((v) => ({
                                ...v,
                                salesman: e.target.value,
                              }))
                            }
                          />
                        ) : (
                          formValues.salesman
                        )}
                      </p>
                    </div>

                    {/* Table */}
                    <div className="overflow-auto mt-4">
                      <table className="w-full text-sm border">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="border px-2 py-1">
                              TRANSACTION DATE
                            </th>
                            <th className="border px-2 py-1">RECEIVED DATE</th>
                            <th className="border px-2 py-1">TRANSACTION</th>
                            <th className="border px-2 py-1">STATUS</th>
                            <th className="border px-2 py-1">CHARGE</th>
                            <th className="border px-2 py-1">CREDIT</th>
                            <th className="border px-2 py-1">BALANCE</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td className="border px-2 py-1">
                              {selectedOrder.date_created
                                ? new Date(selectedOrder.date_created)
                                    .toISOString()
                                    .split("T")[0]
                                : ""}
                            </td>
                            <td className="border px-2 py-1">
                              {selectedOrder.date_created
                                ? new Date(
                                    selectedOrder.date_created
                                  ).toLocaleDateString("en-PH", {
                                    year: "numeric",
                                    month: "long",
                                    day: "numeric",
                                  })
                                : ""}
                            </td>
                            <td className="border px-2 py-1">
                              {selectedOrder.transaction || "—"}
                            </td>
                            <td className="border px-2 py-1">
                              {selectedOrder.status || "Pending"}
                            </td>
                            <td className="border px-2 py-1">
                              ₱
                              {Number(
                                selectedOrder.total_amount || 0
                              ).toLocaleString()}
                            </td>
                            <td className="border px-2 py-1">₱0</td>
                            <td className="border px-2 py-1">
                              ₱
                              {Number(
                                selectedOrder.total_amount || 0
                              ).toLocaleString()}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          ));
        })}
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
                  URL.revokeObjectURL(pdfUrl!);
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
