"use client";

import Image from "next/image";
import { motion } from "framer-motion";

/* --- Brand logos (renamed to match actual filenames) --- */
import hitachiLogo from "@/assets/logo-hitachi.png";
import weberLogo from "@/assets/logo-weber.png";
import ingcoLogo from "@/assets/logo-ingco.png";
import bristolLogo from "@/assets/logo-bristol.png";
import boschLogo from "@/assets/logo-bosch.png";
import makitaLogo from "@/assets/logo-makita.png";

/* --- List once, we'll duplicate for the seamless loop --- */
const logos = [
  { src: hitachiLogo, alt: "Hitachi Logo" },
  { src: weberLogo, alt: "Weber Logo" },
  { src: ingcoLogo, alt: "INGCO Logo" },
  { src: bristolLogo, alt: "Bristol Logo" },
  { src: boschLogo, alt: "Bosch Logo" },
  { src: makitaLogo, alt: "Makita Logo" },
];

export const LogoTicker = () => {
  return (
    <div className="py-8 md:py-12 bg-white">
      <div className="container">
        {/* Mask fades edges left/right; overflow hidden keeps a clean ticker */}
        <div className="flex overflow-hidden [mask-image:linear-gradient(to_right,transparent,black,transparent)]">
          {/* Animate the row to the left forever for a smooth marquee effect */}
          <motion.div
            className="flex gap-14 flex-none pr-14"
            animate={{ translateX: "-50%" }}
            transition={{
              duration: 30,
              repeat: Infinity,
              ease: "linear",
              repeatType: "loop",
            }}
          >
            {/* Duplicate the sequence so it loops seamlessly */}
            {[...logos, ...logos].map((logo, i) => (
              <Image
                key={i}
                src={logo.src}
                alt={logo.alt}
                className="logo-ticker-image"
                /* Optional: set width/height if you want strict sizing
                   width={140} height={50}
                */
                priority={i < 6} // small perf boost for first set
              />
            ))}
          </motion.div>
        </div>
      </div>
    </div>
  );
};
