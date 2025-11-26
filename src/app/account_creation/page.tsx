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

/* ----------------------------- Helpers ----------------------------- */
const EMAIL_REGEX = /^[\w-\.]+@(gmail\.com|hotmail\.com|yahoo\.com)$/i;

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

/* =========================== Component ============================ */
export default function AccountCreationPage() {
  const router = useRouter();

  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    contact_number: "",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Privacy modal
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);

  // Success modal (email verification)
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");

  /* ----------------------------- Handlers ----------------------------- */
  function handleOpenPrivacy(e?: React.MouseEvent | React.KeyboardEvent) {
    if (e) e.preventDefault();
    setShowPrivacy(true);
    setHasScrolledToBottom(false);
  }
  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) {
      setHasScrolledToBottom(true);
    }
  }
  function handleAcceptPolicy() {
    setPolicyAccepted(true);
    setShowPrivacy(false);
    if (errors.privacy) setErrors((p) => ({ ...p, privacy: "" }));
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    if (name === "contact_number") {
      if (!/^\d*$/.test(value)) return;
      if (value.length > 10) return;
      setFormData((p) => ({ ...p, [name]: value }));
      if (errors[name]) setErrors((p) => ({ ...p, [name]: "" }));
      return;
    }
    if (type === "checkbox") {
      setPolicyAccepted(checked);
      if (errors.privacy) setErrors((p) => ({ ...p, privacy: "" }));
      return;
    }
    setFormData((p) => ({ ...p, [name]: value }));
    if (errors[name]) setErrors((p) => ({ ...p, [name]: "" }));
  };

  const handleReset = () => {
    setFormData({
      first_name: "",
      last_name: "",
      email: "",
      contact_number: "",
      password: "",
      confirmPassword: "",
    });
    setErrors({});
    setPolicyAccepted(false);
    setHasScrolledToBottom(false);
  };

  // 🔧 UPDATED VERSION
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!formData.first_name.trim()) newErrors.first_name = "First name is required";
    if (!formData.last_name.trim()) newErrors.last_name = "Last name is required";
    if (!EMAIL_REGEX.test(formData.email))
      newErrors.email = "Must be a valid @gmail.com, @hotmail.com, or @yahoo.com email";
    if (!/^\d{10}$/.test(formData.contact_number))
      newErrors.contact_number = "Enter 10 digits after +63 (e.g., 9201234567)";

    const fullName = `${formData.first_name.trim()} ${formData.last_name.trim()}`.replace(/\s+/g, " ");
    const personalInfo = [fullName, formData.email, "+63" + formData.contact_number];
    const pwStrength = getPasswordStrength(formData.password, personalInfo);
    if (["Weak", "Too Personal", "Invalid"].includes(pwStrength)) {
      newErrors.password =
        pwStrength === "Too Personal"
          ? "Password must not include your name, email, or contact."
          : "Password is too weak. Use a mix of letters, numbers, and special symbols (10+ chars).";
    }
    if (formData.password !== formData.confirmPassword)
      newErrors.confirmPassword = "Passwords do not match";
    if (!policyAccepted) newErrors.privacy = "You must read and accept the Privacy Policy.";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsLoading(true);
    try {
      const origin =
        typeof window !== "undefined"
          ? window.location.origin
          : process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

      // 1) Create auth user with rich metadata
      const { data, error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: fullName,
            name: fullName,
            first_name: formData.first_name.trim(),
            last_name: formData.last_name.trim(),
            contact_number: "+63" + formData.contact_number,
            phone: "+63" + formData.contact_number,
            role: "customer",
            provider_type: "email",
          },
          emailRedirectTo: `${origin}/auth/callback`,
        },
      });

      // Handle explicit Supabase error first
      if (error) {
        const msg = error.message || "";
        if (/already (registered|exists)/i.test(msg)) {
          setErrors((p) => ({
            ...p,
            email: "This email is already registered. Please log in instead.",
          }));
          toast.error("Email already registered.");
        } else {
          toast.error(msg);
        }
        return;
      }

      const user = data.user;

      if (!user) {
        toast.error("Sign up failed. Please try again.");
        return;
      }

      // 🔒 Guard for “obfuscated user” (email already taken)
      const identities = (user as any).identities as any[] | undefined;
      if (Array.isArray(identities) && identities.length === 0) {
        setErrors((p) => ({
          ...p,
          email: "This email is already registered. Please log in instead.",
        }));
        toast.error("Email already registered.");
        return;
      }

      const userId = user.id;
      if (!userId) {
        toast.error("Sign up failed. Please try again.");
        return;
      }

      // 2) Upsert into public.profiles (id = auth user id)
      const { error: upsertErr } = await supabase
        .from("profiles")
        .upsert(
          {
            id: userId,
            first_name: formData.first_name.trim(),
            last_name: formData.last_name.trim(),
            name: fullName,
            contact_number: "+63" + formData.contact_number,
            role: "customer",
            email: formData.email,
          },
          { onConflict: "id" }
        );

      if (upsertErr) {
        console.error("profiles upsert error:", upsertErr);
        toast.error(
          "Profile saving warning: " +
            (upsertErr?.message ?? JSON.stringify(upsertErr))
        );
      }

      // 3) Show “verify your email” modal
      setPendingEmail(formData.email);
      setShowSuccessModal(true);
      handleReset();
    } catch (err: any) {
      console.error(err);
      toast.error("Unexpected error: " + (err?.message || "Unknown error"));
    } finally {
      setIsLoading(false);
    }
  };

  const fullNamePreview = `${formData.first_name || ""} ${formData.last_name || ""}`.trim();
  const personalInfo = [fullNamePreview, formData.email, "+63" + formData.contact_number];
  const passwordStrength = getPasswordStrength(formData.password, personalInfo);

  /* ------------------------------- UI ------------------------------- */
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
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
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
              {/* First / Last Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-neutral-700">First Name</label>
                  <input
                    name="first_name"
                    type="text"
                    placeholder="Enter first name"
                    value={formData.first_name}
                    onChange={handleChange}
                    required
                    className={`w-full px-3 py-2 mt-1 text-sm border rounded-md outline-none focus:ring-2 ${
                      errors.first_name ? "border-red-500" : "focus:ring-black border-gray-300"
                    }`}
                  />
                  {errors.first_name && <p className="text-red-500 text-xs mt-1">{errors.first_name}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700">Last Name</label>
                  <input
                    name="last_name"
                    type="text"
                    placeholder="Enter last name"
                    value={formData.last_name}
                    onChange={handleChange}
                    required
                    className={`w-full px-3 py-2 mt-1 text-sm border rounded-md outline-none focus:ring-2 ${
                      errors.last_name ? "border-red-500" : "focus:ring-black border-gray-300"
                    }`}
                  />
                  {errors.last_name && <p className="text-red-500 text-xs mt-1">{errors.last_name}</p>}
                </div>
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
                        ${passwordStrength === "Strong" ? "bg-emerald-100 text-emerald-800 border-emerald-300" : ""}
                        ${passwordStrength === "Moderate" ? "bg-yellow-100 text-yellow-800 border-yellow-300" : ""}
                        ${passwordStrength === "Weak" ? "bg-red-100 text-red-800 border border-red-300" : ""}
                        ${passwordStrength === "Too Personal" ? "bg-pink-100 text-pink-800 border-pink-300" : ""}
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

              {/* Privacy Policy consent (checkbox + link) */}
              <div className="mt-3">
                <label className="flex items-start gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    name="policyAccepted"
                    className="mt-1 accent-[#ffba20]"
                    checked={policyAccepted}
                    onChange={handleChange}
                  />
                  <span>
                    I agree to the{" "}
                    <button
                      type="button"
                      className="underline text-[#ffba20] hover:text-[#181918]"
                      onClick={handleOpenPrivacy}
                    >
                      Privacy Policy & Terms
                    </button>
                    .
                  </span>
                </label>
                {errors.privacy && <p className="text-red-500 text-xs mt-1">{errors.privacy}</p>}
              </div>

              {/* Actions */}
              <div className="flex gap-2 mt-2">
                <button
                  type="submit"
                  disabled={isLoading || !policyAccepted}
                  className="w-full bg-[#181918] text-white py-2 rounded-md hover:text-[#ffba20] transition text-sm disabled:opacity-70 inline-flex items-center justify-center"
                >
                  {isLoading ? (
                    <span className="inline-flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                      </svg>
                      Creating…
                    </span>
                  ) : (
                    "Create Account"
                  )}
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

        {/* --- PRIVACY POLICY MODAL --- */}
        <AnimatePresence>
          {showPrivacy && (
            <motion.div
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={(e) => {
                if (e.target === e.currentTarget) setShowPrivacy(false);
              }}
            >
              <motion.div
                initial={{ scale: 0.98, y: 40, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.98, y: 40, opacity: 0 }}
                className="bg-white rounded-2xl p-6 max-w-2xl w-full shadow-xl relative"
                style={{ maxHeight: "90vh" }}
                role="dialog"
                aria-modal="true"
              >
                {/* Close */}
                <button
                  onClick={() => setShowPrivacy(false)}
                  className="absolute top-4 right-4 text-gray-400 hover:text-gray-900 transition-colors"
                  aria-label="Close"
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
                  </svg>
                </button>

                <h2 className="text-2xl font-bold mb-3 text-[#181918]">Privacy Policy</h2>
                <div
                  className="text-gray-700 text-sm leading-relaxed space-y-3 max-h-[65vh] overflow-y-auto pr-1 border border-gray-200 rounded p-3"
                  style={{ scrollbarWidth: "thin" }}
                  onScroll={handleScroll}
                  tabIndex={0}
                >
                  <p><strong>Last updated:</strong> September 2025</p>
                  <p>
                    This Privacy Policy applies to the collection, use, and processing of personal information by
                    <b> UniAsia Hardware & Electrical Marketing Corp.</b> (“UniAsia”, “we”, “our”, “us”), in compliance
                    with the Data Privacy Act of 2012 and its IRR.
                  </p>
                  <h3 className="font-semibold text-base mt-4 mb-1">1. Collection of Personal Information</h3>
                  <ul className="list-disc pl-6 space-y-2">
                    <li><b>Personal Data:</b> first name, last name, email address, contact number, password.</li>
                    <li><b>Additional:</b> delivery address and transaction history for orders.</li>
                    <li><b>Automatic:</b> device, browser, IP, usage logs for security and analytics.</li>
                  </ul>
                  <h3 className="font-semibold text-base mt-4 mb-1">2. Purpose and Use</h3>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Process account creation and manage your profile;</li>
                    <li>Communicate about orders, deliveries, and support;</li>
                    <li>Improve products/services and website security;</li>
                    <li>Comply with legal and regulatory obligations.</li>
                  </ul>
                  <h3 className="font-semibold text-base mt-4 mb-1">3. Sharing & Disclosure</h3>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>No selling of personal information.</li>
                    <li>Share only with trusted providers as necessary (e.g., courier/payment), under confidentiality.</li>
                    <li>Disclose if required by law or to protect our rights/property.</li>
                  </ul>
                  <h3 className="font-semibold text-base mt-4 mb-1">4. Retention & Security</h3>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Retained as long as necessary or required by law.</li>
                    <li>We apply organizational, physical, and technical safeguards.</li>
                  </ul>
                  <h3 className="font-semibold text-base mt-4 mb-1">5. Your Rights</h3>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Be informed; access/correct/delete; object; withdraw consent (subject to limits).</li>
                    <li>Contact: <a className="underline text-[#ffba20]" href="mailto:support@uniasia.com">support@uniasia.com</a></li>
                  </ul>
                </div>

                <button
                  type="button"
                  className="mt-4 w-full bg-[#181918] text-white px-4 py-2 rounded hover:text-[#ffba20] transition disabled:opacity-60"
                  disabled={!hasScrolledToBottom}
                  onClick={handleAcceptPolicy}
                >
                  Accept and Close
                </button>
                {!hasScrolledToBottom && (
                  <div className="pt-2 pb-1 text-center">
                    <span className="text-[11px] text-gray-400">Scroll to bottom to enable.</span>
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* --- VERIFY EMAIL MODAL --- */}
        <AnimatePresence>
          {showSuccessModal && (
            <motion.div
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={(e) => {
                if (e.target === e.currentTarget) setShowSuccessModal(false);
              }}
            >
              <motion.div
                className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-8 text-center relative"
                initial={{ scale: 0.98, y: 40, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.98, y: 40, opacity: 0 }}
                role="dialog"
                aria-modal="true"
              >
                <h2 className="text-2xl font-bold text-[#181918] mb-2">Verify your email</h2>
                <p className="text-gray-700 mb-6 text-sm">
                  We sent a verification link to <b>{pendingEmail}</b>. Please open your inbox and click the link to activate your account.
                </p>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    className="w-full bg-[#181918] text-white py-2 rounded hover:text-[#ffba20] transition"
                    onClick={() => {
                      setShowSuccessModal(false);
                      router.push("/login?verify=1");
                    }}
                  >
                    Go to Login
                  </button>
                  <a
                    href="https://mail.google.com"
                    target="_blank"
                    rel="noreferrer"
                    className="block w-full bg-gray-200 text-black py-2 rounded hover:bg-gray-300 transition"
                  >
                    Open Gmail
                  </a>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>
    </div>
  );
}
