// OTPboxes.jsx
import { useState, useEffect, useRef } from "react";
import "./OTPboxes.css";

function OTPboxes({
  length = 6,
  email,
  onComplete,
  onResend,
  disabled = false,
  cooldownSeconds = 60,
}) {
  const [values, setValues] = useState(Array(length).fill(""));
  const [timer, setTimer] = useState(cooldownSeconds);
  const [canResend, setCanResend] = useState(false);
  const inputRefs = useRef([]);
  const hasSubmitted = useRef(false);

  useEffect(() => {
    setCanResend(false);
    setTimer(cooldownSeconds);
  }, [cooldownSeconds]);

  useEffect(() => {
    if (timer <= 0) {
      setCanResend(true);
      return;
    }
    const interval = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setCanResend(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [timer]);

  const handleResend = () => {
    if (!canResend || disabled) return;
    hasSubmitted.current = false;
    setCanResend(false);
    setTimer(cooldownSeconds);
    setValues(Array(length).fill(""));
    inputRefs.current[0]?.focus();
    onResend?.();
  };

  const handleChange = (e, index) => {
    if (disabled) return;
    const value = e.target.value.replace(/\D/, "");
    if (!value) return;

    const newValues = [...values];
    newValues[index] = value;
    setValues(newValues);

    if (index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    const joined = newValues.join("");
    if (joined.length === length && !hasSubmitted.current) {
      hasSubmitted.current = true;
      onComplete?.(joined);
    }
  };

  const handleKeyDown = (e, index) => {
    if (e.key === "Backspace") {
      const newValues = [...values];
      if (values[index]) {
        newValues[index] = "";
        setValues(newValues);
        hasSubmitted.current = false; // allow resubmit after clearing
      } else if (index > 0) {
        newValues[index - 1] = "";
        setValues(newValues);
        hasSubmitted.current = false; // allow resubmit after clearing
        inputRefs.current[index - 1]?.focus();
      }
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    if (disabled) return;
    const pasteData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasteData) return;

    const newValues = Array(length).fill("");
    pasteData.split("").forEach((char, i) => {
      if (i < length) newValues[i] = char;
    });
    setValues(newValues);

    const nextIndex = Math.min(pasteData.length, length - 1);
    inputRefs.current[nextIndex]?.focus();

    const joined = newValues.join("");
    if (joined.length === length && !hasSubmitted.current) {
      hasSubmitted.current = true;
      onComplete?.(joined);
    }
  };

  return (
    <div className="otp-wrapper">
      <p className="otp-email-text">
        Enter the 6-digit code sent to <strong>{email}</strong>
      </p>

      <div className="otp-box-container">
        {values.map((val, i) => (
          <input
            key={i}
            ref={(el) => (inputRefs.current[i] = el)}
            type="text"
            inputMode="numeric"
            maxLength="1"
            className="otp-box"
            value={val}
            onChange={(e) => handleChange(e, i)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            onPaste={handlePaste}
            disabled={disabled}
            autoComplete="one-time-code"
          />
        ))}
      </div>

      <div className="otp-actions">
        <button
          type="button"
          className={`otp-resend-btn ${canResend ? "active" : "disabled"}`}
          onClick={handleResend}
          disabled={!canResend || disabled}
        >
          {canResend ? "Resend OTP" : `Resend in ${timer}s`}
        </button>
      </div>
    </div>
  );
}

export default OTPboxes;