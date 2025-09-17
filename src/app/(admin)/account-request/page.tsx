// src/app/account-request/page.tsx
"use client";

import { useEffect, useState } from "react";
import supabase from "@/config/supabaseClient";
import { motion, AnimatePresence } from "framer-motion";
import { BadgeCheck, Ban, Loader2 } from "lucide-react";
import { toast } from "sonner";

// --- Types
type AccountRequest = {
  id: string;
  name: string;
  email: string;
  contact_number: string;
  password: string;
  status: "Pending" | "Approved" | "Rejected";
  date_created: string;
  role?: string;
};

// --- Activity Logger (reused from Activity Log Page) ---
async function logActivity(action: string, details: any = {}) {
  try {
    const { data } = await supabase.auth.getUser();
    await supabase.from("activity_logs").insert([
      {
        user_email: data?.user?.email || "",
        user_role: "admin",
        action,
        details,
        created_at: new Date().toISOString(),
      },
    ]);
  } catch (e) {
    // Optional: handle error
    console.error("logActivity failed:", e);
  }
}

// --- Show only DATE (not time)
function formatPHDate(d?: string | number | Date | null) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  }).format(new Date(d));
}

export default function AccountRequestPage() {
  const [requests, setRequests] = useState<AccountRequest[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [modalReq, setModalReq] = useState<AccountRequest | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Per-row role select
  const [selectedRoles, setSelectedRoles] = useState<{ [id: string]: string }>({});

  // Real-time subscription (mount once)
  useEffect(() => {
    fetchRequests();
    const channel = supabase
      .channel("account-requests-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "account_requests" },
        () => fetchRequests()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line
  }, []);

  // Fetch from DB
  async function fetchRequests() {
    setLoading(true);
    const { data } = await supabase
      .from("account_requests")
      .select("*")
      .order("date_created", { ascending: false });
    if (data) setRequests(data as AccountRequest[]);
    setLoading(false);
  }

  // Search
  const filteredRequests = requests.filter((req) => {
    const q = search.toLowerCase();
    return (
      req.name.toLowerCase().includes(q) ||
      req.email.toLowerCase().includes(q) ||
      req.contact_number.toLowerCase().includes(q) ||
      (req.status ?? "").toLowerCase().includes(q) ||
      formatPHDate(req.date_created).toLowerCase().includes(q)
    );
  });

  // Status Badge
  function StatusBadge({ status }: { status: string }) {
    return (
      <motion.span
        className={
          "flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border " +
          (status === "Approved"
            ? "bg-[#dcfce7] text-green-800 border-green-200"
            : status === "Rejected"
            ? "bg-[#fee2e2] text-red-700 border-red-200"
            : "bg-[#fef9c3] text-yellow-800 border-yellow-200")
        }
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 18 }}
      >
        {status === "Approved" && <BadgeCheck className="w-3 h-3" />}
        {status === "Rejected" && <Ban className="w-3 h-3" />}
        {status}
      </motion.span>
    );
  }

  // Approve modal open
  const handleApprove = (req: AccountRequest) => {
    setModalReq(req);
    setShowModal(true);
  };

  // --- Modal Approve Confirm (with activity log)
  const handleModalApprove = async () => {
    if (!modalReq) return;
    setIsProcessing(true);
    const id = modalReq.id;
    const role = selectedRoles[id] || "customer";

    try {
      // 1. Create user in Supabase Auth (your own admin route)
      const res = await fetch("/api/setup-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: modalReq.name,
          email: modalReq.email,
          contact_number: modalReq.contact_number,
          password: modalReq.password,
          role,
        }),
      });
      const data = await res.json();
      if (data?.error) throw new Error(data?.error);

      // 2. Update status to Approved
      await supabase
        .from("account_requests")
        .update({ status: "Approved", role })
        .eq("id", id);

      // 3. Log Activity (NEW)
      await logActivity("Approved Account Request", {
        request_id: modalReq.id,
        name: modalReq.name,
        email: modalReq.email,
        contact_number: modalReq.contact_number,
        approved_role: role,
      });

      // 4. Send approval email notification
      await fetch("/api/send-approval-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: modalReq.email, name: modalReq.name }),
      });

      toast.success(`Account for ${modalReq.name} approved as ${role}. Email sent.`);
    } catch (err: any) {
      toast.error("Failed to approve: " + (err?.message || "Unknown"));
    } finally {
      setIsProcessing(false);
      setShowModal(false);
    }
  };

  // Reject handler (with activity log)
  const handleReject = async (req: AccountRequest) => {
    try {
      await supabase
        .from("account_requests")
        .update({ status: "Rejected" })
        .eq("id", req.id);

      // Log Activity (NEW)
      await logActivity("Rejected Account Request", {
        request_id: req.id,
        name: req.name,
        email: req.email,
        contact_number: req.contact_number,
        prev_status: req.status,
      });

      toast.success("Request rejected.");
    } catch {
      toast.error("Failed to reject.");
    }
  };

  return (
    <div className="px-4 pb-6 pt-1 min-h-screen bg-gradient-to-br from-[#fff8e1] to-[#ececec]">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="pt-2 pb-1">
          <h1 className="text-3xl font-bold mb-1">Account Requests</h1>
          <p className="text-sm text-gray-500 mb-2">
            View, approve, or reject new account signups in real time.
          </p>
        </div>

        {/* Search bar */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <input
            type="text"
            className="w-full md:w-[22rem] px-4 py-2 rounded-xl border border-gray-200 bg-white shadow-sm text-sm outline-none focus:ring-2 focus:ring-[#ffba20] transition-all"
            placeholder="Search by name, email, contact, or status…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Table - styled like Activity Log */}
        <div className="overflow-x-auto">
          <table className="min-w-full text-[13.5px] rounded-2xl overflow-hidden">
            <thead>
              <tr className="bg-[#ffd033] text-neutral-900 font-bold rounded-t-2xl">
                <th className="py-3 px-4 font-semibold text-left rounded-tl-2xl">Date</th>
                <th className="py-3 px-4 font-semibold text-left">Name</th>
                <th className="py-3 px-4 font-semibold text-left">Email</th>
                <th className="py-3 px-4 font-semibold text-left">Contact #</th>
                <th className="py-3 px-4 font-semibold text-left">Status</th>
                <th className="py-3 px-4 font-semibold text-left">Role</th>
                <th className="py-3 px-4 font-semibold text-left rounded-tr-2xl">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-400">
                    <Loader2 className="mx-auto animate-spin" /> Loading…
                  </td>
                </tr>
              ) : filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-400">
                    No requests found.
                  </td>
                </tr>
              ) : (
                filteredRequests.map((req, i) => (
                  <tr
                    key={req.id}
                    className={
                      "transition " +
                      (i % 2 === 0
                        ? "bg-[#fffbe7] hover:bg-yellow-50"
                        : "bg-white hover:bg-yellow-50")
                    }
                  >
                    {/* Date */}
                    <td className="py-2 px-4 align-middle font-mono text-[13px] whitespace-nowrap">
                      {formatPHDate(req.date_created)}
                    </td>
                    {/* Name */}
                    <td className="py-2 px-4 align-middle">{req.name}</td>
                    {/* Email */}
                    <td className="py-2 px-4 align-middle whitespace-nowrap">{req.email}</td>
                    {/* Contact number */}
                    <td className="py-2 px-4 align-middle whitespace-nowrap">{req.contact_number}</td>
                    {/* Status */}
                    <td className="py-2 px-4 align-middle">
                      <StatusBadge status={req.status} />
                    </td>
                    {/* Role (dropdown only if pending) */}
                    <td className="py-2 px-4 align-middle">
                      {req.status === "Pending" ? (
                        <select
                          className="border rounded px-2 py-1 bg-gray-50 outline-none focus:ring-2 focus:ring-[#ffba20] transition text-[13px]"
                          value={selectedRoles[req.id] || "customer"}
                          onChange={e =>
                            setSelectedRoles({ ...selectedRoles, [req.id]: e.target.value })
                          }
                        >
                          <option value="customer">Customer</option>
                          <option value="admin">Admin</option>
                        </select>
                      ) : (
                        <span className="capitalize">{req.role || "—"}</span>
                      )}
                    </td>
                    {/* Approve/Reject buttons */}
                    <td className="py-2 px-4 align-middle">
                      {req.status === "Pending" && (
                        <div className="flex gap-2">
                          <button
                            className="bg-green-600 hover:bg-green-700 text-white text-xs px-4 py-1 rounded-full shadow"
                            onClick={() => handleApprove(req)}
                          >
                            Approve
                          </button>
                          <button
                            className="bg-red-500 hover:bg-red-600 text-white text-xs px-4 py-1 rounded-full shadow"
                            onClick={() => handleReject(req)}
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {showModal && modalReq && (
          <motion.div
            key="approve-modal"
            initial={{ opacity: 0, scale: 0.98, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 30 }}
            className="fixed inset-0 bg-black/30 z-40 flex items-center justify-center backdrop-blur"
          >
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.98 }}
              className="bg-white/90 rounded-2xl shadow-2xl max-w-sm w-full p-8 border border-yellow-200"
            >
              <h2 className="font-bold text-xl mb-3">Approve Account</h2>
              <p className="mb-2">
                Approve account for <span className="font-semibold">{modalReq.name}</span> as{" "}
                <span className="font-semibold">{selectedRoles[modalReq.id] || "customer"}</span>?
              </p>
              <div className="flex gap-2 mt-6">
                <button
                  onClick={handleModalApprove}
                  className={`w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-md font-semibold transition ${
                    isProcessing ? "opacity-60 pointer-events-none" : ""
                  }`}
                  disabled={isProcessing}
                >
                  {isProcessing ? <Loader2 className="w-4 h-4 animate-spin inline" /> : "Confirm & Create"}
                </button>
                <button
                  className="w-full bg-gray-200 text-black py-2 rounded-md hover:bg-gray-300 font-semibold"
                  onClick={() => setShowModal(false)}
                  disabled={isProcessing}
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
