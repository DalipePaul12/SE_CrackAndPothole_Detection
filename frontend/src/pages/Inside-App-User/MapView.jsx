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
import { useTheme } from "../Contexts/ThemeContext";
import { useMapReports } from "../../hooks/useMapReports";
import {
  MapPin, AlertTriangle, Clock, CheckCircle2,
  BarChart2, Layers, Search, X, Maximize2,
  Navigation, SlidersHorizontal, ChevronDown,
  Flame, Circle as CircleIcon, Map,
} from "lucide-react";

// ─── Image helper ──────────────────────────────────────────────────────────────
const BASE_URL = import.meta.env.VITE_API_URL || "";
const getThumb = (r) => {
  const url = r?.media_attachments?.[0]?.file_url;
  return url ? `${BASE_URL}${url}` : null;
};

// ─── Fix Leaflet default icon URLs ────────────────────────────────────────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// ─── Custom SVG marker icons ───────────────────────────────────────────────────
const makeSvgIcon = (color, pulse = false) =>
  L.divIcon({
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
    iconSize:    [40, 54],
    iconAnchor:  [20, 52],
    popupAnchor: [0, -54],
  });

const ICONS = {
  critical:     makeSvgIcon("#ef4444", true),
  non_critical: makeSvgIcon("#f59e0b"),
  unknown:      makeSvgIcon("#6b7280"),
};

const getIcon = (r) =>
  ICONS[(r.ai_severity || "").toLowerCase().replace(/[^a-z_]/g, "")] || ICONS.unknown;

const SEV_COLOR = { critical: "#ef4444", non_critical: "#f59e0b", unknown: "#6b7280" };
const getSevColor = (s) =>
  SEV_COLOR[(s || "").toLowerCase().replace(/[^a-z_]/g, "")] || SEV_COLOR.unknown;

const STATUS_LABEL = {
  PENDING:     "Pending",
  VERIFIED:    "Verified",
  IN_PROGRESS: "In Progress",
  RESOLVED:    "Resolved",
  DECLINED:    "Declined",
};

// ─── Map config ────────────────────────────────────────────────────────────────
const MALABON_BOUNDARY = [
  [14.6685, 120.9578], [14.6701, 120.9623], [14.6720, 120.9658], [14.6738, 120.9689],
  [14.6725, 120.9720], [14.6698, 120.9748], [14.6665, 120.9762], [14.6630, 120.9771],
  [14.6595, 120.9765], [14.6558, 120.9748], [14.6530, 120.9720], [14.6512, 120.9688],
  [14.6508, 120.9650], [14.6518, 120.9615], [14.6540, 120.9585], [14.6572, 120.9563],
  [14.6610, 120.9553], [14.6648, 120.9558], [14.6685, 120.9578],
];
const CENTER = [14.6615, 120.966];

const TILES = {
  street: {
    label: "Street", icon: <Map size={12} />,
    light: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    dark:  "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png",
    attr:  "&copy; OpenStreetMap / Stadia Maps",
  },
  dark: {
    label: "Dark", icon: <Layers size={12} />,
    light: "https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png",
    dark:  "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png",
    attr:  "&copy; Stadia Maps",
  },
  satellite: {
    label: "Satellite", icon: <CircleIcon size={12} />,
    light: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    dark:  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attr:  "&copy; Esri",
  },
  topo: {
    label: "Topo", icon: <BarChart2 size={12} />,
    light: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    dark:  "https://tiles.stadiamaps.com/tiles/outdoors/{z}/{x}/{y}{r}.png",
    attr:  "&copy; OpenTopoMap / Stadia Maps",
  },
};

const VIEW_MODES = [
  { key: "markers", label: "Markers", icon: <MapPin size={13} /> },
  { key: "heat",    label: "Heatmap", icon: <Flame size={13} /> },
  { key: "density", label: "Density", icon: <CircleIcon size={13} /> },
];

// ─── Sub-components ────────────────────────────────────────────────────────────
function FlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target, 17, { duration: 1.4 });
  }, [target, map]);
  return null;
}

function HeatmapLayer({ reports }) {
  const map = useMap();
  const ref = useRef(null);
  useEffect(() => {
    const pts = reports
      .filter((r) => r.latitude && r.longitude)
      .map((r) => {
        const w =
          (r.ai_severity || "").toLowerCase() === "critical"     ? 1.0
          : (r.ai_severity || "").toLowerCase() === "non_critical" ? 0.5 : 0.3;
        return [parseFloat(r.latitude), parseFloat(r.longitude), w];
      });
    if (!pts.length) return;
    import("leaflet.heat").then(() => {
      if (ref.current) map.removeLayer(ref.current);
      ref.current = L.heatLayer(pts, {
        radius: 35, blur: 25, maxZoom: 17,
        gradient: { 0.2: "#3b82f6", 0.5: "#f59e0b", 1.0: "#ef4444" },
      }).addTo(map);
    });
    return () => {
      if (ref.current) { map.removeLayer(ref.current); ref.current = null; }
    };
  }, [reports, map]);
  return null;
}

function DensityLayer({ reports }) {
  const cells = {};
  reports.forEach((r) => {
    if (!r.latitude || !r.longitude) return;
    const k = `${(Math.round(parseFloat(r.latitude) * 100) / 100).toFixed(2)},${(Math.round(parseFloat(r.longitude) * 100) / 100).toFixed(2)}`;
    if (!cells[k]) cells[k] = { lat: parseFloat(k.split(",")[0]), lng: parseFloat(k.split(",")[1]), count: 0 };
    cells[k].count++;
  });
  return Object.values(cells).map(({ lat, lng, count }, i) => (
    <Circle
      key={i}
      center={[lat, lng]}
      radius={count * 30 + 60}
      pathOptions={{
        color: "#155318", fillColor: "#22c55e",
        fillOpacity: Math.min(0.15 + count * 0.08, 0.55), weight: 1.5, opacity: 0.7,
      }}
    />
  ));
}

function Lightbox({ src, onClose }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="mv-lightbox" onClick={onClose} role="dialog" aria-modal="true">
      <div className="mv-lightbox-inner" onClick={(e) => e.stopPropagation()}>
        <button className="mv-lightbox-close" onClick={onClose} aria-label="Close photo">
          <X size={18} strokeWidth={2.5} />
        </button>
        <img src={src} alt="Report evidence" />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function MapView() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [viewMode,     setViewMode]     = useState("markers");
  const [tileKey,      setTileKey]      = useState("street");
  const [filterSev,    setFilterSev]    = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterDmg,    setFilterDmg]    = useState("All");
  const [search,       setSearch]       = useState("");
  const [flyTarget,    setFlyTarget]    = useState(null);
  const [lightbox,     setLightbox]     = useState(null);
  const [selected,     setSelected]     = useState(null);
  const [panelOpen,    setPanelOpen]    = useState(false);
  const [filtersOpen,  setFiltersOpen]  = useState(false);
  const [sidebarOpen,  setSidebarOpen]  = useState(false);

const { reports, loading, error, refetch } = useMapReports();

  // Derived state
  const safe   = Array.isArray(reports) ? reports : [];
  const mapped = safe.filter((r) => r.latitude && r.longitude);
  const q      = search.toLowerCase();

  const filtered = mapped.filter((r) => {
    const sev    = (r.ai_severity || "").toLowerCase();
    const status = r.status || "";
    const dmg    = (r.ai_damage_type || "").toLowerCase();
    const match  =
      !q ||
      (r.barangay    || "").toLowerCase().includes(q) ||
      (r.description || "").toLowerCase().includes(q) ||
      String(r.id).includes(q);
    return (
      match &&
      (filterSev    === "All" || sev    === filterSev.toLowerCase()) &&
      (filterStatus === "All" || status === filterStatus) &&
      (filterDmg    === "All" || dmg    === filterDmg.toLowerCase())
    );
  });

  const counts = {
    critical:    mapped.filter((r) => (r.ai_severity || "").toLowerCase() === "critical").length,
    nonCritical: mapped.filter((r) => (r.ai_severity || "").toLowerCase() === "non_critical").length,
    inProgress:  mapped.filter((r) => r.status === "IN_PROGRESS").length,
    resolved:    mapped.filter((r) => r.status === "RESOLVED").length,
  };

  const openPanel = useCallback((r) => {
    setSelected(r);
    setPanelOpen(true);
    setFlyTarget([parseFloat(r.latitude), parseFloat(r.longitude)]);
  }, []);

  const tile    = TILES[tileKey];
  const tileUrl = isDark ? tile.dark : tile.light;

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <AppHeader onMenuToggle={() => setSidebarOpen((p) => !p)} />

      {sidebarOpen && (
        <div
          className="mv-sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <div data-theme={theme} className="mv-root">

        {/* ── Top bar ── */}
        <header className="mv-topbar">
          <div className="mv-topbar-left">
            <div className="mv-page-icon" aria-hidden="true">
              <MapPin size={16} strokeWidth={2.2} color="#fff" />
            </div>
            <div className="mv-title-group">
              <h1 className="mv-page-title">Road Damage Map</h1>
              <span className="mv-subtitle">Live reports — Malabon City</span>
            </div>
          </div>

          <div className="mv-stat-pills" role="status" aria-label="Report statistics">
            <div className="mv-pill mv-pill--critical">
              <AlertTriangle size={11} aria-hidden="true" />
              <strong>{counts.critical}</strong>
              <span className="mv-pill-label">Critical</span>
            </div>
            <div className="mv-pill mv-pill--warning">
              <AlertTriangle size={11} aria-hidden="true" />
              <strong>{counts.nonCritical}</strong>
              <span className="mv-pill-label">Non-Critical</span>
            </div>
            <div className="mv-pill mv-pill--blue">
              <Clock size={11} aria-hidden="true" />
              <strong>{counts.inProgress}</strong>
              <span className="mv-pill-label">In Progress</span>
            </div>
            <div className="mv-pill mv-pill--green">
              <CheckCircle2 size={11} aria-hidden="true" />
              <strong>{counts.resolved}</strong>
              <span className="mv-pill-label">Resolved</span>
            </div>
            <div className="mv-pill mv-pill--neutral">
              <BarChart2 size={11} aria-hidden="true" />
              <strong>{mapped.length}</strong>
              <span className="mv-pill-label">Total</span>
            </div>
          </div>
        </header>

        {/* ── Controls bar ── */}
        <div className="mv-controls">
          <div className="mv-controls-row">
            <div className="mv-search-wrap">
              <Search className="mv-search-icon" size={14} strokeWidth={2} aria-hidden="true" />
              <input
                className="mv-search"
                placeholder="Search barangay, ID…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search reports"
              />
              {search && (
                <button className="mv-search-clear" onClick={() => setSearch("")} aria-label="Clear search">
                  <X size={12} strokeWidth={2.5} />
                </button>
              )}
            </div>

            <div className="mv-seg-group" role="group" aria-label="View mode">
              {VIEW_MODES.map(({ key, label, icon }) => (
                <button
                  key={key}
                  className={`mv-seg-btn${viewMode === key ? " mv-seg-btn--active" : ""}`}
                  onClick={() => setViewMode(key)}
                  aria-pressed={viewMode === key}
                >
                  {icon}<span>{label}</span>
                </button>
              ))}
            </div>

            <div className="mv-seg-group mv-tile-group" role="group" aria-label="Map style">
              {Object.entries(TILES).map(([k, v]) => (
                <button
                  key={k}
                  className={`mv-seg-btn${tileKey === k ? " mv-seg-btn--active" : ""}`}
                  onClick={() => setTileKey(k)}
                  aria-pressed={tileKey === k}
                >
                  {v.icon}<span>{v.label}</span>
                </button>
              ))}
            </div>

            <div className="mv-controls-right">
              <span className="mv-result-count" aria-live="polite">
                <strong>{filtered.length}</strong>{" "}
                {filtered.length !== 1 ? "reports" : "report"}
              </span>
              <button
                className={`mv-filter-toggle${filtersOpen ? " mv-filter-toggle--active" : ""}`}
                onClick={() => setFiltersOpen((p) => !p)}
                aria-expanded={filtersOpen}
                aria-controls="mv-filter-drawer"
              >
                <SlidersHorizontal size={14} />
                <span>Filters</span>
                <ChevronDown
                  size={12}
                  className={`mv-chevron${filtersOpen ? " mv-chevron--open" : ""}`}
                />
              </button>
            </div>
          </div>

          <div
            id="mv-filter-drawer"
            className={`mv-filter-drawer${filtersOpen ? " mv-filter-drawer--open" : ""}`}
            aria-hidden={!filtersOpen}
          >
            <div className="mv-filter-inner">
              <label className="mv-filter-label">
                <span>Severity</span>
                <select className="mv-select" value={filterSev} onChange={(e) => setFilterSev(e.target.value)}>
                  <option value="All">All Severity</option>
                  <option value="critical">Critical</option>
                  <option value="non_critical">Non-Critical</option>
                </select>
              </label>
              <label className="mv-filter-label">
                <span>Status</span>
                <select className="mv-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                  <option value="All">All Status</option>
                  <option value="PENDING">Pending</option>
                  <option value="VERIFIED">Verified</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="DECLINED">Declined</option>
                </select>
              </label>
              <label className="mv-filter-label">
                <span>Damage</span>
                <select className="mv-select" value={filterDmg} onChange={(e) => setFilterDmg(e.target.value)}>
                  <option value="All">All Damage</option>
                  <option value="pothole">Pothole</option>
                  <option value="crack">Crack</option>
                </select>
              </label>
              <button
                className="mv-filter-reset"
                onClick={() => { setFilterSev("All"); setFilterStatus("All"); setFilterDmg("All"); }}
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        {/* ── Body: map + panel ── */}
        <div className="mv-body">
          <div className={`mv-map-wrap${panelOpen ? " mv-map-wrap--panel" : ""}`}>

            {loading ? (
              <div className="mv-state-view">
                <div className="mv-spinner" role="status" aria-label="Loading map" />
                <p>Loading map data…</p>
              </div>
            ) : error ? (
              <div className="mv-state-view mv-state-view--error">
                <AlertTriangle size={36} strokeWidth={1.5} aria-hidden="true" />
                <p>{error}</p>
                <button className="mv-retry-btn" onClick={refetch}>Retry</button>
              </div>
            ) : (
              <MapContainer
                center={CENTER} zoom={14} minZoom={12}
                zoomControl={false}
                style={{ height: "100%", width: "100%" }}
              >
                <TileLayer key={tileUrl} url={tileUrl} attribution={tile.attr} />
                <ZoomControl position="bottomright" />
                <FlyTo target={flyTarget} />

                <Polygon
                  positions={MALABON_BOUNDARY}
                  pathOptions={{
                    color: "#155318", weight: 2.5, opacity: 0.75,
                    fillColor: "#22c55e", fillOpacity: 0.04, dashArray: "8 5",
                  }}
                />

                {viewMode === "heat"    && <HeatmapLayer reports={filtered} />}
                {viewMode === "density" && <DensityLayer reports={filtered} />}

                {viewMode === "markers" && filtered.map((r) => {
                  const thumb = getThumb(r); // ✅ fixed
                  return (
                    <Marker
                      key={r.id}
                      position={[parseFloat(r.latitude), parseFloat(r.longitude)]}
                      icon={getIcon(r)}
                      eventHandlers={{ click: () => openPanel(r) }}
                    >
                      <Popup className="mv-popup-wrap">
                        <div className="mv-popup">
                          <div className="mv-popup-head">
                            <span className="mv-popup-id">#{r.id}</span>
                            <span
                              className="mv-popup-sev"
                              style={{ background: getSevColor(r.ai_severity) }}
                            >
                              {r.ai_severity || "Unknown"}
                            </span>
                          </div>
                          {thumb && ( // ✅ fixed
                            <button
                              className="mv-popup-img-btn"
                              onClick={() => setLightbox(thumb)}
                            >
                              <img src={thumb} alt="Report evidence" />
                              <span className="mv-popup-img-overlay">View Photo</span>
                            </button>
                          )}
                          <div className="mv-popup-body">
                            <div className="mv-popup-row">
                              <span>Location</span>
                              <span>{r.barangay || r.street_name || "—"}</span>
                            </div>
                            <div className="mv-popup-row">
                              <span>Damage</span>
                              <span>{r.ai_damage_type || "—"}</span>
                            </div>
                            <div className="mv-popup-row">
                              <span>Status</span>
                              <span className={`mv-badge mv-badge--${(r.status || "").toLowerCase().replace("_", "-")}`}>
                                {STATUS_LABEL[r.status] || r.status || "—"}
                              </span>
                            </div>
                          </div>
                          <button className="mv-popup-cta" onClick={() => openPanel(r)}>
                            View Details
                          </button>
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
              </MapContainer>
            )}

            {!loading && !error && (
              <div className="mv-legend" aria-label="Severity legend">
                <p className="mv-legend-title">Severity</p>
                {[["#ef4444","Critical"],["#f59e0b","Non-Critical"],["#6b7280","Unknown"]].map(([c,l]) => (
                  <div className="mv-legend-row" key={l}>
                    <span className="mv-legend-dot" style={{ background: c }} aria-hidden="true" />
                    <span>{l}</span>
                  </div>
                ))}
                {viewMode === "heat" && (
                  <p className="mv-legend-note">Intensity = density + severity</p>
                )}
              </div>
            )}
          </div>

          {/* ── Detail panel ── */}
          <aside
            className={`mv-panel${panelOpen ? " mv-panel--open" : ""}`}
            aria-label="Report details"
          >
            <div className="mv-panel-drag" aria-hidden="true" />

            {selected && (() => {
              const selectedThumb = getThumb(selected); // ✅ fixed
              return (
                <>
                  <div className="mv-panel-head">
                    <div className="mv-panel-title-group">
                      <h2 className="mv-panel-id">Report #{selected.id}</h2>
                      <p className="mv-panel-loc">
                        {selected.barangay || selected.street_name || "Malabon City"}
                      </p>
                    </div>
                    <button
                      className="mv-panel-close"
                      onClick={() => setPanelOpen(false)}
                      aria-label="Close panel"
                    >
                      <X size={15} strokeWidth={2.5} />
                    </button>
                  </div>

                  {selectedThumb && ( // ✅ fixed
                    <button
                      className="mv-panel-photo"
                      onClick={() => setLightbox(selectedThumb)}
                      aria-label="Expand photo"
                    >
                      <img src={selectedThumb} alt="Report evidence" />
                      <span className="mv-panel-photo-overlay">
                        <Maximize2 size={16} color="#fff" strokeWidth={2} aria-hidden="true" />
                        <span>Expand</span>
                      </span>
                    </button>
                  )}

                  <div className="mv-panel-badges">
                    <span
                      className="mv-sev-chip"
                      style={{
                        background:  getSevColor(selected.ai_severity) + "18",
                        color:       getSevColor(selected.ai_severity),
                        borderColor: getSevColor(selected.ai_severity) + "40",
                      }}
                    >
                      {selected.ai_severity || "Unknown"}
                    </span>
                    <span className={`mv-badge mv-badge--${(selected.status || "").toLowerCase().replace("_", "-")}`}>
                      {STATUS_LABEL[selected.status] || selected.status || "—"}
                    </span>
                  </div>

                  <div className="mv-panel-info">
                    {[
                      ["Damage Type", selected.ai_damage_type || "—"],
                      ["Reporter",    selected.owner?.full_name || "—"],
                      ["Barangay",    selected.barangay || "—"],
                      ["Coordinates", selected.latitude
                        ? `${parseFloat(selected.latitude).toFixed(5)}, ${parseFloat(selected.longitude).toFixed(5)}`
                        : "—"],
                      ["Submitted", selected.created_at
                        ? new Date(selected.created_at).toLocaleDateString("en-PH", {
                            year: "numeric", month: "long", day: "numeric",
                          })
                        : "—"],
                    ].map(([label, value]) => (
                      <div className="mv-info-row" key={label}>
                        <span className="mv-info-label">{label}</span>
                        <span className="mv-info-value">{value}</span>
                      </div>
                    ))}

                    {selected.description && (
                      <div className="mv-info-desc">
                        <span className="mv-info-label">Description</span>
                        <p>{selected.description}</p>
                      </div>
                    )}
                  </div>

                  <div className="mv-panel-actions">
                    <button
                      className="mv-fly-btn"
                      onClick={() =>
                        setFlyTarget([
                          parseFloat(selected.latitude),
                          parseFloat(selected.longitude),
                        ])
                      }
                    >
                      <Navigation size={14} strokeWidth={2.2} aria-hidden="true" />
                      Fly to Location
                    </button>
                  </div>
                </>
              );
            })()}
          </aside>
        </div>

        {/* ── Bottom strip ── */}
        <section className="mv-strip" aria-label="Recent reports">
          <div className="mv-strip-label">
            <span>Reports</span>
          </div>
          <div className="mv-strip-scroll" role="list">
            {filtered.length === 0 && !loading ? (
              <div className="mv-strip-empty">No reports match current filters.</div>
            ) : (
              filtered.slice(0, 20).map((r) => {
                const thumb = getThumb(r); // ✅ fixed
                return (
                  <button
                    key={r.id}
                    className="mv-strip-card"
                    onClick={() => openPanel(r)}
                    role="listitem"
                    aria-label={`Report #${r.id} in ${r.barangay || "unknown location"}`}
                  >
                    {thumb ? ( // ✅ fixed
                      <img src={thumb} alt="" className="mv-strip-thumb" aria-hidden="true" />
                    ) : (
                      <div className="mv-strip-thumb mv-strip-thumb--empty" aria-hidden="true">
                        <MapPin size={14} />
                      </div>
                    )}
                    <div className="mv-strip-info">
                      <span className="mv-strip-id">#{r.id}</span>
                      <span className="mv-strip-loc">{r.barangay || "—"}</span>
                      <span
                        className="mv-strip-sev"
                        style={{
                          background: getSevColor(r.ai_severity) + "18",
                          color:      getSevColor(r.ai_severity),
                        }}
                      >
                        {r.ai_severity || "—"}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>
      </div>

      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </>
  );
}