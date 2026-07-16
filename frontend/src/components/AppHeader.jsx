import "./AppHeader.css";
import { Menu, X } from "lucide-react";

function AppHeader({ onMenuClick, isCollapsed, isSidebarOpen }) {
  return (
    <header className={`app-header ${isCollapsed ? "collapsed" : ""}`}>
      {/* LEFT — hamburger + title */}
      <div className="app-header-left">
        <button className="burger-btn" onClick={onMenuClick} aria-label="Toggle sidebar">
          {isSidebarOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
        <h2>Snap2Fix</h2>
      </div>

      <div className="app-header-right" />
    </header>
  );
}

export default AppHeader;