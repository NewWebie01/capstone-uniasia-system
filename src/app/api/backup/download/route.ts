import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const owner = process.env.GITHUB_OWNER!;
  const repo = process.env.GITHUB_REPO!;
  const token = process.env.GITHUB_TOKEN!;
  const id = req.nextUrl.searchParams.get("id");

  if (!id) return new Response("Missing id", { status: 400 });
  if (!owner || !repo || !token) {
    return new Response("Missing GITHUB_* env vars", { status: 500 });
  }

  // GitHub returns a ZIP archive of the artifact; your tar.gz will be inside this ZIP.
  const gh = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/artifacts/${id}/zip`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
      cache: "no-store",
    }
  );

  if (!gh.ok) {
    const msg = await gh.text();
    return new Response(msg, { status: 500 });
  }

  const headers = new Headers();
  headers.set("Content-Disposition", `attachment; filename="backup_${id}.zip"`);
  headers.set("Content-Type", "application/zip");
  return new Response(gh.body, { headers });
}
