// src/app/api/auth/reset-password/route.ts
import { NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/mysql";

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token || "").trim();
    const password = String(body?.password || "");

    if (!token || !password) {
      return NextResponse.json(
        { message: "Token and password are required." },
        { status: 400 },
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { message: "Password must be at least 8 characters." },
        { status: 400 },
      );
    }

    const tokenHash = sha256(token);

    const [rows] = await db.query<any[]>(
      `
      SELECT id, email, expires_at, used_at
      FROM password_resets
      WHERE token_hash = ?
      ORDER BY id DESC
      LIMIT 1
      `,
      [tokenHash],
    );

    if (!rows?.length) {
      return NextResponse.json(
        { message: "Invalid or expired link." },
        { status: 400 },
      );
    }

    const pr = rows[0];

    if (pr.used_at) {
      return NextResponse.json(
        { message: "This reset link was already used." },
        { status: 400 },
      );
    }

    const expiresAt = new Date(pr.expires_at);
    if (expiresAt.getTime() < Date.now()) {
      return NextResponse.json(
        { message: "Reset link expired." },
        { status: 400 },
      );
    }

    // ✅ Hash new password
    const passwordHash = await bcrypt.hash(password, 10);

    // ✅ IMPORTANT:
    // Change `password_hash` to the real column name in your `users` table
    // Common names: password_hash, password, passwordHash
    await db.query("UPDATE users SET password_hash = ? WHERE email = ?", [
      passwordHash,
      pr.email,
    ]);

    // ✅ Mark token as used
    await db.query("UPDATE password_resets SET used_at = NOW() WHERE id = ?", [
      pr.id,
    ]);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("reset-password error:", err);
    return NextResponse.json({ message: "Server error." }, { status: 500 });
  }
}
