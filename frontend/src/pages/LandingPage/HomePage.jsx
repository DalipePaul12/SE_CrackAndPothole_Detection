import "./HomePage.css";

function HomePage({ onGetStarted }) {

  return (
    <>
    <div className="home-container">
      {/* home SECTION */}
      <section className="home-section">
        <div className="home-content">
          <h1>Snap2Fix PH</h1>
          <p>
            AI - Powered Road Damage Reporting System
          </p>

          <div className="home-buttons">
            <button className="primary-btn" onClick={onGetStarted}>Get Started</button>
            <button className="secondary-btn">Learn More</button>
          </div>
        </div>
      </section>

      {/* FEATURES SECTION */}
      <section className="features-section">
        <h2>How It Works</h2>

        <div className="features-grid">
          <div className="feature-card">
            <h3>📸 Snap</h3>
            <p>Take a photo of road cracks or potholes using your device.</p>
          </div>

          <div className="feature-card">
            <h3>📍 Report</h3>
            <p>Automatically tag the location and submit the report.</p>
          </div>

          <div className="feature-card">
            <h3>🛠 Fix</h3>
            <p>Authorities receive reports and take action faster.</p>
          </div>
        </div>
      </section>

      {/* WHY SECTION */}
      <section className="why-section">
        <h2>Why Snap2Fix PH?</h2>
        <p>
          Poor road conditions cause accidents, traffic delays, and vehicle damage.
          Snap2Fix PH empowers citizens to actively participate in improving
          road safety through technology.
        </p>
      </section>

      {/* CALL TO ACTION */}
      <section className="cta-section">
        <h2>Be Part of the Solution</h2>
        <p>Join the community helping build safer roads across the Philippines.</p>
        <button className="primary-btn">Create an Account</button>
      </section>

      {/* FOOTER */}
      <footer className="home-footer">
        <p>© {new Date().getFullYear()} Snap2Fix PH. All rights reserved.</p>
      </footer>
    </div>

    </>
  );
}

export default HomePage;
