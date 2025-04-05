"use client";

import avatar1 from "@/assets/avatar-1.png";
import avatar2 from "@/assets/avatar-2.png";
import avatar3 from "@/assets/avatar-3.png";
import avatar4 from "@/assets/avatar-4.png";
import avatar5 from "@/assets/avatar-5.png";
import avatar6 from "@/assets/avatar-6.png";
import avatar7 from "@/assets/avatar-7.png";
import avatar8 from "@/assets/avatar-8.png";
import avatar9 from "@/assets/avatar-9.png";
import Image from "next/image";
import { twMerge } from "tailwind-merge";
import { motion } from "framer-motion";
import React from "react";

const testimonials = [
  {
    text: "UniAsia has been our trusted supplier for years, consistently providing high-quality materials at competitive prices.",
    imageSrc: avatar1.src,
    name: "Michael Tan",
    username: "@michaeltan_hardware",
  },
  {
    text: "Timely deliveries and excellent customer service make UniAsia stand out in the industry.",
    imageSrc: avatar2.src,
    name: "Rachel Cruz",
    username: "@rachelcruz_build",
  },
  {
    text: "The reliability of UniAsia’s supply chain has helped us keep our store fully stocked without any delays.",
    imageSrc: avatar3.src,
    name: "Jonathan Reyes",
    username: "@jonreyes_hardware",
  },
  {
    text: "Working with UniAsia has been a game-changer for our business. Their pricing and product quality are unmatched.",
    imageSrc: avatar4.src,
    name: "Carlos Dela Vega",
    username: "@carlosvega_supp",
  },
  {
    text: "Finding a supplier that consistently delivers durable and cost-effective materials is rare—UniAsia exceeds expectations.",
    imageSrc: avatar5.src,
    name: "Samantha Lim",
    username: "@samlim_hardware",
  },
  {
    text: "Their bulk pricing options and efficient logistics have helped us scale our operations smoothly.",
    imageSrc: avatar6.src,
    name: "Henry Torres",
    username: "@henrytorres_build",
  },
  {
    text: "UniAsia’s product range is extensive, making it easy to source everything we need from one supplier.",
    imageSrc: avatar7.src,
    name: "Diana Mendoza",
    username: "@dianamendoza_supply",
  },
  {
    text: "The quality of materials we receive from UniAsia is consistently top-notch, ensuring our customers get the best products.",
    imageSrc: avatar8.src,
    name: "Bryan Santos",
    username: "@bryansantos_store",
  },
  {
    text: "Thanks to UniAsia, we’ve built a strong reputation for carrying reliable and durable construction materials.",
    imageSrc: avatar9.src,
    name: "Kevin Mercado",
    username: "@kevinmercado_hardware",
  },
];

const firstColumn = testimonials.slice(0, 3);
const secondColumn = testimonials.slice(3, 6);
const thirdColumn = testimonials.slice(6, 9);

const TestimonialsColumn = (props: {
  className?: string;
  testimonials: typeof testimonials;
  duration?: number;
}) => (
  <div className={props.className}>
    <motion.div
      animate={{
        translateY: "-50%",
      }}
      transition={{
        duration: props.duration || 10,
        repeat: Infinity,
        ease: "linear",
        repeatType: "loop",
      }}
      className="flex flex-col gap-6 pb-6"
    >
      {[...new Array(2)].fill(0).map((_, index) => (
        <React.Fragment key={index}>
          {props.testimonials.map(({ text, imageSrc, name, username }) => (
            <div className="card">
              <div>{text}</div>
              <div className="flex items-center gap-2 mt-5">
                <Image
                  src={imageSrc}
                  alt={name}
                  width={40}
                  height={40}
                  className="h-10 w-10 rounded-full"
                />
                <div className="flex flex-col">
                  <div className="font-medium tracking-tight leading-5">
                    {name}
                  </div>
                  <div className="leading-5 tracking-tight">{username}</div>
                </div>
              </div>
            </div>
          ))}
        </React.Fragment>
      ))}
    </motion.div>
  </div>
);

export const Testimonials = () => {
  return (
    <section className="bg-white py-0">
      <div className="container">
        <div className="section-heading">
          <div className="flex justify-center">
            <div className="tag mt-12">Testimonials</div>
          </div>
          <h2 className="section-title mt-5">What Our Clients Say</h2>
          <p className="section-description mt-5">
            See what our customers have to say about UniAsia's quality and
            service.
          </p>
        </div>
        <div className="flex justify-center gap-6 mt-10 [mask-image:linear-gradient(to_bottom,transparent,black_25%,black_75%,transparent)] max-h-[738px] overflow-hidden">
          <TestimonialsColumn testimonials={firstColumn} duration={15} />
          <TestimonialsColumn
            testimonials={secondColumn}
            className="hidden md:block"
            duration={19}
          />
          <TestimonialsColumn
            testimonials={thirdColumn}
            className="hidden lg:block"
            duration={17}
          />
        </div>
      </div>
    </section>
  );
};
