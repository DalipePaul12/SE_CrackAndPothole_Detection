import { useState, useEffect, useCallback } from "react";
import { Outlet } from "react-router-dom";
import ContractorSidebar from "./ContractorSidebar";
import ContractorHeader from "./ContractorHeader";
import "./ContractorLayout.css";

function ContractorLayout() {
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

  /* Lock body scroll while mobile sidebar is open */
  useEffect(() => {
    document.body.style.overflow = isSidebarOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isSidebarOpen]);

  const toggleSidebar  = useCallback(() => setIsSidebarOpen(prev => !prev), []);
  const closeSidebar   = useCallback(() => setIsSidebarOpen(false), []);
  const toggleCollapse = useCallback(() => setIsCollapsed(prev => !prev), []);

  return (
    <div className="contractor-layout">
      <ContractorSidebar
        isOpen={isSidebarOpen}
        onClose={closeSidebar}
        isCollapsed={isCollapsed}
        onToggleCollapse={toggleCollapse}
      />

      <ContractorHeader
        onMenuClick={toggleSidebar}
        isSidebarOpen={isSidebarOpen}
        isCollapsed={isCollapsed}
      />

      <main className={`contractor-main-content ${isCollapsed ? "collapsed" : ""}`}>
        <Outlet />
      </main>

      {isSidebarOpen && (
        <div className="sidebar-backdrop" onClick={closeSidebar} aria-hidden="true" />
      )}
    </div>
  );
}

export default ContractorLayout;
