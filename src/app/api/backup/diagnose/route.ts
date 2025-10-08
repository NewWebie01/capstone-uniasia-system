import { NextResponse } from "next/server";

const H = (t: string) => ({
  Authorization: `Bearer ${t}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
});

export async function GET() {
  const owner = process.env.GITHUB_OWNER!;
  const repo = process.env.GITHUB_REPO!;
  const token = process.env.GITHUB_TOKEN!;
  const wfFile = process.env.GITHUB_WORKFLOW_FILE || "backup.yml";

  const out: any = { owner, repo, wfFile };

  try {
    // 1) Repo lookup (also gives default branch)
    const repoRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}`,
      { headers: H(token), cache: "no-store" }
    );
    out.repoStatus = repoRes.status;
    out.repoText = await repoRes.text();
    if (repoRes.ok) {
      const j = JSON.parse(out.repoText);
      out.default_branch = j.default_branch;
    } else {
      return NextResponse.json(
        { ok: false, where: "repo", ...out },
        { status: 500 }
      );
    }

    // 2) Workflows list (so we can see actual filenames/paths)
    const wfRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows`,
      { headers: H(token), cache: "no-store" }
    );
    out.workflowsStatus = wfRes.status;
    out.workflowsText = await wfRes.text();
    if (!wfRes.ok) {
      return NextResponse.json(
        { ok: false, where: "workflows", ...out },
        { status: 500 }
      );
    }
    const wfJson = JSON.parse(out.workflowsText);
    out.workflowPaths = (wfJson.workflows || []).map((w: any) => w.path);
    out.found = (wfJson.workflows || []).find(
      (w: any) =>
        w?.path?.toLowerCase() ===
          `.github/workflows/${wfFile}`.toLowerCase() ||
        w?.name?.toLowerCase() === wfFile.toLowerCase()
    );
    if (!out.found) {
      return NextResponse.json(
        { ok: false, where: "find-workflow", ...out },
        { status: 500 }
      );
    }

    // 3) Artifacts list (checks Actions read perms)
    const artRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/artifacts?per_page=5`,
      {
        headers: H(token),
        cache: "no-store",
      }
    );
    out.artifactsStatus = artRes.status;
    out.artifactsText = await artRes.text();
    if (!artRes.ok) {
      return NextResponse.json(
        { ok: false, where: "artifacts", ...out },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, ...out }, { status: 200 });
  } catch (e: any) {
    out.error = String(e?.message || e);
    return NextResponse.json({ ok: false, ...out }, { status: 500 });
  }
}
