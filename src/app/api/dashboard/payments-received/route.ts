import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { db } from "@/server/db/mysql";

function getAuth() {
  const token = cookies().get("uniasia_token")?.value;
  if (!token) return null;

  try {
    return jwt.verify(token, process.env.JWT_SECRET as string) as {
      email: string;
      role: string;
    };
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  try {
    const user = getAuth();
    if (!user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "admin") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("startDate"); // e.g. "2026-02-01"

    if (!startDate) {
      return NextResponse.json(
        { message: "Missing startDate" },
        { status: 400 },
      );
    }

    const [rows] = await db.query<any[]>(
      `
      SELECT received_at, amount
      FROM payments
      WHERE status = 'received'
        AND received_at IS NOT NULL
        AND received_at >= ?
      ORDER BY received_at ASC
      `,
      [startDate],
    );

    return NextResponse.json({ rows });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
