/**
 * App.jsx  —  FIXED
 *
 * CHANGES FROM PREVIOUS VERSION:
 *
 * 1. REMOVED <BrowserRouter> — it is already in main.jsx. Having two routers
 *    causes a context mismatch that makes useLocation / useNavigate behave
 *    unpredictably and can trigger full re-mounts on every navigation.
 *
 * 2. REMOVED raw localStorage / JWT helpers (isAuthenticated, getUserRole).
 *    Those read stale values and bypass the AuthProvider you already wired up
 *    in main.jsx. Now PrivateRoute and AdminRoute read from useAuthContext(),
 *    which is the single source of truth.
 *
 * 3. AuthProvider is in main.jsx (wrapping everything), so the auth state is
 *    resolved BEFORE any route guard or page component mounts. That is what
 *    stops data from flashing and then disappearing.
 */

import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useState } from "react";
import "./index.css";

import ScrollToTop from "./components/ScrollToTop.jsx";
import Navbar      from "./components/Navbar.jsx";
import { NotificationProvider } from "./pages/Contexts/NotificationContext.jsx";
import { useAuthContext }        from "./pages/Contexts/AuthContext.jsx";

// Landing
import HomePage  from "./pages/LandingPage/HomePage.jsx";
import AboutPage from "./pages/LandingPage/AboutPage.jsx";

// Inside App — User
import Dashboard     from "./pages/Inside-App-User/Dashboard.jsx";
import AllReports    from "./pages/Inside-App-User/AllReports.jsx";
import MapView       from "./pages/Inside-App-User/MapView.jsx";
import MyProfile     from "./pages/Inside-App-User/MyProfile.jsx";
import MySubmissions from "./pages/Inside-App-User/MySubmissions.jsx";
import Notifications from "./pages/Inside-App-User/Notifications.jsx";
import Settings      from "./pages/Inside-App-User/Settings.jsx";

// Inside App — Admin
import AdminPanel          from "./pages/Inside-App-Admin/AdminPanel.jsx";
import AdminAllReports     from "./pages/Inside-App-Admin/AdminAllReports.jsx";
import AdminMapView        from "./pages/Inside-App-Admin/AdminMapView.jsx";
import AdminManageRequests from "./pages/Inside-App-Admin/AdminManageRequests.jsx";
import AdminManageReports  from "./pages/Inside-App-Admin/AdminManageReports.jsx";
import AdminStreetReports  from "./pages/Inside-App-Admin/AdminStreetReports.jsx";

// ─── Route guards (now use AuthContext, not localStorage) ─────────────────────

/**
 * PrivateRoute
 * Blocks unauthenticated users from reaching user dashboard pages.
 * Because AuthProvider already blocks rendering until isLoading=false,
 * isAuthenticated here is always a settled value — no flash.
 */
function PrivateRoute({ children }) {
  const { isAuthenticated } = useAuthContext();
  return isAuthenticated ? children : <Navigate to="/" replace />;
}

/**
 * AdminRoute
 * Blocks non-admin users. Role is read from the auth context user object,
 * which comes from the validated JWT — no stale localStorage reads.
 */
function AdminRoute({ children }) {
  const { isAuthenticated, user } = useAuthContext();
  if (!isAuthenticated)          return <Navigate to="/"          replace />;
  if (user?.role !== "admin")    return <Navigate to="/dashboard" replace />;
  return children;
}

// ─── App shell ────────────────────────────────────────────────────────────────

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
          {/* ── Landing ──────────────────────────────────────────────────── */}
          <Route path="/"      element={<HomePage onGetStarted={() => setShowSignUp(true)} />} />
          <Route path="/about" element={<AboutPage />} />

          {/* ── User dashboard (auth required) ───────────────────────────── */}
          <Route path="/dashboard"               element={<PrivateRoute><Dashboard /></PrivateRoute>} />
          <Route path="/dashboard/reports"       element={<PrivateRoute><AllReports /></PrivateRoute>} />
          <Route path="/dashboard/mapview"       element={<PrivateRoute><MapView /></PrivateRoute>} />
          <Route path="/dashboard/profile"       element={<PrivateRoute><MyProfile /></PrivateRoute>} />
          <Route path="/dashboard/submissions"   element={<PrivateRoute><MySubmissions /></PrivateRoute>} />
          <Route path="/dashboard/notifications" element={<PrivateRoute><Notifications /></PrivateRoute>} />
          <Route path="/dashboard/settings"      element={<PrivateRoute><Settings /></PrivateRoute>} />

          {/* ── Admin panel (admin role required) ────────────────────────── */}
          <Route path="/adminpanel"                element={<AdminRoute><AdminPanel /></AdminRoute>} />
          <Route path="/adminpanel/reports"        element={<AdminRoute><AdminAllReports /></AdminRoute>} />
          <Route path="/adminpanel/map"            element={<AdminRoute><AdminMapView /></AdminRoute>} />
          <Route path="/adminpanel/requests"       element={<AdminRoute><AdminManageRequests /></AdminRoute>} />
          <Route path="/adminpanel/managereports"  element={<AdminRoute><AdminManageReports /></AdminRoute>} />
          <Route path="/adminpanel/managestreets"  element={<AdminRoute><AdminStreetReports /></AdminRoute>} />

          {/* ── Fallback ─────────────────────────────────────────────────── */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </NotificationProvider>
    </>
  );
}

function App() {
  const [showLogin,  setShowLogin]  = useState(false);
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