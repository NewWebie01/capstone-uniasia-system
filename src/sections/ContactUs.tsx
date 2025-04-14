import ArrowRight from "@/assets/arrow-right.svg";
import starImage from "@/assets/star.png";
import springImage from "@/assets/spring.png";
import Image from "next/image";

export const ContactUs = () => {
  return (
    <section
      id="contact-us"
      className="bg-gradient-to-b from-[#ffba20] to-white pt-14 pb-32 overflow-x-clip"
    >
      <div className="max-w-lg mx-auto text-center">
        <h2 className="section-title mt-0">Contact Us</h2>
        <p className="section-description mt-5">We'd love to hear from you!</p>
      </div>

      <div className="mt-8 max-w-lg mx-auto bg-white p-8 rounded-lg shadow-lg">
        <form>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700">
              Your Name
            </label>
            <input
              type="text"
              placeholder="Enter your full name"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700">
              Your Email
            </label>
            <input
              type="email"
              placeholder="your@email.com"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700">
              Your Message
            </label>
            <textarea
              placeholder="Type your message here..."
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              rows={4}
              required
            ></textarea>
          </div>

          <div className="text-center">
            <button
              type="submit"
              className="btn btn-primary hover:text-[#ffba20] transition-colors duration-300"
            >
              Send Message
            </button>
          </div>
        </form>
      </div>
    </section>
  );
};
