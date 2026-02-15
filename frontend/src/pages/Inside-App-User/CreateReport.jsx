import React, { useState } from "react";
import "./CreateReport.css";
import { FaCamera, FaVideo, FaMapMarkerAlt } from "react-icons/fa";
import ReactDOM from "react-dom";

function CreateReport({ onClose }) {

  const userName = "John Carlo Trajico"; // Replace later with auth context

  const [fileType, setFileType] = useState("photo");
  const [uploadedFile, setUploadedFile] = useState(null);

  const [imageType, setImageType] = useState(null); // "real" or "ai"
  const [damageType, setDamageType] = useState(null); // "pothole" | "crack"
  const [severity, setSeverity] = useState(null); // "critical" | "non-critical"

  const [location, setLocation] = useState("");
  const [contact, setContact] = useState("");
  const [additionalInfo, setAdditionalInfo] = useState("");

  const handleSubmit = () => {
    if (!uploadedFile || !location || !contact) {
      alert("Please complete required fields.");
      return;
    }

    const reportData = {
      file: uploadedFile,
      imageType,
      damageType,
      severity,
      location,
      reporter: userName,
      contact,
      additionalInfo,
    };

    console.log("Submitting:", reportData);

    // BACKEND READY:
    // Send reportData to backend here

    onClose();
  };

  return ReactDOM.createPortal(
    <div className="report-overlay">

      <div className="report-modal">

        {/* LEFT SIDE */}
        <div className="report-left">

          <h2>Visual Evidence</h2>

        <div className="report-buttons-container">
          <div className="file-type-buttons">
            <button
              className={fileType === "photo" ? "active" : ""}
              onClick={() => setFileType("photo")}
            >
              <FaCamera /> Photo
            </button>

            <button
              className={fileType === "video" ? "active" : ""}
              onClick={() => setFileType("video")}
            >
              <FaVideo /> Video
            </button>
          </div>
        </div>

          <div className="upload-box">
            <input
              type="file"
              accept={fileType === "photo" ? "image/*" : "video/*"}
              onChange={(e) => setUploadedFile(e.target.files[0])}
            />
            <div className="upload-content">
              {fileType === "photo" ? <FaCamera size={40}/> : <FaVideo size={40}/>}
              <p>Upload {fileType}</p>
              <small>Required for AI Classification</small>
            </div>
          </div>

          <h3>IMAGE TYPE (AI CLASSIFIED)</h3>
          <div className="classification-box">
            <div className={`result-box ${imageType === "real" ? "green" : ""}`}>
              REAL
            </div>
            <div className={`result-box ${imageType === "ai" ? "red" : ""}`}>
              AI GENERATED
            </div>
          </div>

        </div>

        {/* RIGHT SIDE */}
        <div className="report-right">

          <div className="top-classifications">

            <div className="classification-section">
              <h3>DAMAGE TYPE (AI CLASSIFIED)</h3>
              <div className="classification-box">
                <div className={`result-box ${damageType === "pothole" ? "green" : ""}`}>
                  POTHOLE
                </div>
                <div className={`result-box ${damageType === "crack" ? "green" : ""}`}>
                  CRACK
                </div>
              </div>
            </div>

            <div className="classification-section">
              <h3>SEVERITY (AI CLASSIFIED)</h3>
              <div className="classification-box">
                <div className={`result-box ${severity === "critical" ? "red" : ""}`}>
                  CRITICAL
                </div>
                <div className={`result-box ${severity === "non-critical" ? "green" : ""}`}>
                  NON - CRITICAL    
                </div>
              </div>
            </div>

          </div>

          <div className="location-section">
            <label>LOCATION & BARANGAY</label>
            <div className="location-input">
              {/*<FaMapMarkerAlt />*/}
              <input
                type="text"
                placeholder="Enter or pin location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
          </div>

          <div className="reporter-info">
            <div>
              <label>REPORTER'S NAME</label>
              <input type="text" value={userName} />
            </div>

            <div>
              <label>CONTACT NO.</label>
              <input
                type="text"
                value={contact}
                placeholder="Contact Number"
                onChange={(e) => setContact(e.target.value)}
              />
            </div>
          </div>

            <div className="additional-info">
            <label>ADDITIONAL INFORMATION</label>

            <textarea
                placeholder="Provide extra details about the road damage (optional)..."
                value={additionalInfo}
                onChange={(e) => setAdditionalInfo(e.target.value)}
                maxLength={300}
            />

            <div className="char-count">
                {additionalInfo.length}/300
            </div>
            </div>


          <div className="report-actions">
            <button className="discard-btn" onClick={onClose}>Discard</button>
            <button className="submit-btn" onClick={handleSubmit}>
              Submit Report
            </button>
          </div>

        </div>

      </div>
    </div>,
    document.body
  );
}

export default CreateReport;
