"use client"; // This tells Next.js to treat this file as a Client Component

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import supabase from "@/config/supabaseClient";

// Type Definitions for Inventory Items
type InventoryItem = {
  id: number;
  sku: string;
  product_name: string;
  category: string;
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
  const [newItem, setNewItem] = useState<Omit<InventoryItem, "id">>({
    product_name: "",
    category: "",
    quantity: 0, // Ensure it's a number, not a string
    unit: "",
    amount: 0, // Ensure it's a number, not a string
    max_quantity: 0, // Will be set dynamically based on the quantity input
    date_created: new Date().toLocaleString("en-PH", {
      dateStyle: "long",
      timeStyle: "short",
      hour12: true,
    }),
    sku: "",
  });

  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // List of units for the dropdown
  const unitOptions = [
    "Pieces (pcs)",
    "Gallons (gal)",
    "Sets",
    "Kilograms (kg)",
    "Grams (g)",
    "Pounds (lbs)",
    "Feet (ft)",
    "Inches (in)",
    "Yards (yd)",
    "Meters (m)",
    "Centimeters (cm)",
    "Millimeters (mm)",
    "Liters (L)",
    "Cubic Meters (m³)",
    "Boxes",
    "Rolls",
    "Sheets",
    "Bundles",
    "Cans",
    "Pallets",
    "Sacks",
    "Bags",
    "Tubes",
    "Bars",
    "Drums",
    "Boxes",
    "Containers",
    "Buckets",
    "Jars",
    "Carton",
  ];

  // Fetch all items from the inventory
  const fetchItems = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("inventory").select();
    if (error) {
      setFetchError("Could not fetch the data");
      console.error(error);
    } else {
      setItems(data); // Directly set the data here
      setFetchError(null);
    }
    setLoading(false);
  };

  // Fetch items on mount
  useEffect(() => {
    fetchItems();
  }, []);

  // Handle category change with auto-suggestions
  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setNewItem({ ...newItem, category: e.target.value });
  };

  // Handle unit change with dropdown selection
  const handleUnitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setNewItem({ ...newItem, unit: e.target.value });
  };

  // Handle quantity and amount input change and ensure they are numbers
  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    field: "quantity" | "amount"
  ) => {
    const value = e.target.value;
    // Parse the value as a number, defaulting to 0 if it's an empty string or invalid
    const parsedValue = value === "" ? 0 : parseFloat(value);

    // If quantity is changed, set max_quantity dynamically to the inputted quantity
    if (field === "quantity") {
      setNewItem({
        ...newItem,
        [field]: parsedValue,
        max_quantity: parsedValue,
      });
    } else {
      setNewItem({ ...newItem, [field]: parsedValue });
    }
  };

  // Generate SKU based on category, sequential number, and timestamp
  const generateUniqueSku = async (category: string) => {
    const categoryPrefix = category.slice(0, 3).toUpperCase(); // First three letters of the category

    // Generate sequential ID based on the existing items in the same category
    const { data: existingItems, error } = await supabase
      .from("inventory")
      .select("sku")
      .like("sku", `${categoryPrefix}%`);

    if (error) {
      console.error("Error fetching items for SKU generation:", error);
      throw new Error("Failed to fetch existing items for SKU generation.");
    }

    // Sequential ID padded to 3 digits
    const sequentialId = String(existingItems.length + 1).padStart(3, "0");

    // Timestamp in milliseconds and random string for uniqueness
    const timestamp = Date.now();
    const randomSuffix = Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase();

    return `${categoryPrefix}-${sequentialId}-${timestamp}-${randomSuffix}`;
  };

  // Handle item form submission (add or update item)
  const handleSubmitItem = async () => {
    // Ensure all required fields are filled
    if (
      !newItem.product_name ||
      !newItem.category ||
      !newItem.unit || // Ensure that unit is selected
      !newItem.date_created ||
      newItem.amount <= 0 ||
      newItem.quantity <= 0 ||
      newItem.max_quantity <= 0
    ) {
      alert("Please fill all fields and make sure values are valid!");
      return;
    }

    try {
      if (editingItemId !== null) {
        // Regenerate SKU if category is changed
        newItem.sku = await generateUniqueSku(newItem.category);
      }

      if (editingItemId !== null) {
        // Update the item in the database
        const { error } = await supabase
          .from("inventory")
          .update({ ...newItem })
          .eq("id", editingItemId);
        if (error) throw error;
      } else {
        // Generate SKU for new item before inserting
        newItem.sku = await generateUniqueSku(newItem.category);

        const itemToInsert = { ...newItem };
        const { error } = await supabase
          .from("inventory")
          .insert([itemToInsert]);
        if (error) throw error;
      }

      // Fetch updated items after submission
      await fetchItems();

      // Reset the form for a new item
      setNewItem({
        product_name: "",
        category: "",
        quantity: 0, // Reset quantity to 0
        unit: "", // Reset unit to an empty string
        amount: 0, // Reset amount to 0
        max_quantity: 0, // Reset max_quantity to 0
        date_created: new Date().toLocaleString("en-PH", {
          dateStyle: "long",
          timeStyle: "short",
          hour12: true,
        }),
        sku: "",
      });
      setEditingItemId(null);
      setFeedbackMessage("Item successfully added/updated!");

      // Ensure the new/updated item is on the first page, and at the top of the list
      setCurrentPage(1); // Reset to the first page
    } catch (error: any) {
      console.error("Error saving item:", error);
      setFeedbackMessage(`An error occurred: ${error.message}`);
    }
  };

  // Filter and sort items based on search query and date_created
  const filteredItems = items
    .filter((item) => {
      const query = searchQuery.toLowerCase();
      return (
        item.product_name.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      // Sort based on the `date_created` field to ensure the newest items are at the top
      return (
        new Date(b.date_created).getTime() - new Date(a.date_created).getTime()
      );
    })
    .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const totalPages = Math.ceil(items.length / itemsPerPage);

  // Scroll to the add/edit form when editing an item
  const scrollToForm = () => {
    const element = document.getElementById("add-item-form");
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  // Get the status based on quantity
  const getStatus = (quantity: number, maxQuantity: number) => {
    if (quantity >= maxQuantity) {
      return "In Stock";
    } else if (quantity > 0) {
      return "Low Stock";
    } else {
      return "Out of Stock";
    }
  };

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

      {/* Search Bar */}
      <motion.input
        type="text"
        placeholder="Search items..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="mb-4 w-full md:w-1/3 px-4 py-2 border rounded shadow-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      />

      {/* Feedback Message */}
      {feedbackMessage && (
        <motion.div
          className="mb-4 text-green-600"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          {feedbackMessage}
        </motion.div>
      )}

      {/* Inventory Table */}
      <motion.div className="overflow-x-auto rounded-lg shadow">
        {loading ? (
          <motion.div
            className="p-4 text-center text-gray-500"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            Loading...
          </motion.div>
        ) : (
          <>
            <motion.table
              className="min-w-full bg-white text-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <thead className="bg-[#ffba20] text-black text-left">
                <tr>
                  {[
                    "product_name",
                    "quantity",
                    "unit",
                    "category",
                    "amount",
                    "date_created",
                    "sku",
                  ].map((key) => (
                    <th key={key} className="py-3 px-5">
                      {key
                        .split("_")
                        .map(
                          (word) => word.charAt(0).toUpperCase() + word.slice(1)
                        )
                        .join(" ")}
                    </th>
                  ))}
                  <th className="py-3 px-5">Status</th>
                  <th className="py-3 px-5">Edit</th>
                </tr>
              </thead>

              <tbody>
                {filteredItems.map((item) => {
                  return (
                    <motion.tr
                      key={item.id}
                      className="border-b hover:bg-gray-100 transition duration-150"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3 }}
                    >
                      <td className="py-3 px-5">{item.product_name}</td>
                      <td className="py-3 px-5">{item.quantity}</td>
                      <td className="py-3 px-5">{item.unit}</td>
                      <td className="py-3 px-5">{item.category}</td>
                      <td className="py-3 px-5">{item.amount}</td>
                      <td className="py-3 px-5">{item.date_created}</td>
                      <td className="py-3 px-5">{item.sku}</td>
                      <td
                        className={`py-3 px-5 ${
                          getStatus(item.quantity, item.max_quantity) ===
                          "In Stock"
                            ? "text-green-600"
                            : getStatus(item.quantity, item.max_quantity) ===
                              "Low Stock"
                            ? "text-yellow-500"
                            : "text-red-500"
                        }`}
                      >
                        {getStatus(item.quantity, item.max_quantity)}
                      </td>
                      <td className="py-3 px-5">
                        <button
                          onClick={() => {
                            setEditingItemId(item.id);
                            setNewItem({
                              product_name: item.product_name,
                              category: item.category,
                              quantity: item.quantity,
                              unit: item.unit, // Pass the unit value for editing
                              amount: item.amount,
                              max_quantity: item.max_quantity, // Pass the max quantity for editing
                              date_created: item.date_created,
                              sku: item.sku,
                            });
                            scrollToForm(); // Scroll to the form when editing
                          }}
                          className="bg-blue-500 text-white px-3 py-1 rounded hover:text-[#ffba20] transition-colors duration-300"
                        >
                          Edit
                        </button>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </motion.table>

            {/* Pagination Controls */}
            <div className="flex justify-between items-center mt-4">
              <button
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-5 py-2 btn btn-primary hover:text-[#ffba20] transition-colors duration-300"
              >
                Previous
              </button>

              <div>
                Page {currentPage} of {totalPages}
              </div>

              <button
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="px-5 py-2 btn btn-primary hover:text-[#ffba20] transition-colors duration-300"
              >
                Next
              </button>
            </div>
          </>
        )}
      </motion.div>

      {/* Add Item Form Below */}
      <motion.div
        id="add-item-form"
        className="mt-8 p-6 bg-gray-100 rounded shadow-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <h2 className="text-2xl font-bold mb-4">
          {editingItemId ? "Edit Item" : "Add New Item"}
        </h2>
        <div>
          <label className="block mb-2">Product Name</label>
          <input
            type="text"
            value={newItem.product_name}
            onChange={(e) =>
              setNewItem({ ...newItem, product_name: e.target.value })
            }
            className="w-full mb-4 px-4 py-2 border rounded"
          />

          <label className="block mb-2">Category</label>
          <select
            value={newItem.category}
            onChange={handleCategoryChange}
            className="w-full mb-4 px-4 py-2 border rounded"
          >
            <option value="" disabled>
              Select a Category
            </option>
            {[...unitOptions].map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>

          <label className="block mb-2">Unit</label>
          <select
            value={newItem.unit}
            onChange={handleUnitChange}
            className="w-full mb-4 px-4 py-2 border rounded"
          >
            <option value="" disabled>
              Select a Unit
            </option>
            {unitOptions.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>

          <label className="block mb-2">Quantity</label>
          <input
            type="number"
            value={newItem.quantity}
            onChange={(e) => handleInputChange(e, "quantity")}
            className="w-full mb-4 px-4 py-2 border rounded"
          />

          <label className="block mb-2">Amount</label>
          <input
            type="number"
            value={newItem.amount}
            onChange={(e) => handleInputChange(e, "amount")}
            className="w-full mb-4 px-4 py-2 border rounded"
          />

          {/* Removed Max Quantity input */}
          <button
            onClick={handleSubmitItem}
            className="bg-blue-500 text-white py-2 px-4 rounded hover:text-[#ffba20] transition-colors duration-300"
          >
            {editingItemId ? "Update Item" : "Add Item"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
