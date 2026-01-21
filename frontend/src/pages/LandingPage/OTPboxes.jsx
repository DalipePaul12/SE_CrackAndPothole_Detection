import { useState } from "react";
import "./OTPboxes.css";

function OTPboxes({ length = 6, onChange }) {
  const [values, setValues] = useState(Array(length).fill(""));

  const handleChange = (e, index) => {
    const value = e.target.value.replace(/\D/, "");
    if (!value) return;

    const newValues = [...values];
    newValues[index] = value;
    setValues(newValues);
    onChange(newValues.join(""));

    // move to next box
    if (index < length - 1) {
      e.target.nextSibling?.focus();
    }
  };

  const handleKeyDown = (e, index) => {
    if (e.key === "Backspace") {
      const newValues = [...values];
      newValues[index] = "";
      setValues(newValues);
      onChange(newValues.join(""));

      if (index > 0) {
        e.target.previousSibling?.focus();
      }
    }
  };

  return (
    <div className="otp-box-container">
      {values.map((val, i) => (
        <input
          key={i}
          type="text"
          maxLength="1"
          className="otp-box"
          value={val}
          onChange={(e) => handleChange(e, i)}
          onKeyDown={(e) => handleKeyDown(e, i)}
        />
      ))}
    </div>
  );
}

export default OTPboxes;