import { NextResponse } from "next/server";
export async function GET() {
  const raw = process.env.SUPABASE_DB_URL || "";
  const masked = raw.replace(/:\/\/.*?:.*?@/, "://***:***@");
  return NextResponse.json({ db: masked });
}
