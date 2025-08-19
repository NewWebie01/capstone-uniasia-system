// src/app/track/page.tsx
"use client";
import { useState } from "react";

export default function TrackPage() {
  const [orderNumber, setOrderNumber] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCheck(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await fetch("/api/tracking/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber, code }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed");
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="max-w-xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-4">Track your delivery</h1>
      <form onSubmit={handleCheck} className="space-y-4">
        <div>
          <label className="block text-sm mb-1">Order Number</label>
          <input
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            placeholder="UA-2025-001234"
            className="w-full rounded border px-3 py-2"
            required
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Access Code</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="FX3J-72QM"
            className="w-full rounded border px-3 py-2 tracking-widest uppercase"
            required
          />
        </div>
        <button
          disabled={loading}
          className="w-full rounded bg-black text-white py-2 disabled:opacity-50"
        >
          {loading ? "Checking..." : "Check Status"}
        </button>
      </form>

      {error && <p className="mt-4 text-red-600">{error}</p>}
      {result && (
        <div className="mt-6 rounded border p-4">
          <h2 className="font-medium mb-2">Order {result.order.orderNumber}</h2>
          <p>Status: {result.order.status}</p>
          <p>ETA: {result.order.deliveryETA ?? "—"}</p>
          <p>Last updated: {new Date(result.order.lastUpdated).toLocaleString()}</p>
          <h3 className="mt-4 font-medium">Items</h3>
          <ul className="list-disc ml-5">
            {result.items.map((it: any, idx: number) => (
              <li key={idx}>{it.product_name} — {it.quantity} {it.unit} ({it.status})</li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}