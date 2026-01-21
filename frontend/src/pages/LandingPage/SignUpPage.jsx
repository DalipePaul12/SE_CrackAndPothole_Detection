import { useState } from "react";
import "./SignUpPage.css";
import OTPboxes from "./OTPboxes.jsx";

function SignUpPage({ isOpen, onClose, onSwitchToLogin }) {
  const [step, setStep] = useState(1); // Step 1 = signup, Step 2 = OTP, Step 3 = password
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    city: "",
    barangay: "",
    province: "",
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

    if (formData.name && formData.email /*&& formData.password*/) {
      /*console.log("signup success");*/
      alert(`OTP sent to ${formData.email}`);
      setStep(2); // move to OTP
    } else {
      alert("Please fill all fields");
    }
  };

  const handlePasswordSubmit = (e) => {
  e.preventDefault();

  if (!formData.password || !formData.confirmPassword) {
    alert("Please fill all password fields");
    return;
  }

  if (formData.password !== formData.confirmPassword) {
    alert("Passwords do not match");
    return;
  }

  alert("signup successful!");
  onClose();
  setStep(1);
  setFormData({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    city: "",
    barangay: "",
    province: "",
    otp: ""
  });
};


  const handleOtpSubmit = (e) => {
    e.preventDefault();

    if (formData.otp.length === 6) {
      setStep(3); // move to password panel
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
      <div  className={`sign-up-content ${step > 1 ? "signup-small" : ""}`} onClick={(e) => e.stopPropagation()}>
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

                <div className="sign-up-label-form-province-city"> 
                <div className="sign-up-label-form">
                  <label>Province</label>
                  <select
                    name="province"
                    placeholder="Select Province"
                    required
                    onChange={handleChange}
                    value={formData.province}
                  >
                    <option value="">Select Province</option>
                    <option value="Metro Manila">Metro Manila</option>
                    <option value="Cebu">Cebu</option>
                    <option value="Davao del Sur">Davao del Sur</option>
                  </select>
                </div>

                <div className="sign-up-label-form">
                  <label>City / Municipality</label>
                  <select
                    name="city"
                    placeholder="Select City"
                    required
                    onChange={handleChange}
                    value={formData.city}
                  >
                    <option value="">Select City</option>
                    <option value="Quezon City">Quezon City</option>
                    <option value="Makati">Makati</option>
                    <option value="Cebu City">Cebu City</option>
                  </select>
                </div>
                </div>

                <div className="sign-up-label-form">
                  <label>Barangay</label>
                  <select
                    name="barangay"
                    required
                    onChange={handleChange}
                    value={formData.barangay}
                  >
                    <option value="">Select Barangay</option>
                    <option value="Barangay 1">Barangay 1</option>
                    <option value="Barangay 2">Barangay 2</option>
                    <option value="Barangay 3">Barangay 3</option>
                  </select>
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

                <button className="button-submit-otp" type="submit" disabled={formData.otp.length !== 6}>
                  Verify and Continue
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

          {step === 3 && (
            <>
              <div className="password-title-signup">
                <h2>Set Your Password</h2>
                <p className="sign-up-instruction">
                  Create a secure password for your account.
                </p>
              </div>

              <form onSubmit={handlePasswordSubmit}>
                <div className="sign-up-label-form">
                  <label>Password</label>
                  <input
                    type="password"
                    name="password"
                    placeholder="Enter Password"
                    required
                    onChange={handleChange}
                  />
                </div>

                <div className="sign-up-label-form">
                  <label>Confirm Password</label>
                  <input
                    type="password"
                    name="confirmPassword"
                    placeholder="Confirm Password"
                    required
                    onChange={handleChange}
                  />
                </div>

                <button className="button-submit-password" type="submit">Finish Sign Up</button>

                <button
                  type="button"
                  className="button-back-signup"
                  onClick={() => setStep(2)}
                >
                  Back to OTP
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default SignUpPage;
