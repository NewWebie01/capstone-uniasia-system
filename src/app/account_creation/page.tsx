// src/app/account_creation/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
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
  if (
    personal.some(
      (s) => s && s.length >= 3 && pw.toLowerCase().includes(s.toLowerCase())
    )
  )
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

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch: ${url}`);
  return res.json();
}

type PSGCItem = { code: string; name: string };

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

    // Location (PSGC)
    region_code: "",
    region_name: "",
    province_code: "",
    province_name: "",
    city_code: "",
    city_name: "",
    barangay_code: "",
    barangay_name: "",
    house_street: "",
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

  // PSGC Lists
  const [regions, setRegions] = useState<PSGCItem[]>([]);
  const [provinces, setProvinces] = useState<PSGCItem[]>([]);
  const [cities, setCities] = useState<PSGCItem[]>([]);
  const [barangays, setBarangays] = useState<PSGCItem[]>([]);
  const [psgcLoading, setPsgcLoading] = useState(false);

  // Helper to identify if Region is NCR (starts with 13)
  const isNCR = formData.region_code.startsWith("13");

  /* ----------------------------- PSGC Fetching (UPDATED TO PSGC.CLOUD) ----------------------------- */

  // 1. Load Regions
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setPsgcLoading(true);
        // CHANGED: Using psgc.cloud API
        const data = await fetchJSON<any[]>("https://psgc.cloud/api/regions");
        const mapped = data
          .map((r) => ({ code: r.code, name: r.name }))
          .sort((a, b) => a.name.localeCompare(b.name));

        if (mounted) setRegions(mapped);
      } catch (e: any) {
        console.error(e);
        toast.error("Failed to load regions.");
      } finally {
        if (mounted) setPsgcLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // 2. Load Provinces (With NCR Bypass Logic)
  async function loadProvinces(regionCode: string) {
    try {
      setPsgcLoading(true);

      // NCR Logic: NCR has no provinces in psgc.cloud
      if (regionCode.startsWith("13")) {
        setProvinces([]);
        // Directly load cities for NCR
        await loadCitiesForNCR(regionCode);
        return;
      }

      const data = await fetchJSON<any[]>("https://psgc.cloud/api/provinces");
      // psgc.cloud returns ALL provinces, so we filter by region prefix (first 2 digits)
      const prefix = regionCode.slice(0, 2);
      const filtered = data.filter((p) => p.code.startsWith(prefix));

      setProvinces(
        filtered
          .map((p) => ({ code: p.code, name: p.name }))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    } catch (e) {
      console.error(e);
      toast.error("Failed to load provinces.");
    } finally {
      setPsgcLoading(false);
    }
  }

  // Special function for NCR Cities
  async function loadCitiesForNCR(regionCode: string) {
    try {
      const [c, m] = await Promise.all([
        fetchJSON<any[]>(`https://psgc.cloud/api/regions/${regionCode}/cities`),
        fetchJSON<any[]>(
          `https://psgc.cloud/api/regions/${regionCode}/municipalities`
        ),
      ]);
      const list = [...c, ...m]
        .map((x) => ({ code: x.code, name: x.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
      setCities(list);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load NCR cities");
    } finally {
      setPsgcLoading(false);
    }
  }

  // 3. Load Cities (Normal Provinces)
  async function loadCities(provinceCode: string) {
    if (formData.region_code.startsWith("13")) return; // Skip if NCR

    try {
      setPsgcLoading(true);
      const [c, m] = await Promise.all([
        fetchJSON<any[]>("https://psgc.cloud/api/cities"),
        fetchJSON<any[]>("https://psgc.cloud/api/municipalities"),
      ]);

      // Filter by province prefix (first 4 digits)
      const prefix = provinceCode.slice(0, 4);
      const filtered = [...c, ...m].filter((x) => x.code.startsWith(prefix));

      setCities(
        filtered
          .map((c) => ({ code: c.code, name: c.name }))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    } catch (e) {
      console.error(e);
      toast.error("Failed to load cities/municipalities.");
    } finally {
      setPsgcLoading(false);
    }
  }

  // 4. Load Barangays
  async function loadBarangays(cityCode: string) {
    try {
      setPsgcLoading(true);
      // Try city endpoint first, then municipality endpoint (fallback)
      let data = [];
      try {
        data = await fetchJSON<any[]>(
          `https://psgc.cloud/api/cities/${cityCode}/barangays`
        );
      } catch {
        try {
          data = await fetchJSON<any[]>(
            `https://psgc.cloud/api/municipalities/${cityCode}/barangays`
          );
        } catch {
          data = [];
        }
      }

      setBarangays(
        data
          .map((b) => ({ code: b.code, name: b.name }))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    } catch (e) {
      console.error(e);
      toast.error("Failed to load barangays.");
    } finally {
      setPsgcLoading(false);
    }
  }

  /* ----------------------------- Derived Address ----------------------------- */
  const computedAddress = useMemo(() => {
    const parts = [
      formData.house_street?.trim(),
      formData.barangay_name,
      formData.city_name,
      formData.province_name, // Will be empty for NCR, which is correct
      formData.region_name,
    ].filter(Boolean);
    return parts.join(", ");
  }, [
    formData.house_street,
    formData.barangay_name,
    formData.city_name,
    formData.province_name,
    formData.region_name,
  ]);

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

      region_code: "",
      region_name: "",
      province_code: "",
      province_name: "",
      city_code: "",
      city_name: "",
      barangay_code: "",
      barangay_name: "",
      house_street: "",
    });
    setRegions((p) => p);
    setProvinces([]);
    setCities([]);
    setBarangays([]);
    setErrors({});
    setPolicyAccepted(false);
    setHasScrolledToBottom(false);
  };

  const handleRegionChange = async (code: string) => {
    const picked = regions.find((r) => r.code === code);
    setFormData((p) => ({
      ...p,
      region_code: code,
      region_name: picked?.name || "",
      province_code: "",
      province_name: "",
      city_code: "",
      city_name: "",
      barangay_code: "",
      barangay_name: "",
    }));
    setProvinces([]);
    setCities([]);
    setBarangays([]);
    if (errors.region_code) setErrors((p) => ({ ...p, region_code: "" }));
    if (code) await loadProvinces(code);
  };

  const handleProvinceChange = async (code: string) => {
    const picked = provinces.find((p) => p.code === code);
    setFormData((prev) => ({
      ...prev,
      province_code: code,
      province_name: picked?.name || "",
      city_code: "",
      city_name: "",
      barangay_code: "",
      barangay_name: "",
    }));
    setCities([]);
    setBarangays([]);
    if (errors.province_code) setErrors((p) => ({ ...p, province_code: "" }));
    if (code) await loadCities(code);
  };

  const handleCityChange = async (code: string) => {
    const picked = cities.find((c) => c.code === code);
    setFormData((prev) => ({
      ...prev,
      city_code: code,
      city_name: picked?.name || "",
      barangay_code: "",
      barangay_name: "",
    }));
    setBarangays([]);
    if (errors.city_code) setErrors((p) => ({ ...p, city_code: "" }));
    if (code) await loadBarangays(code);
  };

  const handleBarangayChange = (code: string) => {
    const picked = barangays.find((b) => b.code === code);
    setFormData((prev) => ({
      ...prev,
      barangay_code: code,
      barangay_name: picked?.name || "",
    }));
    if (errors.barangay_code) setErrors((p) => ({ ...p, barangay_code: "" }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!formData.first_name.trim())
      newErrors.first_name = "First name is required";
    if (!formData.last_name.trim())
      newErrors.last_name = "Last name is required";
    if (!EMAIL_REGEX.test(formData.email))
      newErrors.email =
        "Must be a valid @gmail.com, @hotmail.com, or @yahoo.com email";
    if (!/^\d{10}$/.test(formData.contact_number))
      newErrors.contact_number = "Enter 10 digits after +63 (e.g., 9201234567)";

    // Location Validation
    if (!formData.region_code) newErrors.region_code = "Select a region";

    // IMPORTANT: Only require province if NOT NCR
    if (!isNCR && !formData.province_code)
      newErrors.province_code = "Select a province";

    if (!formData.city_code) newErrors.city_code = "Select a city/municipality";
    if (!formData.barangay_code) newErrors.barangay_code = "Select a barangay";
    if (!formData.house_street.trim())
      newErrors.house_street = "House number & street is required";

    const fullName =
      `${formData.first_name.trim()} ${formData.last_name.trim()}`.replace(
        /\s+/g,
        " "
      );
    const personalInfo = [
      fullName,
      formData.email,
      "+63" + formData.contact_number,
    ];
    const pwStrength = getPasswordStrength(formData.password, personalInfo);

    if (["Weak", "Too Personal", "Invalid"].includes(pwStrength)) {
      newErrors.password =
        pwStrength === "Too Personal"
          ? "Password must not include your name, email, or contact."
          : "Password is too weak. Use a mix of letters, numbers, and special symbols (10+ chars).";
    }
    if (formData.password !== formData.confirmPassword)
      newErrors.confirmPassword = "Passwords do not match";
    if (!policyAccepted)
      newErrors.privacy = "You must read and accept the Privacy Policy.";

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

            // Location data (Saved to metadata so hooks trigger correctly)
            region_code: formData.region_code,
            region_name: formData.region_name,
            province_code: formData.province_code || null, // Allow null for NCR
            province_name: formData.province_name || null,
            city_code: formData.city_code,
            city_name: formData.city_name,
            barangay_code: formData.barangay_code,
            barangay_name: formData.barangay_name,
            house_street: formData.house_street.trim(),
            address: computedAddress,
          },
          emailRedirectTo: `${origin}/auth/callback`,
        },
      });

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

      // Upsert to profiles (Mirroring metadata)
      const { error: upsertErr } = await supabase.from("profiles").upsert(
        {
          id: user.id,
          first_name: formData.first_name.trim(),
          last_name: formData.last_name.trim(),
          name: fullName,
          contact_number: "+63" + formData.contact_number,
          role: "customer",
          email: formData.email,

          region_code: formData.region_code,
          region_name: formData.region_name,
          province_code: formData.province_code || null,
          province_name: formData.province_name || null,
          city_code: formData.city_code,
          city_name: formData.city_name,
          barangay_code: formData.barangay_code,
          barangay_name: formData.barangay_name,
          house_street: formData.house_street.trim(),
          address: computedAddress,
        },
        { onConflict: "id" }
      );

      if (upsertErr) {
        console.error("profiles upsert error:", upsertErr);
      }

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

  // Preview data
  const fullNamePreview = `${formData.first_name || ""} ${
    formData.last_name || ""
  }`.trim();
  const personalInfoData = [
    fullNamePreview,
    formData.email,
    "+63" + formData.contact_number,
  ];
  const passwordStrength = getPasswordStrength(
    formData.password,
    personalInfoData
  );

  /* ------------------------------- UI ------------------------------- */
  return (
    <div className="min-h-screen flex flex-col overflow-hidden relative">
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
                <Image
                  src={Logo}
                  alt="UniAsia Logo"
                  height={50}
                  width={50}
                  className="cursor-pointer"
                />
              </motion.button>
              <MenuIcon
                className="h-5 w-5 md:hidden cursor-pointer"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
              />
            </div>
          </div>
        </div>
      </header>

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
              {/* Names */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-neutral-700">
                    First Name
                  </label>
                  <input
                    name="first_name"
                    type="text"
                    value={formData.first_name}
                    onChange={handleChange}
                    required
                    className={`w-full px-3 py-2 mt-1 text-sm border rounded-md outline-none focus:ring-2 ${
                      errors.first_name
                        ? "border-red-500"
                        : "focus:ring-black border-gray-300"
                    }`}
                  />
                  {errors.first_name && (
                    <p className="text-red-500 text-xs mt-1">
                      {errors.first_name}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700">
                    Last Name
                  </label>
                  <input
                    name="last_name"
                    type="text"
                    value={formData.last_name}
                    onChange={handleChange}
                    required
                    className={`w-full px-3 py-2 mt-1 text-sm border rounded-md outline-none focus:ring-2 ${
                      errors.last_name
                        ? "border-red-500"
                        : "focus:ring-black border-gray-300"
                    }`}
                  />
                  {errors.last_name && (
                    <p className="text-red-500 text-xs mt-1">
                      {errors.last_name}
                    </p>
                  )}
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-neutral-700">
                  Email
                </label>
                <input
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  placeholder="your@email.com"
                  className={`w-full px-3 py-2 mt-1 text-sm border rounded-md outline-none focus:ring-2 ${
                    errors.email
                      ? "border-red-500"
                      : "focus:ring-black border-gray-300"
                  }`}
                />
                {errors.email && (
                  <p className="text-red-500 text-xs mt-1">{errors.email}</p>
                )}
              </div>

              {/* Contact */}
              <div>
                <label className="block text-sm font-medium text-neutral-700">
                  Contact Number
                </label>
                <div className="flex items-center mt-1">
                  <span className="px-2 py-2 bg-gray-100 border border-r-0 border-gray-300 rounded-l-md text-gray-500 text-sm select-none">
                    +63
                  </span>
                  <input
                    name="contact_number"
                    type="tel"
                    value={formData.contact_number}
                    onChange={handleChange}
                    required
                    maxLength={10}
                    placeholder="9123456789"
                    className={`w-full px-3 py-2 text-sm border border-gray-300 rounded-r-md outline-none focus:ring-2 ${
                      errors.contact_number
                        ? "border-red-500"
                        : "focus:ring-black"
                    }`}
                    style={{ borderLeft: "none" }}
                  />
                </div>
                {errors.contact_number && (
                  <p className="text-red-500 text-xs mt-1">
                    {errors.contact_number}
                  </p>
                )}
              </div>

              {/* Location */}
              <div className="pt-2">
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Location
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  {/* Region */}
                  <div>
                    <label className="block text-xs font-medium text-neutral-600">
                      Region
                    </label>
                    <select
                      value={formData.region_code}
                      onChange={(e) => handleRegionChange(e.target.value)}
                      className={`w-full px-3 py-2 mt-1 text-sm border rounded-md outline-none focus:ring-2 ${
                        errors.region_code
                          ? "border-red-500"
                          : "focus:ring-black border-gray-300"
                      }`}
                      disabled={psgcLoading}
                    >
                      <option value="">
                        {psgcLoading ? "Loading..." : "Select"}
                      </option>
                      {regions.map((r) => (
                        <option key={r.code} value={r.code}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Province (Disabled if NCR) */}
                  <div>
                    <label className="block text-xs font-medium text-neutral-600">
                      Province
                    </label>
                    <select
                      value={formData.province_code}
                      onChange={(e) => handleProvinceChange(e.target.value)}
                      className={`w-full px-3 py-2 mt-1 text-sm border rounded-md outline-none focus:ring-2 ${
                        errors.province_code
                          ? "border-red-500"
                          : "focus:ring-black border-gray-300"
                      }`}
                      disabled={!formData.region_code || isNCR || psgcLoading}
                    >
                      <option value="">
                        {isNCR ? "NCR (None)" : "Select"}
                      </option>
                      {provinces.map((p) => (
                        <option key={p.code} value={p.code}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* City */}
                  <div>
                    <label className="block text-xs font-medium text-neutral-600">
                      City/Mun
                    </label>
                    <select
                      value={formData.city_code}
                      onChange={(e) => handleCityChange(e.target.value)}
                      className={`w-full px-3 py-2 mt-1 text-sm border rounded-md outline-none focus:ring-2 ${
                        errors.city_code
                          ? "border-red-500"
                          : "focus:ring-black border-gray-300"
                      }`}
                      disabled={
                        (!formData.province_code && !isNCR) || psgcLoading
                      }
                    >
                      <option value="">Select</option>
                      {cities.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Barangay */}
                  <div>
                    <label className="block text-xs font-medium text-neutral-600">
                      Barangay
                    </label>
                    <select
                      value={formData.barangay_code}
                      onChange={(e) => handleBarangayChange(e.target.value)}
                      className={`w-full px-3 py-2 mt-1 text-sm border rounded-md outline-none focus:ring-2 ${
                        errors.barangay_code
                          ? "border-red-500"
                          : "focus:ring-black border-gray-300"
                      }`}
                      disabled={!formData.city_code || psgcLoading}
                    >
                      <option value="">Select</option>
                      {barangays.map((b) => (
                        <option key={b.code} value={b.code}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* House Street */}
                <div className="mt-3">
                  <input
                    name="house_street"
                    type="text"
                    placeholder="House Number & Street Name"
                    value={formData.house_street}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 text-sm border rounded-md outline-none focus:ring-2 ${
                      errors.house_street
                        ? "border-red-500"
                        : "focus:ring-black border-gray-300"
                    }`}
                  />
                  {errors.house_street && (
                    <p className="text-red-500 text-xs mt-1">
                      {errors.house_street}
                    </p>
                  )}
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-neutral-700">
                  Password
                </label>
                <div className="relative">
                  <input
                    name="password"
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={handleChange}
                    required
                    placeholder="Min 6 chars"
                    className={`w-full px-3 py-2 mt-1 text-sm border rounded-md outline-none focus:ring-2 ${
                      errors.password
                        ? "border-red-500"
                        : "focus:ring-black border-gray-300"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
                {/* Strength Meter UI */}
                <div className="flex items-center gap-2 mt-1">
                  {formData.password && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-100 border border-gray-300 text-gray-700">
                      {passwordStrength}
                    </span>
                  )}
                </div>
                {errors.password && (
                  <p className="text-red-500 text-xs mt-1">{errors.password}</p>
                )}
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-sm font-medium text-neutral-700">
                  Confirm Password
                </label>
                <input
                  name="confirmPassword"
                  type="password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  required
                  className={`w-full px-3 py-2 mt-1 text-sm border rounded-md outline-none focus:ring-2 ${
                    errors.confirmPassword
                      ? "border-red-500"
                      : "focus:ring-black border-gray-300"
                  }`}
                />
                {errors.confirmPassword && (
                  <p className="text-red-500 text-xs mt-1">
                    {errors.confirmPassword}
                  </p>
                )}
              </div>

              {/* Privacy Policy */}
              <div className="mt-3">
                <label className="flex items-start gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={policyAccepted}
                    onChange={(e) => {
                      setPolicyAccepted(e.target.checked);
                      if (errors.privacy)
                        setErrors((p) => ({ ...p, privacy: "" }));
                    }}
                    className="mt-1 accent-[#ffba20]"
                  />
                  <span>
                    I agree to the{" "}
                    <button
                      type="button"
                      onClick={handleOpenPrivacy}
                      className="underline text-[#ffba20]"
                    >
                      Privacy Policy & Terms
                    </button>
                    .
                  </span>
                </label>
                {errors.privacy && (
                  <p className="text-red-500 text-xs mt-1">{errors.privacy}</p>
                )}
              </div>

              <div className="flex gap-2 mt-2">
                <button
                  type="submit"
                  disabled={isLoading || !policyAccepted}
                  className="w-full bg-[#181918] text-white py-2 rounded-md hover:text-[#ffba20] transition text-sm disabled:opacity-70"
                >
                  {isLoading ? "Creating..." : "Create Account"}
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

        {/* Privacy Modal */}
        <AnimatePresence>
          {showPrivacy && (
            <motion.div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center">
              <div className="bg-white p-6 rounded-2xl max-w-lg w-full">
                <h2 className="text-xl font-bold mb-4">Privacy Policy</h2>
                <div
                  className="h-64 overflow-y-auto border p-2 mb-4"
                  onScroll={handleScroll}
                >
                  <p className="text-sm">
                    <strong>1. Collection of Data:</strong> We collect your
                    name, email, contact, and address.
                    <br />
                    <br />
                    <strong>2. Use of Data:</strong> Used for account
                    management, order processing, and delivery.
                    <br />
                    <br />
                    <strong>3. Sharing:</strong> We do not sell your data.
                    Shared only with logistics partners.
                    <br />
                    <br />
                    <strong>4. Rights:</strong> You may request to delete your
                    data anytime.
                    <br />
                    <br />
                    (Scroll to bottom to accept)
                  </p>
                  <div className="h-20"></div>
                </div>
                <button
                  onClick={handleAcceptPolicy}
                  disabled={!hasScrolledToBottom}
                  className="w-full bg-black text-white py-2 rounded disabled:opacity-50"
                >
                  Accept
                </button>
                <button
                  onClick={() => setShowPrivacy(false)}
                  className="w-full mt-2 text-gray-500 text-sm"
                >
                  Close
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Success Modal */}
        <AnimatePresence>
          {showSuccessModal && (
            <motion.div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center">
              <div className="bg-white p-8 rounded-2xl max-w-sm w-full text-center">
                <h2 className="text-2xl font-bold mb-2">Verify your email</h2>
                <p className="mb-6">
                  Link sent to <b>{pendingEmail}</b>
                </p>
                <button
                  onClick={() => router.push("/login")}
                  className="w-full bg-black text-white py-2 rounded"
                >
                  Go to Login
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>
    </div>
  );
}
