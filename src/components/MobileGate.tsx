"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

export default function MobileGate() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const evaluate = () => setIsMobile(window.innerWidth < 1024); // < lg
    evaluate();
    window.addEventListener("resize", evaluate);
    window.addEventListener("orientationchange", evaluate);
    return () => {
      window.removeEventListener("resize", evaluate);
      window.removeEventListener("orientationchange", evaluate);
    };
  }, []);

  useEffect(() => {
    if (!isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // lock scroll
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isMobile]);

  if (!isMobile) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        <div className="px-6 py-5 flex items-start gap-3 border-b">
          <div className="shrink-0 mt-0.5">
            <AlertTriangle className="text-yellow-500" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Desktop Only
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Our website is optimized for{" "}
              <span className="font-semibold">desktop or laptop</span> screens.
              Please switch to a larger device (≥ 1024px width) to continue.
            </p>
          </div>
        </div>
        <div className="px-6 py-4">
          <ul className="text-sm text-gray-700 list-disc pl-5 space-y-1">
            <li>Use a desktop browser (Chrome, Edge, Firefox, Safari).</li>
            <li>Or rotate your tablet and ensure width ≥ 1024px.</li>
          </ul>
        </div>
        <div className="px-6 py-4 bg-gray-50 border-t text-xs text-gray-500">
          Need help? Contact UNIASIA support.
        </div>
      </div>
    </div>
  );
}
