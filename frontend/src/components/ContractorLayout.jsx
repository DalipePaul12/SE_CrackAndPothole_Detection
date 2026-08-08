import { useState, useEffect, useCallback } from "react";
import { Outlet } from "react-router-dom";
import ContractorSidebar from "./ContractorSidebar";
import ContractorHeader from "./ContractorHeader";
import ContractorBottomNav from "./ContractorBottomNav";
import "./ContractorLayout.css";

function ContractorLayout() {
  const [isCollapsed, setIsCollapsed] = useState(() => window.innerWidth < 1024);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsCollapsed(mobile);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const toggleCollapse = useCallback(() => setIsCollapsed(prev => !prev), []);

  return (
    <div className="contractor-layout">
      <ContractorSidebar
        isCollapsed={isCollapsed}
        onToggleCollapse={toggleCollapse}
      />

      <ContractorHeader isCollapsed={isCollapsed} />

      <main className={`contractor-main-content ${isCollapsed ? "collapsed" : ""}`}>
        <Outlet />
      </main>

      <ContractorBottomNav />
    </div>
  );
}

export default ContractorLayout;