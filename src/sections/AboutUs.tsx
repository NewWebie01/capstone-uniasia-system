"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";

/* ----------------------------- Images ----------------------------- */
import toolboxImage from "@/assets/toolbox.jpg";
import warehouseImage from "@/assets/warehouse.jpg";
import wrenchImage from "@/assets/wrench.jpg";
import screwsImage from "@/assets/screws.jpg";
import powertoolsImage from "@/assets/powertools.jpg";

/* Define slides with optional captions (edit freely) */
const slides = [
  { src: toolboxImage, alt: "Toolbox", caption: "Built for builders." },
  { src: warehouseImage, alt: "Warehouse", caption: "Stocked. Ready. Reliable." },
  { src: wrenchImage, alt: "Wrench", caption: "Precision in your hands." },
  { src: screwsImage, alt: "Screws", caption: "Every small part matters." },
  { src: powertoolsImage, alt: "Power Tools", caption: "Power through the job." },
] as const;

const AUTOPLAY_MS = 4000;

export const AboutUs = () => {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const dragStartXRef = useRef<number | null>(null);

  const go = useCallback(
    (dir: 1 | -1) => {
      setCurrent((c) => {
        const next = (c + dir + slides.length) % slides.length;
        return next;
      });
    },
    []
  );

  const goTo = (i: number) => setCurrent(i);

  /* ------------------------- Autoplay + Progress ------------------------- */
  const startTimer = useCallback(() => {
    stopTimer();
    timerRef.current = setInterval(() => {
      if (!paused) go(1);
    }, AUTOPLAY_MS);
  }, [go, paused]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  // Restart autoplay when current changes (for progress bar sync)
  useEffect(() => {
    startTimer();
    return stopTimer;
  }, [current, startTimer, stopTimer]);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  /* --------------------------- Drag / Swipe UX --------------------------- */
  const onPointerDown = (e: React.PointerEvent) => {
    dragStartXRef.current = e.clientX;
    setPaused(true);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const start = dragStartXRef.current;
    setPaused(false);
    dragStartXRef.current = null;
    if (start == null) return;
    const dx = e.clientX - start;
    const threshold = 40; // px
    if (dx > threshold) go(-1);
    if (dx < -threshold) go(1);
  };

  /* ------------------------------ Variants ------------------------------ */
  // Fade + slight slide
  const slideVariants = {
    enter: { opacity: 0, scale: 1.02, x: 20 },
    center: { opacity: 1, scale: 1, x: 0 },
    exit: { opacity: 0, scale: 0.98, x: -20 },
  };

  return (
    <section
      id="about-us"
      className="bg-gradient-to-b from-[#FFFFFF] to-[#ffba20] py-24 overflow-x-clip"
    >
      <div className="container">
        {/* Header */}
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

        {/* Carousel */}
        <div
          className="relative mt-16 aspect-[4/3] max-w-3xl mx-auto rounded-2xl overflow-hidden shadow-2xl select-none"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            dragStartXRef.current = null;
            setPaused(false);
          }}
          onPointerLeave={() => {
            dragStartXRef.current = null;
          }}
        >
          {/* Slides */}
          <AnimatePresence mode="wait">
            <motion.div
              key={current}
              className="absolute inset-0"
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.6, ease: "easeOut" }}
            >
              {/* Ken Burns container (slow zoom) */}
              <motion.div
                className="absolute inset-0"
                // subtle zoom & pan per slide for modern feel
                initial={{ scale: 1.05 }}
                animate={{ scale: paused ? 1.05 : 1.1, x: 0, y: 0 }}
                transition={{ duration: paused ? 0.6 : AUTOPLAY_MS / 1000, ease: "linear" }}
              >
                <Image
                  src={slides[current].src}
                  alt={slides[current].alt}
                  fill
                  className="object-cover"
                  priority
                  draggable={false}
                />
                {/* Gradient overlay for text readability */}
                <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/50 to-transparent" />
              </motion.div>

              {/* Caption */}
              <div className="absolute bottom-5 left-5 right-5 text-white">
                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur px-4 py-2 ring-1 ring-white/20">
                  <span className="text-xs">Slide {current + 1}/{slides.length}</span>
                </div>
                {slides[current].caption && (
                  <h3 className="mt-3 text-xl md:text-2xl font-semibold drop-shadow">
                    {slides[current].caption}
                  </h3>
                )}
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Progress bar (autoplay indicator) */}
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/30">
            <motion.div
              ref={progressRef}
              key={current + String(paused)} // reset when slide changes or pause toggles
              className="h-full bg-white"
              initial={{ width: "0%" }}
              animate={{ width: paused ? "0%" : "100%" }}
              transition={{ duration: paused ? 0 : AUTOPLAY_MS / 1000, ease: "linear" }}
            />
          </div>

          {/* Arrows */}
          <button
            aria-label="Previous slide"
            onClick={() => go(-1)}
            className="absolute left-3 top-1/2 -translate-y-1/2 grid place-items-center w-10 h-10 rounded-full bg-white/70 hover:bg-white shadow ring-1 ring-black/5"
          >
            ←
          </button>
          <button
            aria-label="Next slide"
            onClick={() => go(1)}
            className="absolute right-3 top-1/2 -translate-y-1/2 grid place-items-center w-10 h-10 rounded-full bg-white/70 hover:bg-white shadow ring-1 ring-black/5"
          >
            →
          </button>

          {/* Dots */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10">
            {slides.map((_, i) => {
              const active = current === i;
              return (
                <button
                  key={i}
                  onClick={() => goTo(i)}
                  aria-label={`Go to slide ${i + 1}`}
                  className={`h-2.5 rounded-full transition-all ${
                    active ? "w-8 bg-white" : "w-2.5 bg-white/60"
                  }`}
                />
              );
            })}
          </div>

          {/* Edge mask for a polished look */}
          <div className="pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_right,transparent,black,black,transparent)]" />
        </div>
      </div>
    </section>
  );
};
