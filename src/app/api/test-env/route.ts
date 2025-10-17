import { NextResponse } from "next/server";

export const runtime = "nodejs"; // ensure server runtime on Vercel

export async function GET() {
  const envs = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "RESEND_API_KEY",
  ];

  const report = envs.map((key) => ({
    key,
    present: Boolean(process.env[key]),
    length: process.env[key]?.length || 0,
  }));

  return NextResponse.json({
    ok: true,
    runtime: "nodejs",
    domain: process.env.VERCEL_URL || "local",
    vars: report,
    note:
      "Only 'present' and 'length' are shown for safety. If any is false or 0, check Vercel envs.",
  });
}
