// src/app/layout.tsx
import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "@/styles/globals.css";
import clsx from "clsx";
import { Analytics } from "@vercel/analytics/next";

// client-side helpers
import MobileGate from "@/components/MobileGate";
import ToasterClient from "@/components/ToasterClient";

// ✅ add this

const dmSans = DM_Sans({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "UNI-ASIA",
  description: "A website for Uni-Asia",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="relative">
      <body className={clsx(dmSans.className, "antialiased bg-[#dadada]")}>
        <MobileGate />

        {/* ✅ mount globally so it’s on every page */}
        {/* <NotificationBell /> */}

        {children}

        <Analytics />
        <ToasterClient />
      </body>
    </html>
  );
}
