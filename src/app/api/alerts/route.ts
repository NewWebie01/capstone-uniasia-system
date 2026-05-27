// app/api/alerts/expiry/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

/**
 * POST /api/alerts/expiry
 * Finds inventory items with expiration_date within next 30 days (inclusive),
 * emails all admins (profiles.role = 'admin') via Resend if configured,
 * and returns a summary payload.
 */
export async function POST() {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // 1) Load expiring items (next 30 days, inclusive)
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    end.setHours(23, 59, 59, 999);

    const { data: items, error: invErr } = await supabase
      .from("inventory")
      .select("id, product_name, category, subcategory, quantity, expiration_date")
      .not("expiration_date", "is", null)
      .gte("expiration_date", start.toISOString())
      .lte("expiration_date", end.toISOString())
      .order("expiration_date", { ascending: true });

    if (invErr) {
      console.error("[expiry] inventory error:", invErr);
      return NextResponse.json({ ok: false, error: invErr.message }, { status: 500 });
    }

    const count = (items ?? []).length;

    // 2) Get admin recipients
    const { data: admins, error: profErr } = await supabase
      .from("profiles")
      .select("email, name, role")
      .eq("role", "admin");

    if (profErr) {
      console.error("[expiry] profiles error:", profErr);
      return NextResponse.json({ ok: false, error: profErr.message }, { status: 500 });
    }

    const toEmails = (admins ?? [])
      .map((a) => (typeof a?.email === "string" ? a.email.trim() : ""))
      .filter(Boolean);

    // 3) If Resend is configured, send the email (optional)
    let sent = false;
    if (process.env.RESEND_API_KEY && toEmails.length > 0 && count > 0) {
      try {
        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);

        const from = process.env.MAIL_FROM || "UniAsia <no-reply@uniasia.local>";
        const subject = `Expiring Items (Next 30 Days): ${count} item${count === 1 ? "" : "s"}`;

        const lines =
          (items ?? []).map((i) => {
            const exp = i.expiration_date
              ? new Date(i.expiration_date).toLocaleDateString("en-PH", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "—";
            const cat = [i.category, i.subcategory].filter(Boolean).join(" / ");
            return `• ${i.product_name}${cat ? ` (${cat})` : ""} — qty ${i.quantity ?? 0} — exp ${exp}`;
          }) || [];

        const textBody =
          count === 0
            ? "No items expiring in the next 30 days."
            : `The following ${count} item${count === 1 ? "" : "s"} are expiring within 30 days:\n\n${lines.join(
                "\n"
              )}\n\n— UniAsia System`;

        const htmlBody =
          count === 0
            ? `<p>No items expiring in the next 30 days.</p>`
            : `<p>The following <b>${count}</b> item${
                count === 1 ? "" : "s"
              } are expiring within 30 days:</p>
               <ul>${lines.map((l) => `<li>${l.replace(/^•\s*/, "")}</li>`).join("")}</ul>
               <p>— UniAsia System</p>`;

        await resend.emails.send({
          from,
          to: toEmails,
          subject,
          text: textBody,
          html: htmlBody,
        });

        sent = true;
      } catch (e: any) {
        // Don’t hard-fail if email fails — still return the data
        console.error("[expiry] email send failed:", e?.message || e);
      }
    }

    return NextResponse.json({
      ok: true,
      count,
      admins: toEmails.length,
      emailed: sent,
    });
  } catch (e: any) {
    console.error("[expiry] fatal:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Unexpected server error" }, { status: 500 });
  }
}
