"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import supabase from "@/config/supabaseClient"; // <- import your supabase client

// --- PH Time Helper ---
function getPHISOString() {
  const now = new Date();
  // +8 hours in ms
  const ph = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return ph.toISOString().replace("T", " ").slice(0, 19);
}

export default function Page() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [role, setRole] = useState<"admin" | "customer">("customer");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (errors[e.target.name]) setErrors({ ...errors, [e.target.name]: "" });
  };

  const handleReset = () => {
    setFormData({ name: "", email: "", password: "", confirmPassword: "" });
    setRole("customer");
    setErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = "Name is required";
    if (!/\S+@\S+\.\S+/.test(formData.email))
      newErrors.email = "Invalid email address";
    if (formData.password.length < 6)
      newErrors.password = "Password must be at least 6 characters";
    if (formData.password !== formData.confirmPassword)
      newErrors.confirmPassword = "Passwords do not match";
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setIsLoading(true);
    try {
      // (1) Create the account (your original logic)
      const res = await fetch("/api/setup-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
          role,
        }),
      });

      const text = await res.text();
      let result: any;
      try {
        result = JSON.parse(text);
      } catch {
        throw new Error("Invalid JSON from server");
      }

      if (res.ok) {
        // (2) Log the activity to Supabase
        try {
          // --- Get current admin's email & role from Supabase Auth ---
          const { data: { user } } = await supabase.auth.getUser();
          const adminEmail = user?.email || "unknown";
          const adminRole = user?.user_metadata?.role || "unknown"; // <-- CRUCIAL!

          await supabase.from("activity_logs").insert([
            {
              user_email: adminEmail,
              user_role: adminRole, // <-- Save the CURRENT LOGGED IN USER's role
              action: `Created ${role === "admin" ? "Admin" : "Customer"} Account`,
              details: {
                created_name: formData.name,
                created_email: formData.email,
                created_role: role,
              },
              created_at: getPHISOString(),
            },
          ]);
        } catch (err) {
          // Logging error (don't block UI)
          console.error("Failed to log activity:", err);
        }
        alert("Account created successfully!");
        handleReset();
      } else {
        alert("Error: " + result.error);
      }
    } catch (err: any) {
      console.error(err);
      alert("Unexpected error: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div
      className="flex items-center justify-center h-[calc(100dvh-88px)] overflow-y-hidden px-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6 text-center">Create Account</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          {[
            { label: "Name", name: "name", type: "text" },
            { label: "Email", name: "email", type: "email" },
            { label: "Password", name: "password", type: "password" },
            {
              label: "Confirm Password",
              name: "confirmPassword",
              type: "password",
            },
          ].map(({ label, name, type }) => (
            <div key={name}>
              <label className="block text-sm font-medium">{label}</label>
              <input
                name={name}
                type={type}
                value={(formData as any)[name]}
                onChange={handleChange}
                required
                className={`w-full px-3 py-2 mt-1 border rounded-md outline-none focus:ring-2 ${
                  errors[name]
                    ? "border-red-500"
                    : "focus:ring-[#ffba20] border-gray-300"
                }`}
              />
              {errors[name] && (
                <p className="text-red-500 text-sm mt-1">{errors[name]}</p>
              )}
            </div>
          ))}

          {/* --- ROLE RADIO BUTTONS ADDED HERE --- */}
          <div>
            <span className="block text-sm font-medium mb-1">Account Type</span>
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="role"
                  value="admin"
                  checked={role === "admin"}
                  onChange={() => setRole("admin")}
                />
                Admin Account
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="role"
                  value="customer"
                  checked={role === "customer"}
                  onChange={() => setRole("customer")}
                />
                Customer Account
              </label>
            </div>
          </div>
          {/* --- END RADIO BUTTONS --- */}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#ffba20] text-white py-2 rounded-md hover:bg-yellow-500 transition"
            >
              {isLoading ? "Creating..." : "Create Account"}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="w-full bg-gray-300 text-black py-2 rounded-md hover:bg-gray-400 transition"
            >
              Reset
            </button>
          </div>
        </form>
      </div>
    </motion.div>
  );
}
