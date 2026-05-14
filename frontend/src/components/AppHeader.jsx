import "./AppHeader.css";
import { FaBars } from "react-icons/fa";

function AppHeader({ onMenuClick, isCollapsed }) {
  return (
    <header className={`app-header ${isCollapsed ? "collapsed" : ""}`}>
      {/* LEFT SIDE */}
      <div className="app-header-left">
        <button className="burger-btn" onClick={onMenuClick} aria-label="Toggle sidebar">
          <FaBars />
        </button>

        <h2>Snap2Fix</h2>
      </div>

      {/* Right side intentionally left empty */}
      <div className="app-header-right" />
    </header>
  );
}

export default AppHeader;