// src/app/customer/layout.tsx
import { DM_Sans } from "next/font/google";
import "@/STYLES/globals.css";
import { Toaster } from "sonner";

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
      className={`${dmSans.className} min-h-screen`}
      style={{
        // Inline radial gradient — guarantees it shows up without Tailwind escaping headaches
        background: "radial-gradient(ellipse 200% 100% at bottom left, #ffba20, #dadada 100%)",
      }}
      /* If you still want the Tailwind arbitrary class, swap the two lines below:
      className={`${dmSans.className} min-h-screen bg-[radial-gradient(ellipse_200%25_100%25_at_bottom_left,_#ffba20,_#dadada_100%25)]`}
      style={{}} 
      */
    >
      {/* Toast container */}
      <Toaster richColors position="top-center" />

      {/* Sticky Header */}
      <header className="sticky top-0 z-30 backdrop-blur-sm w-full h-12">
        <div className="flex justify-center items-center py-3 bg-[#181918] text-white text-sm gap-3">
          <p>UNIASIA - Reliable Hardware Supplier in the Philippines</p>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-6">{children}</main>
    </div>
  );
}
