"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ScheduleRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/customer/payments/ledger");
  }, [router]);

  return null;
}
