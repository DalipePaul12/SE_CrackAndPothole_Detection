import React, { useEffect, useState } from "react";
import "./MapView.css";

import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";

// Leaflet imports (for map rendering)
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

//Icons
import { FaMagnifyingGlassLocation } from "react-icons/fa6";


// Fix Leaflet marker issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function MapView() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("http://localhost:8000/api/reports/map") // Backend endpoint for fetching map reports, edit nyo to kung saan nyo ineexpose yung data
      .then((res) => res.json())
      .then((data) => {
        setReports(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load reports:", err);
        setLoading(false);
      });
  }, []);

  return (
    <>
      <Sidebar />
      <AppHeader />

      <div 
      className="sidebar-overlay"
      onClick={() => {
        document.querySelector(".app-sidebar").classList.remove("active");
        document.querySelector(".sidebar-overlay").classList.remove("active");
      }}
    ></div>

      <div className="mapview-container">
        <div className="mapview-header">
          <h1>Reported Road Damage Map <FaMagnifyingGlassLocation className="mapview-icon" /></h1>
          <p>Live reports from the community</p>
        </div>

        {loading ? (
          <p>Loading map data...</p>
        ) : (
          <div className="mapview-map">
            <MapContainer center={[14.5995, 120.9842]} zoom={11}>
              <TileLayer
                attribution="© OpenStreetMap contributors"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {reports.map((report) => (
                <Marker
                  key={report.id}
                  position={[report.latitude, report.longitude]}
                >
                  <Popup>
                    <strong>{report.location}</strong>
                    <br />
                    <span>
                        <b>Damage Type:</b> {report.damage_type}
                    </span>
                    <br />
                    <span>
                        <b>Severity:</b> {report.severity}
                    </span>
                    <br />
                    <span>
                        <b>Status:</b> {report.status}
                    </span>
                </Popup>

                </Marker>
              ))}
            </MapContainer>
          </div>
        )}
      </div>
    </>
  );
}

export default MapView;
