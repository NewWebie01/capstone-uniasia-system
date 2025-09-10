// src/app/account_creation/page.tsx
"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { useRouter } from "next/navigation";
import MenuIcon from "@/assets/menu.svg";
import Logo from "@/assets/uniasia-high-resolution-logo.png";
import { toast } from "sonner";
import supabase from "@/config/supabaseClient";

const EMAIL_REGEX = /^[\w-\.]+@(gmail\.com|hotmail\.com|yahoo\.com)$/i;

function getPHISOString() {
  const now = new Date();
  const ph = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return ph.toISOString().replace("T", " ").slice(0, 19);
}

function getPasswordStrength(pw: string, personal: string[] = []) {
  if (!pw) return "Invalid";
  if (personal.some((s) => s && s.length >= 3 && pw.toLowerCase().includes(s.toLowerCase())))
    return "Too Personal";
  const hasLetter = /[A-Za-z]/.test(pw);
  const hasNumber = /\d/.test(pw);
  const hasSpecial = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pw);
  if (pw.length < 6 || !hasLetter || !hasNumber) return "Weak";
  if (pw.length < 8) return "Weak";
  const score = [hasLetter, hasNumber, hasSpecial].filter(Boolean).length;
  if (pw.length >= 12 && score === 3) return "Very Strong";
  if (pw.length >= 10 && score === 3) return "Strong";
  if (pw.length >= 8 && score >= 2) return "Moderate";
  return "Weak";
}

export default function AccountCreationPage() {
  const router = useRouter();

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    contact_number: "",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === "contact_number") {
      if (!/^\d*$/.test(value)) return;
      if (value.length > 10) return;
      setFormData({ ...formData, [name]: value });
      if (errors[name]) setErrors({ ...errors, [name]: "" });
      return;
    }
    setFormData({ ...formData, [name]: value });
    if (errors[name]) setErrors({ ...errors, [name]: "" });
  };

  const handleReset = () => {
    setFormData({
      name: "",
      email: "",
      contact_number: "",
      password: "",
      confirmPassword: "",
    });
    setErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) newErrors.name = "Name is required";
    if (!EMAIL_REGEX.test(formData.email))
      newErrors.email = "Must be a valid @gmail.com, @hotmail.com, or @yahoo.com email";
    if (!/^\d{10}$/.test(formData.contact_number))
      newErrors.contact_number = "Enter 10 digits after +63 (e.g., 9201234567)";

    // Password validation
    const personalInfo = [formData.name, formData.email, "+63" + formData.contact_number];
    const pwStrength = getPasswordStrength(formData.password, personalInfo);
    if (["Weak", "Too Personal", "Invalid"].includes(pwStrength)) {
      newErrors.password =
        pwStrength === "Too Personal"
          ? "Password must not include your name, email, or contact."
          : "Password is too weak. Use a mix of letters, numbers, special symbols (10+ chars).";
    }
    if (formData.password !== formData.confirmPassword)
      newErrors.confirmPassword = "Passwords do not match";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsLoading(true);
    try {
      const contactNumber = "+63" + formData.contact_number;

      // Use Supabase directly for now (or call your API endpoint if you want server insert)
      const { error } = await supabase.from("account_requests").insert([
        {
          name: formData.name,
          email: formData.email,
          contact_number: contactNumber,
          role: "customer", // always customer here!
          password: formData.password,
          status: "Pending",
          date_created: getPHISOString(),
        },
      ]);
      if (error) throw error;

      toast.success("Account request submitted! Please wait for admin approval.");
      handleReset();
    } catch (err: any) {
      console.error(err);
      toast.error("Unexpected error: " + (err?.message || "Unknown error"));
    } finally {
      setIsLoading(false);
    }
  };

  const personalInfo = [formData.name, formData.email, "+63" + formData.contact_number];
  const passwordStrength = getPasswordStrength(formData.password, personalInfo);

  return (
    <div className="min-h-screen flex flex-col overflow-hidden relative">
      {/* Header */}
      <header className="sticky top-0 backdrop-blur-sm z-20">
        <div className="flex justify-center items-center py-3 bg-[#181918] text-white text-sm gap-3">
          <div className="inline-flex gap-1 items-center">
            <p>UNIASIA - Reliable Hardware Supplier in the Philippines</p>
          </div>
        </div>
        <div className="py-5">
          <div className="container">
            <div className="flex items-center justify-between relative">
              <motion.button
                onClick={() => router.push("/")}
                whileHover={{ scale: 1.1 }}
                transition={{ type: "spring", stiffness: 300 }}
                aria-label="Go to Home"
              >
                <Image src={Logo} alt="UniAsia Logo" height={50} width={50} className="cursor-pointer" />
              </motion.button>
              <MenuIcon className="h-5 w-5 md:hidden cursor-pointer" onClick={() => setIsMenuOpen(!isMenuOpen)} />
              <AnimatePresence>
                {isMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className="absolute right-0 top-10 w-48 bg-white rounded-lg shadow-lg z-50 md:hidden"
                  >
                    <a href="/" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-[#ffba20] transition">
                      ← Back to Home
                    </a>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="flex-grow flex items-center justify-center bg-[radial-gradient(ellipse_200%_100%_at_bottom_left,#ffba20,#dadada_100%)] px-4 py-10 overflow-y-auto"
      >
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="p-8 sm:p-10">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-neutral-800 mb-6 text-center">
              Create Account
            </h1>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-neutral-700">Name</label>
                <input
                  name="name"
                  type="text"
                  placeholder="Enter your full name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  className={`w-full px-3 py-2 mt-1 text-sm border rounded-md outline-none focus:ring-2 ${
                    errors.name ? "border-red-500" : "focus:ring-black border-gray-300"
                  }`}
                />
                {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
              </div>
              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-neutral-700">Email</label>
                <input
                  name="email"
                  type="email"
                  placeholder="your@email.com (@gmail.com, @hotmail.com, @yahoo.com)"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className={`w-full px-3 py-2 mt-1 text-sm border rounded-md outline-none focus:ring-2 ${
                    errors.email ? "border-red-500" : "focus:ring-black border-gray-300"
                  }`}
                />
                {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
              </div>
              {/* Contact Number */}
              <div>
                <label className="block text-sm font-medium text-neutral-700">Contact Number</label>
                <div className="flex items-center mt-1">
                  <span className="px-2 py-2 bg-gray-100 border border-r-0 border-gray-300 rounded-l-md text-gray-500 text-sm select-none">
                    +63
                  </span>
                  <input
                    name="contact_number"
                    type="tel"
                    placeholder="9201234567"
                    value={formData.contact_number}
                    onChange={handleChange}
                    required
                    maxLength={10}
                    className={`w-full px-3 py-2 text-sm border border-gray-300 rounded-r-md outline-none focus:ring-2 ${
                      errors.contact_number ? "border-red-500" : "focus:ring-black"
                    }`}
                    style={{ borderLeft: "none" }}
                  />
                </div>
                <span className="text-xs text-gray-500 ml-1">Philippine mobile (enter 10 digits after +63)</span>
                {errors.contact_number && <p className="text-red-500 text-xs mt-1">{errors.contact_number}</p>}
              </div>
              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-neutral-700">Password</label>
                <div className="relative">
                  <input
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Min 6 chars, 1 number, 1 special"
                    value={formData.password}
                    onChange={handleChange}
                    required
                    className={`w-full px-3 py-2 mt-1 text-sm border rounded-md outline-none focus:ring-2 ${
                      errors.password ? "border-red-500" : "focus:ring-black border-gray-300"
                    }`}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {formData.password && (
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded
                        ${passwordStrength === "Very Strong" ? "bg-green-100 text-green-800 border border-green-300" : ""}
                        ${passwordStrength === "Strong" ? "bg-emerald-100 text-emerald-800 border border-emerald-300" : ""}
                        ${passwordStrength === "Moderate" ? "bg-yellow-100 text-yellow-800 border border-yellow-300" : ""}
                        ${passwordStrength === "Weak" ? "bg-red-100 text-red-800 border border-red-300" : ""}
                        ${passwordStrength === "Too Personal" ? "bg-pink-100 text-pink-800 border border-pink-300" : ""}
                        ${passwordStrength === "Invalid" ? "bg-gray-100 text-gray-700 border border-gray-300" : ""}
                      `}
                    >
                      {passwordStrength}
                    </span>
                  )}
                  <span className="text-xs text-gray-500">
                    (Use 10+ chars, letters, numbers & special. Don’t use your name/email/phone.)
                  </span>
                </div>
                {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
              </div>
              {/* Confirm Password */}
              <div>
                <label className="block text-sm font-medium text-neutral-700">Confirm Password</label>
                <input
                  name="confirmPassword"
                  type="password"
                  placeholder="Re-enter your password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  required
                  className={`w-full px-3 py-2 mt-1 text-sm border rounded-md outline-none focus:ring-2 ${
                    errors.confirmPassword ? "border-red-500" : "focus:ring-black border-gray-300"
                  }`}
                />
                {errors.confirmPassword && <p className="text-red-500 text-xs mt-1">{errors.confirmPassword}</p>}
              </div>
              {/* Actions */}
              <div className="flex gap-2 mt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-[#181918] text-white py-2 rounded-md hover:text-[#ffba20] transition text-sm disabled:opacity-70"
                >
                  {isLoading ? "Submitting..." : "Create Account"}
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="w-full bg-gray-200 text-black py-2 rounded-md hover:bg-gray-300 transition text-sm"
                >
                  Reset
                </button>
              </div>
            </form>
          </div>
        </div>
      </motion.section>
    </div>
  );
}
