import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./LoginPage.css";
import OTPboxes from "./OTPboxes.jsx";

// Icons
import { MdEmail } from "react-icons/md";
import { RiLockPasswordFill } from "react-icons/ri";
import { FaKey } from "react-icons/fa6";
import { GrFormNextLink } from "react-icons/gr";
import { IoIosArrowRoundBack } from "react-icons/io";

function LoginPage({ isOpen, onClose, onSwitchToSignUp }) {
  const [step, setStep] = useState(1); // Step 1 = login, Step 2 = OTP
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    otp: ""
  });

  const handleResendOtp = () => {
    // For frontend only
    alert(`OTP resent to ${formData.email}`);
    
    setFormData(prev => ({ ...prev, otp: "" }));
  };

  /* BackEnd Ready
  const handleResendOtp = async () => {
  try {
    const response = await fetch("http://localhost:5173/resend-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: formData.email })
    });

    const data = await response.json();

    if (data.success) {
      alert("OTP resent successfully!");
      setFormData(prev => ({ ...prev, otp: "" }));
    } else {
      alert("Failed to resend OTP. Try again.");
    }
  } catch (error) {
    console.error("Resend OTP error:", error);
  }
};
*/


  if (!isOpen) return null;

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  // STEP 1: Login Submission
  const handleLoginSubmit = async (e) => {
    e.preventDefault();

    /*  BACKEND READY 
    try {
      const response = await fetch("http://localhost:5173/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password
        })
      });

      const data = await response.json();
      console.log("Login Response:", data);

      if (data.success && data.otpSent) {
        setStep(2);
      } else {
        alert("Invalid email or password");
      }
    } catch (error) {
      console.error("Login error:", error);
    }
    ================================================= */

    // FRONTEND-ONLY 
    if (formData.email && formData.password) {
      console.log("login success");
      setStep(2); // move to OTP
    } else {
      alert("Please enter email and password");
    }
  };

  // STEP 2: OTP Verification
  const handleOtpSubmit = async (e) => {
    e.preventDefault();

    /*  BACKEND READY 
    try {
      const response = await fetch("http://localhost:5173/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email,
          otp: formData.otp
        })
      });

      const data = await response.json();
      console.log("OTP response:", data);

      if (data.success) {
        alert("Login successful!");
        onClose();
        setStep(1);
      } else {
        alert("Invalid OTP, try again");
      }
    } catch (error) {
      console.error("OTP error:", error);
    }
    ================================================= */

    //FRONTEND-ONLY 
    if (formData.otp.length >= 4) {
      alert("login successful!");
      onClose();
      setStep(1);
      setFormData({ email: "", password: "", otp: "" });

      // Navigate to Dashboard
      navigate("/dashboard");
      
    } else {
      alert("Please enter OTP");
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

        {/* RIGHT COLUMN */}
        <div className="login-right">
          {step === 1 && (
            <>
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
                    onChange={handleChange}
                  />
                  </div>
                </div>

                <button type="submit">Continue <GrFormNextLink className="next-icon"/></button>
              </form>
            </>
          )}

          {step === 2 && (
            <>
            <div className="otp-title">
              <h2>Check Your Email</h2>
              <p className="login-instruction">
                We have sent a one-time code to your email.
              </p>
              <FaKey className="otp-icon" />
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

                <button className="button-submit-otp" type="submit">Verify and Access Dashboard</button>
                <button className="button-back" type="button" onClick={() => setStep(1)}> <IoIosArrowRoundBack className="back-icon"/>  Back To Login</button>
              </form>
                
                <div className="otp-footer">
              <p>
                Didn't receive the code?{" "}
                <span className="resend-link" onClick={handleResendOtp}>
                  Resend
                </span>
              </p>
            </div>
            </>
          )}

          {step === 1 && (
            <div className="login-footer">
              <p>
                Don't have an account?{" "}
                <span className="signup-link" onClick={onSwitchToSignUp}>
                  Sign Up
                </span>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
