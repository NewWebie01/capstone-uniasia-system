// src/lib/notify-admins.ts
"use server";

import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

const resendApiKey = process.env.RESEND_API_KEY;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

const resend = resendApiKey ? new Resend(resendApiKey) : null;
const supabase =
  supabaseUrl && serviceRole ? createClient(supabaseUrl, serviceRole) : null;

console.log("[notify] RESEND_API_KEY set:", !!resendApiKey);
console.log("[notify] SUPABASE URL set:", !!supabaseUrl);
console.log("[notify] SERVICE_ROLE set:", !!serviceRole);

/**
 * Emails all admins when an item hits low stock.
 * Admin emails are read from `account_requests` where role = 'admin'.
 */
export async function notifyAdminsLowStock(productName: string, quantity: number) {
  if (!supabase) {
    console.error("[notify] Supabase server client not configured");
    return { ok: false, error: "Supabase server client not configured" };
  }
  if (!resend) {
    console.error("[notify] RESEND_API_KEY missing");
    return { ok: false, error: "RESEND_API_KEY missing" };
  }

  // 1) Fetch admin emails
  const { data: admins, error: qErr } = await supabase
    .from("account_requests")
    .select("email")
    .eq("role", "admin");

  if (qErr) {
    console.error("[notify] Supabase query error:", qErr);
    return { ok: false, error: "Supabase query error", detail: qErr.message };
  }

  const emails = (admins ?? []).map(a => a.email).filter(Boolean);
  if (!emails.length) {
    console.error("[notify] No admin emails found in account_requests");
    return { ok: false, error: "No admin emails found" };
  }

  // 2) Send email via Resend
  try {
    const { data, error: sendErr } = await resend.emails.send({
      from: "no-reply@uniasia.shop",
      to: emails,
      subject: "Low Stock Alert",
      html: `
        <h2>Low Stock Notification</h2>
        <p>The item <strong>${productName}</strong> is running low.</p>
        <p>Remaining quantity: <strong>${quantity}</strong></p>
        <p>Please check the inventory dashboard for details.</p>
      `,
    });

    if (sendErr) {
      console.error("[notify] Resend send error:", sendErr);
      return { ok: false, error: "Send error", detail: sendErr.message };
    }

    return { ok: true, data, recipients: emails.length };
  } catch (err: any) {
    console.error("[notify] Unhandled Resend exception:", err);
    return { ok: false, error: "Send error", detail: err?.message };
  }
}
