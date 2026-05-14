import { useState } from "react";
import "./SignUpPage.css";
import OTPboxes from "./OTPboxes.jsx";

import ConfirmChangesModal from "../PopUps/ConfirmChangesModal.jsx";

import { BsFillPersonFill } from "react-icons/bs";
import { MdEmail } from "react-icons/md";
import { FaKey } from "react-icons/fa6";
import { IoIosArrowRoundBack } from "react-icons/io";
import { RiLockPasswordFill } from "react-icons/ri";
import { IoMdDoneAll } from "react-icons/io";
import { BsFillEyeFill, BsFillEyeSlashFill } from "react-icons/bs";

import { register, verifyOtp } from "../../api/auth";

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

  const [modal, setModal] = useState({ show: false, title: "", message: "", variant: "info", onConfirm: null });

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

  const handleSignUpSubmit = async (e) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      showModal("Password Mismatch", "Passwords do not match. Please review and try again.", "warning", () => setModal({ ...modal, show: false }));
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
        throw res.error || new Error("Registration failed.");
      }

      showModal("OTP Sent", `A verification code has been sent to ${formData.email}.`, "info", () => setModal({ ...modal, show: false }));
      setStep(2);
    } catch (err) {
      const msg = extractErrorMessage(err) || "Registration failed. The email may already be in use.";
      showModal("Sign Up Failed", msg, "warning", () => setModal({ ...modal, show: false }));
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e) => {
    e.preventDefault();

    if (formData.otp.length !== 6) {
      showModal("Invalid OTP", "Please enter the complete 6-digit code.", "warning", () => setModal({ ...modal, show: false }));
      return;
    }

    setLoading(true);
    try {
      const res = await verifyOtp(formData.email, formData.otp, "email_verify");

      if (!res.success) {
        throw res.error || new Error("Verification failed.");
      }

      showModal(
        "Account Created!",
        "Your account has been successfully verified. You can now log in.",
        "success",
        () => {
          setModal({ ...modal, show: false });
          setStep(1);
          setFormData({ full_name: "", email: "", password: "", confirmPassword: "", city: "", barangay: "", street: "", otp: "" });
          onClose();
          onSwitchToLogin();
        }
      );
    } catch (err) {
      const msg = extractErrorMessage(err) || "Invalid or expired OTP. Please try again.";
      showModal("Verification Failed", msg, "warning", () => setModal({ ...modal, show: false }));
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    try {
      const { requestOtp } = await import("../../api/auth");
      await requestOtp(formData.email, "email_verify");
      showModal("OTP Resent", `A new code has been sent to ${formData.email}.`, "info", () => setModal({ ...modal, show: false }));
      setFormData((prev) => ({ ...prev, otp: "" }));
    } catch {
      showModal("Error", "Failed to resend OTP. Please wait a moment and try again.", "warning", () => setModal({ ...modal, show: false }));
    }
  };

  return (
    <div className="sign-up-overlay" onClick={onClose}>
      <div className={`sign-up-content ${step === 2 ? "signup-small" : ""}`} onClick={(e) => e.stopPropagation()}>

        <div className="sign-up-left">
          <img src="/snap.jpg" alt="Snap2Fix Logo" className="login-logo" />
          <h1 className="sign-up-title">Snap2Fix</h1>
          <p className="sign-up-slogan">
            Report road damage. Improve safety. Build better streets.
          </p>
        </div>

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
                      placeholder="name@gmail.com"
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
                      <option value="...">...</option>
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
                      <option value="Barangay 1">Panghulo</option>
                      <option value="Barangay 2">Barangay 2</option>
                      <option value="Barangay 3">Barangay 3</option>
                    </select>
                  </div>
                </div>

                <div className="sign-up-label-form">
                  <label>Street Address <span style={{ fontWeight: 400, fontSize: "0.85em", opacity: 0.6 }}>(optional)</span></label>
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
                    />
                    <span className="toggle-eye" onClick={() => setShowPassword((p) => !p)}>
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
                      placeholder="Re-enter password"
                      required
                      value={formData.confirmPassword}
                      onChange={handleChange}
                    />
                    <span className="toggle-eye" onClick={() => setShowConfirmPassword((p) => !p)}>
                      {showConfirmPassword ? <BsFillEyeFill /> : <BsFillEyeSlashFill />}
                    </span>
                  </div>
                </div>

                <button type="submit" disabled={loading}>
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
                    length={6}
                    onChange={(otp) => setFormData((prev) => ({ ...prev, otp }))}
                  />
                </div>

                <button className="button-submit-otp" type="submit" disabled={loading || formData.otp.length !== 6}>
                  {loading ? "Verifying..." : "Verify and Finish"}
                </button>

                <button className="button-back-signup" type="button" onClick={() => setStep(1)}>
                  <IoIosArrowRoundBack className="back-icon-otp" />
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