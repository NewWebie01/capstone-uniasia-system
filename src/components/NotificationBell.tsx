"use client";

import { useEffect, useState } from "react";
import { BellIcon } from "@heroicons/react/24/solid";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export default function NotificationBell() {
  const [hasNewOrder, setHasNewOrder] = useState(false);
  const supabase = createClientComponentClient();

  useEffect(() => {
    const channel = supabase
      .channel("orders_channel")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
        },
        (payload) => {
          console.log("🔔 New order received:", payload);
          setHasNewOrder(true); // set red badge when new order comes in
        
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  const handleClick = () => {
    setHasNewOrder(false); // clear red badge after click
    alert("Viewing new orders... (implement drawer/modal)");
  };

  return (
    <div
      className="fixed top-16 right-12 z-50 bg-white shadow-lg rounded-full p-3 cursor-pointer"
      title="Notifications"
      onClick={handleClick}
    >
      <BellIcon className="h-5 w-5 text-gray-700" />
      {hasNewOrder && (
        <span className="absolute top-1 right-1 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-white bg-red-600 rounded-full">
          🔴
        </span>
      )}
    </div>
  );
}
