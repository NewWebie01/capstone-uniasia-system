import { NextResponse } from "next/server";

export async function GET() {
  const owner = process.env.GITHUB_OWNER!;
  const repo = process.env.GITHUB_REPO!;
  const token = process.env.GITHUB_TOKEN!;

  if (!owner || !repo || !token) {
    return NextResponse.json(
      { ok: false, error: "Missing GITHUB_* env vars" },
      { status: 500 }
    );
  }

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/artifacts?per_page=20`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
      cache: "no-store",
    }
  );

  if (!res.ok) {
    const msg = await res.text();
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }

  const data = await res.json();
  const items = (data?.artifacts || []).map((a: any) => ({
    id: a.id,
    name: a.name,
    size_in_bytes: a.size_in_bytes,
    expired: a.expired,
    created_at: a.created_at,
    updated_at: a.updated_at,
  }));

  return NextResponse.json({ ok: true, items });
}
