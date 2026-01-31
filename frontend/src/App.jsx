import { BrowserRouter as Router, Routes, Route, useLocation } from "react-router-dom";
import { useState } from "react";
import './index.css'

//Scroll to Top Import (so that when navigating to a new page, it starts at the top)
import ScrollToTop from './components/ScrollToTop.jsx';

//Navigation Bar Import
import Navbar from './components/Navbar.jsx';

//Landing Page Imports
import HomePage from './pages/LandingPage/HomePage.jsx';
import AboutPage from './pages/LandingPage/AboutPage.jsx';

//Inside App User Imports
import Dashboard from './pages/Inside-App-User/Dashboard.jsx';


function App() {
  const location = useLocation();
  const [showLogin, setShowLogin] = useState(false);
  const [showSignUp, setShowSignUp] = useState(false);

  //HIdes the Navigation Bar on Inside App User Pages
  const hideNavbar = location.pathname.startsWith("/dashboard");

  return (
    <>
      <ScrollToTop />

      {!hideNavbar && (
      <Navbar
        showLogin={showLogin}
        showSignUp={showSignUp}
        setShowLogin={setShowLogin}
        setShowSignUp={setShowSignUp}
      />
      )}
      
        <Routes>
          {/* Landing Page Routes */}
          <Route path="/" element={<HomePage onGetStarted={() => setShowSignUp(true)} />} />
          <Route path="/about" element={<AboutPage />} />

          {/* Inside App User Routes */}
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
    </>
  )
}

export default App
