import { NextResponse } from "next/server";
export const runtime = "nodejs";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM || "UniAsia <noreply@uniasia.shop>";

function renderHTML(name?: string) {
  return `
  <div style="font-family:Inter,Arial,sans-serif;max-width:640px;margin:0 auto;border:1px solid #eee;border-radius:10px">
    <div style="background:#111827;color:#fff;padding:16px 20px;font-weight:700">Welcome to UniAsia</div>
    <div style="padding:20px">
      <h2 style="margin:0 0 8px">Hi ${name || "there"} 👋</h2>
      <p style="color:#374151">Your customer account has been created successfully.</p>
      <p style="color:#374151">You can now browse inventory, place orders, and track deliveries.</p>
      <a href="https://uniasia.shop/customer" style="display:inline-block;margin-top:14px;padding:10px 14px;background:#ffba20;color:#111827;border-radius:8px;text-decoration:none;font-weight:700">Open Customer Portal</a>
    </div>
    <div style="background:#f9fafb;color:#6b7280;font-size:12px;padding:12px 20px">This is an automated message from UniAsia.</div>
  </div>
  `;
}

export async function POST(req: Request) {
  try {
    const { email, name } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Missing email" }, { status: 400 });
    }

    const html = renderHTML(name);

    // Prefer Resend if available
    if (RESEND_API_KEY) {
      const { Resend } = await import("resend");
      const resend = new Resend(RESEND_API_KEY);
      await resend.emails.send({
        from: EMAIL_FROM,
        to: [email],
        subject: "Welcome to UniAsia",
        html,
      });
      return NextResponse.json({ ok: true, via: "resend" });
    }

    // Fallback: Gmail (Nodemailer)
    if (EMAIL_USER && EMAIL_PASS) {
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: EMAIL_USER, pass: EMAIL_PASS },
      });
      await transporter.sendMail({
        from: EMAIL_FROM,
        to: email,
        subject: "Welcome to UniAsia",
        html,
      });
      return NextResponse.json({ ok: true, via: "gmail" });
    }

    return NextResponse.json(
      { error: "No email provider configured" },
      { status: 500 }
    );
  } catch (e: any) {
    console.error("send-welcome error:", e);
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
