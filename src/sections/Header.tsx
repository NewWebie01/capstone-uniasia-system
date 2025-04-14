"use client";

import Logo from "../assets/uniasia-high-resolution-logo.png"; // Importing UniAsia logo
import Image from "next/image"; // Importing Image component from Next.js
import MenuIcon from "../assets/menu.svg"; // Importing menu icon for mobile navigation
import { useState, useEffect } from "react"; // Importing useState and useEffect
import { useRouter } from "next/navigation"; // Importing useRouter for navigation
import { motion } from "framer-motion"; // Importing motion for animations

export const Header = () => {
  const [activeLink, setActiveLink] = useState<string>(""); // State to store the clicked navigation link
  const router = useRouter(); // Initialize the router

  // Function to handle navigation link clicks for smooth scrolling
  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault(); // Prevent default anchor behavior
    const targetId = event.currentTarget.getAttribute("href")?.substring(1); // Get target section ID
    setActiveLink(targetId || "");

    if (targetId) {
      const targetSection = document.getElementById(targetId); // Get the target section element
      if (targetSection) {
        targetSection.scrollIntoView({ behavior: "smooth" }); // Smooth scroll to target section
      }
    }
  };

  // Function to navigate to login page
  const handleLoginClick = () => {
    router.push("/login"); // Navigate to login page
  };

  // Update activeLink based on scroll position
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
        {/* <p className="text-white/60 hidden md:block">
          Streamline your workflow and boost your productivity
        </p> */}
        <div className="inline-flex gap-1 items-center">
          <p>UNIASIA - Reliable Hardware Supplier in the Philippines</p>
          {/* <ArrowRight className="h-4 w-4 inline-flex justify-center items-center" /> */}
        </div>
      </div>

      <div className="py-5">
        <div className="container">
          <div className="flex items-center justify-between">
            {/* Logo section */}
            <Image src={Logo} alt="UniAsia Logo" height={50} width={50} />

            {/* Mobile menu icon (Only visible on smaller screens) */}
            <MenuIcon className="h-5 w-5 md:hidden" />

            {/* Navigation links */}
            <nav className="hidden md:flex gap-6 text-black/60 items-center">
              <a
                href="#hero" // Links to the Hero section with ID 'hero'
                id="home"
                onClick={handleClick}
                className="hover:text-[#ffba20] transition-colors duration-300"
              >
                Home
              </a>
              <a
                href="#about-us" // Updated to match the AboutUs section ID
                onClick={handleClick}
                className="hover:text-[#ffba20] transition-colors duration-300"
              >
                About Us
              </a>
              <a
                href="#contact-us"
                onClick={handleClick}
                className="hover:text-[#ffba20] transition-colors duration-300"
              >
                Contact
              </a>
              {/* <a
                href="#help"
                id="help"
                onClick={handleClick}
                className="hover:text-[#ffba20] transition-colors duration-300"
              >
                Help
              </a> */}

              {/* Log-in button */}
              <motion.button
                onClick={handleLoginClick} // Navigate to Login page
                whileTap={{ scale: 1.1 }}
                className="bg-[#181918] text-white px-4 py-2 rounded-lg font-medium hover:text-[#ffba20]"
              >
                Log-In
              </motion.button>
            </nav>
          </div>
        </div>
      </div>
    </header>
  );
};
