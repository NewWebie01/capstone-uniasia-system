import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/server/auth/jwt";

export async function GET() {
  const token = cookies().get("uniasia_token")?.value;
  if (!token) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    email: payload.email,
    role: payload.role,
  });
}
