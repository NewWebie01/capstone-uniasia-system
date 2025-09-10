import { NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { to, name } = await req.json();
    if (!to) {
      return NextResponse.json({ error: "Missing email" }, { status: 400 });
    }

    // Compose the email content
    const subject = "Your UNIASIA Account Has Been Approved!";
    const html = `
      <div style="font-family:Arial,sans-serif;">
        <h2>Welcome to UNIASIA!</h2>
        <p>Hi <b>${name || "Customer"}</b>,</p>
        <p>Your account has been <b>approved</b> by the admin. You can now log in and use the system.</p>
        <br />
        <p>If you did not request this, you may ignore this email.</p>
        <br />
        <small>Thank you,<br/>UNIASIA Team</small>
      </div>
    `;

    // Send the email using Resend onboarding sender
    const data = await resend.emails.send({
      from: "UNIASIA <onboarding@resend.dev>",
      to,
      subject,
      html,
    });

    console.log("Resend email result:", data); // Debug

    if (data.error) throw new Error(data.error.message || "Unknown send error");
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("[EMAIL ROUTE ERROR]", e);
    return NextResponse.json({ error: e.message || "Email failed" }, { status: 500 });
  }
}
