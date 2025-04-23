// components/Cards.tsx
import {
  FaBoxes,
  FaExclamationTriangle,
  FaTruck,
  FaUserFriends,
} from "react-icons/fa";

const Cards = () => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div className="bg-white p-4 rounded-xl shadow-sm flex items-center gap-4 overflow-hidden">
        <FaBoxes className="text-3xl text-[#001E80]" />
        <div className="font-medium text-sm sm:text-base">
          <div className="truncate">Total Sales</div>
          <div className="text-xs sm:text-sm text-gray-500 truncate">
            ₱120,000
          </div>
        </div>
      </div>
      <div className="bg-white p-4 rounded-xl shadow-sm flex items-center gap-4 overflow-hidden">
        <FaExclamationTriangle className="text-3xl text-red-500" />
        <div className="font-medium text-sm sm:text-base">
          <div className="truncate">Low Stock</div>
          <div className="text-xs sm:text-sm text-gray-500 truncate">
            6 items
          </div>
        </div>
      </div>
      <div className="bg-white p-4 rounded-xl shadow-sm flex items-center gap-4 overflow-hidden">
        <FaTruck className="text-3xl text-green-600" />
        <div className="font-medium text-sm sm:text-base">
          <div className="truncate">Deliveries</div>
          <div className="text-xs sm:text-sm text-gray-500 truncate">
            24 in transit
          </div>
        </div>
      </div>
      <div className="bg-white p-4 rounded-xl shadow-sm flex items-center gap-4 overflow-hidden">
        <FaUserFriends className="text-3xl text-[#ffba20]" />
        <div className="font-medium text-sm sm:text-base">
          <div className="truncate">Customers</div>
          <div className="text-xs sm:text-sm text-gray-500 truncate">
            1,042 active
          </div>
        </div>
      </div>
    </div>
  );
};

export default Cards;
