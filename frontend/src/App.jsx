/**
 * App.jsx
 *
 * FIX: Added PrivateRoute and AdminRoute guards.
 *      Previously /dashboard and /adminpanel were fully accessible without
 *      authentication — any user who knew the URL could reach protected pages.
 *
 * PrivateRoute: Redirects to "/" if no access_token in localStorage.
 * AdminRoute:   Redirects to "/dashboard" if logged-in user is not an admin.
 *               Role is read from the JWT payload (no extra API call needed).
 */
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useState } from "react";
import "./index.css";

import ScrollToTop        from "./components/ScrollToTop.jsx";
import Navbar             from "./components/Navbar.jsx";
import { NotificationProvider } from "./pages/Contexts/NotificationContext.jsx";

// Landing
import HomePage   from "./pages/LandingPage/HomePage.jsx";
import AboutPage  from "./pages/LandingPage/AboutPage.jsx";

// Inside App — User
import Dashboard      from "./pages/Inside-App-User/Dashboard.jsx";
import AllReports     from "./pages/Inside-App-User/AllReports.jsx";
import MapView        from "./pages/Inside-App-User/MapView.jsx";
import MyProfile      from "./pages/Inside-App-User/MyProfile.jsx";
import MySubmissions  from "./pages/Inside-App-User/MySubmissions.jsx";
import Notifications  from "./pages/Inside-App-User/Notifications.jsx";
import Settings       from "./pages/Inside-App-User/Settings.jsx";

// Inside App — Admin
import AdminPanel          from "./pages/Inside-App-Admin/AdminPanel.jsx";
import AdminAllReports     from "./pages/Inside-App-Admin/AdminAllReports.jsx";
import AdminMapView        from "./pages/Inside-App-Admin/AdminMapView.jsx";
import AdminManageRequests from "./pages/Inside-App-Admin/AdminManageRequests.jsx";
import AdminManageReports  from "./pages/Inside-App-Admin/AdminManageReports.jsx";
import AdminStreetReports  from "./pages/Inside-App-Admin/AdminStreetReports.jsx";

// ─── Auth helpers ──────────────────────────────────────────────────────────────

/** Returns true if a valid (non-expired) access token exists in localStorage. */
function isAuthenticated() {
  const token = localStorage.getItem("access_token");
  if (!token) return false;

  try {
    // Decode JWT payload without verifying signature (verification is server-side)
    const payload = JSON.parse(atob(token.split(".")[1]));
    // exp is in seconds; Date.now() is in ms
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      localStorage.removeItem("access_token");
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Returns the role string from the JWT payload, or null. */
function getUserRole() {
  const token = localStorage.getItem("access_token");
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.role ?? null;
  } catch {
    return null;
  }
}

// ─── Route guards ──────────────────────────────────────────────────────────────

/** Redirects unauthenticated users to the landing page. */
function PrivateRoute({ children }) {
  return isAuthenticated() ? children : <Navigate to="/" replace />;
}

/** Redirects non-admin users back to the user dashboard. */
function AdminRoute({ children }) {
  if (!isAuthenticated()) return <Navigate to="/" replace />;
  if (getUserRole() !== "admin") return <Navigate to="/dashboard" replace />;
  return children;
}

// ─── App shell ─────────────────────────────────────────────────────────────────

function AppShell({ showLogin, showSignUp, setShowLogin, setShowSignUp }) {
  const location = useLocation();

  const hideNavbar =
    location.pathname.startsWith("/dashboard") ||
    location.pathname.startsWith("/adminpanel");

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

      <NotificationProvider>
        <Routes>
          {/* ── Landing ─────────────────────────────────────────────────── */}
          <Route path="/"      element={<HomePage onGetStarted={() => setShowSignUp(true)} />} />
          <Route path="/about" element={<AboutPage />} />

          {/* ── User dashboard (auth required) ──────────────────────────── */}
          <Route path="/dashboard"              element={<PrivateRoute><Dashboard /></PrivateRoute>} />
          <Route path="/dashboard/reports"      element={<PrivateRoute><AllReports /></PrivateRoute>} />
          <Route path="/dashboard/mapview"      element={<PrivateRoute><MapView /></PrivateRoute>} />
          <Route path="/dashboard/profile"      element={<PrivateRoute><MyProfile /></PrivateRoute>} />
          <Route path="/dashboard/submissions"  element={<PrivateRoute><MySubmissions /></PrivateRoute>} />
          <Route path="/dashboard/notifications" element={<PrivateRoute><Notifications /></PrivateRoute>} />
          <Route path="/dashboard/settings"     element={<PrivateRoute><Settings /></PrivateRoute>} />

          {/* ── Admin panel (admin role required) ───────────────────────── */}
          <Route path="/adminpanel"                  element={<AdminRoute><AdminPanel /></AdminRoute>} />
          <Route path="/adminpanel/reports"          element={<AdminRoute><AdminAllReports /></AdminRoute>} />
          <Route path="/adminpanel/map"              element={<AdminRoute><AdminMapView /></AdminRoute>} />
          <Route path="/adminpanel/requests"         element={<AdminRoute><AdminManageRequests /></AdminRoute>} />
          <Route path="/adminpanel/managereports"    element={<AdminRoute><AdminManageReports /></AdminRoute>} />
          <Route path="/adminpanel/managestreets"    element={<AdminRoute><AdminStreetReports /></AdminRoute>} />
        </Routes>
      </NotificationProvider>
    </>
  );
}

function App() {
  const [showLogin, setShowLogin]   = useState(false);
  const [showSignUp, setShowSignUp] = useState(false);

  return (
    <AppShell
      showLogin={showLogin}
      showSignUp={showSignUp}
      setShowLogin={setShowLogin}
      setShowSignUp={setShowSignUp}
    />
  );
}

export default App;