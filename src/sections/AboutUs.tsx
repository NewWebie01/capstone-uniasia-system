import productImage from "@/assets/product-image-uniasia.png";
import pyramidImage from "@/assets/box-parcel.png";
import tubeImage from "@/assets/forklift.png";
import Image from "next/image";

export const AboutUs = () => {
  return (
    <section
      id="about-us" // Added ID for smooth scrolling
      className="bg-gradient-to-b from-[#FFFFFF] to-[#ffba20] py-24 overflow-x-clip"
    >
      <div className="container">
        <div className="section-heading">
          <div className="flex justify-center">
            <div className="tag">About Us</div>
          </div>
          <h2 className="section-title mt-5">What is UNIASIA?</h2>
          <p className="section-description mt-5">
            UniAsia Hardware and Electrical Products is a reliable wholesale
            supplier of construction, electrical, and hardware materials. We
            combine industry expertise with efficient service to meet growing
            demand and ensure customer satisfaction.
          </p>
        </div>
        <div className="relative">
          <Image src={productImage} alt="Product Image" className="mt-16" />
          {/* <Image
            src={pyramidImage}
            alt="Pyramid Image"
            height={262}
            width={262}
            className="hidden md:block absolute -right-36 -top-32"
          />
          <Image
            src={tubeImage}
            alt="Tube Image"
            height={248}
            className="hidden md:block absolute bottom-0 -left-36"
          /> */}
        </div>
      </div>
    </section>
  );
};
