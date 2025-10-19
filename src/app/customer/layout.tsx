// src/app/customer/layout.tsx
"use client";

import { useState, useEffect } from "react";
import { DM_Sans } from "next/font/google";
import { AlertTriangle } from "lucide-react";
import CustomerSidebar from "@/components/CustomerSidebar";
import GlobalRouteLoader from "@/components/GlobalRouteLoader";
import supabase from "@/config/supabaseClient";
import CustomerNotificationBell from "@/components/CustomerNotificationBell";


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
  const [isMobile, setIsMobile] = useState(false);

  // Fetch logged-in user name/email for greeting
  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) setUserName(user.user_metadata?.name || user.email || "Guest");
    };
    getUser();
  }, []);

  // Detect mobile (below lg breakpoint: 1024px) and lock scroll while modal is open
  useEffect(() => {
    const evaluate = () => setIsMobile(window.innerWidth < 1024);
    evaluate();
    window.addEventListener("resize", evaluate);
    window.addEventListener("orientationchange", evaluate);
    return () => {
      window.removeEventListener("resize", evaluate);
      window.removeEventListener("orientationchange", evaluate);
    };
  }, []);

  useEffect(() => {
    // Lock body scroll when the mobile-blocking modal is shown
    if (isMobile) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [isMobile]);

  return (
    <div
      className={`min-h-screen bg-[radial-gradient(ellipse_200%_100%_at_bottom_left,#ffba20,#dadada_100%)] ${dmSans.className}`}
    >
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
          <div className="max-w-7xl mx-auto relative">
            {/* User card — aligned with the title, zero gap, scrolls with content */}
<div className="absolute top-0 right-6 flex items-center gap-3">
  {/* Notification Bell */}
  <CustomerNotificationBell />

  {/* Greeting Card */}
  <div className="greeting-card bg-white rounded-xl px-4 py-2 text-gray-700 shadow-md select-none cursor-default hover:shadow-lg">
    <span className="font-semibold">Hi,</span>{" "}
    <span className="text-[#ffba20] font-bold">
      {userName || "Guest"}
    </span>{" "}
  </div>
</div>


            {/* Your page content (title, subtitle, filters, table, etc.) */}
            {children}
          </div>
        </main>
      </div>

      <GlobalRouteLoader />

      {/* Mobile-only blocking modal */}
      {isMobile && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="px-6 py-5 flex items-start gap-3 border-b">
              <div className="shrink-0 mt-0.5">
                <AlertTriangle className="text-yellow-500" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Desktop Only
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  Our Customer Portal is currently optimized for{" "}
                  <span className="font-semibold">desktop or laptop</span>{" "}
                  screens. Please switch to a larger device (≥ 1024px width) to
                  continue.
                </p>
              </div>
            </div>
            <div className="px-6 py-4">
              <ul className="text-sm text-gray-700 list-disc pl-5 space-y-1">
                <li>Use a desktop browser (Chrome, Edge, Firefox, Safari).</li>
                <li>Or rotate your tablet and ensure width ≥ 1024px.</li>
              </ul>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t text-xs text-gray-500">
              Need help? Contact UNIASIA support.
            </div>
          </div>
        </div>
      )}

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
