import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Admin client (service role) */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function handle() {
  try {
    // 1) Expiring in next 30 days (inclusive)
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end   = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    end.setHours(23, 59, 59, 999);

    const { data: items, error: invErr } = await supabase
      .from("inventory")
      .select("id, product_name, category, subcategory, quantity, expiration_date")
      .not("expiration_date", "is", null)
      .gte("expiration_date", start.toISOString())
      .lte("expiration_date", end.toISOString())
      .order("expiration_date", { ascending: true });

    if (invErr) throw invErr;
    const count = (items ?? []).length;

    // 2) Collect admin recipients
    const { data: admins, error: profErr } = await supabase
      .from("profiles")
      .select("email, role")
      .eq("role", "admin");
    if (profErr) throw profErr;

    const to = (admins ?? [])
      .map((a) => (typeof a?.email === "string" ? a.email.trim() : ""))
      .filter(Boolean);

    // 3) Send via Resend if configured
    let emailed = false;
    if (process.env.RESEND_API_KEY && to.length > 0 && count > 0) {
      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);
      const from = process.env.RESEND_FROM ?? "UniAsia <no-reply@uniasia.local>";
      const subject = `Expiring Items (Next 30 Days): ${count}`;

      const lines = (items ?? []).map((i) => {
        const exp = i.expiration_date
          ? new Date(i.expiration_date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })
          : "—";
        const cat = [i.category, i.subcategory].filter(Boolean).join(" / ");
        return `• ${i.product_name}${cat ? ` (${cat})` : ""} — qty ${i.quantity ?? 0} — exp ${exp}`;
      });

      const text =
        `The following ${count} item${count === 1 ? "" : "s"} are expiring within 30 days:\n\n` +
        lines.join("\n") + `\n\n— UniAsia System`;

      const html =
        `<p>The following <b>${count}</b> item${count === 1 ? "" : "s"} are expiring within 30 days:</p>` +
        `<ul>${lines.map((l) => `<li>${l.replace(/^•\s*/, "")}</li>`).join("")}</ul>` +
        `<p>— UniAsia System</p>`;

      await resend.emails.send({ from, to, subject, text, html });
      emailed = true;
    }

    return NextResponse.json({ ok: true, count, admins: to.length, emailed });
  } catch (e: any) {
    console.error("[expiry] error:", e?.message || e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Unexpected server error" }, { status: 500 });
  }
}

export async function POST() { return handle(); }
// Allow Vercel cron via GET
export async function GET()  { return handle(); }
