import { NextRequest, NextResponse } from "next/server";

const GH = (t: string) => ({
  Authorization: `Bearer ${t}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
});

export async function POST(req: NextRequest) {
  const owner = process.env.GITHUB_OWNER!;
  const repo = process.env.GITHUB_REPO!;
  const token = process.env.GITHUB_TOKEN!;
  if (!owner || !repo || !token) {
    return NextResponse.json(
      { ok: false, error: "Missing GITHUB_* envs" },
      { status: 500 }
    );
  }

  const { artifactId, target = "staging" } = await req.json();
  if (!artifactId) {
    return NextResponse.json(
      { ok: false, error: "artifactId is required" },
      { status: 400 }
    );
  }

  // 1) get default branch
  const rRepo = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: GH(token),
    cache: "no-store",
  });
  if (!rRepo.ok)
    return NextResponse.json(
      {
        ok: false,
        where: "repo",
        status: rRepo.status,
        error: await rRepo.text(),
      },
      { status: 500 }
    );
  const ref = (await rRepo.json()).default_branch || "main";

  // 2) find restore workflow id
  const rWf = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows`,
    { headers: GH(token), cache: "no-store" }
  );
  if (!rWf.ok)
    return NextResponse.json(
      {
        ok: false,
        where: "workflows",
        status: rWf.status,
        error: await rWf.text(),
      },
      { status: 500 }
    );
  const wf = (await rWf.json()).workflows?.find((w: any) =>
    w?.path?.toLowerCase().endsWith("/restore.yml")
  );
  if (!wf)
    return NextResponse.json(
      { ok: false, error: "restore.yml workflow not found" },
      { status: 500 }
    );

  // 3) dispatch with inputs
  const rDispatch = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${wf.id}/dispatches`,
    {
      method: "POST",
      headers: GH(token),
      body: JSON.stringify({
        ref,
        inputs: { artifact_id: String(artifactId), target },
      }),
    }
  );
  if (!rDispatch.ok) {
    return NextResponse.json(
      {
        ok: false,
        where: "dispatch",
        status: rDispatch.status,
        error: await rDispatch.text(),
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
