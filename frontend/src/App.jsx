import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import './index.css'

//Navigation Bar Import
import Navbar from './components/Navbar.jsx';

//Landing Page Imports
import LoginPage from './pages/LandingPage/LoginPage.jsx';
import SignUpPage from './pages/LandingPage/SignUpPage.jsx';
import AboutPage from './pages/LandingPage/AboutPage.jsx';
import HomePage from './pages/LandingPage/HomePage.jsx';

function App() {

  return (
    <>
      <Navbar />
      
        <Routes>
          {/* Landing Page Routes */}
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignUpPage />} />
          <Route path="/about" element={<AboutPage />} />
          
        </Routes>
    </>
  )
}

export default App
