// app/dashboard/page.tsx
"use client";

import Cards from "@/components/Cards";
import Graphs from "@/components/Graphs";
import BottomCards from "@/components/BottomCards";

const DashboardPage = () => {
  return (
    <>
      <h1 className="text-3xl font-bold mb-6">Dashboard</h1>
      <Cards />
      <Graphs />
      <div className="mt-6">
        <BottomCards />
      </div>
    </>
  );
};

export default DashboardPage;
