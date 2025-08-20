// src/app/customer/track/page.tsx
"use client";

import { useState } from "react";
import supabase from "@/config/supabaseClient";

/* ----------------------------- Date formatter ----------------------------- */
const formatPH = (d?: string | number | Date | null) =>
  d
    ? new Intl.DateTimeFormat("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: "Asia/Manila",
      }).format(new Date(d))
    : "—";

/* ---------------------------------- Types --------------------------------- */
type Delivery = {
  id: string | number;
  status: string | null;
  schedule_date: string | null;
  date_received?: string | null;
  driver?: string | null;
  participants?: string[] | null;
};

export default function TrackPage() {
  const [txn, setTxn] = useState("");
  const [trackingResult, setTrackingResult] = useState<any | null>(null);
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    setTrackError(null);
    setTrackingResult(null);
    setDelivery(null);
    setTrackingLoading(true);

    try {
      // 1) Get customer by TXN and include latest order with TRUCK delivery id
      const { data, error } = await supabase
        .from("customers")
        .select(
          `
          id,
          name,
          code,
          contact_person,
          email,
          phone,
          address,
          date,
          orders (
            id,
            total_amount,
            status,
            truck_delivery_id,
            order_items (
              quantity,
              price,
              inventory:inventory_id (
                product_name,
                category,
                subcategory,
                status
              )
            )
          )
        `
        )
        .eq("code", txn.trim().toUpperCase())
        .maybeSingle();

      if (error || !data) {
        setTrackError("Transaction code not found.");
        setTrackingLoading(false);
        return;
      }

      setTrackingResult(data);

      // 2) Follow truck_delivery_id to the truck_deliveries table
      const firstOrder = (data.orders ?? [])[0];
      const truckDeliveryId = firstOrder?.truck_delivery_id as
        | string
        | number
        | undefined;

      if (truckDeliveryId != null) {
        const { data: deliv, error: delivErr } = await supabase
          .from("truck_deliveries")
          .select(
            "id, status, schedule_date, date_received, driver, participants"
          )
          .eq("id", truckDeliveryId)
          .maybeSingle();

        if (!delivErr && deliv) setDelivery(deliv as Delivery);
      }
    } catch {
      setTrackError("Error while fetching. Please try again.");
    } finally {
      setTrackingLoading(false);
    }
  };

  return (
    <div className="p-4">
      <h1 className="text-3xl font-bold mb-4">Track Your Delivery</h1>

      {/* TXN Input */}
      <div className="bg-white border rounded p-4 mb-6 shadow-sm">
        <form
          onSubmit={handleTrack}
          className="flex flex-col sm:flex-row gap-3 items-start sm:items-end"
        >
          <input
            value={txn}
            onChange={(e) => {
              setTxn(e.target.value);
              setTrackingResult(null);
              setDelivery(null);
              setTrackError(null);
            }}
            placeholder="Enter TXN code (e.g., TXN-20250819-ABC123)"
            className="w-full border px-3 py-2 rounded text-sm tracking-wider uppercase"
            required
          />
          <button
            type="submit"
            disabled={trackingLoading}
            className="bg-black text-white px-4 py-2 rounded disabled:opacity-50"
          >
            {trackingLoading ? "Checking..." : "Track"}
          </button>
        </form>
        {trackError && (
          <p className="text-red-600 mt-2 text-sm">{trackError}</p>
        )}
      </div>

      {/* Customer + Order Info */}
      {trackingResult && (
        <div className="bg-gray-50 border rounded p-4 mb-6">
          <h3 className="font-semibold text-md mb-2">Customer & Order Info</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <p>
              <span className="font-medium">Name:</span> {trackingResult.name}
            </p>
            <p>
              <span className="font-medium">TXN Code:</span>{" "}
              {trackingResult.code}
            </p>

            {/* 👇 Show TRUCK DELIVERY STATUS (fallback to order status, then em dash) */}
            <p>
              <span className="font-medium">Delivery Status:</span>{" "}
              {delivery?.status ??
                trackingResult.orders?.[0]?.status ??
                "—"}
            </p>

            <p>
              <span className="font-medium">Date:</span>{" "}
              {formatPH(trackingResult.date)}
            </p>
            <p className="md:col-span-2">
              <span className="font-medium">Address:</span>{" "}
              {trackingResult.address}
            </p>
            <p>
              <span className="font-medium">Contact:</span>{" "}
              {trackingResult.phone}
            </p>
            <p>
              <span className="font-medium">Email:</span> {trackingResult.email}
            </p>
          </div>

          <h4 className="mt-4 font-semibold">Items Ordered</h4>
          <ul className="list-disc ml-6 text-sm">
            {trackingResult.orders?.[0]?.order_items?.map(
              (item: any, index: number) => (
                <li key={index}>
                  {item.inventory?.product_name} – {item.quantity} pcs (
                  {item.inventory?.category}/{item.inventory?.subcategory}) —{" "}
                  {item.inventory?.status}
                </li>
              )
            )}
          </ul>
        </div>
      )}

      {/* Delivery Status Card */}
      {delivery && (
        <div className="bg-white border rounded p-4 shadow-sm">
          <h3 className="font-semibold text-md mb-3">Delivery Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <p>
              <span className="font-medium">Status:</span>{" "}
              {delivery.status || "—"}
            </p>
            <p>
              <span className="font-medium">Schedule Date:</span>{" "}
              {formatPH(delivery.schedule_date)}
            </p>
            <p>
              <span className="font-medium">Date Received:</span>{" "}
              {formatPH(delivery.date_received ?? null)}
            </p>
            <p>
              <span className="font-medium">Driver:</span>{" "}
              {delivery.driver || "—"}
            </p>
            <p className="md:col-span-2">
              <span className="font-medium">Participants:</span>{" "}
              {Array.isArray(delivery.participants) &&
              delivery.participants.length > 0
                ? delivery.participants.join(", ")
                : "—"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
