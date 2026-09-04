// SignUpPage.jsx
import { useState } from "react";
import "./SignUpPage.css";
import OTPboxes from "./OTPboxes.jsx";
import { api } from "../../api/client";

import ConfirmChangesModal from "../PopUps/ConfirmChangesModal.jsx";

import { BsFillPersonFill } from "react-icons/bs";
import { MdEmail } from "react-icons/md";
import { FaKey } from "react-icons/fa6";
import { IoIosArrowRoundBack } from "react-icons/io";
import { RiLockPasswordFill } from "react-icons/ri";
import { IoMdDoneAll } from "react-icons/io";
import { BsFillEyeFill, BsFillEyeSlashFill } from "react-icons/bs";
import { IoClose } from "react-icons/io5";

import { register } from "../../api/auth";

function extractErrorMessage(err) {
  if (err?.response?.status === 422) {
    const detail = err?.response?.data?.detail;
    if (Array.isArray(detail)) {
      return detail.map((d) => d.msg || d.message || JSON.stringify(d)).join(" ");
    }
    if (typeof detail === "string") return detail;
  }
  return err?.detail || err?.message || null;
}

function SignUpPage({ isOpen, onClose, onSwitchToLogin }) {
  const [step, setStep] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [otpKey, setOtpKey] = useState(0); // forces OTPboxes remount on error/resend

  const [modal, setModal] = useState({
    show: false, title: "", message: "", variant: "info", onConfirm: null,
  });

  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    password: "",
    confirmPassword: "",
    city: "",
    barangay: "",
    street: "",
    otp: "",
  });

  if (!isOpen) return null;

  const showModal = (title, message, variant, onConfirm) => {
    setModal({ show: true, title, message, variant, onConfirm });
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const passwordChecks = {
    lowercase: /[a-z]/.test(formData.password),
    uppercase: /[A-Z]/.test(formData.password),
    number: /[0-9]/.test(formData.password),
    symbol: /[^A-Za-z0-9]/.test(formData.password),
    length: formData.password.length >= 8,
  };

  const isPasswordValid = Object.values(passwordChecks).every(Boolean);

  const handleSignUpSubmit = async (e) => {
    e.preventDefault();

    if (!isPasswordValid) {
      showModal(
        "Weak Password",
        "Please meet all password requirements before continuing.",
        "warning",
        () => setModal((m) => ({ ...m, show: false }))
      );
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      showModal(
        "Password Mismatch",
        "Passwords do not match. Please review and try again.",
        "warning",
        () => setModal((m) => ({ ...m, show: false }))
      );
      return;
    }

    setLoading(true);
    try {
      const res = await register({
        full_name: formData.full_name,
        email: formData.email,
        password: formData.password,
        city: formData.city,
        barangay: formData.barangay,
        street: formData.street || undefined,
      });

      if (!res.success) {
        throw new Error(res.error || "Registration failed."); 
      }

      showModal(
        "OTP Sent",
        `A verification code has been sent to ${formData.email}.`,
        "info",
        () => setModal((m) => ({ ...m, show: false }))
      );
      setStep(2);
    } catch (err) {
      const msg = extractErrorMessage(err) || "Registration failed. The email may already be in use.";
      showModal("Sign Up Failed", msg, "warning", () => setModal((m) => ({ ...m, show: false })));
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e) => {
    e.preventDefault();

    if (formData.otp.length !== 6) {
      showModal(
        "Invalid OTP",
        "Please enter the complete 6-digit code.",
        "warning",
        () => setModal((m) => ({ ...m, show: false }))
      );
      return;
    }

    setLoading(true);
    try {
      const res = await api.post("/auth/verify-email-otp", {
        email: formData.email,
        code: formData.otp,
      });

      if (!res.success) throw new Error(res.error || "Verification failed.");

      showModal(
        "Account Created!",
        "Your account has been verified. You can now log in.",
        "success",
        () => {
          setModal((m) => ({ ...m, show: false }));
          setStep(1);
          setOtpKey(0);
          setFormData({
            full_name: "", email: "", password: "", confirmPassword: "",
            city: "", barangay: "", street: "", otp: "",
          });
          onClose();
          onSwitchToLogin();
        }
      );
    } catch (err) {
      const msg = extractErrorMessage(err) || "Invalid or expired OTP. Please try again.";
      showModal("Verification Failed", msg, "warning", () => setModal((m) => ({ ...m, show: false })));
      setFormData((prev) => ({ ...prev, otp: "" }));
      setOtpKey((k) => k + 1); // remount OTPboxes — resets hasSubmitted and clears boxes
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    try {
      const res = await api.post("/auth/resend-email-otp", { email: formData.email });
      if (!res.success) throw new Error(res.error || "Failed to resend.");
      showModal(
        "OTP Resent",
        `A new code has been sent to ${formData.email}.`,
        "info",
        () => setModal((m) => ({ ...m, show: false }))
      );
      setFormData((prev) => ({ ...prev, otp: "" }));
      setOtpKey((k) => k + 1); // remount to restart timer and clear boxes
    } catch {
      showModal(
        "Error",
        "Failed to resend OTP. Please wait a moment and try again.",
        "warning",
        () => setModal((m) => ({ ...m, show: false }))
      );
    }
  };

  return (
    <div className="sign-up-overlay" onClick={onClose}>
      <div
        className={`sign-up-content ${step === 2 ? "signup-small" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="signup-close-btn" onClick={onClose} aria-label="Close sign up modal">
          <IoClose />
        </button>

        <div className="sign-up-left">
          <img src="/snap.jpg" alt="Snap2Fix Logo" className="sign-up-logo" />
          <h1 className="sign-up-title">Snap2Fix</h1>
          <p className="sign-up-slogan">
            Report road damage. Improve safety. Build better streets.
          </p>
        </div>

        <div className="sign-up-right">
          {step === 1 && (
            <>
              <h2>Join Us!</h2>
              <p className="sign-up-instruction">
                Create an account to start reporting road damages.
              </p>

              <form onSubmit={handleSignUpSubmit}>
                <div className="sign-up-label-form">
                  <label>Full Name</label>
                  <div className="icon-input-signup">
                    <BsFillPersonFill className="icon-signup" />
                    <input
                      type="text"
                      name="full_name"
                      placeholder="Enter Your Full Name"
                      required
                      value={formData.full_name}
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
                      placeholder="Enter Your Email Address"
                      required
                      value={formData.email}
                      onChange={handleChange}
                    />
                  </div>
                </div>

                <div className="sign-up-label-form-province-city">
                  <div className="sign-up-label-form">
                    <label>City / Municipality</label>
                    <select
                      name="city"
                      required
                      value={formData.city}
                      onChange={handleChange}
                    >
                      <option value="" disabled hidden>Select City</option>
                      <option value="Malabon City">Malabon City</option>
                    </select>
                  </div>

                  <div className="sign-up-label-form">
                    <label>Barangay</label>
                    <select
                      name="barangay"
                      required
                      value={formData.barangay}
                      onChange={handleChange}
                    >
                      <option value="" disabled hidden>Select Barangay</option>
                      <option value="Panghulo">Panghulo</option>
                    </select>
                  </div>
                </div>

                <div className="sign-up-label-form">
                  <label>
                    Street Address <span className="label-optional">(optional)</span>
                  </label>
                  <div className="icon-input-signup">
                    <input
                      type="text"
                      name="street"
                      placeholder="e.g. 123 Rizal St."
                      value={formData.street}
                      onChange={handleChange}
                    />
                  </div>
                </div>

                <div className="sign-up-label-form">
                  <label>Password</label>
                  <div className="icon-input-signup">
                    <RiLockPasswordFill className="icon-signup" />
                    <input
                      type={showPassword ? "text" : "password"}
                      name="password"
                      placeholder="Min. 8 chars, 1 uppercase, 1 number, 1 symbol"
                      required
                      value={formData.password}
                      onChange={handleChange}
                      onFocus={() => setPasswordFocused(true)}
                    />
                    <span
                      className="toggle-eye"
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); setShowPassword((p) => !p); }}
                      role="button"
                      tabIndex={0}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <BsFillEyeFill /> : <BsFillEyeSlashFill />}
                    </span>
                  </div>

                  {(passwordFocused || formData.password) && (
                    <div className="password-requirements">
                      <p className="password-req-title">Password must contain:</p>
                      <ul>
                        <li className={passwordChecks.lowercase ? "req-pass" : "req-fail"}>
                          <span className="req-icon">{passwordChecks.lowercase ? "✓" : "✕"}</span>
                          At least one lowercase letter
                        </li>
                        <li className={passwordChecks.uppercase ? "req-pass" : "req-fail"}>
                          <span className="req-icon">{passwordChecks.uppercase ? "✓" : "✕"}</span>
                          At least one uppercase letter
                        </li>
                        <li className={passwordChecks.number ? "req-pass" : "req-fail"}>
                          <span className="req-icon">{passwordChecks.number ? "✓" : "✕"}</span>
                          At least one number
                        </li>
                        <li className={passwordChecks.symbol ? "req-pass" : "req-fail"}>
                          <span className="req-icon">{passwordChecks.symbol ? "✓" : "✕"}</span>
                          At least one symbol
                        </li>
                        <li className={passwordChecks.length ? "req-pass" : "req-fail"}>
                          <span className="req-icon">{passwordChecks.length ? "✓" : "✕"}</span>
                          Minimum 8 characters
                        </li>
                      </ul>
                    </div>
                  )}
                </div>

                <div className="sign-up-label-form">
                  <label>Confirm Password</label>
                  <div className="icon-input-signup">
                    <RiLockPasswordFill className="icon-signup" />
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      name="confirmPassword"
                      placeholder="Re-enter password"
                      required
                      value={formData.confirmPassword}
                      onChange={handleChange}
                    />
                    <span
                      className="toggle-eye"
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); setShowConfirmPassword((p) => !p); }}
                      role="button"
                      tabIndex={0}
                      aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                    >
                      {showConfirmPassword ? <BsFillEyeFill /> : <BsFillEyeSlashFill />}
                    </span>
                  </div>

                  {formData.confirmPassword && (
                    <div className={`password-match-msg ${formData.password === formData.confirmPassword ? "match-pass" : "match-fail"}`}>
                      <span className="req-icon">
                        {formData.password === formData.confirmPassword ? "✓" : "✕"}
                      </span>
                      {formData.password === formData.confirmPassword ? "Passwords match" : "Passwords do not match"}
                    </div>
                  )}
                </div>

                <button type="submit" disabled={loading || !isPasswordValid}>
                  {loading ? "Creating Account..." : "Create Account"}
                  {!loading && <IoMdDoneAll className="finish-signup" />}
                </button>
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
                  We sent a 6-digit code to <strong>{formData.email}</strong>.
                </p>
                <FaKey className="otp-icon-signup-otp" />
              </div>

              <form onSubmit={handleOtpSubmit}>
                <div className="label-form-otp">
                  <label>One-Time-Password Code</label>
                  <OTPboxes
                    key={otpKey}
                    length={6}
                    email={formData.email}
                    onComplete={(otp) => setFormData((prev) => ({ ...prev, otp }))}
                    onResend={handleResendOtp}
                    disabled={loading}
                    cooldownSeconds={60}
                  />
                </div>

                <button
                  className="button-submit-otp"
                  type="submit"
                  disabled={loading || formData.otp.length !== 6}
                >
                  {loading ? "Verifying..." : "Verify and Finish"}
                </button>

                <button
                  className="button-back-signup"
                  type="button"
                  onClick={() => setStep(1)}
                >
                  <IoIosArrowRoundBack className="back-icon-otp" />
                  Back To Sign Up
                </button>
              </form>
            </>
          )}
        </div>

        {modal.show && (
          <ConfirmChangesModal
            title={modal.title}
            message={modal.message}
            confirmText="OK"
            variant={modal.variant}
            hideCancel={true}
            onConfirm={modal.onConfirm}
          />
        )}
      </div>
    </div>
  );
}

export default SignUpPage;