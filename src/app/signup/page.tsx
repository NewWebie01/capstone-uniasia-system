"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import { MenuIcon } from "lucide-react";
import Logo from "@/assets/uniasia-high-resolution-logo.png";
import "@/styles/globals.css";

export default function SignUpPage() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [isLoading, setIsLoading] = useState(false);

  const allowedDomains = new Set([
    "gmail.com",
    "outlook.com",
    "hotmail.com",
    "live.com",
    "yahoo.com",
    "yahoo.com.ph",
    "icloud.com",
    "proton.me",
    "protonmail.com",
  ]);

  const getDomain = (email: string) => {
    const at = email.lastIndexOf("@");
    return at > -1 ? email.slice(at + 1).toLowerCase().trim() : "";
  };

  const emailValid = (email: string) => {
    if (!/\S+@\S+\.\S+/.test(email)) return false; // format check
    const domain = getDomain(email);
    return allowedDomains.has(domain);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleReset = () => {
    setFormData({ name: "", email: "", password: "", confirmPassword: "" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Basic validation
    if (!formData.name.trim()) return;
    if (!emailValid(formData.email)) return;
    if (formData.password.length < 6) return;
    if (formData.password !== formData.confirmPassword) return;

    setIsLoading(true);
    try {
      const res = await fetch("/api/setup-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
        }),
      });

      if (res.ok) {
        alert("Account created successfully! You can now login.");
        handleReset();
      } else {
        const result = await res.json();
        alert("Error creating account: " + result.error);
      }
    } catch (err: any) {
      console.error(err);
      alert("An unexpected error occurred: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div
      className="min-h-screen bg-[radial-gradient(ellipse_200%_100%_at_bottom_left,#ffba20,#dadada)]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      {/* Header */}
      <header className="sticky top-0 backdrop-blur-sm z-20">
        <div className="flex justify-center py-3 bg-[#181918] text-white text-sm">
          UNIASIA – Reliable Hardware Supplier
        </div>
        <div className="py-5 container mx-auto flex items-center justify-between px-4">
          <Image src={Logo} alt="Logo" height={50} width={50} />
          <MenuIcon className="h-5 w-5 md:hidden" />
        </div>
      </header>

      {/* Form */}
      <div className="flex items-center justify-center px-4 py-10">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
          <h1 className="text-2xl font-bold mb-6 text-center">Create Account</h1>
          <form onSubmit={handleSubmit} className="space-y-4">
            {[
              { label: "Name", name: "name", type: "text" },
              { label: "Email", name: "email", type: "email" },
              { label: "Password", name: "password", type: "password" },
              { label: "Confirm Password", name: "confirmPassword", type: "password" },
            ].map(({ label, name, type }) => {
              const value = (formData as any)[name];
              const invalidEmail = name === "email" && value && !emailValid(value);

              return (
                <div key={name}>
                  <label className="block text-sm font-medium">{label}</label>
                  <input
                    name={name}
                    type={type}
                    value={value}
                    onChange={handleChange}
                    required
                    className={`w-full px-3 py-2 mt-1 border rounded-md outline-none focus:ring-2 ${
                      invalidEmail
                        ? "border-red-500 focus:ring-red-500"
                        : "focus:ring-[#ffba20]"
                    }`}
                  />
                </div>
              );
            })}
            <div className="flex space-x-2">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-[#ffba20] text-white py-2 rounded-md hover:bg-yellow-500 transition"
              >
                {isLoading ? "Creating..." : "Create Account"}
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="w-full bg-gray-300 text-black py-2 rounded-md hover:bg-gray-400 transition"
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
