// components/MobileMenu.tsx
"use client";

import { useState } from "react";
import { FiMenu, FiX } from "react-icons/fi";
import Link from "next/link";

const MobileMenu = () => {
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => setIsOpen(!isOpen);

  return (
    <div className="md:hidden relative">
      {/* Hamburger Button */}
      <button
        onClick={toggleMenu}
        className="text-2xl text-[#001E80] focus:outline-none"
      >
        {isOpen ? <FiX /> : <FiMenu />}
      </button>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="absolute top-10 right-0 w-48 bg-white shadow-lg rounded-xl z-50">
          <ul className="flex flex-col gap-4 p-4">
            <li>
              <Link href="/" onClick={toggleMenu}>
                Home
              </Link>
            </li>
            <li>
              <Link href="/about-us" onClick={toggleMenu}>
                About
              </Link>
            </li>
            <li>
              <Link href="/contact-us" onClick={toggleMenu}>
                Contact
              </Link>
            </li>
            <li>
              <Link href="/login" onClick={toggleMenu}>
                Login
              </Link>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default MobileMenu;
