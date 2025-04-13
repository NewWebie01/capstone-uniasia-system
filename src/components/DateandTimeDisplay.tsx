"use client";
import { useEffect, useState } from "react";

const DateTimeDisplay = () => {
  const [currentDateTime, setCurrentDateTime] = useState<string>("");

  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();
      setCurrentDateTime(now.toLocaleString()); // You can customize the format if needed
    };

    updateDateTime(); // Initial call to set the time

    const interval = setInterval(updateDateTime, 1000); // Update every second

    // Clean up interval on component unmount
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-gradient-to-b from-black to-[#001E80] text-transparent bg-clip-text text-2xl font-bold">
      <p>{currentDateTime}</p>
    </div>
  );
};

export default DateTimeDisplay;
