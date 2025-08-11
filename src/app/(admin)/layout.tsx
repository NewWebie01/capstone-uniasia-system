"use client";

import { Sidebar } from "@/components/Sidebar";
import NotificationBell from "@/components/NotificationBell";
import { DM_Sans } from "next/font/google";
import { useState } from "react";
import { Toaster } from "sonner";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-dm-sans",
});

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div
      className={`min-h-screen bg-[radial-gradient(ellipse_200%_100%_at_bottom_left,#ffba20,#dadada_100%)] ${dmSans.className}`}
    >
      {/* Global Toast Provider */}
      <Toaster richColors position="top-right" />

      {/* Sticky Header */}
      <header className="sticky top-0 z-30 backdrop-blur-sm w-full h-12">
        <div className="flex justify-center items-center py-3 bg-[#181918] text-white text-sm gap-3">
          <p>UNIASIA - Reliable Hardware Supplier in the Philippines</p>
        </div>
      </header>

      {/* Floating Notification Bell */}
      <NotificationBell />

      {/* Layout */}
      <div className="flex h-[calc(100vh-3rem)] overflow-hidden">
        {/* Sidebar */}
        <Sidebar open={open} setOpen={setOpen} />

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-6 relative">{children}</main>
      </div>
    </div>
  );
}
