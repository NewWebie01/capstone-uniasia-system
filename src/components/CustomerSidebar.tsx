// src/components/CustomerSidebar.tsx
"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, ShoppingBag, ClipboardList, Search } from "lucide-react";

type Props = {
  open: boolean;
  setOpen: (v: boolean) => void;
};

const NAV = [
  { label: "Product catalog", href: "/customer", icon: ShoppingBag },
  { label: "My orders", href: "/customer/orders", icon: ClipboardList },
  { label: "Track Order", href: "/customer/track", icon: Search },
];

export default function CustomerSidebar({ open, setOpen }: Props) {
  const pathname = usePathname();

  // Auto-close on route change for small screens
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setOpen(false);
    }
  }, [pathname, setOpen]);

  return (
    <>
      {/* Mobile toggle button */}
      <div className="lg:hidden sticky top-12 z-30 px-4 py-3">
        <button
          onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-2 rounded-xl bg-[#181918] text-white px-3 py-2 text-sm shadow"
          aria-label="Toggle menu"
        >
          {open ? <X size={18} /> : <Menu size={18} />}
          Menu
        </button>
      </div>

      {/* Desktop sidebar */}
      <aside
        className={`relative z-20 hidden lg:block transition-[width] duration-300 ease-in-out ${
          open ? "w-64" : "w-16"
        }`}
      >
        <div className="fixed left-0 top-12 h-[calc(100vh-3rem)] bg-white/80 backdrop-blur-md border-r border-black/10 shadow-sm">
          {/* Collapse/Expand */}
          <div className="hidden lg:flex items-center justify-end p-2">
            <button
              onClick={() => setOpen(!open)}
              className="rounded-lg px-2 py-1 text-xs text-white bg-[#181918]"
              aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
            >
              {open ? "Collapse" : "Expand"}
            </button>
          </div>

          {/* Nav items */}
          <nav className="px-2 py-2">
            {NAV.map(({ label, href, icon: Icon }) => {
              const active =
                pathname === href || pathname?.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 my-1 ${
                    active
                      ? "bg-[#181918] text-white"
                      : "text-[#181918] hover:bg-black/5"
                  }`}
                >
                  <Icon size={20} />
                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.span
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -6 }}
                        transition={{ duration: 0.15 }}
                        className="whitespace-nowrap text-sm font-medium"
                      >
                        {label}
                      </motion.span>
                    )}
                  </AnimatePresence>

                  {/* Tooltip when collapsed */}
                  {!open && (
                    <span className="pointer-events-none absolute left-14 z-30 rounded-md bg-[#181918] px-2 py-1 text-xs text-white opacity-0 shadow transition group-hover:opacity-100">
                      {label}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {open && (
          <motion.aside
            initial={{ x: -280, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -280, opacity: 0 }}
            transition={{ type: "tween", duration: 0.2 }}
            className="lg:hidden fixed left-0 top-12 z-40 w-72 h-[calc(100vh-3rem)] bg-white shadow-2xl border-r border-black/10"
          >
            <nav className="px-3 py-3">
              {NAV.map(({ label, href, icon: Icon }) => {
                const active =
                  pathname === href || pathname?.startsWith(href + "/");
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 my-1 ${
                      active
                        ? "bg-[#181918] text-white"
                        : "text-[#181918] hover:bg-black/5"
                    }`}
                  >
                    <Icon size={20} />
                    <span className="text-sm font-medium">{label}</span>
                  </Link>
                );
              })}
            </nav>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
