// app/api/send-otp/route.ts
import { NextResponse } from "next/server";
import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const fromAddress = process.env.RESEND_FROM;

const resend = new Resend(apiKey || "");

export async function POST(req: Request) {
  try {
    // 1. Validate env vars
    if (!apiKey || !fromAddress) {
      console.error("Missing RESEND_API_KEY or RESEND_FROM");
      return NextResponse.json(
        { error: "Server is missing RESEND_API_KEY or RESEND_FROM env vars." },
        { status: 500 }
      );
    }

    // 2. Get body
    const { email, otp } = await req.json();

    if (!email || !otp) {
      return NextResponse.json(
        { error: "Email and OTP required." },
        { status: 400 }
      );
    }

    // 3. Send email via Resend
    const { data, error } = await resend.emails.send({
      from: `UniAsia Hardware <${fromAddress}>`,
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

    if (error) {
      console.error("Resend error:", error);
      return NextResponse.json(
        { error: (error as any).message ?? "Resend failed" },
        { status: 500 }
      );
    }

    console.log("OTP email sent:", data?.id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Send-OTP route error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Failed to send OTP." },
      { status: 500 }
    );
  }
}
