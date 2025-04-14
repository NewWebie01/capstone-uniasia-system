"use client";
import { useState } from "react";
import { motion } from "framer-motion";

type InventoryItem = {
  id: number;
  sku: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  status: "In Stock" | "Low Stock" | "Out of Stock";
  createdAt: string;
  srp: number;
};

const inventoryData: InventoryItem[] = [
  {
    id: 1,
    sku: "PAINT-WHT-001",
    name: "White Latex Paint",
    category: "Paint",
    quantity: 25,
    unit: "gallons",
    status: "In Stock",
    createdAt: "2024-04-01",
    srp: 500,
  },
  {
    id: 2,
    sku: "DRILL-ELC-002",
    name: "Electric Drill",
    category: "Power Tools",
    quantity: 5,
    unit: "pcs",
    status: "Low Stock",
    createdAt: "2024-03-21",
    srp: 1500,
  },
  {
    id: 3,
    sku: "HAND-SCR-003",
    name: "Screwdriver Set",
    category: "Hand Tools",
    quantity: 0,
    unit: "sets",
    status: "Out of Stock",
    createdAt: "2024-03-15",
    srp: 400,
  },
  {
    id: 4,
    sku: "HAND-HAM-004",
    name: "Hammer",
    category: "Hand Tools",
    quantity: 12,
    unit: "pcs",
    status: "In Stock",
    createdAt: "2024-03-10",
    srp: 300,
  },
  {
    id: 5,
    sku: "PAINT-VAR-005",
    name: "Wood Varnish",
    category: "Paint",
    quantity: 7,
    unit: "liters",
    status: "Low Stock",
    createdAt: "2024-04-05",
    srp: 650,
  },
  {
    id: 6,
    sku: "PAINT-BRU-006",
    name: 'Paint Brush 2"',
    category: "Paint",
    quantity: 40,
    unit: "pcs",
    status: "In Stock",
    createdAt: "2024-04-10",
    srp: 80,
  },
  {
    id: 7,
    sku: "MEAS-TAP-007",
    name: "Measuring Tape",
    category: "Measuring Tools",
    quantity: 15,
    unit: "pcs",
    status: "In Stock",
    createdAt: "2024-04-11",
    srp: 120,
  },
  {
    id: 8,
    sku: "POWR-ANG-008",
    name: "Angle Grinder",
    category: "Power Tools",
    quantity: 3,
    unit: "pcs",
    status: "Low Stock",
    createdAt: "2024-04-02",
    srp: 2300,
  },
  {
    id: 9,
    sku: "HAND-CHI-009",
    name: "Chisel Set",
    category: "Hand Tools",
    quantity: 10,
    unit: "sets",
    status: "In Stock",
    createdAt: "2024-03-28",
    srp: 450,
  },
  {
    id: 10,
    sku: "HAND-PLI-010",
    name: "Pliers",
    category: "Hand Tools",
    quantity: 20,
    unit: "pcs",
    status: "In Stock",
    createdAt: "2024-03-26",
    srp: 350,
  },
];

type SortKey = keyof InventoryItem;

export default function InventoryPage() {
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [searchQuery, setSearchQuery] = useState("");
  const [newItem, setNewItem] = useState<Omit<InventoryItem, "id">>({
    sku: generateSku(),
    name: "",
    category: "",
    quantity: 0,
    unit: "",
    status: "In Stock",
    createdAt: new Date().toISOString().split("T")[0],
    srp: 0,
  });

  const handleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortBy(key);
      setSortDirection("asc");
    }
  };

  const handleAddItem = () => {
    if (
      !newItem.sku ||
      !newItem.name ||
      !newItem.category ||
      !newItem.unit ||
      !newItem.createdAt
    ) {
      alert("Please fill all fields!");
      return;
    }

    const newItemWithId = {
      ...newItem,
      id: inventoryData.length + 1,
    };

    inventoryData.push(newItemWithId);

    setNewItem({
      sku: generateSku(),
      name: "",
      category: "",
      quantity: 0,
      unit: "",
      status: "In Stock",
      createdAt: new Date().toISOString().split("T")[0],
      srp: 0,
    });
  };

  const filteredItems = inventoryData
    .filter((item) => {
      const query = searchQuery.toLowerCase();
      return (
        item.name.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query) ||
        item.status.toLowerCase().includes(query) ||
        item.sku.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      const aValue = a[sortBy];
      const bValue = b[sortBy];

      if (typeof aValue === "number" && typeof bValue === "number") {
        return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
      } else {
        return sortDirection === "asc"
          ? String(aValue).localeCompare(String(bValue))
          : String(bValue).localeCompare(String(aValue));
      }
    });

  function generateSku() {
    const randomString = Math.random()
      .toString(36)
      .substring(2, 7)
      .toUpperCase();
    return `SKU-${randomString}`;
  }

  return (
    <div className="pt-2 p-4">
      <motion.h1 className="text-3xl font-bold mb-4">Inventory</motion.h1>

      <motion.input
        type="text"
        placeholder="Search items..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="mb-4 w-full md:w-1/3 px-4 py-2 border rounded shadow-sm"
      />

      <motion.div className="overflow-x-auto rounded-lg shadow">
        <table className="min-w-full bg-white text-sm">
          <thead className="bg-[#ffba20] text-black text-left">
            <tr>
              {[
                "name",
                "quantity",
                "unit",
                "createdAt",
                "sku",
                "category",
                "srp",
              ].map((key) => (
                <th
                  key={key}
                  className="py-3 px-5 cursor-pointer"
                  onClick={() => handleSort(key as SortKey)}
                >
                  {key.charAt(0).toUpperCase() + key.slice(1)}{" "}
                  {sortBy === key && (sortDirection === "asc" ? "↑" : "↓")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => (
              <tr
                key={item.id}
                className="border-b hover:bg-gray-100 transition duration-150"
              >
                <td className="py-3 px-5">{item.name}</td>
                <td className="py-3 px-5">{item.quantity}</td>
                <td className="py-3 px-5">{item.unit}</td>
                <td className="py-3 px-5">{item.createdAt}</td>
                <td className="py-3 px-5">{item.sku}</td>
                <td className="py-3 px-5">{item.category}</td>
                <td className="py-3 px-5">₱{item.srp}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredItems.length === 0 && (
          <div className="p-4 text-center text-gray-500">No items found.</div>
        )}
      </motion.div>

      {/* Add Item Form */}
      <motion.div className="mt-8 p-4 bg-gray-100 rounded-lg">
        <h2 className="text-2xl font-bold mb-4">Add Item</h2>
        <div className="space-y-4">
          <div>
            <label htmlFor="name" className="block font-medium mb-1">
              Item Name
            </label>
            <input
              type="text"
              id="name"
              placeholder="Enter Item Name"
              value={newItem.name}
              onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
              className="w-full px-4 py-2 border rounded shadow-sm"
            />
          </div>
          <div>
            <label htmlFor="quantity" className="block font-medium mb-1">
              Quantity
            </label>
            <input
              type="number"
              id="quantity"
              placeholder="Enter Quantity"
              value={newItem.quantity}
              onChange={(e) =>
                setNewItem({ ...newItem, quantity: +e.target.value })
              }
              className="w-full px-4 py-2 border rounded shadow-sm"
            />
          </div>
          <div>
            <label htmlFor="unit" className="block font-medium mb-1">
              Unit
            </label>
            <input
              type="text"
              id="unit"
              placeholder="Enter Unit (e.g., pcs)"
              value={newItem.unit}
              onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
              className="w-full px-4 py-2 border rounded shadow-sm"
            />
          </div>
          <div>
            <label htmlFor="category" className="block font-medium mb-1">
              Category
            </label>
            <input
              type="text"
              id="category"
              placeholder="Enter Category"
              value={newItem.category}
              onChange={(e) =>
                setNewItem({ ...newItem, category: e.target.value })
              }
              className="w-full px-4 py-2 border rounded shadow-sm"
            />
          </div>
          <div>
            <label htmlFor="srp" className="block font-medium mb-1">
              SRP
            </label>
            <input
              type="number"
              id="srp"
              placeholder="Enter SRP"
              value={newItem.srp}
              onChange={(e) => setNewItem({ ...newItem, srp: +e.target.value })}
              className="w-full px-4 py-2 border rounded shadow-sm"
            />
          </div>
          <button
            onClick={handleAddItem}
            className="mt-4 px-6 py-2 bg-black text-white rounded hover:bg-[#ffba20] hover:text-black transition-colors"
          >
            Add Item
          </button>
        </div>
      </motion.div>
    </div>
  );
}
