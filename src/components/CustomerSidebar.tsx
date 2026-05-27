// src/components/CustomerSidebar.tsx
"use client";

import Image, { StaticImageData } from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { Dispatch, SetStateAction } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

// assets (same as admin)
import arrowcontrol from "@/assets/control.png";
import Logo from "@/assets/uniasia-high-resolution-logo.png";
import LogoutIcon from "@/assets/power-button.png";

// icons for customer nav
import {
  ShoppingBag,
  ShoppingCart,
  ClipboardList,
  RotateCcw,
  BadgeCheck,
  PackageCheck,
  ReceiptText,
  History,
} from "lucide-react";

// shared link wrapper (same as admin)
import NavLink from "@/components/NavLink";

interface SidebarProps {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
}

type MenuItem = {
  title: string;
  href: string;
  src?: StaticImageData;
  icon?: React.ComponentType<{ className?: string }>;
};

const Menus: MenuItem[] = [
  {
    title: "Product catalog",
    href: "/customer/product-catalog",
    icon: ShoppingBag,
  },
  { title: "Cart (Checkout)", href: "/customer/checkout", icon: ShoppingCart },
  { title: "My orders", href: "/customer/orders", icon: ClipboardList },


  { title: "My Payment Ledger", href: "/customer/payments/ledger", icon: ReceiptText },


  { title: "Returns / Issues", href: "/customer/returns", icon: RotateCcw },
  { title: "Return Status", href: "/customer/returns/status", icon: BadgeCheck },
];

export default function CustomerSidebar({ open, setOpen }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClientComponentClient();

  const handleLogout = async () => {
    try {
      // Clear OTP/other storage if needed
      localStorage.removeItem("otpVerified");
      localStorage.removeItem("otpVerifiedEmail");
      localStorage.removeItem("otpVerifiedExpiry");
      localStorage.removeItem("otpCode");
      localStorage.removeItem("otpExpiry");
      localStorage.removeItem("otpEmail");
      // Optionally: localStorage.clear();

      await supabase.auth.signOut();
    } catch (err) {
      console.error("Logout failed:", err);
    } finally {
      window.location.href = "/login";
    }
  };

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

      {/* Logo */}
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
          {Menus.map((menu, idx) => {
            const isActive =
              pathname === menu.href || pathname?.startsWith(menu.href + "/");

const highlightTitles = new Set([
  "Product catalog",
  "Cart (Checkout)",
  "My orders",
  "Payments",
  "My Payment Ledger",      // ← add this
  "Payment History",
  "Returns / Issues",
  "Return Status",
]);

            const IconOrImage = menu.src ? (
              <Image src={menu.src} alt={menu.title} width={20} height={20} />
            ) : menu.icon ? (
              <menu.icon
                className={`h-5 w-5 ${
                  highlightTitles.has(menu.title) ? "text-[#ffba20]" : "text-black"
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

            return (
              <NavLink href={menu.href} key={menu.title}>
                {menuItem}
              </NavLink>
            );
          })}
        </ul>
      </div>

      {/* Logout */}
      <div className="p-5">
        {open ? (
          <motion.button
            type="button"
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
          <motion.button
            type="button"
            onClick={handleLogout}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.3 }}
            className="cursor-pointer hover:scale-110 transition-transform duration-300 p-1 rounded"
            aria-label="Log out"
            title="Log out"
          >
            <Image src={LogoutIcon} alt="Log out" width={24} height={24} />
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}
