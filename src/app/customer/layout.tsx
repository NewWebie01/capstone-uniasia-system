// src/app/customer/layout.tsx
"use client";

import { useState, useEffect } from "react";
import { DM_Sans } from "next/font/google";
import { Toaster } from "sonner";
import CustomerSidebar from "@/components/CustomerSidebar";
import GlobalRouteLoader from "@/components/GlobalRouteLoader";
import supabase from "@/config/supabaseClient";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-dm-sans",
});

export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) setUserName(user.user_metadata?.name || user.email || "Guest");
    };
    getUser();
  }, []);

  return (
    <div
      className={`min-h-screen bg-[radial-gradient(ellipse_200%_100%_at_bottom_left,#ffba20,#dadada_100%)] ${dmSans.className}`}
    >
      <Toaster richColors position="top-center" />

      {/* Sticky Header */}
      <header className="sticky top-0 z-20 backdrop-blur-sm w-full h-12">
        <div className="flex justify-center items-center py-3 bg-[#181918] text-white text-sm gap-3 h-full">
          <p>UNIASIA - Reliable Hardware Supplier in the Philippines</p>
        </div>
      </header>

      {/* Layout */}
      <div className="flex h-[calc(100vh-3rem)] overflow-hidden">
        <CustomerSidebar open={open} setOpen={setOpen} />
        <main className="flex-1 overflow-y-auto p-6 relative">
          {/* 👋 Modern greeting */}
          <div className="flex justify-end mb-2">
            <div
              className={`greeting-card bg-white rounded-xl px-4 py-2 text-gray-700 mr-6 select-none cursor-default shadow-md transition-shadow will-change-transform hover:shadow-lg`}
            >
              <span className="font-semibold">Hi,</span>{" "}
              <span className="text-[#ffba20] font-bold">
                {userName || "Guest"}
              </span>
              👋
            </div>
          </div>

          {children}
        </main>
      </div>

      <GlobalRouteLoader />

      {/* Hover shake animation */}
      <style jsx global>{`
        @keyframes greeting-wobble {
          0% {
            transform: translateX(0) rotate(0);
          }
          15% {
            transform: translateX(-2px) rotate(-1deg);
          }
          30% {
            transform: translateX(3px) rotate(1.2deg);
          }
          45% {
            transform: translateX(-3px) rotate(-1.2deg);
          }
          60% {
            transform: translateX(2px) rotate(0.8deg);
          }
          75% {
            transform: translateX(-2px) rotate(-0.6deg);
          }
          100% {
            transform: translateX(0) rotate(0);
          }
        }
        .greeting-card:hover {
          animation: greeting-wobble 0.5s ease-in-out both;
        }
      `}</style>
    </div>
  );
}
