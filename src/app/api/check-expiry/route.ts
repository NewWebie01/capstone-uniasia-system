import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import supabase from "@/config/supabaseClient";

const resend = new Resend(process.env.RESEND_API_KEY);

// Use the service role key to access Supabase Auth Admin API
const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function GET(req: NextRequest) {
  try {
    // 1. Find items expiring within 7 days
    const today = new Date();
    const in7 = new Date();
    in7.setDate(today.getDate() + 7);

    const { data: items, error } = await supabase
      .from("inventory")
      .select("id, product_name, expiration_date")
      .gte("expiration_date", today.toISOString().slice(0, 10))
      .lte("expiration_date", in7.toISOString().slice(0, 10));
    if (error) throw error;
    if (!items?.length)
      return NextResponse.json({ message: "No expiring items." });

    // 2. Fetch all users via Admin API
    const { data: users, error: userErr } =
      await adminSupabase.auth.admin.listUsers();
    if (userErr) throw userErr;

    // 3. Filter for admins (user_metadata.role === "admin")
    const adminEmails = users?.users
      ?.filter((u: any) => u.user_metadata?.role === "admin")
      .map((u: any) => u.email)
      .filter(Boolean);

    if (!adminEmails?.length) throw new Error("No admin emails found!");

    // 4. Send Resend email to all admins
    await resend.emails.send({
      from: "UniAsia <sales@uniasia.shop>",
      to: adminEmails,
      subject: "Expiring Inventory Alert – UniAsia",
      html: `<h2>Expiring Inventory</h2>
             <ul>${items
               .map(
                 (i: any) =>
                   `<li><b>${i.product_name}</b> – expires ${i.expiration_date}</li>`
               )
               .join("")}</ul>
             <p>Please take action on these items.</p>`,
      text: `Expiring inventory:\n${items
        .map((i: any) => `${i.product_name} – expires ${i.expiration_date}`)
        .join("\n")}`,
    });

    return NextResponse.json({ success: true, notified: adminEmails });
  } catch (err: any) {
    console.error("[check-expiry] ERROR:", err);
    return NextResponse.json(
      { error: String(err?.message || err) },
      { status: 500 }
    );
  }
}
