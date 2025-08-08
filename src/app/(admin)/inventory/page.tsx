"use client";

import { useEffect, useState } from "react";
import supabase from "@/config/supabaseClient";

type InventoryItem = {
  id: number;
  sku: string;
  product_name: string;
  category: string;
  subcategory: string;
  unit: string;
  quantity: number;
  unit_price: number;
  amount: number;
  date_created: string;
  status: string;
};

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [loading, setLoading] = useState(true);
  const categoryOptions = ["Paint", "Cement", "Tools", "Plumbing"];
  const categoryToSubcategories: Record<string, string[]> = {
    Paint: ["Acrylic", "Latex", "Oil-Based"],
    Cement: ["Masonry", "Quick-Set", "Waterproof"],
    Tools: ["Hand Tools", "Power Tools", "Measuring Tools"],
    Plumbing: ["Pipes", "Fittings", "Valves"],
  };

  const unitOptions = ["pcs", "box", "gal", "kg", "bag"];

  const [newItem, setNewItem] = useState<Omit<InventoryItem, "id">>({
    sku: "",
    product_name: "",
    category: "",
    quantity: 0,
    subcategory: "",
    unit: "",
    unit_price: 0,
    amount: 0,
    date_created: new Date().toISOString(),
    status: "",
  });

  const [validationErrors, setValidationErrors] = useState({
    product_name: false,
    category: false,
    subcategory: false,
    unit: false,
    quantity: false,
    unit_price: false,
  });

  const subcategoryOptions = categoryToSubcategories[newItem.category] || [];
  const fetchItems = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("inventory")
      .select("*")
      .order("date_created", { ascending: false });

    if (!error && data) {
      setItems(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchItems();
  }, []);

  useEffect(() => {
    const amount = newItem.unit_price * newItem.quantity;
    setNewItem((prev) => ({ ...prev, amount }));
  }, [newItem.unit_price, newItem.quantity]);

  const handleSubmitItem = async () => {
    try {
      const errors = {
        product_name: !newItem.product_name,
        category: !newItem.category,
        subcategory: !newItem.subcategory,
        unit: !newItem.unit,
        quantity: newItem.quantity < 0,
        unit_price: newItem.unit_price <= 0,
      };

      setValidationErrors(errors);

      const hasErrors = Object.values(errors).some((v) => v);
      if (hasErrors) {
        return;
      }

      const dataToSave = {
        ...newItem,
        date_created: new Date().toISOString(),
      };

      const { error } =
        editingItemId !== null
          ? await supabase
              .from("inventory")
              .update(dataToSave)
              .eq("id", editingItemId)
          : await supabase.from("inventory").insert([dataToSave]);

      if (error) throw error;

      setNewItem({
        sku: "",
        product_name: "",
        category: "",
        quantity: 0,
        subcategory: "", // ✅ add this
        unit: "",
        unit_price: 0,
        amount: 0,
        date_created: new Date().toISOString(),
        status: "",
      });

      setShowForm(false);
      setEditingItemId(null);
      fetchItems();
    } catch (err: any) {
      console.error(err);
      alert("Error saving item: " + err.message);
    }
  };

  const filteredItems = items
    .filter((item) =>
      `${item.product_name}`.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const totalPages = Math.ceil(items.length / itemsPerPage);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-6">Inventory</h1>

      <div className="flex gap-4 mb-4">
        <input
          className="border px-4 py-2 w-full max-w-md rounded"
          placeholder="Search by product name"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <button
          className="bg-black text-white px-4 py-2 rounded hover:text-[#ffba20]"
          onClick={() => {
            setShowForm(true);
            setEditingItemId(null);
            setNewItem({
              sku: "",
              product_name: "",
              category: "",
              quantity: 0,
              subcategory: "", // ✅ add this
              unit: "",
              unit_price: 0,
              amount: 0,
              date_created: new Date().toISOString(),
              status: "",
            });
          }}
        >
          Add New Item
        </button>
      </div>

      <div className="overflow-auto rounded-lg shadow">
        <table className="min-w-full bg-white text-sm">
          <thead className="bg-[#ffba20] text-black text-left">
            <tr>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Subcategory</th>
              <th className="px-4 py-3">Unit</th>

              <th className="px-4 py-3">Quantity</th>
              <th className="px-4 py-3">Unit Price</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => (
              <tr key={item.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-2">{item.sku}</td>
                <td className="px-4 py-2">{item.product_name}</td>
                <td className="px-4 py-2">{item.category}</td>
                <td className="px-4 py-2">{item.subcategory}</td>
                <td className="px-4 py-2">{item.unit}</td>
                <td className="px-4 py-2">{item.quantity}</td>
                <td className="px-4 py-2">
                  ₱{item.unit_price.toLocaleString()}
                </td>
                <td className="px-4 py-2">₱{item.amount.toLocaleString()}</td>
                <td className="px-4 py-2">
                  <span
                    className={`font-semibold px-2 py-1 rounded ${
                      item.status === "In Stock"
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {item.status}
                  </span>
                </td>
                <td className="px-4 py-2">
                  {new Date(item.date_created).toLocaleString("en-PH")}
                </td>
                <td className="px-4 py-2">
                  <button
                    className="text-blue-600 hover:underline"
                    onClick={() => {
                      setShowForm(true);
                      setEditingItemId(item.id);
                      setNewItem({ ...item });
                    }}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex justify-between items-center">
        <button
          disabled={currentPage === 1}
          onClick={() => setCurrentPage((p) => p - 1)}
          className="px-4 py-2 bg-gray-200 rounded disabled:opacity-50"
        >
          ← Prev
        </button>
        <span className="text-sm text-gray-600">
          Page {currentPage} of {totalPages}
        </span>
        <button
          disabled={currentPage === totalPages}
          onClick={() => setCurrentPage((p) => p + 1)}
          className="px-4 py-2 bg-gray-200 rounded disabled:opacity-50"
        >
          Next →
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white p-8 rounded-lg max-w-xl w-full space-y-4">
            <h2 className="text-lg font-semibold">
              {editingItemId ? "Edit Item" : "Add New Item"}
            </h2>

            <div className="flex items-center gap-2">
              <label className="w-36 text-sm text-gray-700">SKU</label>
              <input
                className={`flex-1 border px-4 py-2 rounded ${
                  validationErrors.product_name ? "border-red-500" : ""
                }`}
                placeholder="PRODUCT ID"
                value={newItem.product_name}
                onChange={(e) =>
                  setNewItem((prev) => ({
                    ...prev,
                    product_name: e.target.value,
                  }))
                }
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="w-36 text-sm text-gray-700">Product Name</label>
              <input
                className="flex-1 border px-4 py-2 rounded"
                placeholder="e.g. Boysen"
                value={newItem.product_name}
                onChange={(e) =>
                  setNewItem((prev) => ({
                    ...prev,
                    product_name: e.target.value,
                  }))
                }
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="w-36 text-sm text-gray-700">Category</label>
              <select
                value={newItem.category}
                onChange={(e) =>
                  setNewItem({ ...newItem, category: e.target.value })
                }
                className="flex-1 border px-4 py-2 rounded"
              >
                <option value="">Select Category</option>
                {categoryOptions.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="w-36 text-sm text-gray-700">Subcategory</label>
              <select
                value={newItem.subcategory}
                onChange={(e) =>
                  setNewItem((prev) => ({
                    ...prev,
                    subcategory: e.target.value,
                  }))
                }
                disabled={!newItem.category}
                className="flex-1 border px-4 py-2 rounded"
              >
                <option value="">Select Subcategory</option>
                {subcategoryOptions.map((sub) => (
                  <option key={sub} value={sub}>
                    {sub}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="w-36 text-sm text-gray-700">Unit</label>
              <select
                value={newItem.unit}
                onChange={(e) =>
                  setNewItem((prev) => ({ ...prev, unit: e.target.value }))
                }
                className="flex-1 border px-4 py-2 rounded"
              >
                <option value="">Select Unit</option>
                {unitOptions.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="w-36 text-sm text-gray-700">Quantity</label>
              <input
                type="number"
                className="flex-1 border px-4 py-2 rounded"
                placeholder="Enter quantity"
                value={newItem.quantity}
                onChange={(e) =>
                  setNewItem((prev) => ({
                    ...prev,
                    quantity: parseInt(e.target.value) || 0,
                  }))
                }
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="w-36 text-sm text-gray-700">Unit Price</label>
              <input
                type="number"
                className="flex-1 border px-4 py-2 rounded"
                placeholder="₱ per unit"
                value={newItem.unit_price}
                onChange={(e) =>
                  setNewItem((prev) => ({
                    ...prev,
                    unit_price: parseFloat(e.target.value) || 0,
                  }))
                }
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="w-36 text-sm text-gray-700">Total Price</label>
              <input
                type="text"
                className="flex-1 border px-4 py-2 rounded bg-gray-100 text-gray-600"
                value={`₱${newItem.amount.toLocaleString()}`}
                readOnly
                disabled
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <button
                onClick={() => setShowForm(false)}
                className="bg-gray-300 px-4 py-2 rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitItem}
                className="bg-black text-white px-4 py-2 rounded hover:text-[#ffba20]"
              >
                {editingItemId ? "Update Item" : "Add Item"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
