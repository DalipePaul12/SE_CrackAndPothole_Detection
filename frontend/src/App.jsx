import { BrowserRouter as Router, Routes, Route, useLocation } from "react-router-dom";
import { useState } from "react";
import './index.css'

//Scroll to Top Import (so that when navigating to a new page, it starts at the top)
import ScrollToTop from './components/ScrollToTop.jsx';

//Navigation Bar Import
import Navbar from './components/Navbar.jsx';

//Notification Context Import
import { NotificationProvider } from "./pages/Contexts/NotificationContext.jsx";

//Landing Page Imports
import HomePage from './pages/LandingPage/HomePage.jsx';
import AboutPage from './pages/LandingPage/AboutPage.jsx';

//Inside App User Imports
import Dashboard from './pages/Inside-App-User/Dashboard.jsx';
import AllReports from './pages/Inside-App-User/AllReports.jsx';
import MapView from "./pages/Inside-App-User/MapView.jsx";
import MyProfile from "./pages/Inside-App-User/MyProfile.jsx";
import MySubmissions from "./pages/Inside-App-User/MySubmissions.jsx";
import Notifications from "./pages/Inside-App-User/Notifications.jsx";
import Settings from "./pages/Inside-App-User/Settings.jsx";


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
      
      {/* Wrap all routes with NotificationContext to provide notification context to all pages */}
      <NotificationProvider>
        
        <Routes>
          {/* Landing Page Routes */}
          <Route path="/" element={<HomePage onGetStarted={() => setShowSignUp(true)} />} />
          <Route path="/about" element={<AboutPage />} />
      

          {/* Inside App User Routes */}
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/dashboard/reports" element={<AllReports />} />
          <Route path="/dashboard/mapview" element={<MapView />} />
          <Route path="/dashboard/profile" element={<MyProfile />} />
          <Route path="/dashboard/submissions" element={<MySubmissions />} />
          <Route path="/dashboard/notifications" element={<Notifications />} />
          <Route path="/dashboard/settings" element={<Settings />} />
        </Routes>
      
      </NotificationProvider>
    </>
  )
}

export default App
