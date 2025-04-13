// components/Cards.tsx
import {
  FaBoxes,
  FaExclamationTriangle,
  FaTruck,
  FaUserFriends,
} from "react-icons/fa";

const Cards = () => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div className="bg-white p-4 rounded-xl shadow-sm flex items-center gap-4">
        <FaBoxes className="text-3xl text-[#001E80]" />
        <div className="font-medium">
          <div>Total Sales</div>
          <div className="text-sm text-gray-500">₱120,000</div>
        </div>
      </div>
      <div className="bg-white p-4 rounded-xl shadow-sm flex items-center gap-4">
        <FaExclamationTriangle className="text-3xl text-red-500" />
        <div className="font-medium">
          <div>Low Stock</div>
          <div className="text-sm text-gray-500">6 items</div>
        </div>
      </div>
      <div className="bg-white p-4 rounded-xl shadow-sm flex items-center gap-4">
        <FaTruck className="text-3xl text-green-600" />
        <div className="font-medium">
          <div>Deliveries</div>
          <div className="text-sm text-gray-500">24 in transit</div>
        </div>
      </div>
      <div className="bg-white p-4 rounded-xl shadow-sm flex items-center gap-4">
        <FaUserFriends className="text-3xl text-[#ffba20]" />
        <div className="font-medium">
          <div>Customers</div>
          <div className="text-sm text-gray-500">1,042 active</div>
        </div>
      </div>
    </div>
  );
};

export default Cards;
