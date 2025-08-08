"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { CheckCircle, Clock, Truck, Plus } from "lucide-react";
import { createPagesBrowserClient } from "@supabase/auth-helpers-nextjs";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Printer, ReceiptText, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { generatePDFBlob } from "@/utils/exportInvoice";

export default function TruckDeliveryPage() {
  const supabase = createPagesBrowserClient();

  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [formVisible, setFormVisible] = useState(false);
  const [newPerson, setNewPerson] = useState("");
  const [invoiceDialogOpenId, setInvoiceDialogOpenId] = useState<number | null>(
    null
  );
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const [newDelivery, setNewDelivery] = useState({
    destination: "",
    plateNumber: "",
    status: "Scheduled",
    scheduleDate: "",
    arrivalDate: "",
    driver: "",
    participants: [] as string[],
    expenses: {
      food: 0,
      gas: 0,
      toll: 0,
      boat: 0,
      other: 0,
    },
  });

  useEffect(() => {
    const fetchDeliveries = async () => {
      const { data, error } = await supabase
        .from("truck_deliveries")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) console.error("Fetch error:", error);
      else setDeliveries(data || []);
    };

    fetchDeliveries();

    const fetchCustomers = async () => {
      const { data } = await supabase.from("customers").select("*");
      setCustomers(data || []);
    };
    fetchCustomers();
  }, []);

  const showForm = () => setFormVisible(true);

  const hideForm = () => {
    setFormVisible(false);
    setNewPerson("");
    setNewDelivery({
      destination: "",
      plateNumber: "",
      status: "Scheduled",
      scheduleDate: "",
      arrivalDate: "",
      driver: "",
      participants: [],
      expenses: { food: 0, gas: 0, toll: 0, boat: 0, other: 0 },
    });
  };

  const handleAddDelivery = async (e: React.FormEvent) => {
    e.preventDefault();

    const { error } = await supabase.from("truck_deliveries").insert([
      {
        destination: newDelivery.destination,
        plate_number: newDelivery.plateNumber,
        driver: newDelivery.driver,
        participants: newDelivery.participants,
        status: newDelivery.status,
        schedule_date: newDelivery.scheduleDate,
        arrival_date: newDelivery.arrivalDate || null,
        food: newDelivery.expenses.food,
        gas: newDelivery.expenses.gas,
        toll: newDelivery.expenses.toll,
        boat: newDelivery.expenses.boat,
        other: newDelivery.expenses.other,
      },
    ]);

    if (error) {
      console.error("Insert error:", error);
      return;
    }

    const { data: refreshedData } = await supabase
      .from("truck_deliveries")
      .select("*")
      .order("created_at", { ascending: false });

    setDeliveries(refreshedData || []);
    hideForm();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "Delivered":
        return <CheckCircle className="text-green-600" />;
      case "Ongoing":
        return <Truck className="text-yellow-600" />;
      case "Scheduled":
        return <Clock className="text-blue-600" />;
      default:
        return null;
    }
  };

  const updateDeliveryStatus = (id: number, newStatus: string) => {
    setDeliveries((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status: newStatus } : d))
    );
  };

  const addParticipant = () => {
    if (!newPerson.trim()) return;
    setNewDelivery((prev) => ({
      ...prev,
      participants: [...prev.participants, newPerson.trim()],
    }));
    setNewPerson("");
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Truck Delivery</h1>
        <button
          onClick={showForm}
          className="bg-[#181918] text-white px-4 py-2 rounded hover:text-[#ffba20] flex items-center gap-2 mr-20"
        >
          <Plus size={18} />
          Add Delivery Schedule
        </button>
      </div>

      {deliveries.map((delivery) => (
        <motion.div
          key={delivery.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="bg-white p-6 rounded-lg shadow-md mb-6"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              Delivery to {delivery.destination}
            </h2>
            <div className="flex flex-col items-end gap-1 text-sm">
              <div className="flex items-center gap-2">
                {getStatusIcon(delivery.status)}
                <select
                  value={delivery.status}
                  onChange={(e) =>
                    updateDeliveryStatus(delivery.id, e.target.value)
                  }
                  className={`border px-2 py-1 rounded text-sm ${
                    delivery.status === "Delivered"
                      ? "text-green-600"
                      : delivery.status === "Ongoing"
                      ? "text-yellow-600"
                      : "text-blue-600"
                  }`}
                >
                  <option value="Scheduled">Scheduled</option>
                  <option value="Ongoing">Ongoing</option>
                  <option value="Delivered">Delivered</option>
                </select>
              </div>

              {/* View Invoice Button + Modal */}
              <Dialog
                open={invoiceDialogOpenId === delivery.id}
                onOpenChange={(open) => {
                  setInvoiceDialogOpenId(open ? delivery.id : null);
                  setSelectedCustomer(null);
                }}
              >
                <DialogTrigger asChild>
                  <button className="text-sm text-blue-600 underline hover:text-blue-800">
                    View Invoice
                  </button>
                </DialogTrigger>
                <DialogContent className="max-w-5xl">
                  {selectedCustomer ? (
                    <div
                      id={`invoice-${selectedCustomer.id}`}
                      className="bg-white p-6 text-sm"
                    >
                      <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold flex items-center gap-2">
                          <ReceiptText /> Sales Invoice –{" "}
                          {selectedCustomer.code}
                        </h2>
                        <button
                          onClick={async () => {
                            const blob = await generatePDFBlob(
                              `invoice-${selectedCustomer.id}`
                            );
                            if (blob) {
                              const url = URL.createObjectURL(blob);
                              setPdfUrl(url);
                            }
                          }}
                          className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          <Printer className="w-4 h-4" /> Preview PDF
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-y-1 text-sm">
                        <p>
                          <strong>NAME:</strong> {selectedCustomer.name}
                        </p>
                        <p>
                          <strong>TRANSACTION CODE:</strong>{" "}
                          {selectedCustomer.code}
                        </p>
                        <p className="col-span-2">
                          <strong>ADDRESS:</strong> {selectedCustomer.address}
                        </p>
                        <p>
                          <strong>CONTACT PERSON:</strong>{" "}
                          {selectedCustomer.contact_person}
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

                      <div className="overflow-auto mt-4">
                        <table className="w-full text-sm border">
                          <thead className="bg-gray-100">
                            <tr>
                              <th className="border px-2 py-1">
                                TRANSACTION DATE
                              </th>
                              <th className="border px-2 py-1">
                                RECEIVED DATE
                              </th>
                              <th className="border px-2 py-1">TRANSACTION</th>
                              <th className="border px-2 py-1">STATUS</th>
                              <th className="border px-2 py-1">CHARGE</th>
                              <th className="border px-2 py-1">CREDIT</th>
                              <th className="border px-2 py-1">BALANCE</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(
                              selectedCustomer.transaction?.split(",") || []
                            ).map((txn: string, index: number) => (
                              <tr key={index}>
                                <td className="border px-2 py-1">
                                  {selectedCustomer.date ||
                                    selectedCustomer.created_at}
                                </td>
                                <td className="border px-2 py-1">
                                  {new Date().toLocaleDateString()}
                                </td>
                                <td className="border px-2 py-1">
                                  {txn.trim()}
                                </td>
                                <td className="border px-2 py-1">
                                  {selectedCustomer.status || "Pending"}
                                </td>
                                <td className="border px-2 py-1">₱5,000</td>
                                <td className="border px-2 py-1">₱0</td>
                                <td className="border px-2 py-1">₱5,000</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">
                        Select a customer to view their invoice:
                      </p>
                      <select
                        onChange={(e) => {
                          const selected = customers.find(
                            (c) => c.id === e.target.value
                          );
                          setSelectedCustomer(selected || null);
                        }}
                        className="border p-2 rounded w-full"
                      >
                        <option value="">-- Choose customer --</option>
                        {customers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} - {c.code}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="mt-2 text-sm text-gray-700 space-y-1">
            <p>
              <strong>Schedule Date:</strong> {delivery.schedule_date}
            </p>
            <p>
              <strong>Plate Number:</strong> {delivery.plate_number}
            </p>
            {delivery.arrival_date && (
              <p>
                <strong>Arrival Date:</strong> {delivery.arrival_date}
              </p>
            )}
            <p>
              <strong>Driver:</strong> {delivery.driver}
            </p>
            {delivery.participants?.length > 0 && (
              <p>
                <strong>Other Participants:</strong>{" "}
                {delivery.participants.join(", ")}
              </p>
            )}
          </div>

          <div className="mt-4">
            <h3 className="font-semibold mb-2">Delivery Expenses</h3>
            <ul className="text-sm space-y-1">
              <li>🚚 Food Allowance: ₱{delivery.food}</li>
              <li>⛽ Gas: ₱{delivery.gas}</li>
              <li>🛣 Toll Fees: ₱{delivery.toll}</li>
              <li>🛥 Boat Shipping: ₱{delivery.boat}</li>
              <li>📦 Other Fees: ₱{delivery.other}</li>
              <li className="font-medium">
                Total: ₱
                {(delivery.food || 0) +
                  (delivery.gas || 0) +
                  (delivery.toll || 0) +
                  (delivery.boat || 0) +
                  (delivery.other || 0)}
              </li>
            </ul>
          </div>
        </motion.div>
      ))}

      {formVisible && (
        <div className="fixed inset-0 bg-black/40 flex justify-center items-center z-50">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-white p-6 rounded-xl w-full max-w-3xl shadow-lg"
          >
            <h2 className="text-xl font-bold mb-4">Add Delivery Schedule</h2>
            <form onSubmit={handleAddDelivery} className="space-y-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <div className="flex items-center gap-2">
                  <label className="w-32 text-sm font-medium">
                    Destination
                  </label>
                  <input
                    type="text"
                    value={newDelivery.destination}
                    onChange={(e) =>
                      setNewDelivery({
                        ...newDelivery,
                        destination: e.target.value,
                      })
                    }
                    className="w-full border p-2 rounded"
                    required
                  />
                </div>

                <div className="flex items-center gap-2">
                  <label className="w-32 text-sm font-medium">
                    Plate Number
                  </label>
                  <input
                    type="text"
                    value={newDelivery.plateNumber}
                    onChange={(e) =>
                      setNewDelivery({
                        ...newDelivery,
                        plateNumber: e.target.value,
                      })
                    }
                    className="w-full border p-2 rounded"
                    required
                  />
                </div>

                <div className="flex items-center gap-2">
                  <label className="w-32 text-sm font-medium">Driver</label>
                  <input
                    type="text"
                    value={newDelivery.driver}
                    onChange={(e) =>
                      setNewDelivery({ ...newDelivery, driver: e.target.value })
                    }
                    className="w-full border p-2 rounded"
                    required
                  />
                </div>

                <div className="flex items-center gap-2">
                  <label className="w-32 text-sm font-medium">
                    Participant
                  </label>
                  <div className="flex gap-2 w-full">
                    <input
                      type="text"
                      value={newPerson}
                      onChange={(e) => setNewPerson(e.target.value)}
                      className="w-full border p-2 rounded"
                    />
                    <button
                      type="button"
                      onClick={addParticipant}
                      className="bg-gray-800 text-white px-3 py-1 rounded hover:bg-gray-900"
                    >
                      Add
                    </button>
                  </div>
                </div>

                {newDelivery.participants.length > 0 && (
                  <div className="col-span-2 text-sm pl-36 text-gray-600">
                    Current: {newDelivery.participants.join(", ")}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <label className="w-32 text-sm font-medium">Status</label>
                  <select
                    value={newDelivery.status}
                    onChange={(e) =>
                      setNewDelivery({ ...newDelivery, status: e.target.value })
                    }
                    className="w-full border p-2 rounded"
                  >
                    <option>Scheduled</option>
                    <option>Ongoing</option>
                    <option>Delivered</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <label className="w-32 text-sm font-medium">
                    Schedule Date
                  </label>
                  <input
                    type="date"
                    value={newDelivery.scheduleDate}
                    onChange={(e) =>
                      setNewDelivery({
                        ...newDelivery,
                        scheduleDate: e.target.value,
                      })
                    }
                    className="w-full border p-2 rounded"
                    required
                  />
                </div>

                {newDelivery.status === "Delivered" && (
                  <div className="flex items-center gap-2 col-span-2">
                    <label className="w-32 text-sm font-medium">
                      Arrival Date
                    </label>
                    <input
                      type="date"
                      value={newDelivery.arrivalDate}
                      onChange={(e) =>
                        setNewDelivery({
                          ...newDelivery,
                          arrivalDate: e.target.value,
                        })
                      }
                      className="w-full border p-2 rounded"
                    />
                  </div>
                )}

                {Object.keys(newDelivery.expenses).map((key) => (
                  <div className="flex items-center gap-2" key={key}>
                    <label className="w-32 text-sm font-medium capitalize">
                      {key}
                    </label>
                    <input
                      type="number"
                      placeholder="₱"
                      value={(newDelivery.expenses as any)[key]}
                      onChange={(e) =>
                        setNewDelivery({
                          ...newDelivery,
                          expenses: {
                            ...newDelivery.expenses,
                            [key]: Number(e.target.value),
                          },
                        })
                      }
                      className="w-full border p-2 rounded"
                      min={0}
                    />
                  </div>
                ))}
              </div>

              <div className="flex justify-between pt-4">
                <button
                  type="button"
                  onClick={hideForm}
                  className="text-sm text-gray-600 hover:underline"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-[#181918] text-white px-4 py-2 rounded hover:bg-[#2b2b2b]"
                >
                  Save Delivery
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
