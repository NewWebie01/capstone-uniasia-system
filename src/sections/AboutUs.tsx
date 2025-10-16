"use client";
import { useState, useEffect } from "react";
import toolboxImage from "@/assets/toolbox.jpg";
import warehouseImage from "@/assets/warehouse.jpg";
import wrenchImage from "@/assets/wrench.jpg";
import screwsImage from "@/assets/screws.jpg";
import powertoolsImage from "@/assets/powertools.jpg";
import Image from "next/image";

const images = [
  toolboxImage,
  warehouseImage,
  wrenchImage,
  screwsImage,
  powertoolsImage,
];

export const AboutUs = () => {
  const [current, setCurrent] = useState(0);

  // Auto-slide every 4s
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrent((c) => (c + 1) % images.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section
      id="about-us"
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
        <div className="relative mt-16 aspect-[4/3] max-w-3xl mx-auto rounded-2xl overflow-hidden shadow-xl">
          {images.map((img, idx) => (
            <Image
              key={img.src}
              src={img}
              alt={`UniAsia Slideshow ${idx + 1}`}
              fill
              className={`
                object-cover transition-opacity duration-1000
                ${idx === current ? "opacity-100" : "opacity-0"}
              `}
              priority={idx === 0}
              draggable={false}
            />
          ))}
          {/* Dots */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10">
            {images.map((_, i) => (
              <button
                key={i}
                className={`w-3 h-3 rounded-full ${
                  current === i
                    ? "bg-[#ffba20]"
                    : "bg-white/60 border border-gray-300"
                }`}
                onClick={() => setCurrent(i)}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
