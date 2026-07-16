import { useState, useEffect, useCallback } from "react";
import { Outlet } from "react-router-dom";
import AdminSidebar from "./AdminSidebar";
import AdminHeader from "./AdminHeader";
import "./AdminLayout.css";

function AdminLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => window.innerWidth < 1024);
  const isMobile = typeof window !== "undefined" && window.innerWidth < 1024;

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      if (mobile) {
        setIsCollapsed(true);
        setIsSidebarOpen(false);
      } else {
        setIsCollapsed(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  /* Lock body scroll while mobile sidebar is open */
  useEffect(() => {
    document.body.style.overflow = isSidebarOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isSidebarOpen]);

  const toggleSidebar  = useCallback(() => setIsSidebarOpen(prev => !prev), []);
  const closeSidebar   = useCallback(() => setIsSidebarOpen(false), []);
  const toggleCollapse = useCallback(() => setIsCollapsed(prev => !prev), []);

  return (
    <div className="admin-layout">
      <AdminSidebar
        isOpen={isSidebarOpen}
        onClose={closeSidebar}
        isCollapsed={isCollapsed}
        onToggleCollapse={toggleCollapse}
      />

      <AdminHeader
        onMenuClick={toggleSidebar}
        isSidebarOpen={isSidebarOpen}
        isCollapsed={isCollapsed}
      />

      <main className={`admin-main-content ${isCollapsed ? "collapsed" : ""}`}>
        <Outlet />
      </main>

      {isSidebarOpen && (
        <div className="sidebar-backdrop" onClick={closeSidebar} aria-hidden="true" />
      )}
    </div>
  );
}

export default AdminLayout;