import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "@/STYLES/globals.css";
import clsx from "clsx";
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
      {" "}
      <body className={clsx(dmSans.className, "antialiased bg-[#dadada]")}>
        {" "}
        {children}{" "}
      </body>{" "}
    </html>
  );
}
