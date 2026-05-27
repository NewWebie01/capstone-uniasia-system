"use client";

import arrowcontrol from "@/assets/control.png";
import Logo from "@/assets/uniasia-high-resolution-logo.png";
import ChartFill from "@/assets/Chart_fill.png";
import Logistics from "@/assets/logistics.png";
import Sales from "@/assets/Sales.png";
import LogoutIcon from "@/assets/power-button.png";

import {
  Boxes,
  FileText,
  Receipt,
  RotateCcw,
  ReceiptText,
  BookOpen,
} from "lucide-react";
import { FaHistory } from "react-icons/fa";

import Image, { StaticImageData } from "next/image";
import NavLink from "@/components/NavLink";

import { usePathname } from "next/navigation";
import React, { Dispatch, SetStateAction, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
// import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

/* ✅ Custom icon (unique) */
const PurchaseIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M6 7h15l-1.5 8.5a2 2 0 0 1-2 1.5H8a2 2 0 0 1-2-1.6L4 3H2" />
    <path d="M9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />
    <path d="M17 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />
    <path d="M12 6V2" />
    <path d="M10 4h4" />
  </svg>
);

/* ----------------------------- Types ----------------------------- */
type MenuItem = {
  title: string;
  href: string;
  src?: StaticImageData;
  icon?: React.ComponentType<{ className?: string }>;
};

/* ----------------------------- Menus ----------------------------- */
const Menus: MenuItem[] = [
  { title: "Dashboard", src: ChartFill, href: "/dashboard" },
  { title: "Inventory", icon: Boxes, href: "/inventory" },

  {
    title: "Purchase Products",
    icon: PurchaseIcon,
    href: "/purchase-products",
  },

  // ✅ NEW: Cash Ledger (Company Cash Ledger)
  { title: "Cash Ledger", icon: BookOpen, href: "/reports/cash-ledger" },

  { title: "Truck Delivery", src: Logistics, href: "/logistics" },
  { title: "Delivered", src: Logistics, href: "/logistics/delivered" },
  { title: "Sales", src: Sales, href: "/sales" },
  { title: "Invoice", icon: FileText, href: "/invoice" },
  { title: "Payments", icon: ReceiptText, href: "/payments" },
  { title: "Payments History", icon: ReceiptText, href: "/payments/history" },
  { title: "Returns", icon: RotateCcw, href: "/returns" },
  { title: "Transaction History", icon: Receipt, href: "/transaction-history" },
  { title: "Activity Log", icon: FaHistory, href: "/activity-log" },
  { title: "Backup", icon: RotateCcw, href: "/backups" },
];

/* -------------------------- Role Access -------------------------- */
const ROLE_MENUS: Record<string, string[]> = {
  admin: [
    "Dashboard",
    "Inventory",
    "Purchase Products",
    "Cash Ledger",
    "Truck Delivery",
    "Delivered",
    "Sales",
    "Invoice",
    "Payments",
    "Payments History",
    "Returns",
    "Transaction History",
    "Activity Log",
    "Backup",
  ],
  cashier: [
    "Sales",
    "Invoice",
    "Payments",
    "Returns",
    "Transaction History",
    "Cash Ledger",
  ],
  warehouse: ["Inventory", "Purchase Products"],
  trucker: ["Truck Delivery", "Delivered"],
  supervisor: [
    "Dashboard",
    "Inventory",
    "Purchase Products",
    "Cash Ledger",
    "Truck Delivery",
    "Delivered",
    "Sales",
    "Invoice",
    "Payments",
    "Returns",
    "Transaction History",
  ],
};

interface SidebarProps {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
}

export const Sidebar: React.FC<SidebarProps> = ({ open, setOpen }) => {
  const pathname = usePathname();
  // const supabase = createClientComponentClient();
  const [role, setRole] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!res.ok) {
          setRole("");
          return;
        }
        const data = await res.json();
        setRole(String(data?.role || ""));
      } catch {
        setRole("");
      }
    })();
  }, []);

  const handleLogout = async () => {
    try {
      localStorage.removeItem("otpVerified");
      localStorage.removeItem("otpVerifiedEmail");
      localStorage.removeItem("otpVerifiedExpiry");
      localStorage.removeItem("otpCode");
      localStorage.removeItem("otpExpiry");
      localStorage.removeItem("otpEmail");

      // Optional: log logout in DB via API
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (err) {
      console.error("Logout failed:", err);
    } finally {
      window.location.href = "/login";
    }
  };

  const filteredMenus = Menus.filter((menu) =>
    ROLE_MENUS[role]?.includes(menu.title),
  );

  return (
    <motion.div
      animate={{ width: open ? 288 : 80 }}
      transition={{ duration: 0.3, type: "spring", damping: 15 }}
      className="h-full bg-white relative flex flex-col"
    >
      <Image
        src={arrowcontrol}
        alt="Toggle Sidebar"
        width={50}
        height={50}
        className={`absolute cursor-pointer rounded-full -right-3 top-9 w-7 border-2 border-[#ffba20] bg-white z-50 ${
          !open ? "rotate-180" : ""
        }`}
        onClick={() => setOpen(!open)}
      />

      <div className="p-5 pt-8">
        <div className="flex gap-x-4 items-center">
          <motion.div
            animate={{ rotate: open ? 360 : 0 }}
            transition={{ duration: 0.5 }}
          >
            <Image src={Logo} alt="UNIASIA Logo" width={40} height={40} />
          </motion.div>
          <AnimatePresence>
            {open && (
              <motion.h1
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.2 }}
                className="font-bold tracking-tighter bg-gradient-to-b from-black to-[#001E80] text-transparent bg-clip-text text-xl"
              >
                UNIASIA
              </motion.h1>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5">
        <ul className="flex flex-col gap-y-4">
          {filteredMenus.map((menu, idx) => {
            const isActive =
              pathname === menu.href || pathname?.startsWith(menu.href + "/");

            const iconColor = [
              "Inventory",
              "Purchase Products",
              "Cash Ledger",
              "Invoice",
              "Payments",
              "Payments History",
              "Returns",
              "Transaction History",
              "Activity Log",
            ].includes(menu.title)
              ? "text-[#ffba20]"
              : "text-black";

            const IconOrImage = menu.src ? (
              <Image src={menu.src} alt={menu.title} width={20} height={20} />
            ) : menu.icon ? (
              <menu.icon className={`h-5 w-5 ${iconColor}`} />
            ) : null;

            const item = (
              <motion.li
                key={menu.title}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className={`flex items-center gap-x-4 p-2 rounded-md cursor-pointer text-sm hover:bg-gray-200 ${
                  isActive ? "bg-gray-100 font-semibold" : ""
                }`}
              >
                {IconOrImage}
                <AnimatePresence>
                  {open && (
                    <motion.span
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.15 }}
                    >
                      {menu.title}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.li>
            );

            return (
              <NavLink href={menu.href} key={menu.title}>
                {item}
              </NavLink>
            );
          })}
        </ul>
      </div>

      <div className="p-5">
        {open ? (
          <button
            onClick={handleLogout}
            className="w-full px-4 py-2 bg-black text-white rounded hover:text-[#ffba20]"
          >
            Log out
          </button>
        ) : (
          <Image
            src={LogoutIcon}
            alt="Log out"
            width={24}
            height={24}
            className="cursor-pointer hover:scale-110 transition-transform"
            onClick={handleLogout}
          />
        )}
      </div>
    </motion.div>
  );
};

export default Sidebar;
