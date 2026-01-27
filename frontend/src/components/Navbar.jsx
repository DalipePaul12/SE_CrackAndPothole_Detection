import { Link } from "react-router-dom";
import { useState } from "react";
import { GiCrackedDisc } from "react-icons/gi";

import "./Navbar.css";

// Import Components
import LoginPage from '../pages/LandingPage/LoginPage.jsx';
import SignUpPage from '../pages/LandingPage/SignUpPage.jsx';

function Navbar({ showLogin, showSignUp, setShowLogin, setShowSignUp }) {
  /*const [showLogin, setShowLogin] = useState(false);
  const [showSignUp, setShowSignUp] = useState(false);*/

  return (
    <>
    <nav className="navbar">

      <div className="navbar-left">
        <h1 className="logo">Snap2Fix PH <GiCrackedDisc className="logo-icon" /></h1>
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
        }}/>

     <SignUpPage
        isOpen={showSignUp}
        onClose={() => setShowSignUp(false)}
        onSwitchToLogin={() => {
          setShowSignUp(false);
          setShowLogin(true);
        }}/>
    </>

);
}

export default Navbar;
