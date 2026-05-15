import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./LoginPage.css";

import ConfirmChangesModal from "../PopUps/ConfirmChangesModal.jsx";
import OTPboxes from "./OTPboxes.jsx";

import { MdEmail } from "react-icons/md";
import { RiLockPasswordFill } from "react-icons/ri";
import { GrFormNextLink } from "react-icons/gr";
import { IoClose } from "react-icons/io5";
import { FaArrowLeft } from "react-icons/fa";
import { BsFillEyeFill, BsFillEyeSlashFill } from "react-icons/bs";

import { login, verifyLoginOTP, resendLoginOTP } from "../../api/auth";
import { api } from "../../api/client";
import { useAuthContext } from "../Contexts/AuthContext.jsx";

function LoginPage({ isOpen, onClose, onSwitchToSignUp }) {
  const navigate = useNavigate();
  const { saveLogin } = useAuthContext();

  const [step, setStep] = useState("credentials");
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [maskedEmail, setMaskedEmail] = useState("");
  const [resendKey, setResendKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [forgotEmail, setForgotEmail] = useState("");
  const [resetOtp, setResetOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [resetOtpKey, setResetOtpKey] = useState(0);

  if (!isOpen) return null;

  const showError = (msg) => {
    setErrorMsg(msg);
    setShowErrorModal(true);
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setErrorMsg("");
  };

  const handleBack = () => {
    setStep("credentials");
    setErrorMsg("");
  };

  const completeLogin = (data) => {
    saveLogin(data.access_token, data.refresh_token ?? null, data.user ?? null);
    onClose();
    setFormData({ email: "", password: "" });
    setStep("credentials");
    setResendKey(0);
    const role = data.user?.role;
    if (role === "admin" || role === "superadmin") {
      navigate("/adminpanel");
    } else {
      navigate("/dashboard");
    }
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await login(formData.email, formData.password);
      if (!res.success) {
        const errText = res.error || "Login failed";
        if (errText.includes("429") || errText.includes("Too many")) {
          throw new Error("Too many failed attempts. Please wait a few minutes.");
        }
        throw new Error(errText);
      }
      const data = res.data;
      if (data?.otp_required) {
        setMaskedEmail(data.email || formData.email);
        setStep("otp");
        setLoading(false);
        return;
      }
      completeLogin(data);
    } catch (err) {
      showError(err.message || "Invalid email or password.");
      setLoading(false);
    }
  };

  const handleOTPComplete = async (code) => {
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await verifyLoginOTP(formData.email, String(code));
      if (!res.success) throw new Error(res.error || "Invalid OTP. Please try again.");
      completeLogin(res.data);
    } catch (err) {
      showError(err.message || "Verification failed.");
      setLoading(false);
      setResendKey((k) => k + 1);
    }
  };

  const handleResendOTP = async () => {
    setLoading(true);
    try {
      const res = await resendLoginOTP(formData.email);
      if (!res.success) throw new Error(res.error || "Failed to resend OTP.");
      setResendKey((k) => k + 1);
    } catch (err) {
      showError(err.message || "Failed to resend OTP.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post("/auth/forgot-password", { email: forgotEmail });
      if (!res.success) throw new Error(res.error || "Failed to send OTP.");
      setResetOtpKey((k) => k + 1);
      setResetOtp("");
      setStep("reset_otp");
    } catch (err) {
      showError(err.message || "Failed to send reset OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetOtpComplete = (code) => {
    setResetOtp(code);
  };

  const handleResendResetOtp = async () => {
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email: forgotEmail });
      setResetOtpKey((k) => k + 1);
      setResetOtp("");
    } catch {
      showError("Failed to resend OTP. Please wait a moment.");
    } finally {
      setLoading(false);
    }
  };

  const handleProceedToNewPassword = (e) => {
    e.preventDefault();
    if (resetOtp.length !== 6) {
      showError("Please enter the complete 6-digit OTP.");
      return;
    }
    setStep("new_password");
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmNewPassword) {
      showError("Passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      showError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      const res = await api.post("/auth/reset-password", {
        email: forgotEmail,
        otp_code: resetOtp,
        new_password: newPassword,
      });
      if (!res.success) throw new Error(res.error || "Failed to reset password.");
      setStep("credentials");
      setForgotEmail("");
      setResetOtp("");
      setNewPassword("");
      setConfirmNewPassword("");
      showError("Password reset successfully! You can now log in.");
    } catch (err) {
      showError(err.message || "Failed to reset password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const errorVariant =
    errorMsg.includes("successfully") ? "success" :
    errorMsg.includes("Too many")     ? "warning" : "danger";

  const errorTitle =
    step === "otp"                        ? "Verification Failed" :
    errorMsg.includes("successfully")    ? "Success!"            : "Error";

  return (
    <>
      <div className="login-overlay" onClick={onClose}>
        <div className="login-content" onClick={(e) => e.stopPropagation()}>
          <button className="login-close-btn" onClick={onClose} aria-label="Close login modal">
            <IoClose />
          </button>

          <div className="login-left">
            <img src="/snap.jpg" alt="Snap2Fix Logo" className="login-logo" />
            <h1 className="login-title">Snap2Fix</h1>
            <p className="login-slogan">
              Report road damage. Improve safety. Build better streets.
            </p>
          </div>

          <div className="login-right">

            {step === "credentials" && (
              <>
                <h2>Welcome Back!</h2>
                <p className="login-instruction">Log in to continue reporting road damages!</p>
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
                        autoComplete="email"
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
                        autoComplete="current-password"
                      />
                    </div>
                  </div>
                  <div className="forgot-password-row">
                    <span
                      className="forgot-password-link"
                      onClick={() => { setForgotEmail(formData.email); setStep("forgot"); }}
                    >
                      Forgot Password?
                    </span>
                  </div>
                  <button type="submit" disabled={loading}>
                    {loading ? "Sending OTP..." : "Log in"}
                    {!loading && <GrFormNextLink className="next-icon" />}
                  </button>
                </form>
                <div className="login-footer">
                  <p>
                    Don't have an account?{" "}
                    <span className="signup-link" onClick={onSwitchToSignUp}>Sign Up</span>
                  </p>
                </div>
              </>
            )}

            {step === "otp" && (
              <>
                <button className="otp-back-btn" onClick={handleBack} type="button">
                  <FaArrowLeft /> Back
                </button>
                <h2>Two-Factor Authentication</h2>
                <p className="login-instruction">Verify your identity to continue.</p>
                <OTPboxes
                  key={resendKey}
                  email={maskedEmail}
                  onComplete={handleOTPComplete}
                  onResend={handleResendOTP}
                  disabled={loading}
                  cooldownSeconds={60}
                />
                {loading && <p className="otp-loading">Verifying...</p>}
              </>
            )}

            {step === "forgot" && (
              <>
                <button className="otp-back-btn" onClick={handleBack} type="button">
                  <FaArrowLeft /> Back
                </button>
                <h2>Forgot Password</h2>
                <p className="login-instruction">
                  Enter your email and we'll send you a reset code.
                </p>
                <form onSubmit={handleForgotSubmit}>
                  <div className="label-form">
                    <label>Email Address</label>
                    <div className="email-icon-wrapper">
                      <MdEmail className="email-icon" />
                      <input
                        type="email"
                        placeholder="name@gmail.com"
                        required
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        autoComplete="email"
                      />
                    </div>
                  </div>
                  <button type="submit" disabled={loading}>
                    {loading ? "Sending..." : "Send Reset Code"}
                    {!loading && <GrFormNextLink className="next-icon" />}
                  </button>
                </form>
              </>
            )}

            {step === "reset_otp" && (
              <>
                <button className="otp-back-btn" onClick={() => setStep("forgot")} type="button">
                  <FaArrowLeft /> Back
                </button>
                <h2>Enter Reset Code</h2>
                <p className="login-instruction">
                  We sent a 6-digit code to <strong>{forgotEmail}</strong>.
                </p>
                <form onSubmit={handleProceedToNewPassword}>
                  <OTPboxes
                    key={resetOtpKey}
                    email={forgotEmail}
                    onComplete={handleResetOtpComplete}
                    onResend={handleResendResetOtp}
                    disabled={loading}
                    cooldownSeconds={60}
                  />
                  <button
                    type="submit"
                    disabled={loading || resetOtp.length !== 6}
                    style={{ marginTop: "1rem" }}
                  >
                    {loading ? "Verifying..." : "Continue"}
                    {!loading && <GrFormNextLink className="next-icon" />}
                  </button>
                </form>
              </>
            )}

            {step === "new_password" && (
              <>
                <button className="otp-back-btn" onClick={() => setStep("reset_otp")} type="button">
                  <FaArrowLeft /> Back
                </button>
                <h2>New Password</h2>
                <p className="login-instruction">
                  Choose a strong new password for your account.
                </p>
                <form onSubmit={handleResetPassword}>
                  <div className="label-form">
                    <label>New Password</label>
                    <div className="password-icon-wrapper">
                      <RiLockPasswordFill className="password-icon" />
                      <input
                        type={showNewPassword ? "text" : "password"}
                        placeholder="Min. 8 chars, 1 uppercase, 1 number, 1 symbol"
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                      <span
                        className="toggle-eye"
                        onClick={() => setShowNewPassword((p) => !p)}
                        role="button"
                        tabIndex={0}
                        aria-label={showNewPassword ? "Hide password" : "Show password"}
                      >
                        {showNewPassword ? <BsFillEyeFill /> : <BsFillEyeSlashFill />}
                      </span>
                    </div>
                  </div>
                  <div className="label-form">
                    <label>Confirm Password</label>
                    <div className="password-icon-wrapper">
                      <RiLockPasswordFill className="password-icon" />
                      <input
                        type={showConfirmNewPassword ? "text" : "password"}
                        placeholder="Re-enter new password"
                        required
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                      />
                      <span
                        className="toggle-eye"
                        onClick={() => setShowConfirmNewPassword((p) => !p)}
                        role="button"
                        tabIndex={0}
                        aria-label={showConfirmNewPassword ? "Hide password" : "Show password"}
                      >
                        {showConfirmNewPassword ? <BsFillEyeFill /> : <BsFillEyeSlashFill />}
                      </span>
                    </div>
                  </div>
                  <button type="submit" disabled={loading}>
                    {loading ? "Resetting..." : "Reset Password"}
                    {!loading && <GrFormNextLink className="next-icon" />}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>

      {showErrorModal && (
        <ConfirmChangesModal
          title={errorTitle}
          message={errorMsg}
          confirmText="OK"
          variant={errorVariant}
          hideCancel={true}
          onConfirm={() => setShowErrorModal(false)}
        />
      )}
    </>
  );
}

export default LoginPage;