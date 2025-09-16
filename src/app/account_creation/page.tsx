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

  // Privacy modal
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [policyChecked, setPolicyChecked] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);

  // Open privacy policy
  function handleOpenPrivacy(e?: React.MouseEvent | React.KeyboardEvent) {
    if (e) e.preventDefault();
    setShowPrivacy(true);
    setHasScrolledToBottom(false);
    setPolicyChecked(false);
  }

  // Only enable checkbox after scrolling to bottom
  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) {
      setHasScrolledToBottom(true);
    }
  }

  // Accept button in modal
  function handleAcceptPolicy() {
    setPolicyAccepted(true);
    setShowPrivacy(false);
    toast.success("Privacy Policy accepted.");
  }

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
    setPolicyChecked(false);
    setPolicyAccepted(false);
    setHasScrolledToBottom(false);
  };

 const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  const newErrors: Record<string, string> = {};

  if (!formData.name.trim()) newErrors.name = "Name is required";
  if (!EMAIL_REGEX.test(formData.email))
    newErrors.email = "Must be a valid @gmail.com, @hotmail.com, or @yahoo.com email";
  if (!/^\d{10}$/.test(formData.contact_number))
    newErrors.contact_number = "Enter 10 digits after +63 (e.g., 9201234567)";

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

  if (!policyAccepted) {
    newErrors.privacy = "You must read and accept the Privacy Policy.";
  }

  if (Object.keys(newErrors).length > 0) {
    setErrors(newErrors);
    return;
  }

  setIsLoading(true);
  try {
    const contactNumber = "+63" + formData.contact_number;
    const { error } = await supabase.from("account_requests").insert([
      {
        name: formData.name,
        email: formData.email,
        contact_number: contactNumber,
        role: "customer",
        password: formData.password,
        status: "Pending",
        date_created: getPHISOString(),
      },
    ]);
    if (error) {
      // ⭐ Handle duplicate email error based on your unique constraint name:
      if (
        error.message?.toLowerCase().includes("unique") &&
        error.message?.toLowerCase().includes("email")
      ) {
        setErrors({ email: "This email address is already registered. Please use a different email." });
        toast.error("This email address is already registered. Please use a different email.");
      } else {
        toast.error("Unexpected error: " + (error.message || "Unknown error"));
      }
      return;
    }

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

              {/* Privacy Policy Consent (all clickable, faded checkbox) */}
              <div
                className="flex items-center gap-2 mt-3 cursor-pointer select-none group"
                tabIndex={0}
                role="button"
                aria-label="View and accept Privacy Policy"
                onClick={handleOpenPrivacy}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") handleOpenPrivacy(); }}
              >
                {/* Faded or checked checkbox */}
                <input
                  type="checkbox"
                  className={`w-4 h-4 rounded accent-[#ffba20] transition
                    ${!policyAccepted ? "opacity-40 cursor-pointer" : "opacity-100 cursor-pointer"}
                  `}
                  checked={policyAccepted}
                  readOnly
                  tabIndex={-1}
                />
                {/* The full sentence, all clickable */}
                <span className="text-xs text-gray-700 leading-tight group-hover:underline">
                  I have read and agree to the <span className="underline text-[#ffba20] hover:text-[#181918]">Privacy Policy</span> regarding the collection and use of my personal information by UniAsia Hardware & Electrical Marketing Corp.
                </span>
              </div>
              {errors.privacy && (
                <span className="text-red-500 text-xs mt-1">{errors.privacy}</span>
              )}

              {/* Actions */}
              <div className="flex gap-2 mt-2">
                <button
                  type="submit"
                  disabled={isLoading || !policyAccepted}
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

        {/* --- PRIVACY POLICY MODAL --- */}
<AnimatePresence>
  {showPrivacy && (
    <motion.div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        initial={{ scale: 0.98, y: 40, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.98, y: 40, opacity: 0 }}
        className="bg-white rounded-2xl p-6 max-w-2xl w-full shadow-xl relative"
        style={{ maxHeight: '90vh' }}
      >
        {/* Close button */}
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
          <p>
            <strong>Last updated:</strong> September 2025
          </p>
          <p>
            This Privacy Policy applies to the collection, use, and processing of personal information by <b>UniAsia Hardware & Electrical Marketing Corp.</b> (“UniAsia”, “we”, “our”, “us”), in compliance with Republic Act No. 10173, otherwise known as the Data Privacy Act of 2012 and its Implementing Rules and Regulations.
          </p>
          <h3 className="font-semibold text-base mt-4 mb-1">1. Collection of Personal Information</h3>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <b>Personal Data:</b> We collect your full name, email address, contact number, and password when you register for an account or use our services.
            </li>
            <li>
              <b>Additional Information:</b> We may also collect information such as delivery addresses and transaction history for order processing and after-sales service.
            </li>
            <li>
              <b>Automatic Collection:</b> Our website may automatically collect technical information such as your device type, browser, IP address, and usage logs for security and analytics purposes.
            </li>
          </ul>
          <h3 className="font-semibold text-base mt-4 mb-1">2. Purpose and Use</h3>
          <ul className="list-disc pl-6 space-y-2">
            <li>To process your account creation and manage your profile;</li>
            <li>To communicate with you regarding your orders, deliveries, and customer service concerns;</li>
            <li>To improve our products and services, including data analytics and website security;</li>
            <li>To comply with legal, regulatory, and contractual obligations.</li>
          </ul>
          <h3 className="font-semibold text-base mt-4 mb-1">3. Data Sharing and Disclosure</h3>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              We do <b>not</b> sell, trade, or rent your personal information to third parties.
            </li>
            <li>
              We may share data with trusted service providers (e.g., courier, payment gateways, IT support) only as necessary to fulfill our services, subject to strict confidentiality.
            </li>
            <li>
              We may disclose personal data if required by law, subpoena, or government request, or to protect our rights and property.
            </li>
          </ul>
          <h3 className="font-semibold text-base mt-4 mb-1">4. Data Retention and Security</h3>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              Your information is retained only for as long as necessary for the purposes stated above, or as required by applicable law.
            </li>
            <li>
              We implement appropriate organizational, physical, and technical security measures (such as SSL, restricted access, audit logs) to safeguard your data from unauthorized access, alteration, or destruction.
            </li>
          </ul>
          <h3 className="font-semibold text-base mt-4 mb-1">5. Your Rights</h3>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              Under the Data Privacy Act, you have the right to be informed, to access, correct, and update your personal data, to object to processing, to request deletion or blocking, and to withdraw your consent at any time, subject to legal and contractual restrictions.
            </li>
            <li>
              You may contact us to exercise these rights or for privacy-related concerns by emailing <a href="mailto:support@uniasia.com" className="underline text-[#ffba20]">support@uniasia.com</a>.
            </li>
          </ul>
          <h3 className="font-semibold text-base mt-4 mb-1">6. Changes to This Policy</h3>
          <p>
            We may revise this Privacy Policy to reflect changes in the law or our practices. Any significant changes will be posted on this page and, where appropriate, notified to you by email.
          </p>
          <h3 className="font-semibold text-base mt-4 mb-1">7. Consent</h3>
          <p>
            By creating an account, you acknowledge that you have read and understood this Privacy Policy and consent to the collection and processing of your personal data as described above.
          </p>
          <h3 className="font-semibold text-base mt-4 mb-1">8. Contact Information</h3>
          <p>
            For any privacy-related inquiries or requests, please contact our Data Privacy Officer:<br />
            <b>Email:</b> <a href="mailto:support@uniasia.com" className="underline text-[#ffba20]">support@uniasia.com</a>
          </p>
        </div>
        <button
          type="button"
          className={`mt-4 w-full bg-[#181918] text-white px-4 py-2 rounded hover:text-[#ffba20] transition disabled:opacity-60`}
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


      </motion.section>
    </div>
  );
}
