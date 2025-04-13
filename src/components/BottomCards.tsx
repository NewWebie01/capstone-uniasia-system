// components/BottomCards.tsx
import { FaClipboardList, FaHistory } from "react-icons/fa";

const BottomCards = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-white p-4 rounded-xl shadow-sm flex items-start gap-4 min-h-[150px]">
        <FaClipboardList className="text-3xl text-[#001E80] mt-1" />
        <div>
          <h2 className="text-lg font-semibold mb-1">Recent Orders</h2>
          <p className="text-sm text-gray-500">No recent orders.</p>
        </div>
      </div>
      <div className="bg-white p-4 rounded-xl shadow-sm flex items-start gap-4 min-h-[150px]">
        <FaHistory className="text-3xl text-[#ffba20] mt-1" />
        <div>
          <h2 className="text-lg font-semibold mb-1">Activity Log</h2>
          <p className="text-sm text-gray-500">No recent activity.</p>
        </div>
      </div>
    </div>
  );
};

export default BottomCards;
