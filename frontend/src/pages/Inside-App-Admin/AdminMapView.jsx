import React, { useEffect, useState, useRef, useCallback } from "react";
import "./AdminMapView.css";

import AdminSidebar from "../../components/AdminSidebar.jsx";
import AdminHeader from "../../components/AdminHeader.jsx";

import {
  MapContainer,
  TileLayer,
  Marker,
  useMap,
  useMapEvents,
  Rectangle,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

import { FaMagnifyingGlassLocation } from "react-icons/fa6";
import {
  FiFilter,
  FiRefreshCw,
  FiLayers,
  FiX,
  FiCheck,
  FiAlertTriangle,
  FiTool,
  FiClock,
  FiDownload,
  FiMapPin,
  FiUser,
  FiCalendar,
  FiCpu,
  FiSquare,
  FiImage,
  FiZoomIn,
  FiUpload,
  FiTrash2,
} from "react-icons/fi";

import { getReports, updateReport, uploadReportMedia as uploadReportImage } from "../../api/reports";

// ─── Leaflet icon fix ────────────────────────────────────────────────────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// ─── Constants ───────────────────────────────────────────────────────────────
const MAP_CENTER       = [14.6607, 120.9612];
const MAP_ZOOM         = 14;
const REFRESH_INTERVAL = 30_000;
const MAX_FILE_MB      = 5;

const SEVERITY_CONFIG = {
  severe:   { color: "#e53e3e", bg: "#fff5f5", label: "Severe"   },
  moderate: { color: "#d69e2e", bg: "#fffaf0", label: "Moderate" },
  minor:    { color: "#38a169", bg: "#f0fff4", label: "Minor"    },
  resolved: { color: "#3182ce", bg: "#ebf8ff", label: "Fixed"    },
  default:  { color: "#718096", bg: "#f7fafc", label: "Unknown"  },
};

const STATUS_CONFIG = {
  pending:     { label: "Pending",     color: "#d69e2e", bg: "#fffaf0" },
  in_progress: { label: "In Progress", color: "#805ad5", bg: "#faf5ff" },
  resolved:    { label: "Resolved",    color: "#38a169", bg: "#f0fff4" },
  rejected:    { label: "Rejected",    color: "#e53e3e", bg: "#fff5f5" },
};

const DATE_FILTERS = [
  { label: "All time",   value: "all"   },
  { label: "Last 24h",  value: "24h"   },
  { label: "Last week",  value: "week"  },
  { label: "Last month", value: "month" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getSevKey(r) {
  const st = (r.status ?? "").toLowerCase();
  if (st === "resolved") return "resolved";
  const s = (r.ai_severity ?? r.severity ?? "").toLowerCase();
  if (["severe",   "high"  ].includes(s)) return "severe";
  if (["moderate", "medium"].includes(s)) return "moderate";
  if (["minor",    "low"   ].includes(s)) return "minor";
  return "default";
}

function passesDateFilter(r, range) {
  if (range === "all") return true;
  const created = new Date(r.created_at ?? r.date_reported ?? 0);
  const ms = { "24h": 86_400_000, week: 604_800_000, month: 2_592_000_000 }[range];
  return Date.now() - created.getTime() <= ms;
}

// Try every common field name the API might use for images
function getImageSrc(r) {
  return r.image_url ?? r.photo_url ?? r.image ?? r.photo ?? r.attachment_url ?? null;
}

function buildIcon(report) {
  const cfg       = SEVERITY_CONFIG[getSevKey(report)] ?? SEVERITY_CONFIG.default;
  const isPothole = (report.ai_damage_type ?? report.damage_type ?? "").toLowerCase().includes("pothole");
  const symbol    = isPothole ? "&#x1F573;&#xFE0F;" : "&#x26A0;&#xFE0F;";
  return L.divIcon({
    className: "",
    html: `<div style="background:${cfg.color};border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35);width:32px;height:32px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;"><span style="transform:rotate(45deg);font-size:13px;line-height:1">${symbol}</span></div>`,
    iconSize:    [32, 32],
    iconAnchor:  [16, 32],
    popupAnchor: [0, -34],
  });
}

function exportCSV(reports) {
  const cols = ["id","location_address","barangay","ai_damage_type","damage_type","ai_severity","severity","status","latitude","longitude","created_at"];
  const csv  = [cols.join(","), ...reports.map((r) => cols.map((c) => `"${r[c] ?? ""}"`).join(","))].join("\n");
  const url  = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  Object.assign(document.createElement("a"), { href: url, download: "road_damage_reports.csv" }).click();
  URL.revokeObjectURL(url);
}

// ─── Click-outside hook ───────────────────────────────────────────────────────
function useClickOutside(ref, handler) {
  useEffect(() => {
    function listener(e) {
      if (ref.current && !ref.current.contains(e.target)) handler();
    }
    document.addEventListener("mousedown", listener);
    return () => document.removeEventListener("mousedown", listener);
  }, [ref, handler]);
}

// ─── Native Cluster Layer ─────────────────────────────────────────────────────
function ClusterLayer({ reports, onMarkerClick }) {
  const map      = useMap();
  const groupRef = useRef(null);

  useEffect(() => {
    groupRef.current = L.markerClusterGroup({
      chunkedLoading: true,
      showCoverageOnHover: false,
      iconCreateFunction(cluster) {
        const count = cluster.getChildCount();
        const size  = count < 10 ? 36 : count < 50 ? 42 : 48;
        return L.divIcon({
          className: "",
          html: `<div class="amv-cluster" style="width:${size}px;height:${size}px">${count}</div>`,
          iconSize:   [size, size],
          iconAnchor: [size / 2, size / 2],
        });
      },
    });
    map.addLayer(groupRef.current);
    return () => { map.removeLayer(groupRef.current); };
  }, [map]);

  useEffect(() => {
    if (!groupRef.current) return;
    groupRef.current.clearLayers();
    const markers = reports.map((r) => {
      const m = L.marker(
        [parseFloat(r.latitude), parseFloat(r.longitude)],
        { icon: buildIcon(r) }
      );
      m.on("click", () => onMarkerClick(r));
      return m;
    });
    groupRef.current.addLayers(markers);
  }, [reports, onMarkerClick]);

  return null;
}

// ─── Plain markers (clustering OFF) ──────────────────────────────────────────
function PlainMarkers({ reports, onMarkerClick }) {
  return reports.map((r) => (
    <Marker
      key={r.id}
      position={[parseFloat(r.latitude), parseFloat(r.longitude)]}
      icon={buildIcon(r)}
      eventHandlers={{ click: () => onMarkerClick(r) }}
    />
  ));
}

// ─── Heatmap Layer ────────────────────────────────────────────────────────────
function HeatmapLayer({ reports, enabled }) {
  const map      = useMap();
  const layerRef = useRef(null);

  useEffect(() => {
    if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null; }
    if (!enabled || reports.length === 0) return;
    if (typeof L.heatLayer !== "function") {
      console.warn("leaflet.heat not loaded — run: npm install leaflet.heat");
      return;
    }
    const points = reports.map((r) => [
      parseFloat(r.latitude),
      parseFloat(r.longitude),
      getSevKey(r) === "severe" ? 1.0 : getSevKey(r) === "moderate" ? 0.6 : 0.3,
    ]);
    layerRef.current = L.heatLayer(points, {
      radius: 28, blur: 22, maxZoom: 17,
      gradient: { 0.2: "#38a169", 0.5: "#d69e2e", 1.0: "#e53e3e" },
    }).addTo(map);
    return () => { if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null; } };
  }, [enabled, reports, map]);

  return null;
}

// ─── Fly-to controller ────────────────────────────────────────────────────────
function MapController({ flyTo }) {
  const map     = useMap();
  const prevRef = useRef(null);
  useEffect(() => {
    if (flyTo && flyTo !== prevRef.current) {
      prevRef.current = flyTo;
      map.flyTo(flyTo, 17, { duration: 1.2 });
    }
  }, [flyTo, map]);
  return null;
}

// ─── Draw / select area tool ──────────────────────────────────────────────────
function DrawSelectTool({ active, onBoundsSelected }) {
  const [start,   setStart  ] = useState(null);
  const [current, setCurrent] = useState(null);

  useMapEvents({
    mousedown(e) { if (!active) return; setStart(e.latlng); setCurrent(e.latlng); },
    mousemove(e) { if (!active || !start) return; setCurrent(e.latlng); },
    mouseup(e) {
      if (!active || !start) return;
      onBoundsSelected(L.latLngBounds(start, e.latlng));
      setStart(null); setCurrent(null);
    },
  });

  if (!active || !start || !current) return null;
  return (
    <Rectangle
      bounds={L.latLngBounds(start, current)}
      pathOptions={{ color: "#3182ce", weight: 2, fillOpacity: 0.15 }}
    />
  );
}

// ─── Image Lightbox ───────────────────────────────────────────────────────────
function ImageLightbox({ src, onClose }) {
  useEffect(() => {
    const fn = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [onClose]);

  return (
    <div className="amv-lightbox-overlay" onClick={onClose}>
      <button className="amv-lightbox-close" onClick={onClose}><FiX size={20} /></button>
      <img
        src={src}
        alt="Road damage"
        className="amv-lightbox-img"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

// ─── Image Upload Zone ────────────────────────────────────────────────────────
function ImageUploadZone({ reportId, onUploaded }) {
  const [dragOver,  setDragOver ] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error,     setError    ] = useState(null);
  const [done,      setDone     ] = useState(false);
  const fileRef = useRef(null);

  async function processFile(file) {
    if (!file) return;
    setError(null);
    setDone(false);

    if (!file.type.startsWith("image/")) {
      setError("Only image files are accepted.");
      return;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`File must be under ${MAX_FILE_MB} MB.`);
      return;
    }

    setUploading(true);
    try {
      const res = await uploadReportImage(reportId, file);
      if (res.success) {
        const url = res.data?.image_url ?? res.data?.photo_url ?? URL.createObjectURL(file);
        setDone(true);
        onUploaded(url);
      } else {
        setError(res.error ?? "Upload failed. Please try again.");
      }
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="amv-upload-section">
      <div
        className={`amv-upload-dropzone ${dragOver ? "amv-upload-dropzone--active" : ""} ${uploading ? "amv-upload-dropzone--loading" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); processFile(e.dataTransfer.files[0]); }}
        onClick={() => !uploading && fileRef.current?.click()}
      >
        {uploading ? (
          <>
            <div className="amv-upload-spinner" />
            <span className="amv-upload-label">Uploading…</span>
          </>
        ) : done ? (
          <>
            <FiCheck size={24} className="amv-upload-icon amv-upload-icon--done" />
            <span className="amv-upload-label amv-upload-label--done">Uploaded!</span>
          </>
        ) : (
          <>
            <FiUpload size={22} className="amv-upload-icon" />
            <span className="amv-upload-label">
              {dragOver ? "Drop to upload" : "Upload Photo"}
            </span>
            <span className="amv-upload-hint">Drag & drop or click to browse</span>
            <span className="amv-upload-meta">JPG · PNG · WEBP · max {MAX_FILE_MB} MB</span>
          </>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="amv-upload-hidden"
        onChange={(e) => { processFile(e.target.files[0]); e.target.value = ""; }}
      />

      {error && (
        <div className="amv-upload-error">
          <FiAlertTriangle size={13} /> {error}
        </div>
      )}
    </div>
  );
}

// ─── Detail Image Block ───────────────────────────────────────────────────────
// Handles: existing image → show + replace | no image → upload zone
function DetailImageBlock({ report, onImageChange, onLightbox }) {
  const [showUpload, setShowUpload] = useState(false);
  const imgSrc = getImageSrc(report);

  // Reset when report changes
  useEffect(() => { setShowUpload(false); }, [report.id]);

  if (imgSrc && !showUpload) {
    return (
      <div className="amv-detail-image-wrap">
        <img
          src={imgSrc}
          alt="Road damage"
          className="amv-detail-image"
          onClick={() => onLightbox(imgSrc)}
          onError={(e) => {
            // If src 404s, fall through to upload zone
            e.target.style.display = "none";
            setShowUpload(true);
          }}
        />
        <div className="amv-image-overlay" onClick={() => onLightbox(imgSrc)}>
          <FiZoomIn size={18} />
          <span>Click to enlarge</span>
        </div>
        <button
          className="amv-image-replace-btn"
          title="Replace image"
          onClick={() => setShowUpload(true)}
        >
          <FiUpload size={11} /> Replace
        </button>
      </div>
    );
  }

  // No image or replace mode
  return (
    <div>
      {showUpload && imgSrc && (
        <button className="amv-upload-cancel-replace" onClick={() => setShowUpload(false)}>
          ← Keep existing photo
        </button>
      )}
      <ImageUploadZone
        key={`${report.id}-${showUpload}`}
        reportId={report.id}
        onUploaded={(url) => {
          onImageChange(url);
          setShowUpload(false);
        }}
      />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
function AdminMapView() {
  const [allReports,    setAllReports   ] = useState([]);
  const [loading,       setLoading      ] = useState(true);
  const [error,         setError        ] = useState(null);
  const [refreshing,    setRefreshing   ] = useState(false);
  const [lastRefresh,   setLastRefresh  ] = useState(null);

  const [filterType,      setFilterType     ] = useState("all");
  const [filterSeverity,  setFilterSeverity ] = useState("all");
  const [filterStatus,    setFilterStatus   ] = useState("all");
  const [filterDate,      setFilterDate     ] = useState("all");
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  const [showHeatmap,    setShowHeatmap   ] = useState(false);
  const [clusterEnabled, setClusterEnabled] = useState(true);
  const [layerPanelOpen, setLayerPanelOpen] = useState(false);

  const [selectedReport,  setSelectedReport ] = useState(null);
  const [actionLoading,   setActionLoading  ] = useState(false);
  const [flyTo,           setFlyTo          ] = useState(null);
  const [lightboxSrc,     setLightboxSrc    ] = useState(null);

  const [drawMode,        setDrawMode       ] = useState(false);
  const [selectedBounds,  setSelectedBounds ] = useState(null);
  const [boundsReports,   setBoundsReports  ] = useState([]);
  const [showBoundsPanel, setShowBoundsPanel] = useState(false);

  const layerDropRef  = useRef(null);
  const filterDropRef = useRef(null);
  useClickOutside(layerDropRef,  () => setLayerPanelOpen(false));
  useClickOutside(filterDropRef, () => setFilterPanelOpen(false));

  // ── Load ──────────────────────────────────────────────────────────────────
  const loadReports = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    const res = await getReports({ page_size: 500 });
    if (res.success) {
      const withCoords = (res.data?.results ?? []).filter((r) => r.latitude && r.longitude);
      setAllReports(withCoords);
      setLastRefresh(new Date());
    } else {
      setError(res.error);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { loadReports(); }, [loadReports]);
  useEffect(() => {
    const id = setInterval(() => loadReports(true), REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [loadReports]);

  // ── Filtered reports ──────────────────────────────────────────────────────
  const filteredReports = allReports.filter((r) => {
    const type = (r.ai_damage_type ?? r.damage_type ?? "").toLowerCase();
    const sev  = getSevKey(r);
    const stat = (r.status ?? "").toLowerCase();
    if (filterType     !== "all" && !type.includes(filterType)) return false;
    if (filterSeverity !== "all" && sev  !== filterSeverity)    return false;
    if (filterStatus   !== "all" && stat !== filterStatus)      return false;
    if (!passesDateFilter(r, filterDate))                       return false;
    return true;
  });

  const counts = allReports.reduce((acc, r) => {
    const k = getSevKey(r); acc[k] = (acc[k] ?? 0) + 1; return acc;
  }, {});

  // ── Update report status ──────────────────────────────────────────────────
  async function handleAction(reportId, newStatus) {
    setActionLoading(true);
    const res = await updateReport(reportId, { status: newStatus });
    if (res.success) {
      setAllReports((prev) => prev.map((r) => r.id === reportId ? { ...r, status: newStatus } : r));
      setSelectedReport((prev) => prev ? { ...prev, status: newStatus } : prev);
    }
    setActionLoading(false);
  }

  // ── Patch image URL into state after upload ───────────────────────────────
  function handleImageChange(reportId, newUrl) {
    setAllReports((prev) =>
      prev.map((r) => r.id === reportId ? { ...r, image_url: newUrl } : r)
    );
    setSelectedReport((prev) =>
      prev?.id === reportId ? { ...prev, image_url: newUrl } : prev
    );
  }

  const handleFlyTo = useCallback((report) => {
    setSelectedReport(report);
    setFlyTo([parseFloat(report.latitude), parseFloat(report.longitude)]);
  }, []);

  const handleMarkerClick = useCallback((report) => {
    setSelectedReport(report);
  }, []);

  function handleBoundsSelected(bounds) {
    setSelectedBounds(bounds);
    setBoundsReports(
      filteredReports.filter((r) =>
        bounds.contains(L.latLng(parseFloat(r.latitude), parseFloat(r.longitude)))
      )
    );
    setShowBoundsPanel(true);
    setDrawMode(false);
  }

  const activeFilters = [filterType, filterSeverity, filterStatus, filterDate].filter((f) => f !== "all").length;

  const fmt = (r) => ({
    type:     r.ai_damage_type   ?? r.damage_type ?? "—",
    severity: r.ai_severity      ?? r.severity    ?? "—",
    location: r.location_address ?? r.barangay    ?? "—",
    status:   (r.status ?? "pending").toLowerCase(),
    conf:     r.ai_confidence != null ? `${Math.round(r.ai_confidence * 100)}%` : null,
    date:     r.created_at
                ? new Date(r.created_at).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })
                : "—",
    user:     r.reported_by ?? r.user_email ?? null,
  });

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <>
      <AdminSidebar />
      <AdminHeader />

      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}

      <div className="amv-container">

        {/* ── Page header ── */}
        <div className="amv-page-header">
          <div className="amv-header-left">
            <h1 className="amv-title">
              Road Damage Map <FaMagnifyingGlassLocation className="amv-title-icon" />
            </h1>
            <p className="amv-subtitle">
              {filteredReports.length} report{filteredReports.length !== 1 ? "s" : ""} shown
              {activeFilters > 0 && (
                <span className="amv-filter-badge">
                  {activeFilters} filter{activeFilters > 1 ? "s" : ""} active
                </span>
              )}
              {lastRefresh && (
                <span className="amv-last-refresh">
                  · Updated {lastRefresh.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </p>
          </div>

          <div className="amv-header-actions">
            <button
              className={`amv-btn amv-btn-icon ${refreshing ? "amv-btn-spinning" : ""}`}
              onClick={() => loadReports(true)}
              title="Refresh"
            >
              <FiRefreshCw size={16} />
            </button>

            <button className="amv-btn amv-btn-ghost" onClick={() => exportCSV(filteredReports)}>
              <FiDownload size={15} /> Export
            </button>

            <button
              className={`amv-btn ${drawMode ? "amv-btn-active" : "amv-btn-ghost"}`}
              onClick={() => setDrawMode((d) => !d)}
            >
              <FiSquare size={15} /> {drawMode ? "Cancel Select" : "Select Area"}
            </button>

            {/* Layers */}
            <div className="amv-dropdown-wrap" ref={layerDropRef}>
              <button className="amv-btn amv-btn-ghost" onClick={() => { setLayerPanelOpen((v) => !v); setFilterPanelOpen(false); }}>
                <FiLayers size={15} /> Layers
              </button>
              {layerPanelOpen && (
                <div className="amv-dropdown amv-layer-panel">
                  <p className="amv-dropdown-title">Map Layers</p>
                  <label className="amv-toggle-row">
                    <span>Marker Clustering</span>
                    <input type="checkbox" checked={clusterEnabled} onChange={(e) => setClusterEnabled(e.target.checked)} />
                  </label>
                  <label className="amv-toggle-row">
                    <span>Heatmap Density</span>
                    <input type="checkbox" checked={showHeatmap} onChange={(e) => setShowHeatmap(e.target.checked)} />
                  </label>
                </div>
              )}
            </div>

            {/* Filters */}
            <div className="amv-dropdown-wrap" ref={filterDropRef}>
              <button
                className={`amv-btn ${activeFilters > 0 ? "amv-btn-primary" : "amv-btn-ghost"}`}
                onClick={() => { setFilterPanelOpen((v) => !v); setLayerPanelOpen(false); }}
              >
                <FiFilter size={15} /> Filters
                {activeFilters > 0 && <span className="amv-count-pill">{activeFilters}</span>}
              </button>
              {filterPanelOpen && (
                <div className="amv-dropdown amv-filter-panel">
                  <div className="amv-filter-header">
                    <p className="amv-dropdown-title">Filter Reports</p>
                    <button className="amv-clear-btn" onClick={() => { setFilterType("all"); setFilterSeverity("all"); setFilterStatus("all"); setFilterDate("all"); }}>Clear all</button>
                  </div>
                  <div className="amv-filter-group">
                    <label className="amv-filter-label">Damage Type</label>
                    <div className="amv-filter-chips">
                      {["all","pothole","crack"].map((v) => (
                        <button key={v} className={`amv-chip ${filterType === v ? "amv-chip-active" : ""}`} onClick={() => setFilterType(v)}>
                          {v === "all" ? "All" : v === "pothole" ? "🕳️ Pothole" : "⚠️ Crack"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="amv-filter-group">
                    <label className="amv-filter-label">Severity</label>
                    <div className="amv-filter-chips">
                      {["all","severe","moderate","minor"].map((v) => (
                        <button key={v} className={`amv-chip ${filterSeverity === v ? "amv-chip-active" : ""}`} onClick={() => setFilterSeverity(v)}>
                          {v === "all" ? "All" : <><span className="amv-dot" style={{ background: SEVERITY_CONFIG[v].color }} />{SEVERITY_CONFIG[v].label}</>}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="amv-filter-group">
                    <label className="amv-filter-label">Status</label>
                    <div className="amv-filter-chips">
                      {["all","pending","in_progress","resolved","rejected"].map((v) => (
                        <button key={v} className={`amv-chip ${filterStatus === v ? "amv-chip-active" : ""}`} onClick={() => setFilterStatus(v)}>
                          {v === "all" ? "All" : STATUS_CONFIG[v]?.label ?? v}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="amv-filter-group">
                    <label className="amv-filter-label">Date Range</label>
                    <div className="amv-filter-chips">
                      {DATE_FILTERS.map(({ label, value }) => (
                        <button key={value} className={`amv-chip ${filterDate === value ? "amv-chip-active" : ""}`} onClick={() => setFilterDate(value)}>{label}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Stat bar ── */}
        <div className="amv-stat-bar">
          {[
            { key: "severe",   emoji: "🔴", label: "Severe"   },
            { key: "moderate", emoji: "🟡", label: "Moderate" },
            { key: "minor",    emoji: "🟢", label: "Minor"    },
            { key: "resolved", emoji: "🔵", label: "Fixed"    },
          ].map(({ key, emoji, label }) => (
            <button
              key={key}
              className={`amv-stat-pill ${filterSeverity === key ? "amv-stat-pill-active" : ""}`}
              onClick={() => setFilterSeverity(filterSeverity === key ? "all" : key)}
            >
              <span>{emoji}</span>
              <span className="amv-stat-count">{counts[key] ?? 0}</span>
              <span className="amv-stat-label">{label}</span>
            </button>
          ))}
          <div className="amv-stat-divider" />
          <div className="amv-stat-total">
            <span className="amv-stat-count">{allReports.length}</span>
            <span className="amv-stat-label">Total</span>
          </div>
        </div>

        {error && <div className="amv-error-banner"><FiAlertTriangle /> {error}</div>}

        {/* ── Map ── */}
        <div className={`amv-map-wrap ${drawMode ? "amv-draw-cursor" : ""}`}>
          {loading ? (
            <div className="amv-loading">
              <div className="amv-spinner" />
              <p>Loading map data…</p>
            </div>
          ) : (
            <MapContainer center={MAP_CENTER} zoom={MAP_ZOOM} style={{ height: "560px", width: "100%" }} zoomControl>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapController flyTo={flyTo} />
              <HeatmapLayer reports={filteredReports} enabled={showHeatmap} />
              <DrawSelectTool active={drawMode} onBoundsSelected={handleBoundsSelected} />
              {clusterEnabled
                ? <ClusterLayer  reports={filteredReports} onMarkerClick={handleMarkerClick} />
                : <PlainMarkers  reports={filteredReports} onMarkerClick={handleMarkerClick} />
              }
            </MapContainer>
          )}

          <div className="amv-legend">
            <p className="amv-legend-title">Legend</p>
            {[
              { dot: "#e53e3e", label: "Severe"   },
              { dot: "#d69e2e", label: "Moderate" },
              { dot: "#38a169", label: "Minor"    },
              { dot: "#3182ce", label: "Fixed"    },
            ].map(({ dot, label }) => (
              <div key={label} className="amv-legend-row">
                <span className="amv-legend-dot" style={{ background: dot }} />
                <span>{label}</span>
              </div>
            ))}
            <div className="amv-legend-sep" />
            <div className="amv-legend-row"><span style={{ fontSize: 14 }}>🕳️</span><span>Pothole</span></div>
            <div className="amv-legend-row"><span style={{ fontSize: 14 }}>⚠️</span><span>Crack</span></div>
          </div>

          {drawMode && (
            <div className="amv-draw-hint">
              <FiSquare size={14} /> Click and drag on the map to select an area
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            DETAIL SIDE PANEL
        ══════════════════════════════════════════════════════════════════ */}
        {selectedReport && (() => {
          const d       = fmt(selectedReport);
          const sevCfg  = SEVERITY_CONFIG[getSevKey(selectedReport)];
          const statCfg = STATUS_CONFIG[d.status] ?? STATUS_CONFIG.pending;

          return (
            <div className="amv-detail-panel">

              {/* Header */}
              <div className="amv-detail-header" style={{ borderLeft: `4px solid ${sevCfg.color}` }}>
                <div>
                  <span className="amv-detail-type">{d.type}</span>
                  <div className="amv-detail-badges">
                    <span className="amv-badge" style={{ background: sevCfg.bg, color: sevCfg.color }}>{sevCfg.label}</span>
                    <span className="amv-badge" style={{ background: statCfg.bg, color: statCfg.color }}>{statCfg.label}</span>
                  </div>
                </div>
                <button className="amv-close-btn" onClick={() => setSelectedReport(null)}>
                  <FiX size={18} />
                </button>
              </div>

              {/* ── Image / Upload ── */}
              <DetailImageBlock
                report={selectedReport}
                onImageChange={(url) => handleImageChange(selectedReport.id, url)}
                onLightbox={(src) => setLightboxSrc(src)}
              />

              {/* Info rows */}
              <div className="amv-detail-info">
                <div className="amv-info-row">
                  <FiMapPin size={14} className="amv-info-icon" />
                  <span>{d.location}</span>
                </div>
                <div className="amv-info-row">
                  <FiCalendar size={14} className="amv-info-icon" />
                  <span>{d.date}</span>
                </div>
                {d.conf && (
                  <div className="amv-info-row">
                    <FiCpu size={14} className="amv-info-icon" />
                    <span>ML Confidence: <strong>{d.conf}</strong></span>
                  </div>
                )}
                {d.user && (
                  <div className="amv-info-row">
                    <FiUser size={14} className="amv-info-icon" />
                    <span>{d.user}</span>
                  </div>
                )}
              </div>

              {/* Coords */}
              <div className="amv-detail-coords">
                <span>📍 {parseFloat(selectedReport.latitude).toFixed(5)}, {parseFloat(selectedReport.longitude).toFixed(5)}</span>
                <button className="amv-fly-btn" onClick={() => handleFlyTo(selectedReport)}>Fly to</button>
              </div>

              {/* Status actions */}
              {d.status === "pending" && (
                <div className="amv-action-section">
                  <p className="amv-action-hint"><FiClock size={12} /> Pending — assign to begin work</p>
                  <div className="amv-action-row">
                    <button className="amv-action-btn amv-action-progress" disabled={actionLoading} onClick={() => handleAction(selectedReport.id, "in_progress")}>
                      <FiTool size={13} /> Mark In Progress
                    </button>
                    <button className="amv-action-btn amv-action-reject" disabled={actionLoading} onClick={() => handleAction(selectedReport.id, "rejected")}>
                      <FiX size={13} /> Reject
                    </button>
                  </div>
                </div>
              )}

              {d.status === "in_progress" && (
                <div className="amv-action-section">
                  <p className="amv-action-hint amv-action-hint--progress"><FiTool size={12} /> In Progress — mark resolved once done</p>
                  <div className="amv-action-row">
                    <button className="amv-action-btn amv-action-resolve amv-action-btn--full" disabled={actionLoading} onClick={() => handleAction(selectedReport.id, "resolved")}>
                      <FiCheck size={13} /> Mark as Resolved
                    </button>
                  </div>
                </div>
              )}

              {d.status === "resolved" && (
                <div className="amv-action-section amv-action-locked amv-action-locked--resolved">
                  <FiCheck size={14} />
                  <span>This report has been <strong>resolved</strong>. No further actions available.</span>
                </div>
              )}

              {d.status === "rejected" && (
                <div className="amv-action-section amv-action-locked amv-action-locked--rejected">
                  <FiX size={14} />
                  <span>This report was <strong>rejected</strong>. No further actions available.</span>
                </div>
              )}

              {actionLoading && <div className="amv-action-loading">Updating…</div>}
            </div>
          );
        })()}

        {/* ══════════════════════════════════════════════════════════════════
            BOUNDS SELECTION PANEL
        ══════════════════════════════════════════════════════════════════ */}
        {showBoundsPanel && (
          <div className="amv-bounds-panel">
            <div className="amv-bounds-header">
              <span className="amv-bounds-title">
                <FiSquare size={14} /> {boundsReports.length} report{boundsReports.length !== 1 ? "s" : ""} in selected area
              </span>
              <button className="amv-close-btn" onClick={() => { setShowBoundsPanel(false); setSelectedBounds(null); }}>
                <FiX size={16} />
              </button>
            </div>
            <div className="amv-bounds-actions">
              <button className="amv-btn amv-btn-primary" onClick={() => exportCSV(boundsReports)}>
                <FiDownload size={13} /> Export
              </button>
              <button className="amv-btn amv-btn-ghost" onClick={() => boundsReports.forEach((r) => handleAction(r.id, "in_progress"))}>
                <FiTool size={13} /> Bulk: In Progress
              </button>
              <button className="amv-btn amv-btn-ghost" onClick={() => boundsReports.forEach((r) => handleAction(r.id, "resolved"))}>
                <FiCheck size={13} /> Bulk: Resolve
              </button>
            </div>
            <div className="amv-bounds-list">
              {boundsReports.slice(0, 8).map((r) => {
                const d  = fmt(r);
                const sc = SEVERITY_CONFIG[getSevKey(r)];
                return (
                  <div key={r.id} className="amv-bounds-item" onClick={() => { setSelectedReport(r); setShowBoundsPanel(false); }}>
                    <span className="amv-dot" style={{ background: sc.color }} />
                    <span className="amv-bounds-loc">{d.location}</span>
                    <span className="amv-bounds-type">{d.type}</span>
                  </div>
                );
              })}
              {boundsReports.length > 8 && (
                <p className="amv-bounds-more">+{boundsReports.length - 8} more — export to see all</p>
              )}
            </div>
          </div>
        )}

      </div>
    </>
  );
}

export default AdminMapView;