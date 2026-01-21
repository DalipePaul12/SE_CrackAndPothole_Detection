import { useState } from "react";
import "./SignUpPage.css";
import OTPboxes from "./OTPboxes.jsx";

function SignUpPage({ isOpen, onClose, onSwitchToLogin }) {
  const [step, setStep] = useState(1); // Step 1 = signup, Step 2 = OTP
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    otp: ""
  });

  if (!isOpen) return null;

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  // Frontend-only simulation of signup
  const handleSignUpSubmit = (e) => {
    e.preventDefault();

    if (formData.name && formData.email && formData.password) {
      console.log("Frontend-only signup success");
      setStep(2); // move to OTP
    } else {
      alert("Please fill all fields");
    }
  };

  const handleOtpSubmit = (e) => {
    e.preventDefault();

    if (formData.otp.length >= 4) {
      alert("Frontend-only signup successful!");
      onClose();
      setStep(1);
      setFormData({ name: "", email: "", password: "", otp: "" });
    } else {
      alert("Please enter OTP");
    }
  };

  const handleResendOtp = () => {
    alert(`OTP resent to ${formData.email}`);
    setFormData(prev => ({ ...prev, otp: "" }));
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

        {/* RIGHT COLUMN */}
        <div className="sign-up-right">
          {step === 1 && (
            <>
              <h2>Join Us!</h2>
              <p className="sign-up-instruction">Create an account to start reporting road damages.</p>

              <form onSubmit={handleSignUpSubmit}>
                <div className="sign-up-label-form">
                  <label>Full Name</label>
                  <input
                    type="text"
                    name="name"
                    placeholder="Enter Your Full Name"
                    required
                    onChange={handleChange}
                  />
                </div>

                <div className="sign-up-label-form">
                  <label>Email Address</label>
                  <input
                    type="email"
                    name="email"
                    placeholder="name@gmail.com"
                    required
                    onChange={handleChange}
                  />
                </div>

                <div className="sign-up-label-form">
                  <label>Password</label>
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
                <p>
                  Already a member?{" "}
                  <span className="login-link" onClick={onSwitchToLogin}>Login</span>
                </p>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="otp-title-signup">
                <h2>Check Your Email</h2>
                <p className="sign-up-instruction">
                  We have sent a one-time code to your email.
                </p>
              </div>

              <form onSubmit={handleOtpSubmit}>
                <div className="label-form-otp">
                  <label>One-Time-Password Code</label>
                  <OTPboxes
                    length={6}
                    onChange={(otp) =>
                      setFormData((prev) => ({ ...prev, otp }))
                    }
                  />
                </div>

                <button className="button-submit-otp" type="submit">
                  Verify and Create Account
                </button>
                <button className="button-back-signup" type="button" onClick={() => setStep(1)}>
                  Back To Sign Up
                </button>
              </form>

              <div className="otp-footer-signup">
                <p>
                  Didn't receive the code?{" "}
                  <span className="resend-link" onClick={handleResendOtp}>
                    Resend
                  </span>
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default SignUpPage;
