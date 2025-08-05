import { Header } from "@/sections/Header"; // Importing Header component
import { Hero } from "@/sections/Hero"; // Importing Hero section component
import { LogoTicker } from "@/sections/LogoTicker"; // Importing LogoTicker section component
import { AboutUs } from "@/sections/AboutUs"; // Importing AboutUs section component
import { Testimonials } from "@/sections/Testimonials"; // Importing Testimonials section component
import { ContactUs } from "@/sections/ContactUs"; // Importing ContactUs section component
import { Footer } from "@/sections/Footer"; // Importing Footer section component
import { CallToAction } from "@/sections/CallToAction";
import { Pricing } from "@/sections/Pricing";

export default function Home() {
  return (
    <>
      <Header /> {/* Render Header component */}
      <Hero /> {/* Render Hero component */}
      <LogoTicker /> {/* Render LogoTicker component */}
      <AboutUs /> {/* Render ProductShowcase component */}
      {/* <Testimonials /> Render Testimonials component */}
      {/* <ContactUs /> Render Pricing component */}
      <Footer /> {/* Render Footer component */}
    </>
  );
}
