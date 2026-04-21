import React, { useEffect, useState } from "react";
import "./AdminMapView.css";

import AdminSidebar from "../../components/AdminSidebar.jsx";
import AdminHeader from "../../components/AdminHeader.jsx";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { FaMagnifyingGlassLocation } from "react-icons/fa6";

import { getReports } from "../../api/reports";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function AdminMapView() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await getReports({ page_size: 100 });
      if (cancelled) return;
      if (!res.success) { setError(res.error); setLoading(false); return; }
      const withCoords = (res.data?.results ?? []).filter((r) => r.latitude && r.longitude);
      setReports(withCoords);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const damageType = (r) => r.ai_damage_type ?? r.damage_type ?? "—";
  const severity   = (r) => r.ai_severity    ?? r.severity    ?? "—";
  const location   = (r) => r.location_address ?? r.barangay  ?? "—";

  return (
    <>
      <AdminSidebar />
      <AdminHeader />

      <div className="admin-mapview-container">
        <div className="admin-mapview-header">
          <h1>Admin Road Damage Map <FaMagnifyingGlassLocation className="admin-mapview-icon" /></h1>
          <p>All reported incidents across the system</p>
        </div>

        {error && <div className="admin-error-banner">{error}</div>}

        {loading ? (
          <p style={{ padding: "2rem", color: "#555" }}>Loading map data…</p>
        ) : (
          <div className="admin-mapview-map">
            <MapContainer center={[14.5995, 120.9842]} zoom={11} style={{ height: "100%", width: "100%" }}>
              <TileLayer
                attribution="© OpenStreetMap contributors"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {reports.map((r) => (
                <Marker key={r.id} position={[r.latitude, r.longitude]}>
                  <Popup>
                    <strong>{location(r)}</strong><br />
                    <b>Type:</b> {damageType(r)}<br />
                    <b>Severity:</b> {severity(r)}<br />
                    <b>Status:</b> {r.status}
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