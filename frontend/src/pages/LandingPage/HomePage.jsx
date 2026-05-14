import { useNavigate } from "react-router-dom";
import "./HomePage.css";
import Footer from "./Footer.jsx";

import { FaCircleQuestion } from "react-icons/fa6";
import { FaCamera } from "react-icons/fa";
import { MdReport } from "react-icons/md";
import { FaCheckCircle } from "react-icons/fa";
import { FaRoad } from "react-icons/fa";
import { SiMinutemailer } from "react-icons/si";
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

function HomePage({ onGetStarted, onLearnMore }) {
  const navigate = useNavigate();

  return (
    <div className="home-container">
      <section className="home-section">
        <div className="home-content">
          <h1>Snap2Fix</h1>
          <p>AI - Powered Road Damage Reporting System</p>
          <div className="home-buttons">
            <button className="primary-btn" onClick={onGetStarted}>Get Started</button>
            <button className="secondary-btn" onClick={() => navigate("/about")}>Learn More</button>
          </div>
        </div>
      </section>

      <section className="features-section">
        <AnimatedSection>
          <h2><FaCircleQuestion className="home-icon" /> How It Works <FaCircleQuestion className="home-icon" /></h2>
        </AnimatedSection>

        <div className="features-grid">
          <AnimatedSection delay={0.1} direction="left">
            <div className="feature-card">
              <img src="/lp10.jpg" alt="Snap road damage" />
              <h3>Snap <FaCamera className="home-icon" /></h3>
              <p>Take a photo of road cracks or potholes using your device.</p>
            </div>
          </AnimatedSection>

          <AnimatedSection delay={0.2} direction="up">
            <div className="feature-card">
              <img src="/lp2-mapview.jpg" alt="Report location" />
              <h3>Report <MdReport className="home-icon" /></h3>
              <p>Send the report with location details for quick action.</p>
            </div>
          </AnimatedSection>

          <AnimatedSection delay={0.3} direction="up">
            <div className="feature-card">
              <img src="/lp11.jpg" alt="Fix roads" />
              <h3>Fix <FaCheckCircle className="home-icon" /></h3>
              <p>Authorities receive reports and take action faster.</p>
            </div>
          </AnimatedSection>

          <AnimatedSection delay={0.4} direction="right">
            <div className="feature-card">
              <img src="/lp12.jpg" alt="Thriving communities" />
              <h3>Thriving Communities <FaRoad className="home-icon" /></h3>
              <p>This helps build better roads that lead to better communities.</p>
            </div>
          </AnimatedSection>
        </div>
      </section>

      <section className="cta-section">
        <AnimatedSection>
          <h2>Be Part of the Solution</h2>
          <p>Join the community helping build safer roads across the Philippines.</p>
          <button className="primary-btn-cta" onClick={onGetStarted}>Start Reporting!</button>
        </AnimatedSection>
      </section>

      <section className="contact-section">
        <AnimatedSection>
          <h2>Contact the Developers <SiMinutemailer className="home-icon" /></h2>
          <p>If you have questions or feedback, feel free to reach out to our team.</p>
        </AnimatedSection>

        <div className="developers-row">
          {[
            { name: "Paul Angelo Dalipe", email: "paulangelo.dalipe@tup.edu.ph" },
            { name: "Brian Dapito", email: "brian.dapito@tup.edu.ph" },
            { name: "Mave Rick Sandoval", email: "maverick.sandoval@tup.edu.ph" },
            { name: "Krislyn Sayat", email: "krislyn.sayat@tup.edu.ph" },
            { name: "John Carlo Trajico", email: "johncarlo.trajico@tup.edu.ph" },
          ].map((dev, i) => (
            <AnimatedSection key={i} delay={i * 0.1} direction="scale">
              <div className="developer-card">
                <p className="dev-name">{dev.name}</p>
                <p className="dev-email">{dev.email}</p>
              </div>
            </AnimatedSection>
          ))}
        </div>
      </section>

      <Footer />
    </div>
  );
}

export default HomePage;