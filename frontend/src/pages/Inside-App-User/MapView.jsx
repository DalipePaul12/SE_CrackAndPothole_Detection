import React, { useEffect, useState, useRef, useCallback } from "react";
import "./MapView.css";
import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";
import {
  MapContainer, TileLayer, Marker, Popup,
  Polygon, useMap, Circle, ZoomControl,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getReports } from "../../api/reports";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const makeSvgIcon = (color, pulse = false) => L.divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 54" width="40" height="54">
    ${pulse ? `<circle cx="20" cy="20" r="18" fill="${color}" opacity="0.12">
      <animate attributeName="r" from="14" to="23" dur="1.5s" repeatCount="indefinite"/>
      <animate attributeName="opacity" from="0.25" to="0" dur="1.5s" repeatCount="indefinite"/>
    </circle>` : ""}
    <circle cx="20" cy="20" r="13" fill="${color}" stroke="#fff" stroke-width="2.5"/>
    <circle cx="20" cy="20" r="5.5" fill="#fff" opacity="0.95"/>
    <path d="M20 35 L13.5 23 Q20 9 26.5 23 Z" fill="${color}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>
  </svg>`,
  className: "",
  iconSize: [40, 54],
  iconAnchor: [20, 52],
  popupAnchor: [0, -54],
});

const ICONS = {
  critical:     makeSvgIcon("#ef4444", true),
  non_critical: makeSvgIcon("#f59e0b"),
  unknown:      makeSvgIcon("#6b7280"),
};

const getIcon = (r) => ICONS[(r.ai_severity || "").toLowerCase().replace(/[^a-z_]/g, "")] || ICONS.unknown;

const SEV_COLOR = { critical: "#ef4444", non_critical: "#f59e0b", unknown: "#6b7280" };
const getSevColor = (s) => SEV_COLOR[(s || "").toLowerCase().replace(/[^a-z_]/g, "")] || SEV_COLOR.unknown;

const STATUS_LABEL = {
  PENDING: "Pending", VERIFIED: "Verified", IN_PROGRESS: "In Progress",
  RESOLVED: "Resolved", DECLINED: "Declined",
};

const MALABON_BOUNDARY = [
  [14.6685,120.9578],[14.6701,120.9623],[14.6720,120.9658],[14.6738,120.9689],
  [14.6725,120.9720],[14.6698,120.9748],[14.6665,120.9762],[14.6630,120.9771],
  [14.6595,120.9765],[14.6558,120.9748],[14.6530,120.9720],[14.6512,120.9688],
  [14.6508,120.9650],[14.6518,120.9615],[14.6540,120.9585],[14.6572,120.9563],
  [14.6610,120.9553],[14.6648,120.9558],[14.6685,120.9578],
];
const CENTER = [14.6615, 120.9660];

const TILES = {
  street:    { label: "Street",    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", attr: '&copy; OpenStreetMap' },
  dark:      { label: "Dark",      url: "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png", attr: '&copy; Stadia Maps' },
  satellite: { label: "Satellite", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attr: '&copy; Esri' },
  topo:      { label: "Topo",      url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", attr: '&copy; OpenTopoMap' },
};

function FlyTo({ target }) {
  const map = useMap();
  useEffect(() => { if (target) map.flyTo(target, 17, { duration: 1.4 }); }, [target, map]);
  return null;
}

function HeatmapLayer({ reports }) {
  const map = useMap();
  const ref = useRef(null);
  useEffect(() => {
    const pts = reports.filter(r => r.latitude && r.longitude).map(r => {
      const w = (r.ai_severity||"").toLowerCase() === "critical" ? 1.0 : (r.ai_severity||"").toLowerCase() === "non_critical" ? 0.5 : 0.3;
      return [parseFloat(r.latitude), parseFloat(r.longitude), w];
    });
    if (!pts.length) return;
    import("leaflet.heat").then(() => {
      if (ref.current) map.removeLayer(ref.current);
      ref.current = L.heatLayer(pts, { radius: 35, blur: 25, maxZoom: 17, gradient: { 0.2: "#3b82f6", 0.5: "#f59e0b", 1.0: "#ef4444" } }).addTo(map);
    });
    return () => { if (ref.current) { map.removeLayer(ref.current); ref.current = null; } };
  }, [reports, map]);
  return null;
}

function DensityLayer({ reports }) {
  const cells = {};
  reports.forEach(r => {
    if (!r.latitude || !r.longitude) return;
    const k = `${(Math.round(parseFloat(r.latitude)*100)/100).toFixed(2)},${(Math.round(parseFloat(r.longitude)*100)/100).toFixed(2)}`;
    if (!cells[k]) cells[k] = { lat: parseFloat(k.split(",")[0]), lng: parseFloat(k.split(",")[1]), count: 0 };
    cells[k].count++;
  });
  return Object.values(cells).map(({ lat, lng, count }, i) => (
    <Circle key={i} center={[lat, lng]} radius={count * 30 + 60}
      pathOptions={{ color: "#155318", fillColor: "#22c55e", fillOpacity: Math.min(0.15 + count * 0.08, 0.55), weight: 1.5, opacity: 0.7 }} />
  ));
}

function Lightbox({ src, onClose }) {
  useEffect(() => {
    const h = e => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="mv-lightbox" onClick={onClose}>
      <div className="mv-lightbox-inner" onClick={e => e.stopPropagation()}>
        <button className="mv-lightbox-close" onClick={onClose}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
        <img src={src} alt="Report evidence" />
      </div>
    </div>
  );
}

export default function MapView() {
  const [reports, setReports]           = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [viewMode, setViewMode]         = useState("markers");
  const [tileKey, setTileKey]           = useState("street");
  const [filterSev, setFilterSev]       = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterDmg, setFilterDmg]       = useState("All");
  const [search, setSearch]             = useState("");
  const [flyTarget, setFlyTarget]       = useState(null);
  const [lightbox, setLightbox]         = useState(null);
  const [selected, setSelected]         = useState(null);
  const [panelOpen, setPanelOpen]       = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await getReports({ page: 1, page_size: 100 });
        if (res?.success) {
          const body = res.data;
          setReports(Array.isArray(body) ? body : Array.isArray(body?.results) ? body.results : []);
        } else {
          setError(res?.error || "Could not load reports.");
        }
      } catch {
        setError("Could not load reports. Check your connection.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const safe     = Array.isArray(reports) ? reports : [];
  const mapped   = safe.filter(r => r.latitude && r.longitude);
  const q        = search.toLowerCase();

  const filtered = mapped.filter(r => {
    const sev    = (r.ai_severity || "").toLowerCase();
    const status = r.status || "";
    const dmg    = (r.ai_damage_type || "").toLowerCase();
    const match  = !q || (r.barangay||"").toLowerCase().includes(q)
                       || (r.description||"").toLowerCase().includes(q)
                       || String(r.id).includes(q);
    return match
      && (filterSev    === "All" || sev    === filterSev.toLowerCase())
      && (filterStatus === "All" || status === filterStatus)
      && (filterDmg    === "All" || dmg    === filterDmg.toLowerCase());
  });

  const counts = {
    critical:    mapped.filter(r => (r.ai_severity||"").toLowerCase() === "critical").length,
    nonCritical: mapped.filter(r => (r.ai_severity||"").toLowerCase() === "non_critical").length,
    inProgress:  mapped.filter(r => r.status === "IN_PROGRESS").length,
    resolved:    mapped.filter(r => r.status === "RESOLVED").length,
  };

  const openPanel = useCallback(r => {
    setSelected(r); setPanelOpen(true);
    setFlyTarget([parseFloat(r.latitude), parseFloat(r.longitude)]);
  }, []);

  const tile = TILES[tileKey];

  return (
    <>
      <Sidebar />
      <AppHeader />
      <div className="mv-root">

        {/* TOP BAR */}
        <div className="mv-topbar">
          <div className="mv-topbar-left">
            <div className="mv-page-icon">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                <circle cx="12" cy="9" r="2.5"/>
              </svg>
            </div>
            <div className="mv-title-group">
              <div className="mv-page-title">Road Damage Map</div>
              <p className="mv-subtitle">Live reports — Malabon City</p>
            </div>
          </div>

          <div className="mv-stat-pills">
            <div className="mv-pill critical"><span className="mv-pill-dot"/><strong>{counts.critical}</strong> Critical</div>
            <div className="mv-pill warning"><span className="mv-pill-dot"/><strong>{counts.nonCritical}</strong> Non-Critical</div>
            <div className="mv-pill blue"><span className="mv-pill-dot"/><strong>{counts.inProgress}</strong> In Progress</div>
            <div className="mv-pill green"><span className="mv-pill-dot"/><strong>{counts.resolved}</strong> Resolved</div>
            <div className="mv-pill neutral"><strong>{mapped.length}</strong> Total</div>
          </div>
        </div>

        {/* TOOLBAR */}
        <div className="mv-toolbar">
          <div className="mv-search-wrap">
            <svg className="mv-search-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            <input className="mv-search" placeholder="Search barangay, ID…" value={search} onChange={e => setSearch(e.target.value)} />
            {search && (
              <button className="mv-search-clear" onClick={() => setSearch("")}>
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            )}
          </div>

          <div className="mv-toolbar-divider" />

          <div className="mv-btn-group">
            {[["markers","Markers"],["heat","Heatmap"],["density","Density"]].map(([k,l]) => (
              <button key={k} className={`mv-btn${viewMode===k?" active":""}`} onClick={() => setViewMode(k)}>{l}</button>
            ))}
          </div>

          <div className="mv-btn-group tile-group">
            {Object.entries(TILES).map(([k,v]) => (
              <button key={k} className={`mv-btn${tileKey===k?" active":""}`} onClick={() => setTileKey(k)}>{v.label}</button>
            ))}
          </div>

          <div className="mv-toolbar-divider" />

          <select className="mv-select" value={filterSev} onChange={e => setFilterSev(e.target.value)}>
            <option value="All">All Severity</option>
            <option value="critical">Critical</option>
            <option value="non_critical">Non-Critical</option>
          </select>
          <select className="mv-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="All">All Status</option>
            <option value="PENDING">Pending</option>
            <option value="VERIFIED">Verified</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="RESOLVED">Resolved</option>
            <option value="DECLINED">Declined</option>
          </select>
          <select className="mv-select" value={filterDmg} onChange={e => setFilterDmg(e.target.value)}>
            <option value="All">All Damage</option>
            <option value="pothole">Pothole</option>
            <option value="crack">Crack</option>
          </select>

          <div className="mv-result-count"><strong>{filtered.length}</strong> report{filtered.length !== 1 ? "s" : ""}</div>
        </div>

        {/* BODY */}
        <div className="mv-body">
          <div className={`mv-map-wrap${panelOpen ? " panel-open" : ""}`}>
            {loading ? (
              <div className="mv-loader"><div className="mv-spinner"/><p>Loading map data…</p></div>
            ) : error ? (
              <div className="mv-error">
                <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#ef4444" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
                <p>{error}</p>
                <button className="mv-retry" onClick={() => window.location.reload()}>Retry</button>
              </div>
            ) : (
              <MapContainer center={CENTER} zoom={14} minZoom={12} zoomControl={false} style={{ height: "100%", width: "100%" }}>
                <TileLayer url={tile.url} attribution={tile.attr} />
                <ZoomControl position="bottomright" />
                <FlyTo target={flyTarget} />

                <Polygon positions={MALABON_BOUNDARY}
                  pathOptions={{ color: "#155318", weight: 2.5, opacity: 0.75, fillColor: "#22c55e", fillOpacity: 0.04, dashArray: "8 5" }} />

                {viewMode === "heat"    && <HeatmapLayer reports={filtered} />}
                {viewMode === "density" && <DensityLayer reports={filtered} />}

                {viewMode === "markers" && filtered.map(r => (
                  <Marker key={r.id} position={[parseFloat(r.latitude), parseFloat(r.longitude)]}
                    icon={getIcon(r)} eventHandlers={{ click: () => openPanel(r) }}>
                    <Popup className="mv-popup-wrap">
                      <div className="mv-popup">
                        <div className="mv-popup-head">
                          <span className="mv-popup-id">#{r.id}</span>
                          <span className="mv-popup-sev" style={{ background: getSevColor(r.ai_severity) }}>
                            {r.ai_severity || "Unknown"}
                          </span>
                        </div>
                        {r.image_url && (
                          <button className="mv-popup-img-btn" onClick={() => setLightbox(r.image_url)}>
                            <img src={r.image_url} alt="evidence" />
                            <span className="mv-popup-img-overlay">View Photo</span>
                          </button>
                        )}
                        <div className="mv-popup-rows">
                          <div className="mv-popup-row"><span>Location</span><span>{r.barangay || r.street_name || "—"}</span></div>
                          <div className="mv-popup-row"><span>Damage</span><span>{r.ai_damage_type || "—"}</span></div>
                          <div className="mv-popup-row">
                            <span>Status</span>
                            <span className={`mv-status-badge ${(r.status||"").toLowerCase().replace("_","-")}`}>
                              {STATUS_LABEL[r.status] || r.status || "—"}
                            </span>
                          </div>
                        </div>
                        <button className="mv-popup-detail-btn" onClick={() => openPanel(r)}>View Details</button>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            )}

            {!loading && !error && (
              <div className="mv-legend">
                <div className="mv-legend-title">Severity</div>
                {[["#ef4444","Critical"],["#f59e0b","Non-Critical"],["#6b7280","Unknown"]].map(([c,l]) => (
                  <div className="mv-legend-item" key={l}>
                    <span className="mv-legend-dot" style={{ background: c }} />{l}
                  </div>
                ))}
                {viewMode === "heat" && <div className="heat-note">Intensity = density + severity</div>}
              </div>
            )}
          </div>

          {/* DETAIL PANEL */}
          <div className={`mv-panel${panelOpen ? " open" : ""}`}>
            <div className="mv-panel-handle" />
            {selected && (
              <>
                <div className="mv-panel-head">
                  <div>
                    <h3>Report #{selected.id}</h3>
                    <p>{selected.barangay || selected.street_name || "Malabon City"}</p>
                  </div>
                  <button className="mv-panel-close" onClick={() => setPanelOpen(false)}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  </button>
                </div>

                {selected.image_url && (
                  <button className="mv-panel-img-btn" onClick={() => setLightbox(selected.image_url)}>
                    <img src={selected.image_url} alt="Report evidence" />
                    <span className="mv-panel-img-overlay">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fff" strokeWidth="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                      Expand Photo
                    </span>
                  </button>
                )}

                <div className="mv-panel-badges">
                  <span className="mv-sev-badge" style={{
                    background: getSevColor(selected.ai_severity) + "1a",
                    color: getSevColor(selected.ai_severity),
                    borderColor: getSevColor(selected.ai_severity) + "44"
                  }}>{selected.ai_severity || "Unknown"}</span>
                  <span className={`mv-status-badge ${(selected.status||"").toLowerCase().replace("_","-")}`}>
                    {STATUS_LABEL[selected.status] || selected.status || "—"}
                  </span>
                </div>

                <div className="mv-panel-details">
                  {[
                    ["Damage",      selected.ai_damage_type || "—"],
                    ["Reporter",    selected.reporter_name  || "—"],
                    ["Barangay",    selected.barangay       || "—"],
                    ["Coordinates", selected.latitude ? `${parseFloat(selected.latitude).toFixed(5)}, ${parseFloat(selected.longitude).toFixed(5)}` : "—"],
                    ["Submitted",   selected.created_at ? new Date(selected.created_at).toLocaleDateString("en-PH", { year:"numeric", month:"long", day:"numeric" }) : "—"],
                  ].map(([label, value]) => (
                    <div className="mv-panel-row" key={label}>
                      <span className="mv-panel-label">{label}</span>
                      <span className="mv-panel-value">{value}</span>
                    </div>
                  ))}
                  {selected.description && (
                    <div className="mv-panel-desc">
                      <span className="mv-panel-label">Description</span>
                      <p>{selected.description}</p>
                    </div>
                  )}
                </div>

                <button className="mv-panel-fly-btn" onClick={() => setFlyTarget([parseFloat(selected.latitude), parseFloat(selected.longitude)])}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
                  Fly to Location
                </button>
              </>
            )}
          </div>
        </div>

        {/* BOTTOM STRIP */}
        <div className="mv-list-strip">
          <div className="mv-list-label">Reports</div>
          <div className="mv-list-scroll">
            {filtered.slice(0, 20).map(r => (
              <button key={r.id} className="mv-list-card" onClick={() => openPanel(r)}>
                {r.image_url
                  ? <img src={r.image_url} alt="" className="mv-list-thumb" />
                  : <div className="mv-list-thumb placeholder" />}
                <div className="mv-list-info">
                  <div className="mv-list-id">#{r.id}</div>
                  <div className="mv-list-loc">{r.barangay || "—"}</div>
                  <span className="mv-list-sev" style={{ background: getSevColor(r.ai_severity)+"1a", color: getSevColor(r.ai_severity) }}>
                    {r.ai_severity || "—"}
                  </span>
                </div>
              </button>
            ))}
            {filtered.length === 0 && !loading && (
              <div className="mv-list-empty">No reports match the current filters.</div>
            )}
          </div>
        </div>
      </div>

      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </>
  );
}