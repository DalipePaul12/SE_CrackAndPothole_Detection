import { useState } from "react";
import "./SignUpPage.css";

function SignUpPage({ isOpen, onClose, onSwitchToLogin }) {
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
    <div className="sign-up-overlay" onClick={onClose}>
      <div className="sign-up-content" onClick={(e) => e.stopPropagation()}>
        {/* LEFT COLUMN */}
        <div className="sign-up-left">
          <img src="/snap.jpg" alt="Snap2Fix Logo" className="login-logo" />
          <h1 className="sign-up-title">Snap2Fix PH</h1>
          <p className="sign-up-slogan">
            Report road damage. Improve safety. Build better streets.
          </p>
        </div>

        <div className="sign-up-right">
            <h2>Welcome!</h2>
            <p className="sign-up-instruction">Join the community efforts to fix our streets!</p>

            <form onSubmit={handleSubmit}>
              <div className="sign-up-label-form">
                <label htmlFor="email">Full Name</label>
              <input
                type="email"
                name="email"
                placeholder="Enter Your Full Name"
                required
                onChange={handleChange}
              />
              </div>

              <div className="sign-up-label-form">
                <label htmlFor="email">Email Address</label>
              <input
                type="email"
                name="email"
                placeholder="name@gmail.com"
                required
                onChange={handleChange}
              />
              </div>

              <div className="sign-up-label-form">
                <label htmlFor="password">Password</label>
              <input
                type="password"
                name="password"
                placeholder="Password"
                required
                onChange={handleChange}
              />
              </div>

              <button type="submit">Create Account</button>
            </form>

            <div className="sign-up-footer">
              <p>Already a member? <span className="login-link" onClick={onSwitchToLogin}>Login</span></p>
            </div>
          </div>
      </div>
    </div>
  );
}

export default SignUpPage;
