"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle, Clock, Truck, Plus } from "lucide-react";

export default function TruckDeliveryPage() {
  const [deliveries, setDeliveries] = useState([
    {
      id: 1,
      destination: "Cebu City",
      plateNumber: "ABC-1234",
      status: "Scheduled",
      scheduleDate: "2025-08-10",
      arrivalDate: "",
      expenses: {
        food: 1500,
        gas: 5000,
        toll: 700,
        boat: 3000,
        other: 500,
      },
    },
    {
      id: 2,
      destination: "Iloilo City",
      plateNumber: "XYZ-5678",
      status: "Ongoing",
      scheduleDate: "2025-08-04",
      arrivalDate: "",
      expenses: {
        food: 1200,
        gas: 4500,
        toll: 600,
        boat: 2500,
        other: 300,
      },
    },
  ]);

  const [formVisible, setFormVisible] = useState(false);

  const showForm = () => setFormVisible(true);
  const hideForm = () => setFormVisible(false);

  const [newDelivery, setNewDelivery] = useState({
    destination: "",
    plateNumber: "",
    status: "Scheduled",
    scheduleDate: "",
    arrivalDate: "",
    expenses: {
      food: 0,
      gas: 0,
      toll: 0,
      boat: 0,
      other: 0,
    },
  });

  const handleAddDelivery = (e: React.FormEvent) => {
    e.preventDefault();

    const newEntry = {
      ...newDelivery,
      id: Date.now(),
    };

    setDeliveries([...deliveries, newEntry]);
    setNewDelivery({
      destination: "",
      plateNumber: "",
      status: "Scheduled",
      scheduleDate: "",
      arrivalDate: "",
      expenses: { food: 0, gas: 0, toll: 0, boat: 0, other: 0 },
    });
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
            <div className="flex items-center gap-2 text-sm">
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
          </div>

          <div className="mt-2 text-sm text-gray-700">
            <p>
              <strong>Schedule Date:</strong> {delivery.scheduleDate}
            </p>
            <p>
              <strong>Plate Number:</strong> {delivery.plateNumber}
            </p>
            {delivery.arrivalDate && (
              <p>
                <strong>Arrival Date:</strong> {delivery.arrivalDate}
              </p>
            )}
          </div>

          <div className="mt-4">
            <h3 className="font-semibold mb-2">Delivery Expenses</h3>
            <ul className="text-sm space-y-1">
              <li>🚚 Food Allowance: ₱{delivery.expenses.food}</li>
              <li>⛽ Gas: ₱{delivery.expenses.gas}</li>
              <li>🛣 Toll Fees: ₱{delivery.expenses.toll}</li>
              <li>🛥 Boat Shipping: ₱{delivery.expenses.boat}</li>
              <li>📦 Other Fees: ₱{delivery.expenses.other}</li>
              <li className="font-medium">
                Total: ₱
                {Object.values(delivery.expenses).reduce(
                  (acc, val) => acc + val,
                  0
                )}
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
            className="bg-white p-6 rounded-xl w-full max-w-md shadow-lg"
          >
            <h2 className="text-xl font-bold mb-4">Add Delivery Schedule</h2>
            <form onSubmit={handleAddDelivery} className="space-y-4">
              <div>
                <label className="text-sm font-medium">Destination</label>
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

              <div>
                <label className="text-sm font-medium">Plate Number</label>
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

              <div>
                <label className="text-sm font-medium">Status</label>
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

              <div>
                <label className="text-sm font-medium">Schedule Date</label>
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
                <div>
                  <label className="text-sm font-medium">Arrival Date</label>
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

              <div className="grid grid-cols-2 gap-3">
                {Object.keys(newDelivery.expenses).map((key) => (
                  <div key={key}>
                    <label className="text-sm font-medium capitalize">
                      {key}
                    </label>
                    <input
                      type="number"
                      placeholder={`₱`}
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
