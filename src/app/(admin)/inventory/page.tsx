"use client";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import supabase from "@/config/supabaseClient";

type InventoryItem = {
  id: number;
  sku: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  price: number;
  max_quantity: number;
  date_created: string;
};

type SortKey = keyof InventoryItem;

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [newItem, setNewItem] = useState<Omit<InventoryItem, "id">>({
    sku: "",
    name: "",
    category: "",
    quantity: 0,
    unit: "",
    price: 0,
    max_quantity: 100,
    date_created: new Date().toLocaleString("en-PH", {
      dateStyle: "long",
      timeStyle: "short",
      hour12: true,
    }),
  });

  async function generateIncrementalSku(): Promise<string> {
    const { data, error } = await supabase
      .from("inventory")
      .select("sku")
      .order("id", { ascending: false })
      .limit(1);

    if (error) {
      console.error("Failed to fetch latest SKU", error);
      return "SKU-0001";
    }

    const latestSku = data?.[0]?.sku;
    if (!latestSku) return "SKU-0001";

    const match = latestSku.match(/SKU-(\d+)/);
    const number = match ? parseInt(match[1], 10) + 1 : 1;
    return `SKU-${number.toString().padStart(4, "0")}`;
  }

  const fetchItems = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("inventory").select();
    if (error) {
      setFetchError("Could not fetch the data");
      console.error(error);
    } else {
      setItems(data);
      setFetchError(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    const setInitialSku = async () => {
      const sku = await generateIncrementalSku();
      setNewItem((prev) => ({ ...prev, sku }));
    };
    fetchItems();
    setInitialSku();
  }, []);

  const handleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortBy(key);
      setSortDirection("asc");
    }
  };

  const handleSubmitItem = async () => {
    if (
      !newItem.name ||
      !newItem.category ||
      !newItem.unit ||
      !newItem.date_created ||
      newItem.price <= 0 ||
      newItem.quantity < 0 ||
      newItem.max_quantity <= 0
    ) {
      alert("Please fill all fields and make sure values are valid!");
      return;
    }

    try {
      if (editingItemId !== null) {
        const { error } = await supabase
          .from("inventory")
          .update(newItem)
          .eq("id", editingItemId);
        if (error) throw error;
      } else {
        const sku = await generateIncrementalSku();
        const itemToInsert = { ...newItem, sku };
        const { error } = await supabase
          .from("inventory")
          .insert([itemToInsert]);
        if (error) throw error;
      }

      await fetchItems();

      const nextSku = await generateIncrementalSku();
      setNewItem({
        sku: nextSku,
        name: "",
        category: "",
        quantity: 0,
        unit: "",
        price: 0,
        max_quantity: 100,
        date_created: new Date().toLocaleString("en-PH", {
          dateStyle: "long",
          timeStyle: "short",
          hour12: true,
        }),
      });
      setEditingItemId(null);
    } catch (error: any) {
      console.error("Error saving item:", error);
      alert(`An error occurred: ${error.message}`);
    }
  };

  const filteredItems = items
    .filter((item) => {
      const query = searchQuery.toLowerCase();
      return (
        item.name.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query) ||
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
        {loading ? (
          <div className="p-4 text-center text-gray-500">Loading...</div>
        ) : (
          <>
            <table className="min-w-full bg-white text-sm">
              <thead className="bg-[#ffba20] text-black text-left">
                <tr>
                  {[
                    "name",
                    "quantity",
                    "unit",
                    "SKU",
                    "category",
                    "price",
                    "date_created", // ✅ Added to header
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
                  <th>Status</th>
                  <th>Edit</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const stockPercent =
                    item.max_quantity > 0
                      ? (item.quantity / item.max_quantity) * 100
                      : 0;

                  const statusColor =
                    stockPercent >= 80
                      ? "text-green-600"
                      : stockPercent >= 40
                      ? "text-yellow-500"
                      : "text-red-500";

                  return (
                    <tr
                      key={item.id}
                      className="border-b hover:bg-gray-100 transition duration-150"
                    >
                      <td className="py-3 px-5">{item.name}</td>
                      <td className="py-3 px-5">{item.quantity}</td>
                      <td className="py-3 px-5">{item.unit}</td>
                      <td className="py-3 px-5">{item.sku}</td>
                      <td className="py-3 px-5">{item.category}</td>
                      <td className="py-3 px-5">₱ {item.price.toFixed(2)}</td>
                      <td className="py-3 px-5">{item.date_created}</td>{" "}
                      {/* ✅ Display here */}
                      <td className={`py-3 px-5 font-semibold ${statusColor}`}>
                        {stockPercent >= 80
                          ? "In Stock"
                          : stockPercent >= 40
                          ? "Moderate Stock"
                          : "Critical Stock"}
                      </td>
                      <td className="py-3 px-5">
                        <button
                          onClick={() => {
                            setNewItem({ ...item });
                            setEditingItemId(item.id);
                          }}
                          className="text-blue-500 underline"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredItems.length === 0 && (
              <div className="p-4 text-center text-gray-500">
                No items found.
              </div>
            )}
          </>
        )}
      </motion.div>

      <motion.div className="mt-8 p-4 bg-gray-100 rounded-lg">
        <h2 className="text-2xl font-bold mb-4">
          {editingItemId !== null ? "Edit Item" : "Add Item"}
        </h2>
        <div className="space-y-4">
          {/* Form fields (no date_created shown here) */}
          <div>
            <label className="block font-medium mb-1">SKU</label>
            <input
              type="text"
              value={newItem.sku}
              readOnly
              className="w-full px-4 py-2 border rounded bg-gray-100 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Item Name</label>
            <input
              type="text"
              value={newItem.name}
              onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
              className="w-full px-4 py-2 border rounded"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Quantity</label>
            <input
              type="number"
              value={newItem.quantity}
              onChange={(e) =>
                setNewItem({ ...newItem, quantity: +e.target.value })
              }
              className="w-full px-4 py-2 border rounded"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Max Quantity</label>
            <input
              type="number"
              value={newItem.max_quantity}
              onChange={(e) =>
                setNewItem({ ...newItem, max_quantity: +e.target.value })
              }
              className="w-full px-4 py-2 border rounded"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Unit</label>
            <input
              type="text"
              value={newItem.unit}
              onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
              className="w-full px-4 py-2 border rounded"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Category</label>
            <input
              type="text"
              value={newItem.category}
              onChange={(e) =>
                setNewItem({ ...newItem, category: e.target.value })
              }
              className="w-full px-4 py-2 border rounded"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Price (₱)</label>
            <input
              type="number"
              value={newItem.price}
              onChange={(e) =>
                setNewItem({ ...newItem, price: +e.target.value })
              }
              className="w-full px-4 py-2 border rounded"
            />
          </div>

          <div className="flex gap-4">
            <button
              onClick={handleSubmitItem}
              className="mt-4 px-6 py-2 bg-black text-white rounded hover:bg-[#ffba20] hover:text-black transition-colors"
            >
              {editingItemId !== null ? "Update Item" : "Add Item"}
            </button>

            {editingItemId !== null && (
              <button
                onClick={async () => {
                  const nextSku = await generateIncrementalSku();
                  setNewItem({
                    sku: nextSku,
                    name: "",
                    category: "",
                    quantity: 0,
                    unit: "",
                    price: 0,
                    max_quantity: 100,
                    date_created: new Date().toLocaleString("en-PH", {
                      dateStyle: "long",
                      timeStyle: "short",
                      hour12: true,
                    }),
                  });
                  setEditingItemId(null);
                }}
                className="mt-4 px-6 py-2 bg-red-500 text-white rounded hover:bg-red-600"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
