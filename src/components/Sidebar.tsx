"use client";
import arrowcontrol from "@/assets/control.png";
import Logo from "@/assets/uniasia-high-resolution-logo.png";
import ChartFill from "@/assets/Chart_fill.png";
import Logistics from "@/assets/logistics.png";
import Calendar from "@/assets/Calendar.png";
import Sales from "@/assets/Sales.png";
import Chart from "@/assets/Chart.png";
import Folder from "@/assets/Folder.png";
import Setting from "@/assets/Setting.png";
import LogoutIcon from "@/assets/power-button.png";
import supabase from "@/config/supabaseClient";
import { useRouter } from "next/navigation";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export const Sidebar = () => {
  const [open, setOpen] = useState(true);
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClientComponentClient();

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Logout failed:", error.message);
    } else {
      //router.push("/");
      window.location.href = "/login";
    }
  };
  const Menus = [
    { title: "Dashboard", src: ChartFill, href: "/dashboard" },
    { title: "Inventory", src: Calendar, href: "/inventory" },
    { title: "Truck Delivery", src: Logistics, href: "/logistics" }, // 🔁 Updated here
    { title: "Sales", src: Sales, href: "/sales" },
    { title: "Sales Report", src: Chart, href: "/sales-report" },
    { title: "Activity Log", src: Folder, href: "/activity-log" },
    { title: "Setting", src: Setting, gap: true, href: "/settings" },
  ];

  return (
    <motion.div
      animate={{ width: open ? 288 : 80 }}
      transition={{ duration: 0.3, type: "spring", damping: 15 }}
      className="h-full bg-white relative flex flex-col"
    >
      {/* Arrow control */}
      <Image
        src={arrowcontrol}
        alt="Arrow control"
        width={50}
        height={50}
        className={`absolute cursor-pointer rounded-full -right-3 top-9 w-7 border-2 border-[#ffba20] ${
          !open && "rotate-180"
        }`}
        onClick={() => setOpen(!open)}
      />

      {/* Top section */}
      <div className="p-5 pt-8">
        <div className="flex gap-x-4 items-center">
          <motion.div
            animate={{ rotate: open ? 360 : 0 }}
            transition={{ duration: 0.5 }}
          >
            <Image
              src={Logo}
              alt="logo"
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

      {/* Scrollable menu */}
      <div className="flex-1 overflow-y-auto px-5">
        <ul className="flex flex-col gap-y-4">
          {Menus.map((menu, index) => {
            const isActive = pathname === menu.href;

            const menuItem = (
              <motion.li
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`text-black text-sm flex items-center gap-x-4 cursor-pointer p-2 rounded-md hover:bg-gray-400 transition-colors ${
                  menu.gap ? "mt-9" : "mt-2"
                } ${isActive ? "bg-gray-100 font-semibold" : ""}`}
              >
                <Image src={menu.src} alt={menu.title} width={20} height={20} />
                <AnimatePresence>
                  {open && (
                    <motion.span
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.15 }}
                      className="origin-left duration-200"
                    >
                      {menu.title}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.li>
            );

            return menu.href ? (
              <Link href={menu.href} key={index}>
                {menuItem}
              </Link>
            ) : (
              <div key={index}>{menuItem}</div>
            );
          })}
        </ul>
      </div>

      {/* Bottom log-out button */}
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
              className="hover:text-[#ffba20] transition-colors duration-300"
              onClick={handleLogout}
            />
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};
