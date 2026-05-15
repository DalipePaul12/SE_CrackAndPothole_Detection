import { Link } from "react-router-dom";
import { useState } from "react";

import "./Navbar.css";

// Import Components
import LoginPage from '../pages/LandingPage/LoginPage.jsx';
import SignUpPage from '../pages/LandingPage/SignUpPage.jsx';

/* ── Logo using /snap.jpg with SVG fallback ── */
function SnapLogo() {
  const [imgError, setImgError] = useState(false);

  if (imgError) {
    // Fallback SVG when /snap.jpg fails to load - green circle with subtle dark green strokes
    return (
      <div className="navbar-logo-fallback">
        <svg width="40" height="40" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="24" cy="24" r="24" fill="url(#lg)" />
          <circle cx="24" cy="24" r="12" stroke="#2e7d32" strokeWidth="2" fill="none" opacity="0.5" />
          <path d="M24 12v6M24 30v6M12 24h6M30 24h6" stroke="#2e7d32" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
          <defs>
            <linearGradient id="lg" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
              <stop stopColor="#4caf50" />
              <stop offset="1" stopColor="#2e7d32" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    );
  }

  return (
    <div className="navbar-logo-fallback">
      <img
        src="/snap.jpg"
        alt="Snap2Fix"
        className="navbar-logo-img"
        onError={() => setImgError(true)}
      />
    </div>
  );
}

function Navbar({ showLogin, showSignUp, setShowLogin, setShowSignUp }) {
  return (
    <>
      <nav className="navbar">
        <div className="navbar-left">
          <Link to="/" className="logo-link">
            <div className="logo">
              <SnapLogo />
              <span className="logo-text">Snap2Fix</span>
            </div>
          </Link>
        </div>

        <div className="navbar-right">
          <Link to="/" className="nav-home">Home</Link>
          <Link to="/about" className="nav-about">About</Link>
          <Link className="nav-login" onClick={() => setShowLogin(true)}>Login</Link>
          <Link className="nav-signup" onClick={() => setShowSignUp(true)}>Sign Up</Link>
        </div>
      </nav>

      <LoginPage
        isOpen={showLogin}
        onClose={() => setShowLogin(false)}
        onSwitchToSignUp={() => {
          setShowLogin(false);
          setShowSignUp(true);
        }}
      />

      <SignUpPage
        isOpen={showSignUp}
        onClose={() => setShowSignUp(false)}
        onSwitchToLogin={() => {
          setShowSignUp(false);
          setShowLogin(true);
        }}
      />
    </>
  );
}

export default Navbar;