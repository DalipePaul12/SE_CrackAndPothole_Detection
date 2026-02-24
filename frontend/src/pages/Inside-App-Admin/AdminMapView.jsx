import React, { useEffect, useState } from "react";
import "./AdminMapView.css";

import AdminSidebar from "../../components/AdminSidebar.jsx";
import AdminHeader from "../../components/AdminHeader.jsx";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { FaMagnifyingGlassLocation } from "react-icons/fa6";

// Fix Leaflet marker issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function AdminMapView() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("http://localhost:8000/api/reports/map")
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
      <AdminSidebar />
      <AdminHeader />

      <div className="admin-mapview-container">
        <div className="admin-mapview-header">
          <h1>
            Admin Road Damage Map{" "}
            <FaMagnifyingGlassLocation className="admin-mapview-icon" />
          </h1>
          <p>All reported incidents across the system</p>
        </div>

        {loading ? (
          <p>Loading map data...</p>
        ) : (
          <div className="admin-mapview-map">
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
                    <b>Damage Type:</b> {report.damage_type}
                    <br />
                    <b>Severity:</b> {report.severity}
                    <br />
                    <b>Status:</b> {report.status}
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

export default AdminMapView;