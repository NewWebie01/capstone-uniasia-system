"use client";

import arrowcontrol from "@/assets/control.png";
import Logo from "@/assets/uniasia-high-resolution-logo.png";
import ChartFill from "@/assets/Chart_fill.png";
import Logistics from "@/assets/logistics.png";
import Sales from "@/assets/Sales.png";
import LogoutIcon from "@/assets/power-button.png";
import { ReceiptText } from "lucide-react";
import { FaHistory } from "react-icons/fa";
import { Boxes, FileText, Receipt, RotateCcw } from "lucide-react";

import Image, { StaticImageData } from "next/image";
import NavLink from "@/components/NavLink";

import { usePathname } from "next/navigation";
import { Dispatch, SetStateAction, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

// --- Menu Item Type
type MenuItem = {
  title: string;
  href: string;
  src?: StaticImageData;
  icon?: React.ComponentType<{ className?: string }>;
};

// --- Master Menu List (Account Request removed)
const Menus: MenuItem[] = [
  { title: "Dashboard", src: ChartFill, href: "/dashboard" },
  { title: "Inventory", icon: Boxes, href: "/inventory" },
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

// --- Which roles can see which menu titles (Account Request removed)
const ROLE_MENUS: Record<string, string[]> = {
  admin: [
    "Dashboard",
    "Inventory",
    "Truck Delivery",
    "Delivered",
    "Sales",
    "Invoice",
    "Payments",
    "Payments History", // NEW
    "Returns",
    "Transaction History",
    "Activity Log",
    "Backup",
  ],
  cashier: ["Sales", "Invoice", "Payments", "Returns", "Transaction History"],
  warehouse: ["Inventory"],
  trucker: ["Truck Delivery", "Delivered"],
  supervisor: [
    "Dashboard",
    "Inventory",
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
  const supabase = createClientComponentClient();
  const [role, setRole] = useState<string>("");

  useEffect(() => {
    // Fetch user role from Supabase
    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      const userRole =
        user?.user_metadata?.role ||
        // fallback for older accounts
        (user && (user as any).raw_user_meta_data?.role) ||
        "";
      setRole(userRole);
    })();
  }, [supabase]);

  // --- Robust logout (clears storage, session, forces reload)
  const handleLogout = async () => {
    try {
      // Clear OTP/other custom storage if needed
      localStorage.removeItem("otpVerified");
      localStorage.removeItem("otpVerifiedEmail");
      localStorage.removeItem("otpVerifiedExpiry");
      localStorage.removeItem("otpCode");
      localStorage.removeItem("otpExpiry");
      localStorage.removeItem("otpEmail");
      // Optionally: localStorage.clear();

      // Log out activity
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const userEmail = user?.email || "unknown";
      const userRole =
        user?.user_metadata?.role ||
        (user && (user as any).raw_user_meta_data?.role) ||
        "unknown";
      await supabase.from("activity_logs").insert([
        {
          user_email: userEmail,
          user_role: userRole,
          action: "Logout",
          details: {},
          created_at: new Date().toISOString(),
        },
      ]);
      await supabase.auth.signOut();
    } catch (err) {
      // Not blocking: still force reload
      console.error("Logout failed:", err);
    } finally {
      window.location.href = "/login"; // ✅ Full reload
    }
  };

  // --- Filter menus based on current role
  const filteredMenus: MenuItem[] = Menus.filter((menu) =>
    ROLE_MENUS[role]?.includes(menu.title)
  );

  return (
    <motion.div
      animate={{ width: open ? 288 : 80 }}
      transition={{ duration: 0.3, type: "spring", damping: 15 }}
      className="h-full bg-white relative flex flex-col"
    >
      {/* Toggle Button */}
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

      {/* Logo Section */}
      <div className="p-5 pt-8">
        <div className="flex gap-x-4 items-center">
          <motion.div
            animate={{ rotate: open ? 360 : 0 }}
            transition={{ duration: 0.5 }}
          >
            <Image
              src={Logo}
              alt="UNIASIA Logo"
              width={40}
              height={40}
              className="cursor-pointer"
            />
          </motion.div>
          <AnimatePresence>
            {open && (
              <motion.h1
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.2 }}
                className="font-bold tracking-tighter bg-gradient-to-b from-black to-[#001E80] text-transparent bg-clip-text origin-left text-xl"
              >
                UNIASIA
              </motion.h1>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Menu Items */}
      <div className="flex-1 overflow-y-auto px-5">
        <ul className="flex flex-col gap-y-4">
          {filteredMenus.map((menu, idx) => {
            const isActive =
              pathname === menu.href || pathname?.startsWith(menu.href + "/");

            const IconOrImage = menu.src ? (
              <Image src={menu.src} alt={menu.title} width={20} height={20} />
            ) : menu.icon ? (
              <menu.icon
                className={`h-5 w-5 ${
                  [
                    "Activity Log",
                    "Account Creation",
                    "Purchase",
                    "Inventory",
                    "Invoice",
                    "Transaction History",
                    "Returns",
                    "Payments",
                    "Payments History",
                  ].includes(menu.title)
                    ? "text-[#ffba20]"
                    : "text-black"
                }`}
              />
            ) : null;

            const menuItem = (
              <motion.li
                key={menu.title}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className={`flex items-center gap-x-4 p-2 rounded-md cursor-pointer text-sm text-black hover:bg-gray-200 transition-colors ${
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
                      className="origin-left"
                    >
                      {menu.title}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.li>
            );

            return menu.href ? (
              <NavLink href={menu.href} key={menu.title}>
                {menuItem}
              </NavLink>
            ) : (
              <div key={menu.title}>{menuItem}</div>
            );
          })}
        </ul>
      </div>

      {/* Logout Button */}
      <div className="p-5">
        {open ? (
          <motion.button
            onClick={handleLogout}
            className="w-full px-4 py-2 btn btn-primary hover:text-[#ffba20] transition-colors duration-300"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            Log out
          </motion.button>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.3 }}
            className="cursor-pointer hover:scale-110 transition-transform duration-300"
          >
            <Image
              src={LogoutIcon}
              alt="Log out"
              width={24}
              height={24}
              onClick={handleLogout}
            />
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};

export default Sidebar;
