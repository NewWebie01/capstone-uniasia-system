// app/inventory/page.tsx
"use client";
import { useState } from "react";
import { motion } from "framer-motion";

type InventoryItem = {
  id: number;
  sku: string; // added SKU field
  name: string;
  category: string;
  quantity: number;
  unit: string;
  status: "In Stock" | "Low Stock" | "Out of Stock";
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
  },
  {
    id: 2,
    sku: "DRILL-ELC-002",
    name: "Electric Drill",
    category: "Power Tools",
    quantity: 5,
    unit: "pcs",
    status: "Low Stock",
  },
  {
    id: 3,
    sku: "HAND-SCR-003",
    name: "Screwdriver Set",
    category: "Hand Tools",
    quantity: 0,
    unit: "sets",
    status: "Out of Stock",
  },
  {
    id: 4,
    sku: "HAND-HAM-004",
    name: "Hammer",
    category: "Hand Tools",
    quantity: 12,
    unit: "pcs",
    status: "In Stock",
  },
  {
    id: 5,
    sku: "PAINT-VAR-005",
    name: "Wood Varnish",
    category: "Paint",
    quantity: 7,
    unit: "liters",
    status: "Low Stock",
  },
  {
    id: 6,
    sku: "PAINT-BRU-006",
    name: 'Paint Brush 2"',
    category: "Paint",
    quantity: 40,
    unit: "pcs",
    status: "In Stock",
  },
  {
    id: 7,
    sku: "MEAS-TAP-007",
    name: "Measuring Tape",
    category: "Measuring Tools",
    quantity: 15,
    unit: "pcs",
    status: "In Stock",
  },
  {
    id: 8,
    sku: "POWR-ANG-008",
    name: "Angle Grinder",
    category: "Power Tools",
    quantity: 3,
    unit: "pcs",
    status: "Low Stock",
  },
  {
    id: 9,
    sku: "HAND-CHI-009",
    name: "Chisel Set",
    category: "Hand Tools",
    quantity: 10,
    unit: "sets",
    status: "In Stock",
  },
  {
    id: 10,
    sku: "HAND-PLI-010",
    name: "Pliers",
    category: "Hand Tools",
    quantity: 20,
    unit: "pcs",
    status: "In Stock",
  },
  // Add remaining items with SKU...
];

type SortKey = keyof InventoryItem;

export default function InventoryPage() {
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [searchQuery, setSearchQuery] = useState("");
  const [newItem, setNewItem] = useState<Omit<InventoryItem, "id">>({
    sku: "",
    name: "",
    category: "",
    quantity: 0,
    unit: "",
    status: "In Stock",
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
    if (!newItem.sku || !newItem.name || !newItem.category || !newItem.unit) {
      alert("Please fill all fields!");
      return;
    }

    const newItemWithId = { ...newItem, id: inventoryData.length + 1 };
    inventoryData.push(newItemWithId);
    setNewItem({
      sku: "",
      name: "",
      category: "",
      quantity: 0,
      unit: "",
      status: "In Stock",
    });
  };

  const filteredItems = inventoryData
    .filter((item) => {
      const query = searchQuery.toLowerCase();
      return (
        item.name.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query) ||
        item.status.toLowerCase().includes(query) ||
        item.sku.toLowerCase().includes(query) // Added SKU filter
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

  return (
    <div className="pt-2 p-4">
      <motion.h1
        className="text-3xl font-bold mb-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        Inventory
      </motion.h1>

      <motion.input
        type="text"
        placeholder="Search items..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="mb-4 w-full md:w-1/3 px-4 py-2 border rounded shadow-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
      />

      <motion.div
        className="overflow-x-auto rounded-lg shadow"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <table className="min-w-full bg-white text-sm">
          <thead className="bg-[#ffba20] text-black text-left">
            <tr>
              {["sku", "name", "category", "quantity", "unit", "status"].map(
                (key) => (
                  <th
                    key={key}
                    className="py-3 px-5 cursor-pointer"
                    onClick={() => handleSort(key as SortKey)}
                  >
                    {key.charAt(0).toUpperCase() + key.slice(1)}{" "}
                    {sortBy === key && (sortDirection === "asc" ? "↑" : "↓")}
                  </th>
                )
              )}
            </tr>
          </thead>
          <motion.tbody
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            {filteredItems.map((item) => (
              <motion.tr
                key={item.id}
                className="border-b hover:bg-gray-100 transition duration-150"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
              >
                <td className="py-3 px-5">{item.sku}</td>
                <td className="py-3 px-5">{item.name}</td>
                <td className="py-3 px-5">{item.category}</td>
                <td className="py-3 px-5">{item.quantity}</td>
                <td className="py-3 px-5">{item.unit}</td>
                <td
                  className={`py-3 px-5 font-semibold ${
                    item.status === "In Stock"
                      ? "text-green-600"
                      : item.status === "Low Stock"
                      ? "text-yellow-600"
                      : "text-red-600"
                  }`}
                >
                  {item.status}
                </td>
              </motion.tr>
            ))}
          </motion.tbody>
        </table>
        {filteredItems.length === 0 && (
          <div className="p-4 text-center text-gray-500">No items found.</div>
        )}
      </motion.div>

      {/* Add Item Form */}
      <motion.div
        className="mt-8 p-4 bg-gray-100 rounded-lg"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h2 className="text-2xl font-bold mb-4">Add Item</h2>
        <motion.div
          className="space-y-2"
          initial="hidden"
          animate="visible"
          variants={{
            hidden: { opacity: 0 },
            visible: {
              opacity: 1,
              transition: {
                staggerChildren: 0.1,
              },
            },
          }}
        >
          <motion.div
            variants={{
              hidden: { opacity: 0, y: 10 },
              visible: { opacity: 1, y: 0 },
            }}
          >
            <input
              type="text"
              placeholder="SKU"
              value={newItem.sku}
              onChange={(e) => setNewItem({ ...newItem, sku: e.target.value })}
              className="mb-2 w-full px-4 py-2 border rounded shadow-sm"
            />
          </motion.div>

          <motion.div
            variants={{
              hidden: { opacity: 0, y: 10 },
              visible: { opacity: 1, y: 0 },
            }}
          >
            <input
              type="text"
              placeholder="Name"
              value={newItem.name}
              onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
              className="mb-2 w-full px-4 py-2 border rounded shadow-sm"
            />
          </motion.div>

          <motion.div
            variants={{
              hidden: { opacity: 0, y: 10 },
              visible: { opacity: 1, y: 0 },
            }}
          >
            <input
              type="text"
              placeholder="Category"
              value={newItem.category}
              onChange={(e) =>
                setNewItem({ ...newItem, category: e.target.value })
              }
              className="mb-2 w-full px-4 py-2 border rounded shadow-sm"
            />
          </motion.div>

          <motion.div
            variants={{
              hidden: { opacity: 0, y: 10 },
              visible: { opacity: 1, y: 0 },
            }}
          >
            <input
              type="number"
              placeholder="Quantity"
              value={newItem.quantity}
              onChange={(e) =>
                setNewItem({ ...newItem, quantity: +e.target.value })
              }
              className="mb-2 w-full px-4 py-2 border rounded shadow-sm"
            />
          </motion.div>

          <motion.div
            variants={{
              hidden: { opacity: 0, y: 10 },
              visible: { opacity: 1, y: 0 },
            }}
          >
            <input
              type="text"
              placeholder="Unit"
              value={newItem.unit}
              onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
              className="mb-2 w-full px-4 py-2 border rounded shadow-sm"
            />
          </motion.div>

          <motion.button
            onClick={handleAddItem}
            className="mt-4 px-6 py-2 btn btn-primary hover:text-[#ffba20] transition-colors duration-300"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            Add Item
          </motion.button>
        </motion.div>
      </motion.div>
    </div>
  );
}
