// src/app/customer/layout.tsx
import { DM_Sans } from "next/font/google";
import "@/STYLES/globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-dm-sans",
});

export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={`min-h-screen bg-[radial-gradient(ellipse_200%_100%_at_bottom_left,#ffba20,#dadada_100%)] ${dmSans.className}`}
    >
      {/* Sticky Header */}
      <header className="sticky top-0 z-30 backdrop-blur-sm w-full h-12">
        <div className="flex justify-center items-center py-3 bg-[#181918] text-white text-sm gap-3">
          <p>UNIASIA - Reliable Hardware Supplier in the Philippines</p>
        </div>
      </header>

      {/* Layout */}
      <main className="p-6">{children}</main>
    </div>
  );
}
