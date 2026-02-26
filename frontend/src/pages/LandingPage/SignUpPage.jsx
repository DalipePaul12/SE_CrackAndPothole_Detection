import { useState } from "react";
import "./SignUpPage.css";
import OTPboxes from "./OTPboxes.jsx";

import ConfirmChangesModal from "../PopUps/ConfirmChangesModal.jsx";

//Icons
import { BsFillPersonFill } from "react-icons/bs";
import { MdEmail } from "react-icons/md";
import { FaKey } from "react-icons/fa6";
import { IoIosArrowRoundBack } from "react-icons/io";
import { RiLockPasswordFill } from "react-icons/ri";
import { IoMdDoneAll } from "react-icons/io";
import { BsFillEyeFill, BsFillEyeSlashFill } from "react-icons/bs";


function SignUpPage({ isOpen, onClose, onSwitchToLogin }) {

  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpMessage, setOtpMessage] = useState("");

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");


  const [step, setStep] = useState(1); // Step 1 = signup, Step 2 = OTP, Step 3 = password
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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
      setOtpMessage(`An OTP has been sent to ${formData.email}.`);
      setShowOtpModal(true);
      setStep(2); // move to OTP
    } else {
      alert("Please fill all fields");
    }
  };

  const handlePasswordSubmit = (e) => {
    e.preventDefault();

    if (!formData.password || !formData.confirmPassword) {
      setPasswordMessage("Please fill in all password fields.");
      setShowPasswordModal(true);
      return;
    }

    if (formData.password.length < 8) {
      setPasswordMessage("Your password must be at least 8 characters long.");
      setShowPasswordModal(true);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setPasswordMessage("Passwords do not match. Please review and try again.");
      setShowPasswordModal(true);
      return;
    }

    // Success
    setPasswordMessage("Your account has been successfully created!");
    setShowPasswordModal(true);
  };

  const handlePasswordModalConfirm = () => {
    if (passwordMessage === "Your account has been successfully created!") {
      setShowPasswordModal(false);
      setStep(1);
      onClose();
      onSwitchToLogin();
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
    }

    setShowPasswordModal(false);
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
    setOtpMessage(`A new OTP has been resent to ${formData.email}.`);
    setShowOtpModal(true);

    setFormData(prev => ({ ...prev, otp: "" }));
  };

  /*
  const handleResendOtp = () => {
    alert(`OTP resent to ${formData.email}`);
    setFormData(prev => ({ ...prev, otp: "" }));
  };
*/

  return (
    <div className="sign-up-overlay" onClick={onClose}>
      <div  className={`sign-up-content ${step > 1 ? "signup-small" : ""}`} onClick={(e) => e.stopPropagation()}>
        {/* LEFT COLUMN */}
        <div className="sign-up-left">
          <img src="/snap.jpg" alt="Snap2Fix Logo" className="login-logo" />
          <h1 className="sign-up-title">Snap2Fix</h1>
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
                  <div className="icon-input-signup">
                    <BsFillPersonFill className="icon-signup" />
                  <input
                    type="text"
                    name="name"
                    placeholder="Enter Your Full Name"
                    required
                    onChange={handleChange}
                  />
                   </div>
                </div>

                <div className="sign-up-label-form">
                  <label>Email Address</label>
                  <div className="icon-input-signup">
                    <MdEmail className="icon-signup" />
                  <input
                    type="email"
                    name="email"
                    placeholder="name@gmail.com"
                    required
                    onChange={handleChange}
                  />
                    </div>
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
                    <option value="" disabled hidden>Select Province</option>
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
                    <option value="" disabled hidden>Select City</option>
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
                    placeholder="Select Barangay"
                    required
                    onChange={handleChange}
                    value={formData.barangay}
                  >
                    <option value=""disabled hidden>Select Barangay</option>
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
                <FaKey className="otp-icon-signup-otp" />
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
                  <IoIosArrowRoundBack className="back-icon-otp"/>
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
                  <div className="icon-input-signup">
                    <RiLockPasswordFill className="icon-signup" />
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    placeholder="Enter Password"
                    required
                    onChange={handleChange}
                  />
                    <span className="toggle-eye" onClick={() => setShowPassword((prev) => !prev)}>
                        {showPassword ? <BsFillEyeFill /> : <BsFillEyeSlashFill />}
                    </span>
                  </div>
                </div>

                <div className="sign-up-label-form">
                  <label>Confirm Password</label>
                  <div className="icon-input-signup">
                    <RiLockPasswordFill className="icon-signup" />
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    name="confirmPassword"
                    placeholder="Confirm Password"
                    required
                    onChange={handleChange}
                  />
                  <span className="toggle-eye" onClick={() => setShowConfirmPassword((prev) => !prev)}>
                        {showConfirmPassword ? <BsFillEyeFill /> : <BsFillEyeSlashFill />}
                    </span>
                  </div>
                </div>

                <button className="button-submit-password" type="submit">Finish Sign Up <IoMdDoneAll className="finish-signup"/></button>

                <button
                  type="button"
                  className="button-back-signup"
                  onClick={() => setStep(2)}
                >
                  <IoIosArrowRoundBack className="back-icon-otp"/>
                  Back to OTP
                </button>
              </form>
            </>
          )}
        </div>

        {showOtpModal && (
        <ConfirmChangesModal
          title="OTP Sent"
          message={otpMessage}
          confirmText="OK"
          hideCancel={true}
          variant="info"
          onConfirm={() => setShowOtpModal(false)}
        />
      )}

      {showPasswordModal && (
      <ConfirmChangesModal
        title="Sign Up Status"
        message={passwordMessage}
        confirmText="OK"
        hideCancel={true}
        variant={
          passwordMessage === "Your account has been successfully created!"
            ? "success"
            : "warning"
        }
        onConfirm={handlePasswordModalConfirm}
      />
    )}

      </div>
    </div>
  );
}

export default SignUpPage;
