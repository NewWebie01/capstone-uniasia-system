"use client";

import { useState, useEffect } from "react";
import supabase from "@/config/supabaseClient";

type InventoryItem = {
  id: number;
  sku: string;
  product_name: string;
  category: string;
  subcategory?: string;
  unit_price: number;
  quantity: number;
  unit: string;
  amount: number;
  max_quantity: number;
  date_created: string;
};

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const itemsPerPage = 20;

  const [newItem, setNewItem] = useState<Omit<InventoryItem, "id">>({
    product_name: "",
    category: "",
    subcategory: "",
    quantity: 0,
    unit_price: 0,
    unit: "",
    amount: 0,
    max_quantity: 0,
    date_created: new Date().toLocaleString("en-PH", {
      dateStyle: "long",
      timeStyle: "short",
      hour12: true,
    }),
    sku: "",
  });

  useEffect(() => {
    // Live total calculation
    const total = newItem.unit_price * newItem.quantity;
    setNewItem((prev) => ({ ...prev, amount: total }));
  }, [newItem.unit_price, newItem.quantity]);
  const unitOptions = ["Pieces (pcs)", "Gallons (gal)", "Sets"];
  const categoryOptions = ["Nails", "Screws", "Paint"];
  const subcategoryOptions: { [key: string]: string[] } = {
    Nails: ["Common Nails", "Finishing Nails"],
    Screws: ["Wood Screws", "Machine Screws"],
    Paint: ["Gloss", "Matte"],
  };

  const handleProductNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    const sub =
      subcategoryOptions[newItem.category]?.find((sub) =>
        name.toLowerCase().includes(sub.toLowerCase())
      ) || "";
    setNewItem({ ...newItem, product_name: name, subcategory: sub });
  };

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const category = e.target.value;
    const sub =
      subcategoryOptions[category]?.find((sub) =>
        newItem.product_name.toLowerCase().includes(sub.toLowerCase())
      ) || "";
    setNewItem({ ...newItem, category, subcategory: sub });
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    field: "quantity" | "unit_price"
  ) => {
    const value = parseFloat(e.target.value) || 0;
    setNewItem((prev) => ({ ...prev, [field]: value }));
  };

  const handleUnitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setNewItem((prev) => ({ ...prev, unit: e.target.value }));
  };

  const handleSubcategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setNewItem((prev) => ({ ...prev, subcategory: e.target.value }));
  };
  const generateUniqueSku = async (category: string) => {
    const prefix = category.slice(0, 3).toUpperCase();
    const { data: existingItems } = await supabase
      .from("inventory")
      .select("sku")
      .like("sku", `${prefix}%`);
    const seq = String((existingItems?.length || 0) + 1).padStart(3, "0");
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}-${seq}-${timestamp}-${random}`;
  };

  const fetchItems = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("inventory").select();
    if (error) setFetchError("Could not fetch data");
    else setItems(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const handleSubmitItem = async () => {
    if (
      !newItem.product_name ||
      !newItem.category ||
      !newItem.unit ||
      !newItem.subcategory ||
      newItem.quantity <= 0 ||
      newItem.unit_price <= 0
    ) {
      alert("Please fill all fields properly.");
      return;
    }

    try {
      newItem.sku = await generateUniqueSku(newItem.category);

      const { error } =
        editingItemId !== null
          ? await supabase
              .from("inventory")
              .update({ ...newItem })
              .eq("id", editingItemId)
          : await supabase.from("inventory").insert([{ ...newItem }]);

      if (error) throw error;

      setNewItem({
        product_name: "",
        category: "",
        subcategory: "",
        quantity: 0,
        unit_price: 0,
        unit: "",
        amount: 0,
        max_quantity: 0,
        date_created: new Date().toLocaleString("en-PH", {
          dateStyle: "long",
          timeStyle: "short",
          hour12: true,
        }),
        sku: "",
      });

      setEditingItemId(null);
      fetchItems();
      setCurrentPage(1);
      setShowForm(false);
    } catch (err: any) {
      console.error("Error:", err.message);
    }
  };

  const getStatus = (qty: number, max: number) => {
    if (qty >= max) return "In Stock";
    if (qty > 0) return "Low Stock";
    return "Out of Stock";
  };

  const filteredItems = items
    .filter((item) =>
      `${item.product_name} ${item.category} ${item.subcategory}`
        .toLowerCase()
        .includes(searchQuery.toLowerCase())
    )
    .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const totalPages = Math.ceil(items.length / itemsPerPage);
  return (
    <div className="p-4">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">Inventory</h1>

      <input
        className="border px-3 py-2 mb-4 w-full md:w-1/2 rounded-full"
        placeholder="Search inventory..."
        title="Search by product, category or subcategory"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      <div className="overflow-auto rounded-lg shadow">
        <table className="min-w-full bg-white text-sm rounded-md overflow-hidden">
          <thead className="bg-[#ffba20] text-black text-left">
            <tr>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3">Product Name</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Subcategory</th>
              <th className="px-4 py-3">Quantity</th>
              <th className="px-4 py-3">Unit Price</th>
              <th className="px-4 py-3">Total Price</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Date Added</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => (
              <tr key={item.id} className="border-b hover:bg-gray-100">
                <td className="px-4 py-3">{item.sku}</td>
                <td className="px-4 py-3">{item.product_name}</td>
                <td className="px-4 py-3">{item.category}</td>
                <td className="px-4 py-3">{item.subcategory}</td>
                <td className="px-4 py-3">{item.quantity.toLocaleString()}</td>
                <td className="px-4 py-3">
                  ₱{item.unit_price.toLocaleString()}
                </td>
                <td className="px-4 py-3">₱{item.amount.toLocaleString()}</td>
                <td className="px-4 py-3">
                  {getStatus(item.quantity, item.max_quantity)}
                </td>
                <td className="px-4 py-3">{item.date_created}</td>
                <td className="px-4 py-3">
                  <button
                    className="text-blue-600 hover:underline"
                    onClick={() => {
                      setEditingItemId(item.id);
                      setNewItem({ ...item });
                      setShowForm(true);
                    }}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-3 flex justify-between items-center bg-[#f0ca75] rounded-lg px-4 py-3 shadow-sm">
          <button
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => p - 1)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors duration-200 ${
              currentPage === 1
                ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                : "bg-white hover:bg-[#ffba20] text-black"
            }`}
          >
            ← Prev
          </button>

          <span className="text-sm font-semibold text-gray-800">
            Page {currentPage} of {totalPages}
          </span>

          <button
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage((p) => p + 1)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors duration-200 ${
              currentPage === totalPages
                ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                : "bg-white hover:bg-[#ffba20] text-black"
            }`}
          >
            Next →
          </button>
        </div>
      </div>

      <div className="mt-6">
        <button
          onClick={() => {
            setShowForm(true);
            setEditingItemId(null);
            setNewItem({
              product_name: "",
              category: "",
              subcategory: "",
              quantity: 0,
              unit_price: 0,
              unit: "",
              amount: 0,
              max_quantity: 0,
              date_created: new Date().toLocaleString("en-PH", {
                dateStyle: "long",
                timeStyle: "short",
                hour12: true,
              }),
              sku: "",
            });
          }}
          className="px-4 py-2 btn btn-primary hover:text-[#ffba20] transition-colors duration-300"
        >
          Add New Item
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white p-8 rounded-xl shadow-xl w-full max-w-xl space-y-4">
            <h2 className="text-xl font-bold mb-4">
              {editingItemId ? "Edit Item" : "Add New Item"}
            </h2>

            <input
              title="e.g. Boysen Gloss Paint"
              placeholder="Input product name"
              value={newItem.product_name}
              onChange={handleProductNameChange}
              className="w-full mb-3 px-3 py-2 border"
            />

            <select
              title="Select a category (e.g. Screws, Paint)"
              value={newItem.category}
              onChange={handleCategoryChange}
              className="w-full mb-3 px-3 py-2 border"
            >
              <option value="">Select Category</option>
              {categoryOptions.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            {subcategoryOptions[newItem.category] && (
              <select
                title="Select a subcategory (e.g. Wood Screws)"
                value={newItem.subcategory}
                onChange={handleSubcategoryChange}
                className="w-full mb-3 px-3 py-2 border"
              >
                <option value="">Select Subcategory</option>
                {subcategoryOptions[newItem.category].map((sub, i) => (
                  <option key={`${sub}-${i}`} value={sub}>
                    {sub}
                  </option>
                ))}
              </select>
            )}

            <select
              title="Select unit of measurement (e.g. pcs, gal)"
              value={newItem.unit}
              onChange={handleUnitChange}
              className="w-full mb-3 px-3 py-2 border"
            >
              <option value="">Select Unit</option>
              {unitOptions.map((unit, i) => (
                <option key={`${unit}-${i}`} value={unit}>
                  {unit}
                </option>
              ))}
            </select>

            <input
              title="e.g. 5"
              placeholder="Input quantity"
              value={newItem.quantity}
              onChange={(e) => handleInputChange(e, "quantity")}
              className="w-full mb-3 px-3 py-2 border"
            />

            <input
              title="e.g. 129.99"
              placeholder="Input unit price"
              value={newItem.unit_price}
              onChange={(e) => handleInputChange(e, "unit_price")}
              className="w-full mb-3 px-3 py-2 border"
            />

            <input
              type="number"
              title="Automatically calculated (unit price x quantity)"
              placeholder="Total Price"
              value={newItem.amount}
              readOnly
              className="w-full mb-3 px-3 py-2 border bg-gray-100 text-gray-600 cursor-not-allowed"
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingItemId(null);
                }}
                className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
              >
                Cancel
              </button>

              <button
                onClick={() => {
                  setNewItem({
                    product_name: "",
                    category: "",
                    subcategory: "",
                    quantity: 0,
                    unit_price: 0,
                    unit: "",
                    amount: 0,
                    max_quantity: 0,
                    date_created: new Date().toLocaleString("en-PH", {
                      dateStyle: "long",
                      timeStyle: "short",
                      hour12: true,
                    }),
                    sku: "",
                  });
                  setEditingItemId(null);
                }}
                className="bg-[#ffba20] text-white px-4 py-2 rounded hover:bg-yellow-600"
              >
                Clear
              </button>

              <button
                onClick={handleSubmitItem}
                className="px-4 py-2 btn btn-primary hover:text-[#ffba20] transition-colors duration-300"
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
