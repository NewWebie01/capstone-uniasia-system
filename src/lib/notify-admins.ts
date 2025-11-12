// src/lib/notify-admins.ts
"use server";

import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

/* ------------------------------- Types ------------------------------- */
export type LowStockItem = { sku?: string; name?: string; qty?: number };

/* ----------------------------- Env config ---------------------------- */
const resend = new Resend(process.env.RESEND_API_KEY!);
const fromEmail = process.env.RESEND_FROM ?? "noreply@uniasia.shop";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ADMIN_EMAILS = process.env.ADMIN_EMAILS || ""; // comma-separated list (optional)

/*  Supabase admin client (service role; no session persistence needed)  */
const db = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

/* ----------------------------- Utilities ----------------------------- */
const isEmail = (s?: string | null) => !!s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const uniq = <T,>(arr: T[]) => Array.from(new Set(arr));

function buildHtml(rows: string) {
  return `
    <div style="font-family: system-ui, Arial, sans-serif">
      <h2 style="margin:0 0 12px">Low Stock Alert</h2>
      <p style="margin:0 0 12px">The following items are at low or zero stock:</p>
      <table cellpadding="6" cellspacing="0" style="border-collapse:collapse;min-width:420px">
        <thead>
          <tr>
            <th style="border:1px solid #ddd;text-align:left">SKU</th>
            <th style="border:1px solid #ddd;text-align:left">Product</th>
            <th style="border:1px solid #ddd;text-align:right">Qty</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="color:#888;margin-top:16px">This is an automated email from UniAsia Inventory.</p>
    </div>
  `.trim();
}

function rowsFrom(items: LowStockItem[]) {
  const safe = (Array.isArray(items) ? items : []).filter(
    (x) => x && typeof x === "object"
  ) as LowStockItem[];

  if (!safe.length) {
    return `<tr><td colspan="3" style="border:1px solid #ddd;color:#888">No detail</td></tr>`;
  }

  return safe
    .map((it) => {
      const sku = (it.sku ?? "").toString();
      const name = (it.name ?? "").toString();
      const qty = Number.isFinite(it.qty) ? Number(it.qty!) : 0;
      return `
        <tr>
          <td style="border:1px solid #ddd">${sku}</td>
          <td style="border:1px solid #ddd">${name}</td>
          <td style="border:1px solid #ddd;text-align:right">${qty}</td>
        </tr>
      `;
    })
    .join("");
}

/* ---------------- Collect all admin recipient emails (multi-source) ---------------- */
async function getAdminRecipients(): Promise<string[]> {
  const found: string[] = [];

  /* 1) From ENV static list (optional) */
  if (ADMIN_EMAILS) {
    for (const raw of ADMIN_EMAILS.split(",").map((s) => s.trim())) {
      if (isEmail(raw)) found.push(raw.toLowerCase());
    }
  }

  /* 2) From optional SQL view (public.v_admin_emails) if you created it */
  try {
    const { data, error } = await db.from("v_admin_emails").select("email");
    if (!error && data?.length) {
      for (const r of data) if (isEmail(r.email)) found.push(r.email.toLowerCase());
    }
  } catch {
    /* ignore if view doesn't exist */
  }

  /* 3) From your own public tables, if present */
  try {
    const { data } = await db.from("profiles").select("email, role").eq("role", "admin");
    if (data?.length) {
      for (const r of data) if (isEmail(r.email)) found.push(r.email.toLowerCase());
    }
  } catch { /* ignore */ }

  try {
    const { data } = await db.from("users").select("email, role").eq("role", "admin");
    if (data?.length) {
      for (const r of data) if (isEmail(r.email)) found.push(r.email.toLowerCase());
    }
  } catch { /* ignore */ }

  /* 4) From Auth — ALL confirmed users whose user_metadata.role === "admin" (paginated) */
  try {
    let page = 1;
    const perPage = 1000; // plenty
    // loop until fewer than perPage returned
    // @ts-ignore - types allow page/perPage in supabase-js v2
    for (;;) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const { data, error } = await db.auth.admin.listUsers({ page, perPage });
      if (error) break;

      const users = (data?.users ?? []) as unknown as Array<{
        email?: string | null;
        email_confirmed_at?: string | null;
        user_metadata?: Record<string, any>;
        app_metadata?: Record<string, any>;
      }>;

      for (const u of users) {
        const role =
          (u.user_metadata && u.user_metadata.role) ??
          (u.app_metadata && (u.app_metadata as any).role);
        if (role === "admin" && isEmail(u.email) && !!u.email_confirmed_at) {
          found.push(u.email!.toLowerCase());
        }
      }

      if (!data || (data.users?.length ?? 0) < perPage) break;
      page += 1;
    }
  } catch {
    /* ignore if Auth admin not accessible */
  }

  return uniq(found);
}

/* ------------------------------ Main sender ------------------------------ */
export default async function notifyAdmins(items: LowStockItem[]) {
  const normalized = (Array.isArray(items) ? items : []).filter(
    (x) => x && typeof x === "object"
  ) as LowStockItem[];

  const to = await getAdminRecipients();

  if (!to.length) {
    console.log(
      "[notify] No admin recipients found. Set ADMIN_EMAILS or ensure admins exist (Auth user_metadata.role = 'admin' and email confirmed)."
    );
    return { ok: false as const, sent: 0, reason: "no_recipients" as const };
  }

  const html = buildHtml(rowsFrom(normalized));

  const { error } = await resend.emails.send({
    from: `UniAsia Alerts <${fromEmail}>`,
    to,
    subject: "Low Stock Alert",
    html,
  });

  if (error) {
    return { ok: false as const, sent: 0, reason: error.message ?? ("send_error" as const) };
  }

  console.log("[notify] Email sent to:", to.join(", "));
  return { ok: true as const, sent: to.length };
}

export async function notifyAdminsLowStock(payload: {
  sku: string;
  product_name: string;
  quantity: number;
  threshold: number;
}) {
  // reuse the default sender
  return await notifyAdmins([
    { sku: payload.sku, name: payload.product_name, qty: payload.quantity },
  ]);
}
