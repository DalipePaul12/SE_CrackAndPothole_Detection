import "./AboutPage.css";
import Footer from "./Footer";

function AboutPage() {
  return (
    <div className="about-container">
      
      {/* HERO SECTION */}
      <section className="about-hero">
        <h1>Snap2Fix PH</h1>
        <p>
          Empowering communities to build safer roads through technology.
        </p>
      </section>

      <section className="meaning-section">
          <p>
            Snap2Fix PH is designed to empower citizens to easily report road damage through an 
            AI-powered web system. Its objective is to accurately detect, classify, and manage 
            road issues efficiently, enabling faster response from authorities and improving road 
            safety for communities.
          </p>
      </section>

      {/* MISSION & VISION */}
      <section className="about-section">
        <div className="about-card">
          <h2>Purpose of the Project</h2>
          <p>
            Snap2Fix PH aims to help citizens report road damage easily and efficiently using
            AI-powered tools. In line with this objective, the system enables authorities to
            quickly detect, classify, and respond to reported issues—leading to faster action,
            improved public safety, and better road conditions for communities.
          </p>
        </div>
        

        <div className="about-card">
          <h2>Objective of the Project</h2>
          <p>
            This project aims to develop a web-based, AI-powered road damage reporting system
            that enables residents to easily report road issues through image uploads, while
            helping local authorities efficiently detect, classify, manage, and respond to
            maintenance concerns — promoting safer roads and more connected communities.
        </p>
        </div>
      </section>

      {/* HOW IT STARTED */}
      <section className="about-story">
        <h2>Project Rationale</h2>
        <p>
          Poor road conditions are a major cause of accidents, traffic delays, and vehicle damage across 
          the Philippines. Snap2Fix PH was created to bridge the gap between citizens and local authorities 
          by providing a simple, transparent, and data-driven platform for reporting road damage. By enabling 
          residents to quickly capture and submit reports, the system empowers communities to take an active 
          role in improving local infrastructure. At the same time, authorities gain access to accurate and 
          organized information, allowing them to prioritize repairs, respond faster, and ensure safer roads 
          for everyone.
        </p>
      </section>

      {/* VALUES */}
      <section className="about-values">
        <h2>Project Values</h2>

        <div className="values-grid">
          <div className="value-card">
            <h3>Public Safety</h3>
            <p>Reducing road hazards through timely reporting.</p>
          </div>

          <div className="value-card">
            <h3>Community Action</h3>
            <p>Empowering citizens to take part in solutions.</p>
          </div>

          <div className="value-card">
            <h3>Smart Technology</h3>
            <p>Using AI to detect, classify, and prioritize road damage.</p>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

export default AboutPage;
