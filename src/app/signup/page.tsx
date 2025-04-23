// app/pages/signup/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { MenuIcon } from "lucide-react";
import Logo from "@/assets/uniasia-high-resolution-logo.png";
import { createUserAccount } from "@/app/actions/createUserAccount";

export default function SignUpPage() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });

    // Clear error when user starts typing
    if (errors[e.target.name]) {
      setErrors({ ...errors, [e.target.name]: "" });
    }
  };

  const handleReset = () => {
    setFormData({
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    });
    setErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = "Name is required";
    }

    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = "Email is invalid";
    }

    if (!formData.password) {
      newErrors.password = "Password is required";
    } else if (formData.password.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Create FormData for server action
    const submitData = new FormData();
    submitData.append("name", formData.name);
    submitData.append("email", formData.email);
    submitData.append("password", formData.password);

    setIsLoading(true);

    try {
      const response = await createUserAccount(submitData); // Server action call

      if (response.success) {
        alert("Account created successfully! You can now login.");
        handleReset();
      } else {
        alert(response.message || "Registration failed. Please try again.");
      }

      // Temp success feedback
      // alert("Account created successfully! (Mocked)");
    } catch (error) {
      console.error("Error creating account:", error);
      alert("An unexpected error occurred. Please try again later.");
    } finally {
      setIsLoading(false);
    }
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
              {/* Logo */}
              <Image src={Logo} alt="UniAsia Logo" height={50} width={50} />

              {/* Mobile menu */}
              <MenuIcon className="h-5 w-5 md:hidden text-black" />
            </div>
          </div>
        </div>
      </header>

      {/* Form */}
      <div className="flex items-center justify-center px-4 pt-10 pb-20">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
          <h1 className="text-2xl font-bold mb-6 text-center">
            Create Account
          </h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium">Name</label>
              <input
                id="name"
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className={`w-full px-3 py-2 mt-1 border rounded-md outline-none focus:ring-2 ${
                  errors.name ? "border-red-500" : "focus:ring-[#ffba20]"
                }`}
              />
              {errors.name && (
                <p className="text-red-500 text-sm mt-1">{errors.name}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium">Email</label>
              <input
                id="email"
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                className={`w-full px-3 py-2 mt-1 border rounded-md outline-none focus:ring-2 ${
                  errors.email ? "border-red-500" : "focus:ring-[#ffba20]"
                }`}
              />
              {errors.email && (
                <p className="text-red-500 text-sm mt-1">{errors.email}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium">Password</label>
              <input
                id="password"
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                className={`w-full px-3 py-2 mt-1 border rounded-md outline-none focus:ring-2 ${
                  errors.password ? "border-red-500" : "focus:ring-[#ffba20]"
                }`}
              />
              {errors.password && (
                <p className="text-red-500 text-sm mt-1">{errors.password}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                className={`w-full px-3 py-2 mt-1 border rounded-md outline-none focus:ring-2 ${
                  errors.confirmPassword
                    ? "border-red-500"
                    : "focus:ring-[#ffba20]"
                }`}
              />
              {errors.confirmPassword && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.confirmPassword}
                </p>
              )}
            </div>

            <div className="flex space-x-2">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-[#ffba20] text-white py-2 rounded-md hover:bg-yellow-500 transition-colors"
              >
                {isLoading ? "Creating..." : "Create Account"}
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
