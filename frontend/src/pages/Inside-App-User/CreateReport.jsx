import React, { useState, useRef } from "react";
import "./CreateReport.css";
import { FaCamera, FaVideo, FaMapMarkerAlt } from "react-icons/fa";
import ReactDOM from "react-dom";

import ConfirmSubmitModal from "../PopUps/ConfirmSubmitModal";

//map imports
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";



function CreateReport({ onClose }) {

  //confirmation popup in submitting reports
  const [showConfirm, setShowConfirm] = useState(false);
  const [showRequiredModal, setShowRequiredModal] = useState(false); //its a popup for completing the reqs


  const userName = "John Carlo Trajico"; // Replace later with auth context

  //ITS FOR THE UPLOADING OF FILES
  const [fileType, setFileType] = useState("Photo");
  const [uploadedFile, setUploadedFile] = useState(null);
  const [previewURL, setPreviewURL] = useState(null);

  const cameraInputRef = useRef(null);
  const fileInputRef = useRef(null);

  const [imageType, setImageType] = useState(null); // "real" or "ai"
  const [damageType, setDamageType] = useState(null); // "pothole" | "crack"
  const [severity, setSeverity] = useState(null); // "critical" | "non-critical"

  const [location, setLocation] = useState("");
  const [showMap, setShowMap] = useState(false);
  const [contact, setContact] = useState("");
  const [additionalInfo, setAdditionalInfo] = useState("");

  const validateBeforeConfirm = () => {
  if (!uploadedFile || !location || !contact) {
    setShowRequiredModal(true);
    return;
  }

  setShowConfirm(true);
};

  const handleSubmit = () => {
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

  //for pin address
  const reverseGeocode = async (lat, lng) => {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
    );

    const data = await response.json();

    if (data && data.display_name) {
      setLocation(data.display_name);
    } else {
      setLocation(`${lat}, ${lng}`);
    }
  } catch (error) {
    console.error("Reverse geocoding failed:", error);
    setLocation(`${lat}, ${lng}`);
  }
};

  //for map pins
  delete L.Icon.Default.prototype._getIconUrl;

  L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
  iconUrl:
    "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
  shadowUrl:
    "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
  });

  function LocationMarker({ reverseGeocode, setShowMap }) {
    const [position, setPosition] = useState(null);

    useMapEvents({
      async click(e) {
        setPosition(e.latlng);

        await reverseGeocode(
          e.latlng.lat.toFixed(6),
          e.latlng.lng.toFixed(6)
        );

        setShowMap(false);
      },
    });

    return position === null ? null : <Marker position={position} />;
  }



  return ReactDOM.createPortal(
    <div className="report-overlay" onClick={onClose}>
      <div className="report-modal" onClick={(e) => e.stopPropagation()}>

        {/* LEFT SIDE */}
        <div className="report-left">

          <h2>Visual Evidence</h2>
        <div className="report-buttons-container">
          <div className="file-type-buttons">
            <button
              className={fileType === "Photo" ? "active" : ""}
              onClick={() => setFileType("Photo")}
            >
              <FaCamera /> Photo
            </button>

            <button
              className={fileType === "Video" ? "active" : ""}
              onClick={() => setFileType("Video")}
            >
              <FaVideo /> Video
            </button>
          </div>
        </div>

          <div className="upload-box" onClick={() => fileInputRef.current?.click()}>
            <div className="upload-content">
              {previewURL ? (
                fileType === "Photo" ? (
                  <img src={previewURL} alt="Preview" className="preview-media" />
                ) : (
                  <video src={previewURL} controls className="preview-media" />
                )
              ) : (
                <>
                  {fileType === "Photo" ? <FaCamera size={40}/> : <FaVideo size={40}/>}
                  <p>Upload {fileType}</p>
                  <small>Required for AI Classification</small>
                </>
              )}
            </div>
          </div>

          <div className="upload-camera-button">

            {fileType === "Photo" && (
          <button
            className="camera-button"
            onClick={() => cameraInputRef.current?.click()}
          >
            <FaCamera /> Use Camera
          </button>

            )}

          <button
            className="upload-btn"
            onClick={() => fileInputRef.current?.click()}
          >
            Upload {fileType}
          </button>
          </div>

{/*INPUTS FOR THE UPLOADING OF FILES*/}
          <input
            ref={fileInputRef}
            type="file"
            accept={fileType === "Photo" ? "image/*" : "Video/*"}
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files[0];
              if (file) {
                setUploadedFile(file);
                setPreviewURL(URL.createObjectURL(file));
              }
            }}
          />

          {fileType === "Photo" && (
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files[0];
                if (file) {
                  setUploadedFile(file);
                  setPreviewURL(URL.createObjectURL(file));
                }
              }}
            />
          )}


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
                required
                onChange={(e) => setLocation(e.target.value)}
              />

              <FaMapMarkerAlt
                className="location-icon"
                onClick={() => setShowMap(true)}
                />
            </div>
          </div>

          <div className="reporter-info">
            <div>
              <label>REPORTER'S NAME</label>
              <input type="text" value={userName} required readOnly/>
            </div>

            <div>
              <label>CONTACT NO.</label>
              <input
                type="text"
                value={contact}
                required
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
            <button className="submit-btn" onClick={validateBeforeConfirm}>
              Submit Report
            </button>
          </div>

        </div>

          {/*for map pin location*/}
          {showMap && (
            <div className="map-overlay" onClick={() => setShowMap(false)}>
              <div className="map-modal" onClick={(e) => e.stopPropagation()}>
                <div className="map-header">
                <h3>SELECT LOCATION</h3>

                <button className="current-loc"
                onClick={() => {
                  navigator.geolocation.getCurrentPosition(
                    async (position) => {
                      const { latitude, longitude } = position.coords;
                      await reverseGeocode(latitude, longitude);
                      setShowMap(false);
                    },
                    (error) => {
                      alert("Location permission denied.");
                    }
                  );
                }}
              >
                Use My Current Location
              </button>
              </div>

                <MapContainer
                  center={[14.5995, 120.9842]} // Default (Manila example)
                  zoom={13}
                  style={{ height: "350px", width: "100%", borderRadius: "15px", 
                  border: "1px solid #000", boxShadow: "0 2px 3px rgba(0, 0, 0, 0.4"}}
                >
                  <TileLayer
                    attribution="&copy; OpenStreetMap contributors"
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />

                  <LocationMarker   
                  reverseGeocode={reverseGeocode}
                  setShowMap={setShowMap}
                />

                </MapContainer>

              <div className="map-actions">
              <button
                className="cancel-button-map"
                onClick={() => setShowMap(false)}
              >
                Cancel
              </button>
            </div>
              </div>
            </div>
          )}

          {showConfirm && (
          <ConfirmSubmitModal
            title="Submit Report?"
            message="Are you sure you want to submit this road damage report?"
            onCancel={() => setShowConfirm(false)}
            onConfirm={() => {
              setShowConfirm(false);
              handleSubmit();
            }}
          />
        )}

        {showRequiredModal && (
        <ConfirmSubmitModal
          title="Incomplete Report"
          message="Please complete all required fields before submitting your report."
          confirmText="OK"
          hideCancel={true}
          onConfirm={() => setShowRequiredModal(false)}
        />
      )}

      </div>
    </div>,
    document.body
  );
}

export default CreateReport;
