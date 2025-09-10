"use client";

import Logo from "../assets/uniasia-high-resolution-logo.png";
import Image from "next/image";
import MenuIcon from "../assets/menu.svg";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

export const Header = () => {
  const [activeLink, setActiveLink] = useState<string>("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const router = useRouter();

  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const targetId = event.currentTarget.getAttribute("href")?.substring(1);
    setActiveLink(targetId || "");
    setIsMenuOpen(false);

    if (targetId) {
      const targetSection = document.getElementById(targetId);
      if (targetSection) targetSection.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleLoginClick = () => {
    setIsMenuOpen(false);
    router.push("/login");
  };

  const handleSignUpClick = () => {
    setIsMenuOpen(false);
    // from your screenshot, the route is /account_creation
    router.push("/account_creation");
  };

  useEffect(() => {
    const handleScroll = () => {
      const sections = ["hero", "about-us", "contact", "help"];
      let currentSection = "";
      for (const section of sections) {
        const el = document.getElementById(section);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= 80 && rect.bottom >= 80) {
            currentSection = section;
            break;
          }
        }
      }
      setActiveLink(currentSection);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header className="sticky top-0 backdrop-blur-sm z-20">
      <div className="flex justify-center items-center py-3 bg-[#181918] text-white text-sm gap-3">
        <div className="inline-flex gap-1 items-center">
          <p>UNIASIA - Reliable Hardware Supplier in the Philippines</p>
        </div>
      </div>

      <div className="py-5">
        <div className="container">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <motion.button
              onClick={() => {
                const heroSection = document.getElementById("hero");
                if (heroSection)
                  heroSection.scrollIntoView({ behavior: "smooth" });
              }}
              whileHover={{ scale: 1.1 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <Image
                src={Logo}
                alt="UniAsia Logo"
                height={50}
                width={50}
                className="cursor-pointer"
              />
            </motion.button>

            {/* Mobile menu */}
            <div className="md:hidden relative">
              <MenuIcon
                className="h-5 w-5 cursor-pointer"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
              />

              <AnimatePresence>
                {isMenuOpen && (
                  <motion.div
                    key="mobile-menu"
                    initial={{ opacity: 0, scale: 0.95, y: -10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -10 }}
                    transition={{ duration: 0.25 }}
                    className="absolute right-0 mt-3 w-56 bg-white shadow-lg rounded-lg z-50"
                  >
                    <ul className="flex flex-col gap-4 p-4 text-sm text-black">
                      <li>
                        <a
                          href="#hero"
                          onClick={handleClick}
                          className="hover:text-[#ffba20]"
                        >
                          Home
                        </a>
                      </li>
                      <li>
                        <a
                          href="#about-us"
                          onClick={handleClick}
                          className="hover:text-[#ffba20]"
                        >
                          About Us
                        </a>
                      </li>

                      {/* Sign Up (mobile) */}
                      <li>
                        <motion.button
                          onClick={handleSignUpClick}
                          whileTap={{ scale: 1.05 }}
                          className="w-full border border-[#181918] text-[#181918] py-2 rounded-md hover:bg-[#181918] hover:text-white"
                        >
                          Sign Up
                        </motion.button>
                      </li>

                      {/* Log-In (mobile) */}
                      <li>
                        <motion.button
                          onClick={handleLoginClick}
                          whileTap={{ scale: 1.05 }}
                          className="bg-[#181918] text-white w-full py-2 rounded-md hover:text-[#ffba20]"
                        >
                          Log-In
                        </motion.button>
                      </li>
                    </ul>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Desktop nav */}
            <nav className="hidden md:flex gap-6 text-black/60 items-center">
              <a
                href="#hero"
                id="home"
                onClick={handleClick}
                className="hover:text-[#ffba20] transition-colors duration-300"
              >
                Home
              </a>
              <a
                href="#about-us"
                onClick={handleClick}
                className="hover:text-[#ffba20] transition-colors duration-300"
              >
                About Us
              </a>

              {/* Actions */}
              <div className="flex items-center gap-3">
                {/* Sign Up (desktop) */}
                <motion.button
                  onClick={handleSignUpClick}
                  whileTap={{ scale: 1.05 }}
                  className="border border-[#181918] text-[#181918] px-4 py-2 rounded-lg font-medium hover:bg-[#181918] hover:text-white"
                >
                  Sign Up
                </motion.button>

                {/* Log-In (desktop) */}
                <motion.button
                  onClick={handleLoginClick}
                  whileTap={{ scale: 1.05 }}
                  className="bg[#181918] bg-[#181918] text-white px-4 py-2 rounded-lg font-medium hover:text-[#ffba20]"
                >
                  Log-In
                </motion.button>
              </div>
            </nav>
          </div>
        </div>
      </div>
    </header>
  );
};
