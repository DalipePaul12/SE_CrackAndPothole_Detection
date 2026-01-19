import { useState } from "react";
import "./LoginPage.css";

function LoginPage({ isOpen, onClose, onSwitchToSignUp }) {
  const [formData, setFormData] = useState({
    email: "",
    password: ""
  });

  if (!isOpen) return null;

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // BACKEND READY
    try {
      const response = await fetch("http://localhost:5173/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();
      console.log(data);

      // close modal on success
      onClose();
    } catch (error) {
      console.error("Login error:", error);
    }
  };

  return (
    <div className="login-overlay" onClick={onClose}>
      <div className="login-content" onClick={(e) => e.stopPropagation()}>
        {/* LEFT COLUMN */}
        <div className="login-left">
          <img src="/snap.jpg" alt="Snap2Fix Logo" className="login-logo" />
          <h1 className="login-title">Snap2Fix PH</h1>
          <p className="login-slogan">
            Report road damage. Improve safety. Build better streets.
          </p>
        </div>

        <div className="login-right">
            <h2>Welcome Back!</h2>
            <p className="login-instruction">Log in to continue reporting road damages!</p>

            <form onSubmit={handleSubmit}>
              <div className="label-form">
                <label htmlFor="email">Email Address</label>
              <input
                type="email"
                name="email"
                placeholder="name@gmail.com"
                required
                onChange={handleChange}
              />
              </div>

              <div className="label-form">
                <label htmlFor="password">Password</label>
              <input
                type="password"
                name="password"
                placeholder="Password"
                required
                onChange={handleChange}
              />
              </div>

              <button type="submit">Continue</button>
            </form>

            <div className="login-footer">
              <p>Don't have an account? <span className="signup-link" onClick={onSwitchToSignUp}>Sign Up</span></p>
            </div>
          </div>
      </div>
    </div>
  );
}

export default LoginPage;
