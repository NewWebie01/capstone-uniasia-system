"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { MenuIcon } from "lucide-react";
import Logo from "@/assets/uniasia-high-resolution-logo.png";

export default function SignUpPage() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("User Data:", formData);
    // Handle sign-up logic here
  };

  const handleReset = () => {
    setFormData({
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    });
  };

  return (
    <motion.div
      className="min-h-screen bg-[radial-gradient(ellipse_200%_100%_at_bottom_left,#ffba20,#dadada_100%)]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      {/* Header */}
      <header className="sticky top-0 backdrop-blur-sm z-20">
        <div className="flex justify-center items-center py-3 bg-[#181918] text-white text-sm gap-3">
          <div className="inline-flex gap-1 items-center">
            <p>UNIASIA - Reliable Hardware Supplier in the Philippines</p>
          </div>
        </div>

        <div className="py-5">
          <div className="container px-4 mx-auto">
            <div className="flex items-center justify-between">
              {/* Logo section */}
              <Image src={Logo} alt="UniAsia Logo" height={50} width={50} />

              {/* Mobile menu icon */}
              <MenuIcon className="h-5 w-5 md:hidden text-black" />
            </div>
          </div>
        </div>
      </header>

      {/* Sign Up Form */}
      <div className="flex items-center justify-center px-4 pt-10 pb-20">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
          <h1 className="text-2xl font-bold mb-6 text-center">
            Create Account
          </h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium">Name</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 mt-1 border rounded-md outline-none focus:ring-2 focus:ring-[#ffba20]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium">Email</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 mt-1 border rounded-md outline-none focus:ring-2 focus:ring-[#ffba20]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium">Password</label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 mt-1 border rounded-md outline-none focus:ring-2 focus:ring-[#ffba20]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium">
                Confirm Password
              </label>
              <input
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 mt-1 border rounded-md outline-none focus:ring-2 focus:ring-[#ffba20]"
              />
            </div>

            <div className="flex space-x-2">
              <button
                type="submit"
                className="w-full bg-[#ffba20] text-white py-2 rounded-md hover:bg-yellow-500 transition-colors"
              >
                Create Account
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="w-full bg-gray-300 text-black py-2 rounded-md hover:bg-gray-400 transition-colors"
              >
                Reset
              </button>
            </div>
          </form>
        </div>
      </div>
    </motion.div>
  );
}
