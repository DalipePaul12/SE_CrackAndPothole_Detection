import { Link } from "react-router-dom";
import "./Navbar.css";

function Navbar() {
  return (
    <nav className="navbar">

      <div className="navbar-left">
        <h1 className="logo">Snap2Fix PH</h1>
      </div>

      <div className="navbar-right">
        <Link to="/" className="nav-home">Home</Link>
        <Link to="/about" className="nav-about">About</Link>
        <Link to="/login" className="nav-login">Login</Link>
        <Link to="/signup" className="nav-signup">Sign Up</Link>
      </div>
    </nav>
  
);
}

export default Navbar;
