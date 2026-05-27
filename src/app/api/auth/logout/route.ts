import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { db } from "@/server/db/mysql";

export async function POST(req: Request) {
  const token = req.headers.get("cookie")?.match(/uniasia_token=([^;]+)/)?.[1];

  let payload: any = null;
  try {
    if (token) payload = jwt.verify(token, process.env.JWT_SECRET as string);
  } catch {}

  if (payload?.email) {
    await db.query(
      "INSERT INTO activity_logs (user_email, user_role, action, details) VALUES (?, ?, ?, ?)",
      [payload.email, payload.role || "unknown", "Logout", JSON.stringify({})],
    );
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("uniasia_token", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
