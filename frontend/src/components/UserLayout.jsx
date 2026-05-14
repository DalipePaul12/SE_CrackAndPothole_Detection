import { useState, useEffect, useCallback } from "react";
import { Outlet } from "react-router-dom";
import UserSidebar from "./UserSidebar";
import AppHeader from "./AppHeader";
import "./UserLayout.css";

function UserLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => window.innerWidth < 1024);

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

  const toggleSidebar = useCallback(() => setIsSidebarOpen(prev => !prev), []);
  const closeSidebar = useCallback(() => setIsSidebarOpen(false), []);
  const toggleCollapse = useCallback(() => setIsCollapsed(prev => !prev), []);

  return (
    <div className="user-layout">
      <button className="mobile-menu-btn" onClick={toggleSidebar} aria-label="Toggle sidebar">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {isSidebarOpen ? (
            <path d="M18 6L6 18M6 6l12 12" />
          ) : (
            <>
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </>
          )}
        </svg>
      </button>

      <UserSidebar 
        isOpen={isSidebarOpen}
        onClose={closeSidebar}
        isCollapsed={isCollapsed}
        onToggleCollapse={toggleCollapse}
      />

      {/* Pass both toggle and collapse state */}
      <AppHeader 
        onMenuClick={toggleSidebar} 
        isCollapsed={isCollapsed}
      />

      <main className={`user-main-content ${isCollapsed ? 'collapsed' : ''}`}>
        <Outlet />
      </main>

      {isSidebarOpen && <div className="sidebar-backdrop" onClick={closeSidebar} />}
    </div>
  );
}

export default UserLayout;