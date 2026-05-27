import { NextResponse } from "next/server";
import { logActivity } from "@/lib/logActivity";

export async function POST() {
  const owner = process.env.GITHUB_OWNER!;
  const repo = process.env.GITHUB_REPO!;
  const token = process.env.GITHUB_TOKEN!;
  const workflowFile = process.env.GITHUB_WORKFLOW_FILE || "backup.yml"; // default

  if (!owner || !repo || !token) {
    return NextResponse.json(
      { ok: false, error: "Missing GITHUB_* env vars" },
      { status: 500 }
    );
  }

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowFile}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
      body: JSON.stringify({
        // Set this to your default branch name if needed ("master" vs "main")
        ref: "master",
      }),
      cache: "no-store",
    }
  );

  if (!res.ok) {
    const msg = await res.text();
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }

  // log to your activity_logs table
  try {
    await logActivity("Trigger Backup", {
      workflow: workflowFile,
      repo: `${owner}/${repo}`,
    });
  } catch {
    // ignore log failures
  }

  return NextResponse.json({ ok: true });
}
