// app/inventory/page.tsx
"use client";
import { useState } from "react";
import { motion } from "framer-motion";

type InventoryItem = {
  id: number;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  status: "In Stock" | "Low Stock" | "Out of Stock";
};

const inventoryData: InventoryItem[] = [
  {
    id: 1,
    name: "White Latex Paint",
    category: "Paint",
    quantity: 25,
    unit: "gallons",
    status: "In Stock",
  },
  {
    id: 2,
    name: "Electric Drill",
    category: "Power Tools",
    quantity: 5,
    unit: "pcs",
    status: "Low Stock",
  },
  {
    id: 3,
    name: "Screwdriver Set",
    category: "Hand Tools",
    quantity: 0,
    unit: "sets",
    status: "Out of Stock",
  },
  {
    id: 4,
    name: "Hammer",
    category: "Hand Tools",
    quantity: 12,
    unit: "pcs",
    status: "In Stock",
  },
  {
    id: 5,
    name: "Wood Varnish",
    category: "Paint",
    quantity: 7,
    unit: "liters",
    status: "Low Stock",
  },
  {
    id: 6,
    name: 'Paint Brush 2"',
    category: "Paint",
    quantity: 40,
    unit: "pcs",
    status: "In Stock",
  },
  {
    id: 7,
    name: "Measuring Tape",
    category: "Measuring Tools",
    quantity: 15,
    unit: "pcs",
    status: "In Stock",
  },
  {
    id: 8,
    name: "Angle Grinder",
    category: "Power Tools",
    quantity: 3,
    unit: "pcs",
    status: "Low Stock",
  },
  {
    id: 9,
    name: "Chisel Set",
    category: "Hand Tools",
    quantity: 10,
    unit: "sets",
    status: "In Stock",
  },
  {
    id: 10,
    name: "Pliers",
    category: "Hand Tools",
    quantity: 20,
    unit: "pcs",
    status: "In Stock",
  },
  {
    id: 11,
    name: "Level",
    category: "Measuring Tools",
    quantity: 6,
    unit: "pcs",
    status: "Low Stock",
  },
  {
    id: 12,
    name: "Putty Knife",
    category: "Paint",
    quantity: 25,
    unit: "pcs",
    status: "In Stock",
  },
  {
    id: 13,
    name: "Paint Roller",
    category: "Paint",
    quantity: 18,
    unit: "pcs",
    status: "In Stock",
  },
  {
    id: 14,
    name: "Sandpaper Pack",
    category: "Paint",
    quantity: 30,
    unit: "packs",
    status: "In Stock",
  },
  {
    id: 15,
    name: "Ladder",
    category: "Tools",
    quantity: 5,
    unit: "pcs",
    status: "Low Stock",
  },
  {
    id: 16,
    name: "Nails",
    category: "Hardware",
    quantity: 1000,
    unit: "pcs",
    status: "In Stock",
  },
  {
    id: 17,
    name: "Screws",
    category: "Hardware",
    quantity: 500,
    unit: "pcs",
    status: "In Stock",
  },
  {
    id: 18,
    name: "Bolts",
    category: "Hardware",
    quantity: 300,
    unit: "pcs",
    status: "In Stock",
  },
  {
    id: 19,
    name: "Wrench Set",
    category: "Hand Tools",
    quantity: 8,
    unit: "sets",
    status: "In Stock",
  },
  {
    id: 20,
    name: "Socket Set",
    category: "Hand Tools",
    quantity: 4,
    unit: "sets",
    status: "Low Stock",
  },
  {
    id: 21,
    name: "Utility Knife",
    category: "Hand Tools",
    quantity: 22,
    unit: "pcs",
    status: "In Stock",
  },
  {
    id: 22,
    name: "Caulking Gun",
    category: "Tools",
    quantity: 11,
    unit: "pcs",
    status: "In Stock",
  },
  {
    id: 23,
    name: "Wire Cutter",
    category: "Hand Tools",
    quantity: 14,
    unit: "pcs",
    status: "In Stock",
  },
  {
    id: 24,
    name: "Safety Goggles",
    category: "Safety Gear",
    quantity: 20,
    unit: "pcs",
    status: "In Stock",
  },
  {
    id: 25,
    name: "Gloves",
    category: "Safety Gear",
    quantity: 50,
    unit: "pairs",
    status: "In Stock",
  },
  {
    id: 26,
    name: "Dust Mask",
    category: "Safety Gear",
    quantity: 60,
    unit: "pcs",
    status: "In Stock",
  },
  {
    id: 27,
    name: "Face Shield",
    category: "Safety Gear",
    quantity: 12,
    unit: "pcs",
    status: "In Stock",
  },
  {
    id: 28,
    name: "Drill Bits",
    category: "Accessories",
    quantity: 80,
    unit: "pcs",
    status: "In Stock",
  },
  {
    id: 29,
    name: "Extension Cord",
    category: "Electrical",
    quantity: 10,
    unit: "pcs",
    status: "Low Stock",
  },
  {
    id: 30,
    name: "Heat Gun",
    category: "Power Tools",
    quantity: 2,
    unit: "pcs",
    status: "Low Stock",
  },
];

type SortKey = keyof InventoryItem;

export default function InventoryPage() {
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [searchQuery, setSearchQuery] = useState("");

  const handleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortBy(key);
      setSortDirection("asc");
    }
  };

  const filteredItems = inventoryData
    .filter((item) => {
      const query = searchQuery.toLowerCase();
      return (
        item.name.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query) ||
        item.status.toLowerCase().includes(query)
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
              {["name", "category", "quantity", "unit", "status"].map((key) => (
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
    </div>
  );
}
