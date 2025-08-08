"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle,
  Clock,
  Truck,
  Plus,
  Printer,
  ReceiptText,
} from "lucide-react";
import { createPagesBrowserClient } from "@supabase/auth-helpers-nextjs";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { generatePDFBlob } from "@/utils/exportInvoice";
import { toast } from "sonner";

export default function TruckDeliveryPage() {
  const supabase = createPagesBrowserClient();

  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [formVisible, setFormVisible] = useState(false);
  const [newPerson, setNewPerson] = useState("");
  const [invoiceDialogOpenId, setInvoiceDialogOpenId] = useState<number | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  // Confirmation-dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    id: number | null;
    newStatus: string;
  }>({ open: false, id: null, newStatus: "" });

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

    const fetchCustomers = async () => {
      const { data } = await supabase.from("customers").select("*");
      setCustomers(data || []);
    };

    fetchDeliveries();
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
      toast.error("Failed to add delivery");
      return;
    }
    const { data: refreshed } = await supabase
      .from("truck_deliveries")
      .select("*")
      .order("created_at", { ascending: false });
    setDeliveries(refreshed || []);
    toast.success("Delivery schedule added");
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

  const updateDeliveryStatusInState = (id: number, status: string) => {
    setDeliveries((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status } : d))
    );
  };

  const confirmStatusChange = async () => {
    const { id, newStatus } = confirmDialog;
    if (id == null) return;
    const { error } = await supabase
      .from("truck_deliveries")
      .update({ status: newStatus })
      .eq("id", id);
    if (error) {
      console.error("Update error:", error);
      toast.error("Failed to update delivery status");
    } else {
      updateDeliveryStatusInState(id, newStatus);
      toast.success("Delivery status changed successfully");
    }
    setConfirmDialog({ open: false, id: null, newStatus: "" });
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
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Truck Delivery</h1>
        <button
          onClick={showForm}
          className="bg-[#181918] text-white px-4 py-2 rounded hover:text-[#ffba20] flex items-center gap-2 mr-20"
        >
          <Plus size={18} /> Add Delivery Schedule
        </button>
      </div>

      {/* Delivery Cards */}
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
                    setConfirmDialog({
                      open: true,
                      id: delivery.id,
                      newStatus: e.target.value,
                    })
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

              {/* View Invoice Modal */}
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
                  <DialogTitle>Invoice Details</DialogTitle>

                  {selectedCustomer ? (
                    <div
                      id={`invoice-${selectedCustomer.id}`}
                      className="bg-white p-6 text-sm"
                    >
                      {/* ...invoice JSX unchanged... */}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">
                        Select a customer to view their invoice:
                      </p>
                      <select
                        onChange={(e) => {
                          const sel = customers.find(
                            (c) => c.id === +e.target.value
                          );
                          setSelectedCustomer(sel || null);
                        }}
                        className="border p-2 rounded w-full"
                      >
                        <option value="">-- Choose customer --</option>
                        {customers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} – {c.code}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Details & Expenses */}
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
                {[
                  delivery.food,
                  delivery.gas,
                  delivery.toll,
                  delivery.boat,
                  delivery.other,
                ].reduce((sum, fee) => sum + (fee || 0), 0)}
              </li>
            </ul>
          </div>
        </motion.div>
      ))}

      {/* Confirmation Modal */}
      <Dialog
        open={confirmDialog.open}
        onOpenChange={(open) => {
          if (!open) setConfirmDialog({ open: false, id: null, newStatus: "" });
        }}
      >
        <DialogContent>
          <DialogTitle>Confirm Status Change</DialogTitle>
          <p>
            Are you sure you want to change this delivery’s status to{" "}
            <strong>{confirmDialog.newStatus}</strong>?
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() =>
                setConfirmDialog({ open: false, id: null, newStatus: "" })
              }
              className="px-4 py-2 border rounded hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              onClick={confirmStatusChange}
              className="px-4 py-2 bg-[#181918] text-white rounded hover:bg-[#2b2b2b]"
            >
              Confirm
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Delivery Form */}
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
              {/* …form fields (unchanged)… */}
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
