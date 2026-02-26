import { useState, useEffect} from "react";
import { useNavigate } from "react-router-dom";
import "./HomePage.css";
import Footer from "./Footer.jsx";

//Icons
import { FaCircleQuestion } from "react-icons/fa6";
import { FaCamera } from "react-icons/fa";
import { MdReport } from "react-icons/md";
import { FaCheckCircle } from "react-icons/fa";
import { FaRoad } from "react-icons/fa";
import { SiMinutemailer } from "react-icons/si";

function HomePage({ onGetStarted, onLearnMore }) {
  //This is for the background image loop if needed later
  /*
  const images = ["/lp9.jpg", "/lp10.jpg", "/lp11.jpg"]; 
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrent((prev) => (prev + 1) % images.length);
    }, 3000); // change every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const homeStyle = {
    backgroundImage: `url(${images[current]})`
  };
*/  
  const navigate = useNavigate();

  return (
    <>
      <div className="home-container">
        {/* HOME SECTION */}
        <section className="home-section" /*style={homeStyle}*/>
          <div className="home-content">
            <h1>Snap2Fix</h1>
            <p>AI - Powered Road Damage Reporting System</p>

            <div className="home-buttons">
              <button className="primary-btn" onClick={onGetStarted}>Get Started</button>
              <button className="secondary-btn" onClick={() => navigate("/about")}>Learn More</button>
            </div>
          </div>
        </section>

        {/* FEATURES SECTION */}
        <section className="features-section">
          <h2> <FaCircleQuestion className="home-icon" /> How It Works <FaCircleQuestion className="home-icon" /></h2>

          <div className="features-grid">
            <div className="feature-card">
              <img src="/lp10.jpg" alt="Snap road damage" />
              <h3>Snap <FaCamera className="home-icon" /></h3>
              <p>Take a photo of road cracks or potholes using your device.</p>
            </div>

            <div className="feature-card">
              <img src="/lp2-mapview.jpg" alt="Report location" />
              <h3>Report <MdReport className="home-icon" /></h3>
              <p>Send the report with location details for quick action.</p>
            </div>

            <div className="feature-card">
              <img src="/lp11.jpg" alt="Fix roads" />
              <h3>Fix <FaCheckCircle className="home-icon" /></h3>
              <p>Authorities receive reports and take action faster.</p>
            </div>

            <div className="feature-card">
              <img src="/lp12.jpg" alt="Thriving communities" />
              <h3>Thriving Communities <FaRoad className="home-icon" /></h3>
              <p>This helps build better roads that lead to better communities.</p>
            </div>
          </div>
        </section>

{/*
        <section className="why-section">
          <h2>Why Snap2Fix PH?</h2>
          <p>
            Poor road conditions cause accidents, traffic delays, and vehicle damage.
            Snap2Fix PH empowers citizens to actively participate in improving
            road safety through technology.
          </p>
        </section>
*/}

        {/* CALL TO ACTION */}
        <section className="cta-section">
          <h2>Be Part of the Solution</h2>
          <p>Join the community helping build safer roads across the Philippines.</p>
          <button className="primary-btn-cta" onClick={onGetStarted}>Start Reporting!</button>
        </section>


      {/* CONTACT SECTION */}
      <section className="contact-section">
        <h2>Contact the Developers <SiMinutemailer className="home-icon" /></h2>
        <p>If you have questions or feedback, feel free to reach out to our team.</p>

        <div className="developers-row">
          <div className="developer-card">
            <p className="dev-name">Paul Angelo Dalipe</p>
            <p className="dev-email">paulangelo.dalipe@tup.edu.ph</p>
          </div>

          <div className="developer-card">
            <p className="dev-name">Brian Dapito</p>
            <p className="dev-email">brian.dapito@tup.edu.ph</p>
          </div>

          <div className="developer-card">
            <p className="dev-name">Mave Rick Sandoval</p>
            <p className="dev-email">maverick.sandoval@tup.edu.ph</p>
          </div>

          <div className="developer-card">
            <p className="dev-name">Krislyn Sayat</p>
            <p className="dev-email">krislyn.sayat@tup.edu.ph</p>
          </div>

          <div className="developer-card">
            <p className="dev-name">John Carlo Trajico</p>
            <p className="dev-email">johncarlo.trajico@tup.edu.ph</p>
          </div>
        </div>
      </section>

      <Footer />
      </div>
    </>
  );
}

export default HomePage;
