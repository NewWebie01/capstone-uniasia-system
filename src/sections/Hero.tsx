"use client";
// import ArrowIcon from "@/assets/arrow-right.svg";
import cogImage from "@/assets/hardware-tools.png"; // Importing cog image for hero section
// import cylinderImage from "@/assets/cylinder.png"; // Commented out cylinder image
import noodleImage from "@/assets/DRILL_BIT.png"; // Importing noodle image for hero section
import Image from "next/image"; // Importing Next.js Image component
import { motion } from "framer-motion"; // Importing motion for animation

export const Hero = () => {
  return (
    <section
      id="hero" // Ensure the Hero section has this ID for targeting
      className="pt-8 pb-20 md:pt-5 md:pb-10 bg-[radial-gradient(ellipse_200%_100%_at_bottom_left,#ffba20,#dadada_100%)] overflow-x-clip"
    >
      <div className="container">
        <div className="md:flex items-center">
          <div className="md:w-[478px]">
            {/* <div className="tag">Version 2.0 is here</div> */}{" "}
            {/* Commented out version tag */}
            <h1 className="text-5xl md:text-7xl font-bold tracking-tighter bg-gradient-to-b from-black to-[#001E80] text-transparent bg-clip-text mt-6">
              UNIASIA
            </h1>
            <p className="text-xl text-[#010D3E] tracking-tight mt-6">
              Delivering high-quality construction and industrial materials
              nationwide with reliability, competitive pricing, and a strong
              supply network.
            </p>
            <div className="flex gap-1 items-center mt-[30px]">
              {/* <button className="btn btn-primary hover:text-[#ffba20] transition-colors duration-300">
                Learn more
              </button> */}
              {/* <button className="btn btn-text gap-1">
                <span>Learn more</span>
                <ArrowIcon className="h-5 w-5" />
              </button> */}
            </div>
          </div>
          <div className="mt-0 md:mt-0 -left-50 md:h-[650px] md:flex-1 relative">
            <motion.img
              src={cogImage.src} // Moving cog image in the hero section
              alt="Cog img"
              className="md:absolute md:h-full md:w-auto md:max-w-none md:-left-5 lg:left-5"
              animate={{
                rotate: 360, // Rotates 360 degrees
              }}
              transition={{
                repeat: Infinity, // Infinite rotation
                duration: 100, // 10 seconds per rotation
                ease: "linear", // Smooth constant speed
              }}
            />
            {/* <Image
              src={cylinderImage}
              width={220}
              height={220}
              alt="Cylinder image"
              className="hidden md:block -top-8 -left-32 md:absolute"
            /> */}
            {/* <Image
              src={noodleImage}
              width={220}
              alt="Noodle image"
              className="hidden lg:block absolute top-[550px] left-[500px] rotate-[20deg]"
            /> */}
          </div>
        </div>
      </div>
    </section>
  );
};
