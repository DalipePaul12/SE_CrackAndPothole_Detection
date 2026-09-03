import React, { useEffect, useState, useRef, useCallback } from "react";
import "./MapView.css";
import {
  MapContainer, TileLayer, Marker, Popup,
  Polygon, useMap, Circle, ZoomControl,
} from "react-leaflet";
import L from "leaflet";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet/dist/leaflet.css";
import { useTheme } from "../Contexts/ThemeContext";
import { resolveMediaUrl } from "../../utils/mediaUrl";
import { useMapReports } from "../../hooks/useMapReports";
import {
  MapPin, AlertTriangle, Clock, CheckCircle2,
  BarChart2, Layers, Search, X, Maximize2,
  Navigation, SlidersHorizontal, ChevronDown,
  Flame, Circle as CircleIcon, Map, RefreshCw,
} from "lucide-react";

// ─── Image / Video helper ────────────────────────────────────────────────────
const BASE_URL = import.meta.env.VITE_API_URL || "";
const getThumb = (r) => resolveMediaUrl(r?.media_attachments?.[0]?.file_url);

const isVideo = (r) => r?.media_attachments?.[0]?.media_type === "video";

// ─── Fix Leaflet default icon URLs ────────────────────────────────────────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// ─── Normalization helpers ────────────────────────────────────────────────────
const normSev    = (s) => (s || "").toLowerCase().replace(/[^a-z0-9_]/g, "");
const normStatus = (s) => (s || "").toLowerCase();
const normDmg    = (s) => (s || "").toLowerCase();

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

const getIcon = (r) => ICONS[normSev(r.ai_severity)] || ICONS.unknown;

const SEV_COLOR = { critical: "#ef4444", non_critical: "#f59e0b", unknown: "#6b7280" };
const getSevColor = (s) => SEV_COLOR[normSev(s)] || SEV_COLOR.unknown;

const STATUS_LABEL = {
  pending:     "Pending",
  verified:    "Verified",
  in_progress: "In Progress",
  resolved:    "Resolved",
  declined:    "Declined",
};

const getStatusLabel = (s) => STATUS_LABEL[normStatus(s)] || s || "—";
const STATUS_COLOR = {
  pending:     "#f59e0b",
  verified:    "#3b82f6",
  in_progress: "#3b82f6",
  resolved:    "#22c55e",
  declined:    "#ef4444",
};
const getStatusColor = (s) => STATUS_COLOR[normStatus(s)] || "#6b7280";

const esc = (s) =>
  String(s ?? "—")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function buildPopupHTML(r) {
  const thumb = getThumb(r);
  const sevLabel = normSev(r.ai_severity) === "critical" ? "Critical"
    : normSev(r.ai_severity) === "non_critical" ? "Non_Critical" : "Unknown";
  const desc = (r.description || "").slice(0, 140) + (r.description?.length > 140 ? "…" : "");
  return `
    <div class="mv-popup">
      <div class="mv-popup-head">
        <span class="mv-popup-id">#${r.id}</span>
        <span class="mv-popup-sev" style="background:${getSevColor(r.ai_severity)}">${esc(sevLabel)}</span>
      </div>
      ${thumb ? `
        <div class="mv-popup-thumb" data-thumb="${esc(thumb)}" data-video="${isVideo(r)}">
          ${isVideo(r)
            ? `<video src="${esc(thumb)}" muted playsinline preload="metadata" style="width:100%;height:112px;object-fit:cover;display:block"></video>`
            : `<img src="${esc(thumb)}" alt="Report evidence" />`}
        </div>` : ""
      }
      <div class="mv-popup-body">
        <p class="mv-popup-desc">${esc(desc)}</p>
        <div class="mv-popup-meta">
          <span class="mv-popup-status">${esc(getStatusLabel(r.status))}</span>
          <span class="mv-popup-barangay">${esc(r.barangay || "—")}</span>
        </div>
        <button class="mv-popup-btn" data-rid="${r.id}">View Details</button>
      </div>
    </div>
  `;
}
// ─── Date filter helper ───────────────────────────────────────────────────────
const DATE_FILTERS = [
  { label: "All time",   value: "all"   },
  { label: "Last 24h",   value: "24h"   },
  { label: "Last week",  value: "week"  },
  { label: "Last month", value: "month" },
];

function passesDateFilter(r, range) {
  if (range === "all") return true;
  const created = new Date(r.created_at ?? r.date_reported ?? 0);
  const ms = { "24h": 86_400_000, week: 604_800_000, month: 2_592_000_000 }[range];
  return Date.now() - created.getTime() <= ms;
}

// ─── Map config ────────────────────────────────────────────────────────────────
const MALABON_BOUNDARY = [
  [14.6685, 120.9578], [14.6701, 120.9623], [14.6720, 120.9658], [14.6738, 120.9689],
  [14.6725, 120.9720], [14.6698, 120.9748], [14.6665, 120.9762], [14.6630, 120.9771],
  [14.6595, 120.9765], [14.6558, 120.9748], [14.6530, 120.9720], [14.6512, 120.9688],
  [14.6508, 120.9650], [14.6518, 120.9615], [14.6540, 120.9585], [14.6572, 120.9563],
  [14.6610, 120.9553], [14.6648, 120.9558], [14.6685, 120.9578],
];
const CENTER = [14.6615, 120.966];

// ─── Tile Providers ────────────────────────────────────────────────────────────
const TILES = {
  street: {
    label: "Street", icon: <Map size={12} />,
    light: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    dark:  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attr:  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  dark: {
    label: "Dark", icon: <Layers size={12} />,
    light: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    dark:  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attr:  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  satellite: {
    label: "Satellite", icon: <CircleIcon size={12} />,
    light: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    dark:  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attr:  '&copy; Esri',
  },
  topo: {
    label: "Topo", icon: <BarChart2 size={12} />,
    light: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    dark:  "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attr:  '&copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
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

/**
 * MapBootstrap — invalidates Leaflet map size on mount and whenever
 * panelOpen changes so the tile layer fills the available space correctly.
 */
function MapBootstrap({ panelOpen }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    const container = map.getContainer();
    const invalidate = () => {
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        map.invalidateSize({ animate: true, debounceMoveend: true });
      }
    };
    const timers = [
      setTimeout(invalidate, 0),
      setTimeout(invalidate, 50),
      setTimeout(invalidate, 150),
      setTimeout(invalidate, 300),
      setTimeout(invalidate, 600),
      setTimeout(invalidate, 1000),
    ];
    const onResize = () => invalidate();
    window.addEventListener("resize", onResize);
    let ro;
    if ("ResizeObserver" in window) {
      ro = new ResizeObserver(() => invalidate());
      ro.observe(container);
    }
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener("resize", onResize);
      if (ro) ro.disconnect();
    };
  }, [map]);

  // Re-invalidate whenever the side-panel opens/closes
  useEffect(() => {
    if (!map) return;
    const timers = [
      setTimeout(() => map.invalidateSize({ animate: true }), 50),
      setTimeout(() => map.invalidateSize({ animate: true }), 350),
    ];
    return () => timers.forEach(clearTimeout);
  }, [panelOpen, map]);

  return null;
}

function TileErrorHandler() {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const onTileError = (e) => console.warn("[Snap2Fix] Tile failed:", e?.url);
    map.on("tileerror", onTileError);
    return () => map.off("tileerror", onTileError);
  }, [map]);
  return null;
}

function HeatmapLayer({ reports }) {
  const map = useMap();
  const layerRef = useRef(null);
  useEffect(() => {
    const pts = reports
      .filter((r) => r.latitude && r.longitude)
      .map((r) => {
        const w =
          normSev(r.ai_severity) === "critical"       ? 1.0
          : normSev(r.ai_severity) === "non_critical" ? 0.5 : 0.3;
        return [parseFloat(r.latitude), parseFloat(r.longitude), w];
      });
    if (!pts.length || !map) return;
    let cancelled = false;
    import("leaflet.heat")
      .then(() => {
        if (cancelled || !map || !L.heatLayer) return;
        if (layerRef.current) map.removeLayer(layerRef.current);
        layerRef.current = L.heatLayer(pts, {
          radius: 35, blur: 25, maxZoom: 17,
          gradient: { 0.2: "#3b82f6", 0.5: "#f59e0b", 1.0: "#ef4444" },
        }).addTo(map);
      })
      .catch((err) => console.error("[Snap2Fix] leaflet.heat load failed:", err));
    return () => {
      cancelled = true;
      if (layerRef.current && map) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
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

function ClusterLayer({ reports, onMarkerClick, onLightbox }) {
  const map           = useMap();
  const groupRef       = useRef(null);
  const reportsRef     = useRef(reports);
  const onClickRef     = useRef(onMarkerClick);
  const onLightboxRef  = useRef(onLightbox);
  reportsRef.current    = reports;
  onClickRef.current    = onMarkerClick;
  onLightboxRef.current = onLightbox;

  useEffect(() => {
    groupRef.current = L.markerClusterGroup({
      chunkedLoading: true,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      maxClusterRadius: 60,
      iconCreateFunction(cluster) {
        const count = cluster.getChildCount();
        const size  = count < 10 ? 36 : count < 50 ? 42 : 48;
        return L.divIcon({
          className: "",
          html: `<div class="mv-cluster" style="width:${size}px;height:${size}px">${count}</div>`,
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
      const thumbEl = el.querySelector("[data-thumb]");
      if (thumbEl) {
        thumbEl.onclick = () => {
          onLightboxRef.current(thumbEl.dataset.thumb, thumbEl.dataset.video === "true");
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
        { icon: getIcon(r) }
      );
      m.bindPopup(buildPopupHTML(r), { maxWidth: 260, className: "mv-popup-wrap" });
      m.on("click", () => onClickRef.current(r));
      return m;
    });
    groupRef.current.addLayers(markers);
  }, [reports]);

  return null;
}

function Lightbox({ src, isVideo, onClose }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="mv-lightbox" onClick={onClose} role="dialog" aria-modal="true">
      <div className="mv-lightbox-inner" onClick={(e) => e.stopPropagation()}>
        <button className="mv-lightbox-close" onClick={onClose} aria-label="Close">
          <X size={18} strokeWidth={2.5} />
        </button>
        {isVideo ? (
          <video src={src} controls autoPlay style={{ maxWidth: "100%", maxHeight: "80vh" }} />
        ) : (
          <img src={src} alt="Report evidence" />
        )}
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
  const [filterDmg,    setFilterDmg]    = useState("all");
  const [filterSev,    setFilterSev]    = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDate,   setFilterDate]   = useState("all");
  const [search,       setSearch]       = useState("");
  const [flyTarget,    setFlyTarget]    = useState(null);
  const [lightbox,     setLightbox]     = useState(null);
  const [lightboxIsVideo, setLightboxIsVideo] = useState(false);
  const [selected,     setSelected]     = useState(null);
  const [panelOpen,    setPanelOpen]    = useState(false);
  const [filtersOpen,  setFiltersOpen]  = useState(false);

  const { reports, loading, error, refetch } = useMapReports();

  // Derived state
  const safe   = Array.isArray(reports) ? reports : [];
  const mapped = safe.filter((r) => r.latitude && r.longitude);
  const q      = search.toLowerCase();

  // ─── Filter logic ────────────────────────────────────────────────────────────
  const filtered = mapped.filter((r) => {
    const dmg    = normDmg(r.ai_damage_type);
    const sev    = normSev(r.ai_severity);
    const status = normStatus(r.status);
    const matchQ =
      !q ||
      (r.barangay    || "").toLowerCase().includes(q) ||
      (r.description || "").toLowerCase().includes(q) ||
      String(r.id).includes(q);

    const matchDmg    = filterDmg    === "all" || dmg    === filterDmg;
    const matchSev    = filterSev    === "all" || sev    === filterSev;
    const matchStatus = filterStatus === "all" || status === filterStatus;
    const matchDate   = passesDateFilter(r, filterDate);

    return matchQ && matchDmg && matchSev && matchStatus && matchDate;
  });

  const activeFilters = [filterDmg, filterSev, filterStatus, filterDate].filter((f) => f !== "all").length;

  const counts = {
    critical:    mapped.filter((r) => normSev(r.ai_severity) === "critical").length,
    nonCritical: mapped.filter((r) => normSev(r.ai_severity) === "non_critical").length,
    inProgress:  mapped.filter((r) => normStatus(r.status) === "in_progress").length,
    resolved:    mapped.filter((r) => normStatus(r.status) === "resolved").length,
  };

  const openPanel = useCallback((r) => {
    setSelected(r);
    setPanelOpen(true);
    setFlyTarget([parseFloat(r.latitude), parseFloat(r.longitude)]);
  }, []);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    // Delay clearing selected so close animation plays fully
    setTimeout(() => setSelected(null), 300);
  }, []);

  const tile    = TILES[tileKey];
  const tileUrl = isDark ? tile.dark : tile.light;

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div data-theme={theme} className="mv-shell">
      <div className="mv-root">

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
              <span className="mv-pill-label">Non_Critical</span>
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
                className="mv-ctrl-btn"
                onClick={() => refetch?.()}
                title="Refresh"
                aria-label="Refresh reports"
              >
                <RefreshCw size={14} />
              </button>

              <button
                className={`mv-filter-toggle${filtersOpen ? " mv-filter-toggle--active" : ""}`}
                onClick={() => setFiltersOpen((p) => !p)}
                aria-expanded={filtersOpen}
                aria-controls="mv-filter-drawer"
              >
                <SlidersHorizontal size={14} />
                <span>Filters</span>
                {activeFilters > 0 && (
                  <span className="mv-filter-badge">{activeFilters}</span>
                )}
                <ChevronDown
                  size={12}
                  className={`mv-chevron${filtersOpen ? " mv-chevron--open" : ""}`}
                />
              </button>
            </div>
          </div>

          {/* ── Filter drawer ── */}
          <div
            id="mv-filter-drawer"
            className={`mv-filter-drawer${filtersOpen ? " mv-filter-drawer--open" : ""}`}
            aria-hidden={!filtersOpen}
          >
            <div className="mv-filter-inner">
              <label className="mv-filter-label">
                <span>Damage Type</span>
                <select className="mv-select" value={filterDmg} onChange={(e) => setFilterDmg(e.target.value)}>
                  <option value="all">All Types</option>
                  <option value="pothole">Pothole</option>
                  <option value="crack">Crack</option>
                </select>
              </label>
              <label className="mv-filter-label">
                <span>Severity</span>
                <select className="mv-select" value={filterSev} onChange={(e) => setFilterSev(e.target.value)}>
                  <option value="all">All Severity</option>
                  <option value="critical">Critical</option>
                  <option value="non_critical">Non_Critical</option>
                </select>
              </label>
              <label className="mv-filter-label">
                <span>Status</span>
                <select className="mv-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                  <option value="all">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="verified">Verified</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="declined">Declined</option>
                </select>
              </label>
              <label className="mv-filter-label">
                <span>Date Range</span>
                <select className="mv-select" value={filterDate} onChange={(e) => setFilterDate(e.target.value)}>
                  {DATE_FILTERS.map(({ label, value }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <button
                className="mv-filter-reset"
                onClick={() => {
                  setFilterDmg("all");
                  setFilterSev("all");
                  setFilterStatus("all");
                  setFilterDate("all");
                  setSearch("");
                }}
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            BODY — map + right-side detail panel (side-by-side flex layout)
        ══════════════════════════════════════════════════════════════════════ */}
        <div className="mv-body">

          {/* ── Map wrapper — shrinks when panel is open ── */}
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
                center={CENTER}
                zoom={14}
                minZoom={12}
                zoomControl={false}
                className="mv-leaflet-instance"
              >
                <TileLayer key={tileUrl} url={tileUrl} attribution={tile.attr} />
                <ZoomControl position="bottomright" />
                <MapBootstrap panelOpen={panelOpen} />
                <TileErrorHandler />
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

                {viewMode === "markers" && (
                  <ClusterLayer
                    reports={filtered}
                    onMarkerClick={openPanel}
                    onLightbox={(src, video) => { setLightbox(src); setLightboxIsVideo(video); }}
                  />
                )}
              </MapContainer>
            )}
          </div>

          {/* ══════════════════════════════════════════════════════════════════
              RIGHT-SIDE DETAIL PANEL
          ══════════════════════════════════════════════════════════════════ */}
          <aside
            className={`mv-panel${panelOpen ? " mv-panel--open" : ""}`}
            aria-label="Report details"
            aria-hidden={!panelOpen}
          >
            {selected && (
              <>
                <div className="mv-panel-header">
                  <h2 className="mv-panel-title">Report #{selected.id}</h2>
                  <button
                    className="mv-panel-close"
                    onClick={closePanel}
                    aria-label="Close details panel"
                  >
                    <X size={18} strokeWidth={2.5} />
                  </button>
                </div>

                <div className="mv-panel-body">
                  {/* ── Severity + status badges ── */}
                  <div className="mv-panel-badges">
                    <span
                      className="mv-badge mv-badge--sev"
                      style={{
                        backgroundColor: getSevColor(selected.ai_severity) + "20",
                        color: getSevColor(selected.ai_severity),
                        border: `1px solid ${getSevColor(selected.ai_severity)}40`,
                      }}
                    >
                      {normSev(selected.ai_severity) === "critical"
                        ? "Critical"
                        : normSev(selected.ai_severity) === "non_critical"
                        ? "Non_Critical"
                        : "Unknown"}
                    </span>
                    <span
                      className="mv-badge mv-badge--status"
                      style={{
                        backgroundColor: getStatusColor(selected.status) + "20",
                        color: getStatusColor(selected.status),
                        border: `1px solid ${getStatusColor(selected.status)}40`,
                      }}
                    >
                      {getStatusLabel(selected.status)}
                    </span>
                  </div>

                  {/* ── Evidence media ── */}
                  {getThumb(selected) && (
                    <div
                      className="mv-panel-image"
                      onClick={() => !isVideo(selected) && (setLightbox(getThumb(selected)), setLightboxIsVideo(false))}
                      role="button"
                      tabIndex={0}
                      aria-label={isVideo(selected) ? "Video evidence" : "View full-size evidence photo"}
                      onKeyDown={(e) => e.key === "Enter" && !isVideo(selected) && (setLightbox(getThumb(selected)), setLightboxIsVideo(false))}
                      style={isVideo(selected) ? { cursor: "default" } : undefined}
                    >
                      {isVideo(selected) ? (
                        <video
                          src={getThumb(selected)}
                          muted
                          playsInline
                          controls
                          preload="metadata"
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        <>
                          <img
                            src={getThumb(selected)}
                            alt="Report evidence"
                            loading="lazy"
                          />
                          <div className="mv-panel-image-overlay">
                            <Maximize2 size={20} color="#fff" />
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* ── Description (kept standalone — often multi-line) ── */}
                  <div className="mv-panel-section">
                    <h3>Description</h3>
                    <p>{selected.description || "No description provided."}</p>
                  </div>

                  {/* ── Info card — grouped rows with icons and dividers ── */}
                  <div className="mv-info-card">
                    <div className="mv-info-item">
                      <div className="mv-info-icon"><Navigation size={14} /></div>
                      <div className="mv-info-text">
                        <span className="mv-info-label">Location</span>
                        <span className="mv-info-value">{selected.barangay || "—"}</span>
                        <span className="mv-info-sub">
                          {parseFloat(selected.latitude).toFixed(6)}°,{" "}
                          {parseFloat(selected.longitude).toFixed(6)}°
                        </span>
                      </div>
                    </div>

                    <div className="mv-info-divider" />

                    <div className="mv-info-item">
                      <div className="mv-info-icon"><AlertTriangle size={14} /></div>
                      <div className="mv-info-text">
                        <span className="mv-info-label">Damage Type</span>
                        <span className="mv-info-value">
                          {selected.ai_damage_type
                            ? selected.ai_damage_type
                                .replace(/_/g, " ")
                                .replace(/\b\w/g, (l) => l.toUpperCase())
                            : "—"}
                        </span>
                      </div>
                    </div>

                    <div className="mv-info-divider" />

                    <div className="mv-info-item">
                      <div className="mv-info-icon"><Clock size={14} /></div>
                      <div className="mv-info-text">
                        <span className="mv-info-label">Date Reported</span>
                        <span className="mv-info-value">
                          {new Date(
                            selected.created_at ?? selected.date_reported ?? 0
                          ).toLocaleString("en-PH", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </aside>
        </div>

        {/* ── Bottom strip — report carousel ── */}
        <div className="mv-strip">
          <div className="mv-strip-label">Reports</div>
          <div className="mv-strip-scroll">
            {filtered.length === 0 ? (
              <span className="mv-strip-empty">No reports match your filters</span>
            ) : (
              filtered.map((r) => {
                const thumb = getThumb(r);
                return (
                  <div
                    key={r.id}
                    className={`mv-strip-card${selected?.id === r.id ? " mv-strip-card--active" : ""}`}
                    onClick={() => openPanel(r)}
                    role="button"
                    tabIndex={0}
                    aria-label={`View report #${r.id} — ${r.barangay || "unknown location"}`}
                    onKeyDown={(e) => e.key === "Enter" && openPanel(r)}
                  >
                    {thumb ? (
                      isVideo(r) ? (
                        <video className="mv-strip-thumb" src={thumb} muted playsInline preload="metadata" />
                      ) : (
                        <img className="mv-strip-thumb" src={thumb} alt="" loading="lazy" />
                      )
                    ) : (
                      <div className="mv-strip-thumb mv-strip-thumb--empty">
                        <MapPin size={16} />
                      </div>
                    )}
                    <div className="mv-strip-info">
                      <span className="mv-strip-id">#{r.id}</span>
                      <span className="mv-strip-loc">{r.barangay || "—"}</span>
                      <span
                        className="mv-strip-sev"
                        style={{
                          background:
                            normSev(r.ai_severity) === "critical"
                              ? "rgba(239,68,68,0.15)"
                              : normSev(r.ai_severity) === "non_critical"
                              ? "rgba(245,158,11,0.15)"
                              : "rgba(107,114,128,0.15)",
                          color: getSevColor(r.ai_severity),
                        }}
                      >
                        {normSev(r.ai_severity) === "critical"
                          ? "Critical"
                          : normSev(r.ai_severity) === "non_critical"
                          ? "Non_Critical"
                          : "Unknown"}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>

      {/* Lightbox (full-screen media viewer) */}
      {lightbox && (
        <Lightbox
          src={lightbox}
          isVideo={lightboxIsVideo}
          onClose={() => { setLightbox(null); setLightboxIsVideo(false); }}
        />
      )}
    </div>
  );
}