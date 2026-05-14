import "./AboutPage.css";
import Footer from "./Footer";

import { MdEmojiObjects } from "react-icons/md";
import { MdOutlineEmojiObjects } from "react-icons/md";
import { FaUserShield } from "react-icons/fa6";
import { MdOutlinePublic } from "react-icons/md";
import { SiSmartthings } from "react-icons/si";
import { useScrollAnimation } from "../../hooks/useScrollAnimation";

function AnimatedSection({ children, className = "", delay = 0, direction = "up" }) {
  const [ref, isVisible] = useScrollAnimation();
  const delayStyle = delay ? { transitionDelay: `${delay}s` } : {};

  return (
    <div
      ref={ref}
      className={`${className} scroll-animate scroll-${direction} ${isVisible ? "visible" : ""}`}
      style={delayStyle}
    >
      {children}
    </div>
  );
}

function AboutPage() {
  return (
    <div className="about-container">
      <section className="about-hero">
        <h1>Snap2Fix</h1>
        <p>Empowering communities to build safer roads through technology.</p>
      </section>

      <AnimatedSection className="meaning-section">
        <p>
          Snap2Fix is designed to empower citizens to easily report road damage through an 
          AI-powered web system. Its objective is to accurately detect, classify, and manage 
          road issues efficiently, enabling faster response from authorities and improving road 
          safety for communities.
        </p>
      </AnimatedSection>

      <section className="about-section">
        <AnimatedSection delay={0.1} direction="left">
          <div className="about-card">
            <h2>Purpose of the Project <MdEmojiObjects className="about-icon" /></h2>
            <p>
              Snap2Fix aims to help citizens report road damage easily and efficiently using
              AI-powered tools. In line with this objective, the system enables authorities to
              quickly detect, classify, and respond to reported issues—leading to faster action,
              improved public safety, and better road conditions for communities.
            </p>
          </div>
        </AnimatedSection>

        <AnimatedSection delay={0.2} direction="right">
          <div className="about-card">
            <h2>Objective of the Project <MdEmojiObjects className="about-icon" /></h2>
            <p>
              This project aims to develop a web-based, AI-powered road damage reporting system
              that enables residents to easily report road issues through image uploads, while
              helping local authorities efficiently detect, classify, manage, and respond to
              maintenance concerns — promoting safer roads and more connected communities.
            </p>
          </div>
        </AnimatedSection>
      </section>

      <AnimatedSection className="about-story" direction="up">
        <h2>Project Rationale <MdOutlineEmojiObjects className="about-icon" /></h2>
        <p>
          Poor road conditions are a major cause of accidents, traffic delays, and vehicle damage across 
          the Philippines. Snap2Fix was created to bridge the gap between citizens and local authorities 
          by providing a simple, transparent, and data-driven platform for reporting road damage. By enabling 
          residents to quickly capture and submit reports, the system empowers communities to take an active 
          role in improving local infrastructure. At the same time, authorities gain access to accurate and 
          organized information, allowing them to prioritize repairs, respond faster, and ensure safer roads 
          for everyone.
        </p>
      </AnimatedSection>

      <section className="about-values">
        <AnimatedSection>
          <h2>Project Values <MdOutlineEmojiObjects className="about-icon" /></h2>
        </AnimatedSection>

        <div className="values-grid">
          {[
            { title: "Public Safety", icon: <FaUserShield className="about-icon" />, text: "Reducing road hazards through timely reporting." },
            { title: "Community Action", icon: <MdOutlinePublic className="about-icon" />, text: "Empowering citizens to take part in solutions." },
            { title: "Smart Technology", icon: <SiSmartthings className="about-icon" />, text: "Using AI to detect, classify, and prioritize road damage." },
          ].map((val, i) => (
            <AnimatedSection key={i} delay={i * 0.15} direction="scale">
              <div className="value-card">
                <h3>{val.title} {val.icon}</h3>
                <p>{val.text}</p>
              </div>
            </AnimatedSection>
          ))}
        </div>
      </section>

      <Footer />
    </div>
  );
}

export default AboutPage;