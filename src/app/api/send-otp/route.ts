// app/api/send-otp/route.ts
import { NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY!);

export async function POST(req: Request) {
  const { email, otp } = await req.json();

  if (!email || !otp) {
    return NextResponse.json({ error: "Email and OTP required." }, { status: 400 });
  }

  try {
    const { error } = await resend.emails.send({
     from: "no-reply@uniasia.shop",
      to: email,
      subject: "Your UniAsia OTP Code",
      html: `
        <div style="font-family: sans-serif;">
          <h2>Your UniAsia OTP Code</h2>
          <p>Use this code to complete your login:</p>
          <div style="font-size: 2rem; font-weight: bold; color: #ffba20;">${otp}</div>
          <p style="font-size: 0.95rem;">This code will expire in 5 minutes.</p>
        </div>
      `,
    });
    if (error) return NextResponse.json({ error }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: "Failed to send OTP." }, { status: 500 });
  }
}
