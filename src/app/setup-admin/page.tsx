// app/setup-admin/page.tsx (Frontend)

"use client";

import { useState } from "react";

export default function SetupAdminPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const res = await fetch("/api/setup-admin", {
      method: "POST",
      body: JSON.stringify({ email, password }),
      headers: { "Content-Type": "application/json" },
    });

    try {
      // Log the raw response for debugging
      const result = await res.text(); // Use text() to get the raw response
      console.log("Response body:", result);

      // Now try to parse the response
      const parsedResult = JSON.parse(result); // Try parsing manually

      if (res.ok) {
        alert("Admin created successfully!");
      } else {
        alert("Error: " + parsedResult.error);
      }
    } catch (error) {
      console.error("Failed to parse response:", error);
      alert("Failed to parse server response.");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 max-w-sm mx-auto">
      <h2 className="text-xl font-bold mb-4">Setup Admin</h2>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="mb-2 p-2 border rounded w-full"
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="mb-2 p-2 border rounded w-full"
      />
      <button
        type="submit"
        className="bg-blue-600 text-white p-2 rounded w-full"
      >
        Create Admin
      </button>
    </form>
  );
}
