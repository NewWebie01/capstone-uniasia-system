import { NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { to, name } = await req.json();
    if (!to) {
      return NextResponse.json({ error: "Missing email" }, { status: 400 });
    }

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

    // Make sure this is EXACTLY your Resend verified domain!
    const data = await resend.emails.send({
      from: "noreply@uniasia.shop", // This must be set up in Resend!
      to,
      subject,
      html,
    });

    // Debug: log the data object from Resend
    if (data.error) throw new Error(JSON.stringify(data.error));
    return NextResponse.json({ success: true });
  } catch (e: any) {
    // Log the full error object
    console.error("[EMAIL ROUTE ERROR]", e, e?.message, e?.response?.data, e?.error);
    return NextResponse.json({ error: e.message || "Email failed", details: e }, { status: 500 });
  }
}
