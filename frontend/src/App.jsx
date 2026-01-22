import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { useState } from "react";
import './index.css'

//Navigation Bar Import
import Navbar from './components/Navbar.jsx';

//Landing Page Imports
import HomePage from './pages/LandingPage/HomePage.jsx';
import AboutPage from './pages/LandingPage/AboutPage.jsx';


function App() {
  const [showLogin, setShowLogin] = useState(false);
  const [showSignUp, setShowSignUp] = useState(false);

  return (
    <>
      <Navbar
        showLogin={showLogin}
        showSignUp={showSignUp}
        setShowLogin={setShowLogin}
        setShowSignUp={setShowSignUp}
      />
      
        <Routes>
          {/* Landing Page Routes */}
          <Route path="/" element={<HomePage onGetStarted={() => setShowSignUp(true)} />} />
          <Route path="/about" element={<AboutPage />} />
        </Routes>
    </>
  )
}

export default App
