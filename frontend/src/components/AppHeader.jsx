import "./AppHeader.css";
import { useNavigate } from "react-router-dom";
import { FaUserCircle, FaSignOutAlt } from "react-icons/fa";

function AppHeader() {
  const navigate = useNavigate();

  const handleLogout = () => {
    navigate("/");
  };

  return (
    <header className="app-header">
      {/* LEFT SIDE*/}
      <div className="app-header-left">
        <h2>Snap2Fix PH</h2>
      </div>

      {/* RIGHT SIDE*/}
      <div className="app-header-right">
        <span className="user-name">User</span>
        <FaUserCircle className="profile-icon" />

        <button className="logout-btn " onClick={handleLogout}>
          <FaSignOutAlt />
          Logout
        </button>
      </div>
    </header>
  );
}

export default AppHeader;
