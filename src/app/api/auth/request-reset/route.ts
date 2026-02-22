// src/app/api/auth/request-reset/route.ts
import { NextResponse } from "next/server";
import crypto from "crypto";
import { Resend } from "resend";
import { db } from "@/lib/mysql";

const resend = new Resend(process.env.RESEND_API_KEY);

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const emailRaw = String(body?.email || "");
    const email = emailRaw.trim().toLowerCase();

    if (!email) {
      return NextResponse.json(
        { message: "Email is required." },
        { status: 400 },
      );
    }

    // ✅ Always return this response even if email doesn't exist
    // (prevents attackers from checking registered emails)
    const okResponse = NextResponse.json({
      ok: true,
      message: "If this email is registered, a reset link was sent.",
    });

    // OPTIONAL: Check if user exists
    const [users] = await db.query<any[]>(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [email],
    );

    // If user doesn't exist, still say OK
    if (!users || users.length === 0) return okResponse;

    // Generate secure token
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = sha256(rawToken);

    // Expire in 30 minutes
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    // Store hashed token in DB
    await db.query(
      "INSERT INTO password_resets (email, token_hash, expires_at) VALUES (?, ?, ?)",
      [email, tokenHash, expiresAt],
    );

    // Build reset link
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";

    const resetLink = `${appUrl}/reset/confirm?token=${encodeURIComponent(
      rawToken,
    )}`;

    const from =
      process.env.RESEND_FROM?.trim() || "UNIASIA <no-reply@yourdomain.com>";

    // Send email
    const { error } = await resend.emails.send({
      from,
      to: email,
      subject: "Reset your UNIASIA password",
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2 style="margin:0 0 12px 0;">Reset Password</h2>
          <p>We received a request to reset your UNIASIA account password.</p>
          <p style="margin: 18px 0;">
            <a href="${resetLink}"
               style="display:inline-block;padding:10px 16px;background:#ffba20;color:#000;text-decoration:none;border-radius:8px;font-weight:700;">
              Reset Password
            </a>
          </p>
          <p>If the button doesn’t work, copy and paste this link:</p>
          <p><a href="${resetLink}">${resetLink}</a></p>
          <hr style="border:none;border-top:1px solid #eee;margin:18px 0;" />
          <p style="color:#666;font-size:12px;">
            This link will expire in 30 minutes. If you didn’t request this, ignore this email.
          </p>
        </div>
      `,
    });

    // If Resend errors, log but still return ok (avoid info leak)
    if (error) {
      console.error("Resend error:", error);
      return okResponse;
    }

    return okResponse;
  } catch (err) {
    console.error("request-reset error:", err);
    return NextResponse.json({ message: "Server error." }, { status: 500 });
  }
}
