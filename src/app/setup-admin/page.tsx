// app/setup-admin/page.tsx

"use client";

import { useState } from "react";
import { toast } from "sonner";

const ROLES = [
  { value: "admin", label: "Admin" },
  { value: "cashier", label: "Cashier / Sales Rep" },
  { value: "warehouse", label: "Warehouse Keeper" },
  { value: "trucker", label: "Trucker" },
  { value: "customer", label: "Customer" },
];

export default function SetupAdminPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("admin");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password.trim()) {
      toast.error("All fields are required.");
      return;
    }
    setLoading(true);

    try {
      const res = await fetch("/api/setup-admin", {
        method: "POST",
        body: JSON.stringify({ name, email, password, role }),
        headers: { "Content-Type": "application/json" },
      });

      const resultText = await res.text();
      let result: any;
      try {
        result = JSON.parse(resultText);
      } catch {
        result = { error: resultText };
      }

      if (res.ok) {
        toast.success("User created successfully!");
        setSuccess(true);
        setName("");
        setEmail("");
        setPassword("");
      } else {
        toast.error("Error: " + (result.error || "Unknown error"));
      }
    } catch (error: any) {
      toast.error("Failed to connect: " + (error?.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="max-w-md mx-auto mt-10 bg-white shadow-lg rounded-xl p-8 text-center">
        <h2 className="text-2xl font-bold mb-4">Setup Complete</h2>
        <p className="mb-4">User account created successfully!</p>
        <button
          className="bg-blue-600 text-white px-6 py-2 rounded"
          onClick={() => setSuccess(false)}
        >
          Add Another
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="p-6 bg-white rounded-xl shadow-md max-w-md mx-auto mt-10 flex flex-col gap-4"
      style={{ minWidth: 320 }}
    >
      <h2 className="text-xl font-bold mb-2 text-center">Setup User</h2>
      <input
        type="text"
        placeholder="Full Name"
        value={name}
        autoFocus
        onChange={e => setName(e.target.value)}
        className="p-2 border rounded w-full"
      />
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        className="p-2 border rounded w-full"
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        className="p-2 border rounded w-full"
      />
      <select
        value={role}
        onChange={e => setRole(e.target.value)}
        className="p-2 border rounded w-full"
      >
        {ROLES.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={loading}
        className="bg-blue-600 text-white p-2 rounded w-full disabled:opacity-60"
      >
        {loading ? "Creating..." : "Create User"}
      </button>
    </form>
  );
}
