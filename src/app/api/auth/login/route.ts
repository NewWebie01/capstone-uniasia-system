import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "@/server/db/mysql";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body.email || "")
      .trim()
      .toLowerCase();
    const password = String(body.password || "");

    if (!email || !password) {
      return NextResponse.json(
        { message: "Email and password are required." },
        { status: 400 },
      );
    }

    const [rows] = await db.query<any[]>(
      "SELECT email, password_hash, role FROM users WHERE email = ? LIMIT 1",
      [email],
    );

    if (!rows?.length) {
      return NextResponse.json(
        { message: "Account not registered or wrong password." },
        { status: 401 },
      );
    }

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return NextResponse.json(
        { message: "Account not registered or wrong password." },
        { status: 401 },
      );
    }

    // log activity
    await db.query(
      "INSERT INTO activity_logs (user_email, user_role, action, details) VALUES (?, ?, ?, ?)",
      [user.email, user.role, "Login", JSON.stringify({})],
    );

    const token = jwt.sign(
      { email: user.email, role: user.role },
      process.env.JWT_SECRET as string,
      { expiresIn: "2d" },
    );

    // store JWT in httpOnly cookie
    const res = NextResponse.json({ email: user.email, role: user.role });
    res.cookies.set("uniasia_token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 2,
    });
    return res;
  } catch (e) {
    console.error(e);
    return NextResponse.json({ message: "Server error." }, { status: 500 });
  }
}
