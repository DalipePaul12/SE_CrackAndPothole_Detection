import React, { useEffect, useState, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import "./AdminMapView.css";

import {
  MapContainer, TileLayer, Marker, Popup,
  useMap, useMapEvents, Rectangle, Polygon, Circle,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

import {
  ScanSearch, RefreshCw, Layers, X, Check, AlertTriangle, Wrench, Clock,
  Download, MapPin, User, Calendar, Cpu, Square, ZoomIn, Upload, CircleDot,
  ChevronRight, Flame, Map, BarChart2, SlidersHorizontal, ChevronDown,
  Search, Navigation, ImageOff, Eye, CheckCircle2, Circle as CircleIcon,
  Maximize2,
} from "lucide-react";

function useIsDark() {
  const [isDark, setIsDark] = useState(() =>
    document.body.classList.contains("dark")
  );
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setIsDark(document.body.classList.contains("dark"))
    );
    obs.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

import { getReports, getReport, updateReport, uploadReportMedia as uploadReportImage } from "../../api/reports";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const MAP_CENTER       = [14.6607, 120.9612];
const MAP_ZOOM         = 14;
const REFRESH_INTERVAL = 30_000;
const MAX_FILE_MB      = 5;

const SEVERITY_CONFIG = {
  critical:    { color: "#ef4444", label: "Critical"     },
  non_critical: { color: "#f59e0b", label: "Non_Critical" },
  resolved:    { color: "#52b788", label: "Fixed"        },
  default:     { color: "#6b7280", label: "Unknown"      },
};

const STATUS_CONFIG = {
  pending:     { label: "Pending",     color: "#f59e0b" },
  in_progress: { label: "In Progress", color: "#60a5fa" },
  resolved:    { label: "Resolved",    color: "#52b788" },
  rejected:    { label: "Rejected",    color: "#ef4444" },
};

const DATE_FILTERS = [
  { label: "All time",   value: "all"   },
  { label: "Last 24h",   value: "24h"   },
  { label: "Last week",  value: "week"  },
  { label: "Last month", value: "month" },
];

const VIEW_MODES = [
  { key: "markers", label: "Markers", icon: <MapPin    size={13} /> },
  { key: "heat",    label: "Heatmap", icon: <Flame     size={13} /> },
  { key: "density", label: "Density", icon: <CircleDot size={13} /> },
];

const TILES = {
  street: {
    label: "Street", icon: <Map size={12} />,
    lightUrl: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    darkUrl:  "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png",
    attr: "© OpenStreetMap",
  },
  dark: {
    label: "Dark", icon: <Layers size={12} />,
    lightUrl: "https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png",
    darkUrl:  "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png",
    attr: "© Stadia Maps",
  },
  satellite: {
    label: "Satellite", icon: <BarChart2 size={12} />,
    lightUrl: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    darkUrl:  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attr: "© Esri",
  },
  topo: {
    label: "Topo", icon: <BarChart2 size={12} />,
    lightUrl: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    darkUrl:  "https://tiles.stadiamaps.com/tiles/outdoors/{z}/{x}/{y}{r}.png",
    attr: "© OpenTopoMap",
  },
};

function getSevKey(r) {
  const st = (r.status ?? "").toLowerCase();
  if (st === "resolved") return "resolved";
  const s = (r.ai_severity ?? r.severity ?? "").toLowerCase().replace(/[^a-z_]/g, "");
  if (["critical", "severe", "high"].includes(s))                        return "critical";
  if (["non_critical", "noncritical", "non_critical"].includes(s))       return "noncritical";
  return "default";
}

function passesDateFilter(r, range) {
  if (range === "all") return true;
  const created = new Date(r.created_at ?? r.date_reported ?? 0);
  const ms = { "24h": 86_400_000, week: 604_800_000, month: 2_592_000_000 }[range];
  return Date.now() - created.getTime() <= ms;
}

const BASE_URL = import.meta.env.VITE_API_URL || "";
function getImageSrc(r) {
  const mediaUrl = r?.media_attachments?.[0]?.file_url;
  if (mediaUrl) return `${BASE_URL}${mediaUrl}`;
  return r?.image_url ?? r?.photo_url ?? r?.image ?? r?.photo ?? r?.attachment_url ?? null;
}

const esc = (s) =>
  String(s ?? "—")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function buildIcon(report) {
  const cfg   = SEVERITY_CONFIG[getSevKey(report)] ?? SEVERITY_CONFIG.default;
  const color = cfg.color;
  const pulse = getSevKey(report) === "critical";
  return L.divIcon({
    className: "",
    html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 54" width="40" height="54">
      ${pulse ? `<circle cx="20" cy="20" r="18" fill="${color}" opacity="0.12">
        <animate attributeName="r" from="14" to="23" dur="1.5s" repeatCount="indefinite"/>
        <animate attributeName="opacity" from="0.25" to="0" dur="1.5s" repeatCount="indefinite"/>
      </circle>` : ""}
      <circle cx="20" cy="20" r="13" fill="${color}" stroke="#fff" stroke-width="2.5"/>
      <circle cx="20" cy="20" r="5.5" fill="#fff" opacity="0.95"/>
      <path d="M20 35 L13.5 23 Q20 9 26.5 23 Z" fill="${color}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>`,
    iconSize:    [40, 54],
    iconAnchor:  [20, 52],
    popupAnchor: [0, -54],
  });
}

function buildPopupHTML(r) {
  const imgSrc = getImageSrc(r);
  const sevCfg = SEVERITY_CONFIG[getSevKey(r)] ?? SEVERITY_CONFIG.default;
  const stCfg  = STATUS_CONFIG[(r.status ?? "pending").toLowerCase()] ?? STATUS_CONFIG.pending;
  return `
    <div class="amv-popup">
      <div class="amv-popup-head">
        <span class="amv-popup-id">#${r.id}</span>
        <span class="amv-popup-sev" style="background:${sevCfg.color}">${esc(sevCfg.label)}</span>
      </div>
      ${imgSrc
        ? `<div class="amv-popup-img-wrap" data-img="${esc(imgSrc)}" style="cursor:zoom-in">
             <img src="${esc(imgSrc)}" alt="Road damage" class="amv-popup-img" />
             <span class="amv-popup-img-hint">View Photo</span>
           </div>`
        : `<div class="amv-popup-no-img">
             <span>No image available</span>
           </div>`
      }
      <div class="amv-popup-body">
        <div class="amv-popup-row"><span>Location</span><span>${esc(r.location_address ?? r.barangay)}</span></div>
        <div class="amv-popup-row"><span>Damage</span><span>${esc(r.ai_damage_type ?? r.damage_type)}</span></div>
        <div class="amv-popup-row"><span>Status</span><span style="color:${stCfg.color};font-weight:600">${esc(stCfg.label)}</span></div>
      </div>
      <button class="amv-popup-cta" data-rid="${r.id}">View Details &amp; Manage</button>
    </div>
  `;
}

function exportCSV(reports) {
  const cols = ["id","location_address","barangay","ai_damage_type","damage_type","ai_severity","severity","status","latitude","longitude","created_at"];
  const csv  = [cols.join(","), ...reports.map((r) => cols.map((c) => `"${r[c] ?? ""}"`).join(","))].join("\n");
  const url  = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  Object.assign(document.createElement("a"), { href: url, download: "road_damage_reports.csv" }).click();
  URL.revokeObjectURL(url);
}

function useClickOutside(ref, handler) {
  useEffect(() => {
    function listener(e) {
      if (ref.current && !ref.current.contains(e.target)) handler();
    }
    document.addEventListener("mousedown", listener);
    return () => document.removeEventListener("mousedown", listener);
  }, [ref, handler]);
}

function ClusterLayer({ reports, onMarkerClick, onLightbox }) {
  const map          = useMap();
  const groupRef     = useRef(null);
  const reportsRef   = useRef(reports);
  const onClickRef   = useRef(onMarkerClick);
  const onLightboxRef = useRef(onLightbox);
  reportsRef.current  = reports;
  onClickRef.current  = onMarkerClick;
  onLightboxRef.current = onLightbox;

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
    const handlePopupOpen = (e) => {
      const el = e.popup.getElement();
      if (!el) return;
      const btn = el.querySelector("[data-rid]");
      if (btn) {
        const id = parseInt(btn.dataset.rid, 10);
        btn.onclick = () => {
          const report = reportsRef.current.find((r) => r.id === id);
          if (report) { map.closePopup(); onClickRef.current(report); }
        };
      }
      const imgWrap = el.querySelector("[data-img]");
      if (imgWrap) {
        imgWrap.onclick = () => {
          const src = imgWrap.dataset.img;
          if (src) onLightboxRef.current(src);
        };
      }
    };
    map.on("popupopen", handlePopupOpen);
    return () => map.off("popupopen", handlePopupOpen);
  }, [map]);

  useEffect(() => {
    if (!groupRef.current) return;
    groupRef.current.clearLayers();
    const markers = reports.map((r) => {
      const m = L.marker(
        [parseFloat(r.latitude), parseFloat(r.longitude)],
        { icon: buildIcon(r) }
      );
      m.bindPopup(buildPopupHTML(r), { maxWidth: 260, className: "amv-popup-outer" });
      return m;
    });
    groupRef.current.addLayers(markers);
  }, [reports]);

  return null;
}

function PlainMarkers({ reports, onMarkerClick }) {
  const map = useMap();
  return reports.map((r) => {
    const imgSrc = getImageSrc(r);
    const sevCfg = SEVERITY_CONFIG[getSevKey(r)] ?? SEVERITY_CONFIG.default;
    const stCfg  = STATUS_CONFIG[(r.status ?? "pending").toLowerCase()] ?? STATUS_CONFIG.pending;
    return (
      <Marker
        key={r.id}
        position={[parseFloat(r.latitude), parseFloat(r.longitude)]}
        icon={buildIcon(r)}
        eventHandlers={{ click: () => onMarkerClick(r) }}
      >
        <Popup className="amv-popup-outer" maxWidth={260}>
          <div className="amv-popup">
            <div className="amv-popup-head">
              <span className="amv-popup-id">#{r.id}</span>
              <span className="amv-popup-sev" style={{ background: sevCfg.color }}>{sevCfg.label}</span>
            </div>
            {imgSrc ? (
              <div className="amv-popup-img-wrap">
                <img src={imgSrc} alt="Road damage" className="amv-popup-img" />
                <span className="amv-popup-img-hint"><Eye size={12} /> View Photo</span>
              </div>
            ) : (
              <div className="amv-popup-no-img">
                <ImageOff size={18} /><span>No image available</span>
              </div>
            )}
            <div className="amv-popup-body">
              <div className="amv-popup-row"><span>Location</span><span>{r.location_address ?? r.barangay ?? "—"}</span></div>
              <div className="amv-popup-row"><span>Damage</span><span>{r.ai_damage_type ?? r.damage_type ?? "—"}</span></div>
              <div className="amv-popup-row"><span>Status</span><span style={{ color: stCfg.color, fontWeight: 600 }}>{stCfg.label}</span></div>
            </div>
            <button className="amv-popup-cta" onClick={() => { map.closePopup(); onMarkerClick(r); }}>
              View Details &amp; Manage
            </button>
          </div>
        </Popup>
      </Marker>
    );
  });
}

function HeatmapLayer({ reports, enabled }) {
  const map      = useMap();
  const layerRef = useRef(null);
  useEffect(() => {
    if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null; }
    if (!enabled || reports.length === 0) return;
    if (typeof L.heatLayer !== "function") return;
    const points = reports.map((r) => [
      parseFloat(r.latitude), parseFloat(r.longitude),
      getSevKey(r) === "critical" ? 1.0 : 0.4,
    ]);
    layerRef.current = L.heatLayer(points, {
      radius: 35, blur: 25, maxZoom: 17,
      gradient: { 0.2: "#3b82f6", 0.5: "#f59e0b", 1.0: "#ef4444" },
    }).addTo(map);
    return () => { if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null; } };
  }, [enabled, reports, map]);
  return null;
}

function DensityLayer({ reports }) {
  const cells = {};
  reports.forEach((r) => {
    if (!r.latitude || !r.longitude) return;
    const lat = (Math.round(parseFloat(r.latitude) * 100) / 100).toFixed(2);
    const lng = (Math.round(parseFloat(r.longitude) * 100) / 100).toFixed(2);
    const k   = `${lat},${lng}`;
    if (!cells[k]) cells[k] = { lat: parseFloat(lat), lng: parseFloat(lng), count: 0 };
    cells[k].count++;
  });
  return Object.values(cells).map(({ lat, lng, count }, i) => (
    <Circle
      key={i} center={[lat, lng]} radius={count * 30 + 60}
      pathOptions={{ color: "#155318", fillColor: "#22c55e", fillOpacity: Math.min(0.15 + count * 0.08, 0.55), weight: 1.5, opacity: 0.7 }}
    />
  ));
}

function MapController({ flyTo }) {
  const map     = useMap();
  const prevRef = useRef(null);
  useEffect(() => {
    if (flyTo && flyTo !== prevRef.current) {
      prevRef.current = flyTo;
      map.flyTo(flyTo, 17, { duration: 1.4 });
    }
  }, [flyTo, map]);
  return null;
}

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
      pathOptions={{ color: "#52b788", weight: 2, fillOpacity: 0.12 }}
    />
  );
}

function MapBoundsWatcher({ onBoundsChange }) {
  const map = useMap();
  useEffect(() => { onBoundsChange(map.getBounds()); }, [map, onBoundsChange]);
  useMapEvents({
    moveend(e) { onBoundsChange(e.target.getBounds()); },
    zoomend(e) { onBoundsChange(e.target.getBounds()); },
  });
  return null;
}

function ConfirmStatusDialog({ pending, onConfirm, onCancel, loading }) {
  if (!pending) return null;
  const ACTION_META = {
    in_progress: { label: "Mark as In Progress", color: "#60a5fa", btnClass: "amv-dialog-btn--progress", icon: <Wrench size={22} /> },
    resolved:    { label: "Mark as Resolved",    color: "#52b788", btnClass: "amv-dialog-btn--resolve",  icon: <Check  size={22} /> },
    rejected:    { label: "Reject Report",       color: "#ef4444", btnClass: "amv-dialog-btn--reject",   icon: <X      size={22} /> },
  };
  const meta = ACTION_META[pending.newStatus] ?? { label: pending.newStatus, color: "#6b7280", btnClass: "amv-dialog-btn--default", icon: null };
  return (
    <div className="amv-dialog-overlay" onClick={onCancel}>
      <div className="amv-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="amv-dialog-icon" style={{ color: meta.color }}>{meta.icon}</div>
        <h3 className="amv-dialog-title">{meta.label}</h3>
        <p className="amv-dialog-msg">
          Change status of <strong>Report #{pending.id}</strong> to{" "}
          <strong>{STATUS_CONFIG[pending.newStatus]?.label ?? pending.newStatus}</strong>?
          <br />This will notify the reporter.
        </p>
        <div className="amv-dialog-actions">
          <button className="amv-dialog-cancel" onClick={onCancel} disabled={loading}>Cancel</button>
          <button className={`amv-dialog-confirm ${meta.btnClass}`} onClick={onConfirm} disabled={loading}>
            {loading ? "Updating…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ImageLightbox({ src, onClose }) {
  useEffect(() => {
    const fn = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [onClose]);
  return (
    <div className="amv-lightbox-overlay" onClick={onClose}>
      <button className="amv-lightbox-close" onClick={onClose}><X size={18} strokeWidth={2.5} /></button>
      <div className="amv-lightbox-inner" onClick={(e) => e.stopPropagation()}>
        <img src={src} alt="Road damage" className="amv-lightbox-img" />
      </div>
    </div>
  );
}

function ImageUploadZone({ reportId, onUploaded }) {
  const [dragOver,  setDragOver ] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error,     setError    ] = useState(null);
  const [done,      setDone     ] = useState(false);
  const fileRef = useRef(null);

  async function processFile(file) {
    if (!file) return;
    setError(null); setDone(false);
    if (!file.type.startsWith("image/")) { setError("Only image files are accepted."); return; }
    if (file.size > MAX_FILE_MB * 1024 * 1024) { setError(`File must be under ${MAX_FILE_MB} MB.`); return; }
    setUploading(true);
    try {
      const res = await uploadReportImage(reportId, file);
      if (res.success) {
        const url = res.data?.image_url ?? res.data?.photo_url ?? URL.createObjectURL(file);
        setDone(true); onUploaded(url);
      } else { setError(res.error ?? "Upload failed."); }
    } catch { setError("Upload failed. Please try again."); }
    finally  { setUploading(false); }
  }

  return (
    <div className="amv-upload-section">
      <div
        className={`amv-upload-dropzone${dragOver ? " amv-upload-dropzone--active" : ""}${uploading ? " amv-upload-dropzone--loading" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e)    => { e.preventDefault(); setDragOver(false); processFile(e.dataTransfer.files[0]); }}
        onClick={() => !uploading && fileRef.current?.click()}
      >
        {uploading ? (
          <><div className="amv-upload-spinner" /><span className="amv-upload-label">Uploading…</span></>
        ) : done ? (
          <><Check size={24} className="amv-upload-icon amv-upload-icon--done" /><span className="amv-upload-label amv-upload-label--done">Uploaded!</span></>
        ) : (
          <>
            <Upload size={22} className="amv-upload-icon" />
            <span className="amv-upload-label">{dragOver ? "Drop to upload" : "Upload Photo"}</span>
            <span className="amv-upload-hint">Drag and drop or click to browse</span>
            <span className="amv-upload-meta">JPG · PNG · WEBP · max {MAX_FILE_MB} MB</span>
          </>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="amv-upload-hidden"
        onChange={(e) => { processFile(e.target.files[0]); e.target.value = ""; }} />
      {error && <div className="amv-upload-error"><AlertTriangle size={13} /> {error}</div>}
    </div>
  );
}

function ReportStrip({ reports, onSelect }) {
  return (
    <section className="amv-strip" aria-label="Recent reports">
      <div className="amv-strip-label"><span>Reports</span></div>
      <div className="amv-strip-scroll" role="list">
        {reports.length === 0 ? (
          <div className="amv-strip-empty">No reports match current filters.</div>
        ) : (
          reports.slice(0, 40).map((r) => {
            const imgSrc = getImageSrc(r);
            const sevCfg = SEVERITY_CONFIG[getSevKey(r)] ?? SEVERITY_CONFIG.default;
            return (
              <button
                key={r.id}
                className="amv-strip-card"
                onClick={() => onSelect(r)}
                role="listitem"
                aria-label={`Report #${r.id}`}
                title={`Report #${r.id} — ${r.location_address ?? r.barangay ?? "Unknown"}`}
              >
                {imgSrc ? (
                  <img src={imgSrc} alt="" className="amv-strip-thumb" aria-hidden="true" />
                ) : (
                  <div className="amv-strip-thumb amv-strip-thumb--empty" aria-hidden="true">
                    <MapPin size={14} />
                  </div>
                )}
                <div className="amv-strip-info">
                  <span className="amv-strip-id">#{r.id}</span>
                  <span className="amv-strip-loc">{r.location_address ?? r.barangay ?? "—"}</span>
                  <span className="amv-strip-sev" style={{ background: sevCfg.color + "18", color: sevCfg.color }}>
                    {sevCfg.label.toUpperCase()}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}

function AdminMapView() {
  const isDark = useIsDark();
  const location = useLocation();

  const [allReports,  setAllReports ] = useState([]);
  const [loading,     setLoading    ] = useState(true);
  const [error,       setError      ] = useState(null);
  const [refreshing,  setRefreshing ] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);

  const [filterType,     setFilterType    ] = useState("all");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [filterStatus,   setFilterStatus  ] = useState("all");
  const [filterDate,     setFilterDate    ] = useState("all");
  const [search,         setSearch        ] = useState("");
  const [filtersOpen,    setFiltersOpen   ] = useState(false);

  const [viewMode,       setViewMode      ] = useState("markers");
  const [tileKey,        setTileKey       ] = useState("street");
  const [clusterEnabled, setClusterEnabled] = useState(true);
  const [layerPanelOpen, setLayerPanelOpen] = useState(false);

  const [selectedReport, setSelectedReport] = useState(null);
  const [panelOpen,      setPanelOpen      ] = useState(false);
  const [actionLoading,  setActionLoading ] = useState(false);
  const [flyTo,          setFlyTo         ] = useState(null);
  const [lightboxSrc,    setLightboxSrc   ] = useState(null);
  const [showUpload,     setShowUpload    ] = useState(false);
  const [imgError,       setImgError      ] = useState(false);

  const [drawMode,        setDrawMode       ] = useState(false);
  const [selectedBounds,  setSelectedBounds ] = useState(null);
  const [boundsReports,   setBoundsReports  ] = useState([]);
  const [showBoundsPanel, setShowBoundsPanel] = useState(false);

  const [mapBounds,      setMapBounds     ] = useState(null);
  const [totalCount,     setTotalCount    ] = useState(0);
  const [fetchingMore,   setFetchingMore  ] = useState(false);
  const [confirmPending, setConfirmPending] = useState(null); // { id, newStatus }
  const loadingStateRef = useRef({ loadedPages: 0, totalCount: 0 });

  const layerDropRef = useRef(null);
  const filterRef    = useRef(null);
  useClickOutside(layerDropRef, () => setLayerPanelOpen(false));
  useClickOutside(filterRef,    () => setFiltersOpen(false));

  const loadReports = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    const res = await getReports({ page_size: 100, page: 1 });
    if (res.success) {
      const data  = res.data?.results ?? [];
      const total = res.data?.total   ?? data.length;
      const withCoords = data.filter((r) => r.latitude && r.longitude);
      setAllReports(withCoords);
      setTotalCount(total);
      loadingStateRef.current = { loadedPages: 1, totalCount: total };
      setLastRefresh(new Date());
    } else { setError(res.error); }
    setLoading(false);
    setRefreshing(false);
  }, []);

  // Fetch the next page and append — called when the viewport pans to new areas
  const loadMorePages = useCallback(async () => {
    const { loadedPages, totalCount: knownTotal } = loadingStateRef.current;
    if (loadedPages === 0 || loadedPages * 100 >= knownTotal) return;
    setFetchingMore(true);
    const nextPage = loadedPages + 1;
    const res = await getReports({ page_size: 100, page: nextPage });
    if (res.success) {
      const data = (res.data?.results ?? []).filter((r) => r.latitude && r.longitude);
      setAllReports((prev) => {
        const ids = new Set(prev.map((r) => r.id));
        return [...prev, ...data.filter((r) => !ids.has(r.id))];
      });
      loadingStateRef.current = { loadedPages: nextPage, totalCount: knownTotal };
    }
    setFetchingMore(false);
  }, []);

  useEffect(() => { loadReports(); }, [loadReports]);

  // If navigated here with a focusReport in location.state, fly to it on mount
  useEffect(() => {
    const focus = location.state?.focusReport;
    if (focus?.lat != null && focus?.lng != null) {
      setFlyTo([parseFloat(focus.lat), parseFloat(focus.lng)]);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const id = setInterval(() => loadReports(true), REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [loadReports]);

  // When the map viewport changes, try to load the next page if more exist
  useEffect(() => {
    if (mapBounds) loadMorePages();
  }, [mapBounds, loadMorePages]);

  const q = search.toLowerCase();
  const filteredReports = allReports.filter((r) => {
    const type   = (r.ai_damage_type ?? r.damage_type ?? "").toLowerCase();
    const sev    = getSevKey(r);
    const stat   = (r.status ?? "").toLowerCase();
    const matchQ = !q ||
      (r.location_address ?? "").toLowerCase().includes(q) ||
      (r.barangay         ?? "").toLowerCase().includes(q) ||
      String(r.id).includes(q);
    if (!matchQ)                                                return false;
    if (filterType     !== "all" && !type.includes(filterType)) return false;
    if (filterSeverity !== "all" && sev  !== filterSeverity)    return false;
    if (filterStatus   !== "all" && stat !== filterStatus)      return false;
    if (!passesDateFilter(r, filterDate))                       return false;
    return true;
  });

  const counts = allReports.reduce((acc, r) => {
    const k = getSevKey(r); acc[k] = (acc[k] ?? 0) + 1; return acc;
  }, {});

  const inProgressCount = allReports.filter(r => (r.status ?? "").toLowerCase() === "in_progress").length;
  const activeFilters   = [filterType, filterSeverity, filterStatus, filterDate].filter(f => f !== "all").length;

  // Only render pins within the current viewport — stats + strip still use the full filtered set
  const mapVisibleReports = mapBounds
    ? filteredReports.filter((r) => {
        try { return mapBounds.contains(L.latLng(parseFloat(r.latitude), parseFloat(r.longitude))); }
        catch { return false; }
      })
    : filteredReports;

  async function handleAction(reportId, newStatus) {
    setActionLoading(true);
    const res = await updateReport(reportId, { status: newStatus });
    if (res.success) {
      // Optimistic update — instant feedback on chips, popup, and map pins
      setAllReports((prev) => prev.map((r) => r.id === reportId ? { ...r, status: newStatus } : r));
      setSelectedReport((prev) => prev ? { ...prev, status: newStatus } : prev);
      // Server-confirmed sync — re-fetch the single report so pins/panels show authoritative data
      getReport(reportId).then((fresh) => {
        if (fresh.success && fresh.data) {
          setAllReports((prev) =>
            prev.map((r) =>
              r.id === reportId
                ? { ...fresh.data, latitude: fresh.data.latitude ?? r.latitude, longitude: fresh.data.longitude ?? r.longitude }
                : r
            )
          );
          setSelectedReport((prev) => (prev?.id === reportId ? fresh.data : prev));
        }
      });
    }
    setActionLoading(false);
    setConfirmPending(null);
  }

  function handleImageChange(reportId, newUrl) {
    setAllReports((prev) => prev.map((r) => r.id === reportId ? { ...r, image_url: newUrl } : r));
    setSelectedReport((prev) => prev?.id === reportId ? { ...prev, image_url: newUrl } : prev);
    setShowUpload(false);
    setImgError(false);
  }

  const openPanel = useCallback((report) => {
    setSelectedReport(report);
    setPanelOpen(true);
    setShowBoundsPanel(false);
    setShowUpload(false);
    setImgError(false);
    setFlyTo([parseFloat(report.latitude), parseFloat(report.longitude)]);
  }, []);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    setSelectedReport(null);
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

  function fmt(r) {
    return {
      type:     r.ai_damage_type   ?? r.damage_type ?? "Unknown",
      severity: r.ai_severity      ?? r.severity    ?? "Unknown",
      location: r.location_address ?? r.barangay    ?? "Unknown location",
      status:   (r.status ?? "pending").toLowerCase(),
      conf:     r.ai_confidence != null ? `${Math.round(r.ai_confidence * 100)}%` : null,
      date:     r.created_at
                  ? new Date(r.created_at).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })
                  : "—",
      user:     r.owner?.full_name ?? "—",
    };
  }

  const tileUrl  = isDark ? TILES[tileKey].darkUrl  : TILES[tileKey].lightUrl;
  const tileAttr = TILES[tileKey].attr;

  return (
    <>
      {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}

      <div className="amv-shell">
        <div className="amv-root">

          <header className="amv-topbar">
            <div className="amv-topbar-left">
              <div className="amv-page-icon" aria-hidden="true">
                <ScanSearch size={16} strokeWidth={2.2} color="#fff" />
              </div>
              <div className="amv-title-group">
                <h1 className="amv-page-title">Road Damage Map</h1>
                <span className="amv-subtitle">
                  Admin panel · Live reports
                  {lastRefresh && ` · Updated ${lastRefresh.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}`}
                </span>
              </div>
            </div>

            <div className="amv-stat-pills" role="status">
              <div className="amv-pill amv-pill--critical">
                <AlertTriangle size={11} />
                <strong>{counts.critical ?? 0}</strong>
                <span className="amv-pill-label">Critical</span>
              </div>
              <div className="amv-pill amv-pill--warning">
                <AlertTriangle size={11} />
                <strong>{counts.noncritical ?? 0}</strong>
                <span className="amv-pill-label">Non_Critical</span>
              </div>
              <div className="amv-pill amv-pill--blue">
                <Clock size={11} />
                <strong>{inProgressCount}</strong>
                <span className="amv-pill-label">In Progress</span>
              </div>
              <div className="amv-pill amv-pill--green">
                <CheckCircle2 size={11} />
                <strong>{counts.resolved ?? 0}</strong>
                <span className="amv-pill-label">Resolved</span>
              </div>
              <div className="amv-pill amv-pill--neutral">
                <BarChart2 size={11} />
                <strong>{allReports.length}</strong>
                <span className="amv-pill-label">Total</span>
              </div>
            </div>
          </header>

          <div className="amv-controls">
            <div className="amv-controls-row">
              <div className="amv-search-wrap">
                <Search className="amv-search-icon" size={14} />
                <input
                  className="amv-search"
                  placeholder="Search barangay, ID…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search reports"
                />
                {search && (
                  <button className="amv-search-clear" onClick={() => setSearch("")}>
                    <X size={12} />
                  </button>
                )}
              </div>

              <div className="amv-seg-group" role="group" aria-label="View mode">
                {VIEW_MODES.map(({ key, label, icon }) => (
                  <button
                    key={key}
                    className={`amv-seg-btn${viewMode === key ? " amv-seg-btn--active" : ""}`}
                    onClick={() => setViewMode(key)}
                    aria-pressed={viewMode === key}
                  >
                    {icon}<span>{label}</span>
                  </button>
                ))}
              </div>

              <div className="amv-seg-group amv-tile-group" role="group" aria-label="Map style">
                {Object.entries(TILES).map(([k, v]) => (
                  <button
                    key={k}
                    className={`amv-seg-btn${tileKey === k ? " amv-seg-btn--active" : ""}`}
                    onClick={() => setTileKey(k)}
                    aria-pressed={tileKey === k}
                  >
                    {v.icon}<span>{v.label}</span>
                  </button>
                ))}
              </div>

              <div className="amv-controls-right">
                <span className="amv-result-count">
                  <strong>{filteredReports.length}</strong>{" "}
                  {filteredReports.length !== 1 ? "reports" : "report"}
                  {fetchingMore && <span className="amv-loading-more"> · loading…</span>}
                  {!fetchingMore && totalCount > allReports.length && (
                    <span className="amv-loading-more"> · {allReports.length}/{totalCount}</span>
                  )}
                </span>

                <button
                  className={`amv-ctrl-btn${refreshing ? " amv-ctrl-btn--spin" : ""}`}
                  onClick={() => loadReports(true)} title="Refresh"
                >
                  <RefreshCw size={14} />
                </button>

                <button className="amv-ctrl-btn" onClick={() => exportCSV(filteredReports)} title="Export CSV">
                  <Download size={14} />
                </button>

                <button
                  className={`amv-ctrl-btn${drawMode ? " amv-ctrl-btn--active" : ""}`}
                  onClick={() => setDrawMode((d) => !d)}
                  title={drawMode ? "Cancel select" : "Select area"}
                >
                  <Square size={14} />
                </button>

                <div className="amv-dropdown-wrap" ref={layerDropRef}>
                  <button className="amv-ctrl-btn" onClick={() => setLayerPanelOpen((v) => !v)} title="Layers">
                    <Layers size={14} />
                  </button>
                  {layerPanelOpen && (
                    <div className="amv-dropdown amv-layer-panel">
                      <p className="amv-dropdown-title">Map Layers</p>
                      <label className="amv-toggle-row">
                        <span>Marker Clustering</span>
                        <input type="checkbox" checked={clusterEnabled}
                          onChange={(e) => setClusterEnabled(e.target.checked)} />
                      </label>
                    </div>
                  )}
                </div>

                <button
                  className={`amv-filter-toggle${filtersOpen ? " amv-filter-toggle--active" : ""}`}
                  onClick={() => setFiltersOpen((v) => !v)}
                  aria-expanded={filtersOpen}
                >
                  <SlidersHorizontal size={14} />
                  <span>Filters</span>
                  {activeFilters > 0 && <span className="amv-filter-badge">{activeFilters}</span>}
                  <ChevronDown size={12} className={`amv-chevron${filtersOpen ? " amv-chevron--open" : ""}`} />
                </button>
              </div>
            </div>

            <div className={`amv-filter-drawer${filtersOpen ? " amv-filter-drawer--open" : ""}`} aria-hidden={!filtersOpen}>
              <div className="amv-filter-inner">
                <label className="amv-filter-label">
                  <span>Damage Type</span>
                  <select className="amv-select" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                    <option value="all">All Types</option>
                    <option value="pothole">Pothole</option>
                    <option value="crack">Crack</option>
                  </select>
                </label>
                <label className="amv-filter-label">
                  <span>Severity</span>
                  <select className="amv-select" value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value)}>
                    <option value="all">All Severity</option>
                    <option value="critical">Critical</option>
                    <option value="noncritical">Non_Critical</option>
                  </select>
                </label>
                <label className="amv-filter-label">
                  <span>Status</span>
                  <select className="amv-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                    <option value="all">All Status</option>
                    <option value="pending">Pending</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </label>
                <label className="amv-filter-label">
                  <span>Date Range</span>
                  <select className="amv-select" value={filterDate} onChange={(e) => setFilterDate(e.target.value)}>
                    {DATE_FILTERS.map(({ label, value }) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
                <button
                  className="amv-filter-reset"
                  onClick={() => { setFilterType("all"); setFilterSeverity("all"); setFilterStatus("all"); setFilterDate("all"); setSearch(""); }}
                >
                  Reset
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div className="amv-error-banner">
              <AlertTriangle size={14} /> {error}
            </div>
          )}

          <div className="amv-body">
            <div className={`amv-map-wrap${panelOpen ? " amv-map-wrap--panel" : ""}${drawMode ? " amv-draw-cursor" : ""}`}>
              {loading ? (
                <div className="amv-state-view">
                  <div className="amv-spinner" />
                  <p>Loading map data…</p>
                </div>
              ) : (
                <MapContainer center={MAP_CENTER} zoom={MAP_ZOOM} style={{ height: "100%", width: "100%" }} zoomControl={false}>
                  <TileLayer key={tileUrl} url={tileUrl} attribution={tileAttr} />
                  <MapController flyTo={flyTo} />
                  <MapBoundsWatcher onBoundsChange={setMapBounds} />
                  {viewMode === "heat"    && <HeatmapLayer reports={mapVisibleReports} enabled={true} />}
                  {viewMode === "density" && <DensityLayer reports={mapVisibleReports} />}
                  <DrawSelectTool active={drawMode} onBoundsSelected={handleBoundsSelected} />
                  {viewMode === "markers" && (
                    clusterEnabled
                      ? <ClusterLayer  reports={mapVisibleReports} onMarkerClick={openPanel} />
                      : <PlainMarkers  reports={mapVisibleReports} onMarkerClick={openPanel} />
                  )}
                </MapContainer>
              )}

              {!loading && (
                <div className="amv-legend" aria-label="Severity legend">
                  <p className="amv-legend-title">Severity</p>
                  {[
                    { color: "#ef4444", label: "Critical"     },
                    { color: "#f59e0b", label: "Non_Critical" },
                    { color: "#52b788", label: "Fixed"        },
                    { color: "#6b7280", label: "Unknown"      },
                  ].map(({ color, label }) => (
                    <div className="amv-legend-row" key={label}>
                      <span className="amv-legend-dot" style={{ background: color }} />
                      <span>{label}</span>
                    </div>
                  ))}
                  {viewMode === "heat" && <p className="amv-legend-note">Intensity = density + severity</p>}
                </div>
              )}

              {drawMode && (
                <div className="amv-draw-hint">
                  <Square size={14} /> Click and drag to select an area
                </div>
              )}
            </div>

            <aside className={`amv-panel${panelOpen ? " amv-panel--open" : ""}`} aria-label="Report details">
              <div className="amv-panel-drag" aria-hidden="true" />

              {selectedReport && (() => {
                const d      = fmt(selectedReport);
                const sevCfg = SEVERITY_CONFIG[getSevKey(selectedReport)] ?? SEVERITY_CONFIG.default;
                const stCfg  = STATUS_CONFIG[d.status] ?? STATUS_CONFIG.pending;
                const imgSrc = getImageSrc(selectedReport);

                return (
                  <>
                    <div className="amv-panel-head">
                      <div>
                        <h2 className="amv-panel-id">Report #{selectedReport.id}</h2>
                        <p className="amv-panel-loc">{d.location}</p>
                      </div>
                      <button className="amv-panel-close" onClick={closePanel} aria-label="Close panel">
                        <X size={15} strokeWidth={2.5} />
                      </button>
                    </div>

                    {imgSrc && !showUpload && !imgError ? (
                      <button
                        className="amv-panel-photo"
                        onClick={() => setLightboxSrc(imgSrc)}
                        aria-label="Expand photo"
                      >
                        <img src={imgSrc} alt="Road damage" onError={() => setImgError(true)} />
                        <span className="amv-panel-photo-overlay">
                          <Maximize2 size={16} color="#fff" />
                          <span>Expand</span>
                        </span>
                        <button
                          className="amv-photo-replace"
                          onClick={(e) => { e.stopPropagation(); setShowUpload(true); }}
                          title="Replace photo"
                        >
                          <Upload size={11} /> Replace
                        </button>
                      </button>
                    ) : (
                      <div className="amv-upload-container">
                        {showUpload && imgSrc && !imgError && (
                          <button className="amv-upload-cancel" onClick={() => setShowUpload(false)}>
                            Keep existing photo
                          </button>
                        )}
                        <ImageUploadZone
                          key={`${selectedReport.id}-${showUpload}`}
                          reportId={selectedReport.id}
                          onUploaded={(url) => handleImageChange(selectedReport.id, url)}
                        />
                      </div>
                    )}

                    <div className="amv-panel-badges">
                      <span
                        className="amv-sev-chip"
                        style={{ background: sevCfg.color + "18", color: sevCfg.color, borderColor: sevCfg.color + "40" }}
                      >
                        {sevCfg.label.toUpperCase()}
                      </span>
                      <span
                        className="amv-status-chip"
                        style={{ background: stCfg.color + "18", color: stCfg.color, borderColor: stCfg.color + "40" }}
                      >
                        {stCfg.label}
                      </span>
                    </div>

                    <div className="amv-panel-info">
                      {[
                        ["Damage Type", d.type],
                        ["Reporter",    d.user ?? "—"],
                        ["Barangay",    selectedReport.barangay ?? "—"],
                        ["Coordinates", `${parseFloat(selectedReport.latitude).toFixed(5)}, ${parseFloat(selectedReport.longitude).toFixed(5)}`],
                        ["Submitted",   d.date],
                        ...(d.conf ? [["ML Confidence", d.conf]] : []),
                      ].map(([label, value]) => (
                        <div className="amv-info-row" key={label}>
                          <span className="amv-info-label">{label}</span>
                          <span className="amv-info-value">{value}</span>
                        </div>
                      ))}
                    </div>

                    <div className="amv-panel-actions">
                      <button
                        className="amv-fly-btn"
                        onClick={() => setFlyTo([parseFloat(selectedReport.latitude), parseFloat(selectedReport.longitude)])}
                      >
                        <Navigation size={14} strokeWidth={2.2} />
                        Fly to Location
                      </button>
                    </div>

                    <div className="amv-admin-actions">
                      <p className="amv-admin-actions-title">Admin Actions</p>
                      {d.status === "pending" && (
                        <>
                          <p className="amv-action-hint"><Clock size={12} /> Pending — assign to begin work</p>
                          <div className="amv-action-row">
                            <button className="amv-action-btn amv-action-progress" disabled={actionLoading}
                              onClick={() => setConfirmPending({ id: selectedReport.id, newStatus: "in_progress" })}>
                              <Wrench size={13} /> In Progress
                            </button>
                            <button className="amv-action-btn amv-action-reject" disabled={actionLoading}
                              onClick={() => setConfirmPending({ id: selectedReport.id, newStatus: "rejected" })}>
                              <X size={13} /> Reject
                            </button>
                          </div>
                        </>
                      )}
                      {d.status === "in_progress" && (
                        <>
                          <p className="amv-action-hint amv-action-hint--progress"><Wrench size={12} /> In Progress — mark resolved once done</p>
                          <div className="amv-action-row">
                            <button className="amv-action-btn amv-action-resolve amv-action-btn--full" disabled={actionLoading}
                              onClick={() => setConfirmPending({ id: selectedReport.id, newStatus: "resolved" })}>
                              <Check size={13} /> Mark as Resolved
                            </button>
                          </div>
                        </>
                      )}
                      {d.status === "resolved" && (
                        <div className="amv-action-locked amv-action-locked--resolved">
                          <Check size={14} />
                          <span>Report <strong>resolved</strong>. No further actions.</span>
                        </div>
                      )}
                      {d.status === "rejected" && (
                        <div className="amv-action-locked amv-action-locked--rejected">
                          <X size={14} />
                          <span>Report <strong>rejected</strong>. No further actions.</span>
                        </div>
                      )}
                      {actionLoading && <div className="amv-action-loading">Updating…</div>}
                    </div>
                  </>
                );
              })()}
            </aside>
          </div>

          <ReportStrip reports={filteredReports} onSelect={openPanel} />
        </div>
      </div>

      {showBoundsPanel && (
        <div className="amv-bounds-panel">
          <div className="amv-bounds-header">
            <span className="amv-bounds-title">
              <Square size={14} /> {boundsReports.length} report{boundsReports.length !== 1 ? "s" : ""} in selection
            </span>
            <button className="amv-panel-close"
              onClick={() => { setShowBoundsPanel(false); setSelectedBounds(null); }}>
              <X size={16} />
            </button>
          </div>
          <div className="amv-bounds-actions">
            <button className="amv-bounds-btn amv-bounds-btn--primary" onClick={() => exportCSV(boundsReports)}>
              <Download size={13} /> Export
            </button>
            <button className="amv-bounds-btn" onClick={() => boundsReports.forEach((r) => handleAction(r.id, "in_progress"))}>
              <Wrench size={13} /> Bulk: In Progress
            </button>
            <button className="amv-bounds-btn" onClick={() => boundsReports.forEach((r) => handleAction(r.id, "resolved"))}>
              <Check size={13} /> Bulk: Resolve
            </button>
          </div>
          <div className="amv-bounds-list">
            {boundsReports.slice(0, 8).map((r) => {
              const d  = fmt(r);
              const sc = SEVERITY_CONFIG[getSevKey(r)];
              return (
                <div key={r.id} className="amv-bounds-item" onClick={() => { openPanel(r); setShowBoundsPanel(false); }}>
                  <span className="amv-dot" style={{ background: sc.color }} />
                  <span className="amv-bounds-loc">{d.location}</span>
                  <span className="amv-bounds-type">{d.type}</span>
                  <ChevronRight size={13} className="amv-bounds-chevron" />
                </div>
              );
            })}
            {boundsReports.length > 8 && (
              <p className="amv-bounds-more">+{boundsReports.length - 8} more — export to see all</p>
            )}
          </div>
        </div>
      )}
      <ConfirmStatusDialog
        pending={confirmPending}
        onConfirm={() => handleAction(confirmPending.id, confirmPending.newStatus)}
        onCancel={() => setConfirmPending(null)}
        loading={actionLoading}
      />
    </>
  );
}

export default AdminMapView;