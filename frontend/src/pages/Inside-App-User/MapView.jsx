// frontend/src/pages/Inside-App-User/MapView.jsx
// 100% FREE — OpenStreetMap + Leaflet + leaflet-heat (loaded via useEffect)
// No API key required. No .env entry needed.

import React, { useEffect, useState, useRef } from "react";
import "./MapView.css";

import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";

import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polygon,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { FaMagnifyingGlassLocation } from "react-icons/fa6";
import { getReports } from "../../api/reports";

// ─── Fix Leaflet default marker icon (Vite + Leaflet known issue) ─────────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// ─── Color-coded markers by severity ─────────────────────────────────────────
const createColorMarker = (color) =>
  new L.Icon({
    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize:    [25, 41],
    iconAnchor:  [12, 41],
    popupAnchor: [1, -34],
    shadowSize:  [41, 41],
  });

const MARKERS = {
  critical: createColorMarker("red"),
  low:      createColorMarker("green"),
  default:  createColorMarker("orange"),
};

const getMarkerIcon = (report) => {
  const sev = (report.ai_severity || "").toLowerCase();
  if (sev === "critical") return MARKERS.critical;
  if (sev === "low")      return MARKERS.low;
  return MARKERS.default;
};

const getSeverityColor = (sev) => {
  switch ((sev || "").toLowerCase()) {
    case "critical": return "#ef4444";
    case "low":      return "#22c55e";
    default:         return "#f97316";
  }
};

// ─── Malabon City boundary polygon ───────────────────────────────────────────
const MALABON_BOUNDARY = [
  [14.6685, 120.9578],
  [14.6701, 120.9623],
  [14.6720, 120.9658],
  [14.6738, 120.9689],
  [14.6725, 120.9720],
  [14.6698, 120.9748],
  [14.6665, 120.9762],
  [14.6630, 120.9771],
  [14.6595, 120.9765],
  [14.6558, 120.9748],
  [14.6530, 120.9720],
  [14.6512, 120.9688],
  [14.6508, 120.9650],
  [14.6518, 120.9615],
  [14.6540, 120.9585],
  [14.6572, 120.9563],
  [14.6610, 120.9553],
  [14.6648, 120.9558],
  [14.6685, 120.9578],
];

const MALABON_CENTER = [14.6615, 120.9660];

// ─── Heatmap layer — loads leaflet.heat safely via dynamic import ─────────────
// leaflet.heat is a legacy UMD lib — importing it via "import" breaks Vite.
// We load it dynamically AFTER the map mounts instead.
function HeatmapLayer({ reports }) {
  const map = useMap();
  const heatRef = useRef(null);

  useEffect(() => {
    if (!reports.length) return;

    const points = reports
      .filter((r) => r.latitude && r.longitude)
      .map((r) => {
        const weight = (r.ai_severity || "").toLowerCase() === "critical" ? 1.0 : 0.4;
        return [parseFloat(r.latitude), parseFloat(r.longitude), weight];
      });

    // Dynamically import leaflet.heat — avoids Vite ES module conflict
    import("leaflet.heat").then(() => {
      // Remove old layer if exists
      if (heatRef.current) {
        map.removeLayer(heatRef.current);
      }

      heatRef.current = L.heatLayer(points, {
        radius:   30,
        blur:     20,
        maxZoom:  17,
        gradient: { 0.2: "#22c55e", 0.5: "#f97316", 1.0: "#ef4444" },
      }).addTo(map);
    });

    return () => {
      if (heatRef.current) {
        map.removeLayer(heatRef.current);
        heatRef.current = null;
      }
    };
  }, [reports, map]);

  return null;
}

// ─── Main MapView Component ───────────────────────────────────────────────────
function MapView() {
  const [reports, setReports]           = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [viewMode, setViewMode]         = useState("markers"); // "markers" | "heat"
  const [filterSev, setFilterSev]       = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");

  useEffect(() => {
    const fetchMapReports = async () => {
      try {
        const data = await getReports();
        setReports(data);
      } catch (err) {
        console.error("[MapView] Failed to load reports:", err);
        setError("Failed to load map data. Please try again.");
      } finally {
        setLoading(false);
      }
    };
    fetchMapReports();
  }, []);

  const mappableReports = reports.filter((r) => r.latitude && r.longitude);

  const filteredReports = mappableReports.filter((r) => {
    const sev    = (r.ai_severity || "").toLowerCase();
    const status = r.status || "";
    return (
      (filterSev    === "All" || sev    === filterSev.toLowerCase()) &&
      (filterStatus === "All" || status === filterStatus)
    );
  });

  const criticalCount   = mappableReports.filter((r) => (r.ai_severity || "").toLowerCase() === "critical").length;
  const lowCount        = mappableReports.filter((r) => (r.ai_severity || "").toLowerCase() === "low").length;
  const inProgressCount = mappableReports.filter((r) => r.status === "IN_PROGRESS").length;

  return (
    <>
      <Sidebar />
      <AppHeader />

      <div
        className="sidebar-overlay"
        onClick={() => {
          document.querySelector(".app-sidebar")?.classList.remove("active");
          document.querySelector(".sidebar-overlay")?.classList.remove("active");
        }}
      />

      <div className="mapview-container">

        {/* HEADER */}
        <div className="mapview-header">
          <div className="mapview-title">
            <h1>
              <FaMagnifyingGlassLocation className="mapview-icon" />
              Road Damage Map
            </h1>
            <p>Live community reports — Malabon City</p>
          </div>

          <div className="mapview-stats">
            <div className="map-stat critical">
              <span className="stat-dot" />
              <strong>{criticalCount}</strong> Critical
            </div>
            <div className="map-stat low">
              <span className="stat-dot" />
              <strong>{lowCount}</strong> Low
            </div>
            <div className="map-stat progress">
              <span className="stat-dot" />
              <strong>{inProgressCount}</strong> In Progress
            </div>
            <div className="map-stat total">
              <strong>{mappableReports.length}</strong> Total Pinned
            </div>
          </div>
        </div>

        {/* CONTROLS */}
        <div className="mapview-controls">
          <div className="control-group">
            <label>View</label>
            <div className="toggle-buttons">
              <button
                className={viewMode === "markers" ? "active" : ""}
                onClick={() => setViewMode("markers")}
              >
                📍 Markers
              </button>
              <button
                className={viewMode === "heat" ? "active" : ""}
                onClick={() => setViewMode("heat")}
              >
                🔥 Heatmap
              </button>
            </div>
          </div>

          <div className="control-group">
            <label>Severity</label>
            <select value={filterSev} onChange={(e) => setFilterSev(e.target.value)}>
              <option value="All">All</option>
              <option value="Critical">Critical</option>
              <option value="Low">Low</option>
            </select>
          </div>

          <div className="control-group">
            <label>Status</label>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="All">All</option>
              <option value="PENDING">Pending</option>
              <option value="VERIFIED">Verified</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="RESOLVED">Resolved</option>
              <option value="DECLINED">Declined</option>
            </select>
          </div>

          <div className="control-results">
            Showing <strong>{filteredReports.length}</strong> report{filteredReports.length !== 1 ? "s" : ""}
          </div>
        </div>

        {/* LEGEND */}
        <div className="mapview-legend">
          <span className="legend-item"><span className="legend-dot red" /> Critical</span>
          <span className="legend-item"><span className="legend-dot orange" /> Moderate / Pending</span>
          <span className="legend-item"><span className="legend-dot green" /> Low / Resolved</span>
          {viewMode === "heat" && (
            <span className="legend-item heat-note">🔥 Heatmap intensity = report density + severity</span>
          )}
        </div>

        {/* MAP */}
        {loading ? (
          <div className="mapview-loading">
            <div className="loading-spinner" />
            <p>Loading map data...</p>
          </div>
        ) : error ? (
          <div className="mapview-error"><p>{error}</p></div>
        ) : (
          <div className="mapview-map">
            <MapContainer
              center={MALABON_CENTER}
              zoom={14}
              minZoom={13}
              style={{ height: "100%", width: "100%" }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {/* MALABON CITY BOUNDARY */}
              <Polygon
                positions={MALABON_BOUNDARY}
                pathOptions={{
                  color:       "#155318",
                  weight:       3,
                  opacity:      0.9,
                  fillColor:   "#22c55e",
                  fillOpacity:  0.06,
                  dashArray:   "8, 4",
                }}
              />

              {/* HEATMAP */}
              {viewMode === "heat" && (
                <HeatmapLayer reports={filteredReports} />
              )}

              {/* MARKERS */}
              {viewMode === "markers" &&
                filteredReports.map((report) => (
                  <Marker
                    key={report.id}
                    position={[parseFloat(report.latitude), parseFloat(report.longitude)]}
                    icon={getMarkerIcon(report)}
                  >
                    <Popup>
                      <div className="map-popup">
                        <div className="popup-header">
                          <strong>Report #{report.id}</strong>
                          <span
                            className="popup-severity"
                            style={{ background: getSeverityColor(report.ai_severity) }}
                          >
                            {report.ai_severity || "Unknown"}
                          </span>
                        </div>

                        {report.image_url && (
                          <img
                            src={report.image_url}
                            alt="Report"
                            className="popup-image"
                          />
                        )}

                        <div className="popup-details">
                          <p><b>Location:</b> {report.barangay || report.street_name || "—"}</p>
                          <p><b>Damage:</b> {report.ai_damage_type || "—"}</p>
                          <p>
                            <b>Status:</b>
                            <span className={`popup-status ${(report.status || "").toLowerCase().replace("_", "-")}`}>
                              {" "}{report.status || "—"}
                            </span>
                          </p>
                          {report.description && (
                            <p><b>Note:</b> {report.description}</p>
                          )}
                          <p className="popup-date">
                            {report.created_at
                              ? new Date(report.created_at).toLocaleDateString("en-PH", {
                                  year: "numeric", month: "short", day: "numeric",
                                })
                              : ""}
                          </p>
                        </div>
                      </div>
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