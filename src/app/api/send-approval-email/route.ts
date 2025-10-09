// app/api/send-approval-email/route.ts
import { NextResponse } from "next/server";
import { Resend } from "resend";

// Only allow from your actual Resend verified domain (protect from spoofing!)
const FROM_EMAIL = "noreply@uniasia.shop"; // This must be verified in Resend!

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { to, name } = await req.json();
    if (!to) {
      return NextResponse.json({ error: "Missing recipient email." }, { status: 400 });
    }

    // Allow only UNIASIA or trusted domain emails as "to", if you want:
    // if (!to.endsWith("@uniasia.com") && !to.endsWith("@gmail.com") && ...) { ... }

    const subject = "Your UNIASIA Account Has Been Approved!";
    const html = `
      <div style="font-family:Arial,sans-serif;">
        <h2>Welcome to UNIASIA!</h2>
        <p>Hi <b>${name ? String(name).replace(/[<>"']/g, "") : "Customer"}</b>,</p>
        <p>Your account has been <b>approved</b> by the admin. You can now log in and use the system.</p>
        <br />
        <p>If you did not request this, you may ignore this email.</p>
        <br />
        <small>Thank you,<br/>UNIASIA Team</small>
      </div>
    `;

    // Use await and check for error
    const data = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    });

    if (data.error) {
      // Log all error details
      console.error("[Resend ERROR]", data.error);
      return NextResponse.json({ error: "Failed to send email.", details: data.error }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    // Log the error for debugging (won't leak to user)
    console.error("[EMAIL ROUTE ERROR]", e);
    return NextResponse.json({ error: e.message || "Email failed", details: e }, { status: 500 });
  }
}
