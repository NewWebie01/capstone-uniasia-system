// src/app/auth/callback/page.tsx
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import supabase from "@/config/supabaseClient";

const isNoisyPkceError = (m?: string) =>
  !!m && /(both auth code and code verifier should be non-empty|invalid flow state)/i.test(m ?? "");

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const err = url.searchParams.get("error") || url.searchParams.get("error_description");

      // If user lands here w/o a code (double click / refresh), go to /login silently
      if (err || !code) {
        // optionally show non-noisy errors
        if (err && !isNoisyPkceError(err)) toast.error(decodeURIComponent(err));
        router.replace("/login");
        return;
      }

      const { data, error } = await supabase.auth.exchangeCodeForSession(window.location.href);
      if (error) {
        if (!isNoisyPkceError(error.message)) toast.error(error.message);
        router.replace("/login");
        return;
      }

      // (optional) success toast
      toast.success("Email verified! Welcome.");
      router.replace("/customer");
    })();
  }, [router]);

  return <div className="min-h-screen grid place-items-center p-6">Verifying…</div>;
}
