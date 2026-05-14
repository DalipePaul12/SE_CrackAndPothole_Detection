/**
 * App.jsx  —  FIXED WITH SIDEBAR LAYOUTS
 */

import { Routes, Route, Navigate, useLocation, Outlet } from "react-router-dom";
import { useState } from "react";
import "./index.css";

import ScrollToTop from "./components/ScrollToTop.jsx";
import Navbar      from "./components/Navbar.jsx";
import { NotificationProvider } from "./pages/Contexts/NotificationContext.jsx";
import { useAuthContext }        from "./pages/Contexts/AuthContext.jsx";

// Layouts (NEW - import your layout components)
import UserLayout  from "./components/UserLayout.jsx";
import AdminLayout from "./components/AdminLayout.jsx";

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
import AdminSettings       from "./pages/Inside-App-Admin/AdminSettings.jsx";
// ─── Route guards ─────────────────────────────────────────────────────────────

function PrivateRoute({ children }) {
  const { isAuthenticated } = useAuthContext();
  return isAuthenticated ? children : <Navigate to="/" replace />;
}

function AdminRoute({ children }) {
  const { isAuthenticated, user } = useAuthContext();
  if (!isAuthenticated)          return <Navigate to="/"          replace />;
  if (user?.role !== "admin" && user?.role !== "superadmin")    return <Navigate to="/dashboard" replace />;
  return children;
}

// ─── Layout wrappers with auth guards ─────────────────────────────────────────

/** UserLayout with auth guard */
function UserLayoutGuard() {
  return (
    <PrivateRoute>
      <UserLayout>
        <Outlet />  {/* Renders the matched child route */}
      </UserLayout>
    </PrivateRoute>
  );
}

/** AdminLayout with auth guard */
function AdminLayoutGuard() {
  return (
    <AdminRoute>
      <AdminLayout>
        <Outlet />
      </AdminLayout>
    </AdminRoute>
  );
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
          {/* ── Landing (no sidebar) ───────────────────────────────────── */}
          <Route path="/"      element={<HomePage onGetStarted={() => setShowSignUp(true)} />} />
          <Route path="/about" element={<AboutPage />} />

          {/* ── User dashboard WITH sidebar layout ─────────────────────── */}
          <Route element={<UserLayoutGuard />}>
            <Route path="/dashboard"               element={<Dashboard />} />
            <Route path="/dashboard/reports"       element={<AllReports />} />
            <Route path="/dashboard/mapview"       element={<MapView />} />
            <Route path="/dashboard/profile"       element={<MyProfile />} />
            <Route path="/dashboard/submissions"   element={<MySubmissions />} />
            <Route path="/dashboard/notifications" element={<Notifications />} />
            <Route path="/dashboard/settings"      element={<Settings />} />
          </Route>

          {/* ── Admin panel WITH sidebar layout ────────────────────────── */}
          <Route element={<AdminLayoutGuard />}>
            <Route path="/adminpanel"               element={<AdminPanel />} />
            <Route path="/adminpanel/reports"       element={<AdminAllReports />} />
            <Route path="/adminpanel/map"           element={<AdminMapView />} />
            <Route path="/adminpanel/requests"      element={<AdminManageRequests />} />
            <Route path="/adminpanel/managereports" element={<AdminManageReports />} />
            <Route path="/adminpanel/managestreets" element={<AdminStreetReports />} />
            <Route path="/adminpanel/settings"      element={<AdminSettings />} />
          </Route>

          {/* ── Fallback ───────────────────────────────────────────────── */}
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