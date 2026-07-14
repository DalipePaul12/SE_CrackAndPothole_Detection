import { useNavigate } from "react-router-dom";
import { FaRoad } from "react-icons/fa";
import "./NotFound.css";

function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="notfound-container">
      <div className="notfound-content">
        <FaRoad className="notfound-icon" />
        <h1>404</h1>
        <h2>Road Not Found</h2>
        <p>
          Looks like this road hasn't been mapped yet. The page you're
          looking for doesn't exist or may have been moved.
        </p>
        <div className="notfound-buttons">
          <button className="primary-btn" onClick={() => navigate("/")}>
            Back to Home
          </button>
          <button className="secondary-btn" onClick={() => navigate(-1)}>
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
}

export default NotFound;
