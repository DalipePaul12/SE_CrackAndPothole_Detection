import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./LoginPage.css";

import ConfirmChangesModal from "../PopUps/ConfirmChangesModal.jsx";

import { MdEmail } from "react-icons/md";
import { RiLockPasswordFill } from "react-icons/ri";
import { GrFormNextLink } from "react-icons/gr";

import { login } from "../../api/auth";
import { useAuth } from "../../hooks/useAuth";

function LoginPage({ isOpen, onClose, onSwitchToSignUp }) {
  const navigate = useNavigate();
  const { saveLogin } = useAuth();

  const [formData, setFormData] = useState({ email: "", password: "" });
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);

  if (!isOpen) return null;

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setErrorMsg("");
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    try {
      const res = await login(formData.email, formData.password);

      if (!res.success) {
        throw new Error(res.error || "Login failed");
      }

      const data = res.data;

      saveLogin(
        data.access_token,
        data.refresh_token,
        data.user
      );

      onClose();
      setFormData({ email: "", password: "" });

      if (data.user?.role === "admin") {
        navigate("/adminpanel");
      } else {
        navigate("/dashboard");
      }

    } catch (err) {
      setErrorMsg(err.message || "Invalid email or password.");
      setShowErrorModal(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-overlay" onClick={onClose}>
      <div className="login-content" onClick={(e) => e.stopPropagation()}>
        
        <div className="login-left">
          <img src="/snap.jpg" alt="Snap2Fix Logo" className="login-logo" />
          <h1 className="login-title">Snap2Fix</h1>
          <p className="login-slogan">
            Report road damage. Improve safety. Build better streets.
          </p>
        </div>

        <div className="login-right">
          <h2>Welcome Back!</h2>
          <p className="login-instruction">
            Log in to continue reporting road damages!
          </p>

          <form onSubmit={handleLoginSubmit}>
            <div className="label-form">
              <label>Email Address</label>
              <div className="email-icon-wrapper">
                <MdEmail className="email-icon" />
                <input
                  type="email"
                  name="email"
                  placeholder="name@gmail.com"
                  required
                  value={formData.email}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div className="label-form">
              <label>Password</label>
              <div className="password-icon-wrapper">
                <RiLockPasswordFill className="password-icon" />
                <input
                  type="password"
                  name="password"
                  placeholder="Password"
                  required
                  value={formData.password}
                  onChange={handleChange}
                />
              </div>
            </div>

            <button type="submit" disabled={loading}>
              {loading ? "Logging in..." : "Continue"}
              {!loading && <GrFormNextLink className="next-icon" />}
            </button>
          </form>

          <div className="login-footer">
            <p>
              Don't have an account?{" "}
              <span className="signup-link" onClick={onSwitchToSignUp}>
                Sign Up
              </span>
            </p>
          </div>
        </div>

        {showErrorModal && (
          <ConfirmChangesModal
            title="Login Failed"
            message={errorMsg}
            confirmText="Try Again"
            variant="warning"
            hideCancel={true}
            onConfirm={() => setShowErrorModal(false)}
          />
        )}

      </div>
    </div>
  );
}

export default LoginPage;