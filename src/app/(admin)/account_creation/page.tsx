"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import supabase from "@/config/supabaseClient";

const EMAIL_REGEX = /^[\w-\.]+@(gmail\.com|hotmail\.com|yahoo\.com)$/i;
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*]).{6,}$/;

function getPHISOString() {
  const now = new Date();
  const ph = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return ph.toISOString().replace("T", " ").slice(0, 19);
}

function getPasswordStrength(pw: string) {
  if (!pw) return "";
  if (pw.length < 6) return "Weak";
  if (!/(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*])/.test(pw)) return "Weak";
  if (pw.length < 8) return "Medium";
  return "Strong";
}

export default function Page() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    contact_number: "",
    password: "",
    confirmPassword: "",
  });
  const [role, setRole] = useState<"admin" | "customer">("customer");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Only allow digits in contact_number, limit to 10
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
    setRole("customer");
    setErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) newErrors.name = "Name is required";

    if (!EMAIL_REGEX.test(formData.email))
      newErrors.email = "Must be a valid @gmail.com, @hotmail.com, or @yahoo.com email";

    // Contact number: must be 10 digits, user types only after +63
    if (!/^\d{10}$/.test(formData.contact_number)) {
      newErrors.contact_number = "Enter 10 digits after +63 (e.g., 9201234567)";
    }

    if (!PASSWORD_REGEX.test(formData.password)) {
      newErrors.password =
        "Min 6 chars, 1 letter, 1 number, 1 special (!@#$%^&*)";
    } else if (
      [formData.name, formData.email, "+63" + formData.contact_number].some((field) =>
        formData.password.includes(field)
      )
    ) {
      newErrors.password = "Password must be unique (do not use your name, email, or contact)";
    }
    if (formData.password !== formData.confirmPassword)
      newErrors.confirmPassword = "Passwords do not match";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setIsLoading(true);
    try {
      // Always send as +63 + 10 digits
      const contactNumber = "+63" + formData.contact_number;
      const res = await fetch("/api/setup-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          contact_number: contactNumber,
          password: formData.password,
          role,
        }),
      });

      const text = await res.text();
      let result: any;
      try {
        result = JSON.parse(text);
      } catch {
        throw new Error("Invalid JSON from server");
      }

      if (res.ok) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          const adminEmail = user?.email || "unknown";
          const adminRole = user?.user_metadata?.role || "unknown";
          await supabase.from("activity_logs").insert([
            {
              user_email: adminEmail,
              user_role: adminRole,
              action: `Created ${role === "admin" ? "Admin" : "Customer"} Account`,
              details: {
                created_name: formData.name,
                created_email: formData.email,
                created_contact_number: contactNumber,
                created_role: role,
              },
              created_at: getPHISOString(),
            },
          ]);
        } catch (err) {
          console.error("Failed to log activity:", err);
        }
        toast.success("Account created successfully!");
        handleReset();
      } else {
        toast.error("Error: " + (result?.error || "Unknown error"));
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Unexpected error: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const passwordStrength = getPasswordStrength(formData.password);

  return (
    <motion.div
      className="flex items-center justify-center h-[calc(100dvh-88px)] overflow-y-hidden px-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6 text-center">Create Account</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium">Name</label>
            <input
              name="name"
              type="text"
              placeholder="Enter your full name"
              value={formData.name}
              onChange={handleChange}
              required
              className={`w-full px-3 py-2 mt-1 border rounded-md outline-none focus:ring-2 ${
                errors.name
                  ? "border-red-500"
                  : "focus:ring-[#ffba20] border-gray-300"
              }`}
            />
            {errors.name && (
              <p className="text-red-500 text-sm mt-1">{errors.name}</p>
            )}
          </div>
          {/* Email */}
          <div>
            <label className="block text-sm font-medium">Email</label>
            <input
              name="email"
              type="email"
              placeholder="your@email.com (@gmail.com, @hotmail.com, @yahoo.com)"
              value={formData.email}
              onChange={handleChange}
              required
              className={`w-full px-3 py-2 mt-1 border rounded-md outline-none focus:ring-2 ${
                errors.email
                  ? "border-red-500"
                  : "focus:ring-[#ffba20] border-gray-300"
              }`}
            />
            {errors.email && (
              <p className="text-red-500 text-sm mt-1">{errors.email}</p>
            )}
          </div>
          {/* Contact Number with +63 fixed */}
          <div>
            <label className="block text-sm font-medium">Contact Number</label>
            <div className="flex items-center">
              <span className="px-2 py-2 bg-gray-100 border border-r-0 border-gray-300 rounded-l-md text-gray-500 select-none">
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
                className={`w-full px-3 py-2 border border-gray-300 rounded-r-md outline-none focus:ring-2 ${
                  errors.contact_number
                    ? "border-red-500"
                    : "focus:ring-[#ffba20]"
                }`}
                style={{ borderLeft: "none" }}
              />
            </div>
            <span className="text-xs text-gray-500 ml-1">
              Philippine mobile (enter 10 digits after +63)
            </span>
            {errors.contact_number && (
              <p className="text-red-500 text-sm mt-1">{errors.contact_number}</p>
            )}
          </div>
          {/* Password */}
          <div>
            <label className="block text-sm font-medium">Password</label>
            <div className="relative">
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="Min 6 chars, 1 number, 1 special"
                value={formData.password}
                onChange={handleChange}
                required
                className={`w-full px-3 py-2 mt-1 border rounded-md outline-none focus:ring-2 ${
                  errors.password
                    ? "border-red-500"
                    : "focus:ring-[#ffba20] border-gray-300"
                }`}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <div className="flex items-center gap-2 mt-1">
              {passwordStrength && (
                <span
                  className={`text-xs font-medium ${
                    passwordStrength === "Strong"
                      ? "text-green-600"
                      : passwordStrength === "Medium"
                      ? "text-yellow-500"
                      : "text-red-500"
                  }`}
                >
                  {passwordStrength}
                </span>
              )}
              <span className="text-xs text-gray-500">
                (Min 6 chars, 1 letter, 1 number, 1 special)
              </span>
            </div>
            {errors.password && (
              <p className="text-red-500 text-sm mt-1">{errors.password}</p>
            )}
          </div>
          {/* Confirm Password */}
          <div>
            <label className="block text-sm font-medium">
              Confirm Password
            </label>
            <input
              name="confirmPassword"
              type="password"
              placeholder="Re-enter your password"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
              className={`w-full px-3 py-2 mt-1 border rounded-md outline-none focus:ring-2 ${
                errors.confirmPassword
                  ? "border-red-500"
                  : "focus:ring-[#ffba20] border-gray-300"
              }`}
            />
            {errors.confirmPassword && (
              <p className="text-red-500 text-sm mt-1">{errors.confirmPassword}</p>
            )}
          </div>

          {/* ROLE RADIO BUTTONS */}
          <div>
            <span className="block text-sm font-medium mb-1">Account Type</span>
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="role"
                  value="admin"
                  checked={role === "admin"}
                  onChange={() => setRole("admin")}
                />
                Admin Account
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="role"
                  value="customer"
                  checked={role === "customer"}
                  onChange={() => setRole("customer")}
                />
                Customer Account
              </label>
            </div>
          </div>
          {/* END RADIO BUTTONS */}

          <div className="flex gap-2">
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
    </motion.div>
  );
}
