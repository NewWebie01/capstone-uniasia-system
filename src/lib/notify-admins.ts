// src/lib/notify-admins.ts
"use server";

import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

const resendApiKey = process.env.RESEND_API_KEY;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Use this until your domain is verified.
// After verifying uniasia.shop in Resend, set RESEND_FROM to "no-reply@uniasia.shop".
const DEFAULT_FROM = "onboarding@resend.dev";
const RESEND_FROM = (process.env.RESEND_FROM || DEFAULT_FROM).trim();

const resend = resendApiKey ? new Resend(resendApiKey) : null;
const supabase =
  supabaseUrl && serviceRole ? createClient(supabaseUrl, serviceRole) : null;

console.log("[notify] RESEND_API_KEY set:", !!resendApiKey);
console.log("[notify] SUPABASE URL set:", !!supabaseUrl);
console.log("[notify] SERVICE_ROLE set:", !!serviceRole);
console.log("[notify] FROM:", RESEND_FROM);

/**
 * Emails all admins when an item hits low stock.
 * Admin emails are read from `account_requests` where role = 'admin'.
 * If none are found, falls back to ADMIN_EMAILS env (comma-separated).
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

  // 1) Fetch admin emails from DB
  const { data: admins, error: qErr } = await supabase
    .from("account_requests")
    .select("email")
    .eq("role", "admin");

  if (qErr) {
    console.error("[notify] Supabase query error:", qErr);
    return { ok: false, error: "Supabase query error", detail: qErr.message };
  }

  let recipients = (admins ?? []).map((a: any) => a.email).filter(Boolean);

  // 2) Fallback to env list if table is empty
  if (!recipients.length) {
    const fallback = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    if (fallback.length) {
      console.warn("[notify] No admin emails in table; using ADMIN_EMAILS fallback.");
      recipients = fallback;
    }
  }

  if (!recipients.length) {
    console.error("[notify] No admin emails found anywhere.");
    return { ok: false, error: "No admin emails found" };
  }

  // 3) Send email via Resend
  try {
    const { data, error: sendErr } = await resend.emails.send({
      from: `UniAsia Hardware <${process.env.RESEND_FROM!}>`,
      to: recipients,
      subject: `Low Stock: ${productName}`,
      html: `
        <h2 style="font-family:sans-serif;margin:0 0 8px">Low Stock Notification</h2>
        <p style="font-family:sans-serif;margin:4px 0">The item <strong>${productName}</strong> is running low.</p>
        <p style="font-family:sans-serif;margin:4px 0">Remaining quantity: <strong>${quantity}</strong></p>
        <p style="font-family:sans-serif;margin:12px 0">Please check the inventory dashboard for details.</p>
      `,
    });

    if (sendErr) {
      console.error("[notify] Resend send error:", sendErr);
      return { ok: false, error: "Send error", detail: sendErr.message };
    }

    console.log(`[notify] Sent to ${recipients.length} recipient(s).`);
    return { ok: true, data, recipients: recipients.length };
  } catch (err: any) {
    console.error("[notify] Unhandled Resend exception:", err);
    return { ok: false, error: "Send error", detail: err?.message };
  }
}
