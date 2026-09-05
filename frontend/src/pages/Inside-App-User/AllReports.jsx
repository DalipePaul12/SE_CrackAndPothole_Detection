import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle, ChevronLeft, ChevronRight, X,
  ChevronDown, ChevronUp, ImageOff, MapPin, Calendar,
  Activity, Shield, TrendingUp, Database, Search,
  FileText, Clock, Image as ImageIcon, Wrench, CircleCheck,
  ShieldX, CheckCheck, Send, FileSearch, Info, Camera, ZoomIn, Wallet,
} from "lucide-react";
import "./AllReports.css";
import { useReports } from "../../hooks/useReports";
import { SkeletonTableRow } from "../../components/SkeletonRow";
// ASSUMPTION: adjust this path/export name to match your actual API module.
// Must be reachable by a citizen (report owner), not admin-only.
import { getProjects, getProjectCompletion } from "../../api/projects";

const BASE_URL = import.meta.env.VITE_API_URL || "";

const resolveMediaUrl = (url) => {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : `${BASE_URL}${url}`;
};

const toClass = (str = "") =>
  str.toLowerCase().replaceAll(" ", "-").replaceAll("_", "-");

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—";

const fmtDT = (iso) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

const STATUS_LABEL = { PENDING: "Pending", IN_PROGRESS: "In Progress", VERIFIED: "Verified", RESOLVED: "Resolved", DECLINED: "Declined" };
const STATUS_STEPS = ["PENDING", "VERIFIED", "IN_PROGRESS", "RESOLVED"];

const getMediaAttachment = (report) => report?.media_attachments?.[0] ?? null;

function Pagination({ page, setPage, total, pageSize = 10 }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  return (
    <div className="pagination" role="navigation" aria-label="Report pages">
      <button
        className="page-btn"
        onClick={() => setPage((p) => Math.max(1, p - 1))}
        disabled={page <= 1}
        aria-label="Previous page"
      >
        <ChevronLeft size={15} /> Prev
      </button>
      <span className="page-info">
        Page {page} of {totalPages}&nbsp;·&nbsp;{total} report{total !== 1 ? "s" : ""}
      </span>
      <button
        className="page-btn"
        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
        disabled={page >= totalPages}
        aria-label="Next page"
      >
        Next <ChevronRight size={15} />
      </button>
    </div>
  );
}

function StatusProgress({ status }) {
  if (status === "DECLINED") {
    return (
      <div className="arm-status-progress arm-declined-progress">
        <ShieldX size={16} aria-hidden="true" />
        <span className="arm-declined-label">Report Declined</span>
      </div>
    );
  }
  const StepIcons = [Send, FileSearch, Wrench, CircleCheck];
  const currentIdx = STATUS_STEPS.indexOf(status);

  return (
    <div className="arm-status-progress" role="progressbar" aria-label="Report status">
      {STATUS_STEPS.map((step, idx) => {
        const StepIcon = StepIcons[idx];
        return (
          <React.Fragment key={step}>
            <div className={`arm-progress-step ${idx <= currentIdx ? "step-active" : ""} ${idx === currentIdx ? "step-current" : ""}`}>
              <div className="arm-step-dot" aria-hidden="true">
                {idx < currentIdx ? <CheckCheck size={12} /> : <StepIcon size={12} />}
              </div>
              <span className="arm-step-label">{STATUS_LABEL[step]}</span>
            </div>
            {idx < STATUS_STEPS.length - 1 && (
              <div className={`arm-progress-line ${idx < currentIdx ? "line-active" : ""}`} aria-hidden="true" />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function ReportTimeline({ report }) {
  const events = [{ label: "Submitted", date: report.created_at, Icon: Send }];
  if (report.verified_at)    events.push({ label: "Verified",    date: report.verified_at,    Icon: FileSearch });
  if (report.in_progress_at) events.push({ label: "In Progress", date: report.in_progress_at, Icon: Wrench });
  if (report.resolved_at)    events.push({ label: "Resolved",    date: report.resolved_at,    Icon: CircleCheck });
  if (report.declined_at)    events.push({ label: "Declined",    date: report.declined_at,    Icon: ShieldX });
  events.sort((a, b) => new Date(a.date) - new Date(b.date));

  return (
    <div className="arm-timeline">
      {events.map((evt, i) => {
        const Icon = evt.Icon;
        return (
          <div key={i} className="arm-timeline-item">
            <div className="arm-timeline-icon" aria-hidden="true"><Icon size={16} /></div>
            <div className="arm-timeline-body">
              <span className="arm-timeline-label">{evt.label}</span>
              <span className="arm-timeline-date">
                <Clock size={11} aria-hidden="true" />
                {fmtDT(evt.date)}
              </span>
            </div>
            {i < events.length - 1 && <div className="arm-timeline-connector" aria-hidden="true" />}
          </div>
        );
      })}
    </div>
  );
}

function ReportModal({ report, onClose }) {
  const mediaAtt = getMediaAttachment(report);
  const imageUrl = mediaAtt ? resolveMediaUrl(mediaAtt.file_url) : null;
  const isVideo  = mediaAtt?.media_type === "video";
  const [imgError, setImgError] = useState(false);
  const [activeTab, setActiveTab] = useState("details");
  const [lightboxItems, setLightboxItems] = useState([]); // [{ url, label }]
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const touchStartXRef = useRef(null);
  const status = report.status ?? "";

  const lightboxUrl   = lightboxItems[lightboxIndex]?.url ?? null;
  const openLightbox  = (items, startIndex = 0) => { setLightboxItems(items); setLightboxIndex(startIndex); };
  const closeLightbox = () => { setLightboxItems([]); setLightboxIndex(0); };
  const lightboxNext  = () => setLightboxIndex((i) => (i + 1) % lightboxItems.length);
  const lightboxPrev  = () => setLightboxIndex((i) => (i - 1 + lightboxItems.length) % lightboxItems.length);

  const handleTouchStart = (e) => { touchStartXRef.current = e.touches[0].clientX; };
  const handleTouchEnd = (e) => {
    if (touchStartXRef.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartXRef.current;
    if (Math.abs(dx) > 40) { dx < 0 ? lightboxNext() : lightboxPrev(); }
    touchStartXRef.current = null;
  };
  const isResolved = status === "RESOLVED";

  // ── Completion data (resolved reports only, citizen-safe subset) ───────
  const [completion,  setCompletion]  = useState(report.completion ?? null);
  const [compLoading, setCompLoading] = useState(false);
  const [compError,   setCompError]   = useState(null);

  useEffect(() => {
    if (!isResolved || report.completion) return;
    let cancelled = false;
    setCompLoading(true);
    setCompError(null);

    (async () => {
      try {
        const projsRes = await getProjects();
        const proj = (projsRes?.data ?? []).find((p) => p.report_id === report.id);
        if (!proj) {
          if (!cancelled) setCompError("no-linked-project");
          return;
        }
        const cRes = await getProjectCompletion(proj.id);
        console.log("[DEBUG] project found:", proj);
        console.log("[DEBUG] completion response:", cRes);
        if (!cancelled) setCompletion(cRes?.data ?? null);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[ReportModal] Failed to load completion for report #${report.id}:`, err);
        if (!cancelled) setCompError("fetch-failed");
      } finally {
        if (!cancelled) setCompLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [isResolved, report.completion, report.id]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    document.body.classList.add("arm-modal-open");
    return () => {
      document.body.style.overflow = "";
      document.body.classList.remove("arm-modal-open");
    };
  }, []);
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape" && lightboxItems.length === 0) onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, lightboxItems.length]);

  useEffect(() => {
    if (lightboxItems.length === 0) return;
    const handler = (e) => {
      if (e.key === "Escape")    closeLightbox();
      if (e.key === "ArrowRight") lightboxNext();
      if (e.key === "ArrowLeft")  lightboxPrev();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [lightboxItems.length]);

  const TABS = [
    { id: "details",  label: "Details",  Icon: FileText },
    { id: "timeline", label: "Timeline", Icon: Clock },
    { id: "media",    label: "Media",    Icon: ImageIcon },
    ...(isResolved ? [{ id: "completion", label: "Completion", Icon: CircleCheck }] : []),
  ];

  return createPortal(
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Report details"
    >
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
          <X size={16} />
        </button>

        <div className="arm-modal-header">
          <div>
            <h2 className="arm-modal-title">Report #{report.id}</h2>
            <p className="arm-modal-subtitle">
              <MapPin size={12} style={{ display: "inline", marginRight: 4 }} aria-hidden="true" />
              {report.barangay ?? report.street_name ?? "—"}
            </p>
          </div>
          <span className={`status ${toClass(status)} arm-status-pill`}>
            {STATUS_LABEL[status] ?? status ?? "—"}
          </span>
        </div>

        <StatusProgress status={status} />

        <div className="arm-modal-tabs" role="tablist">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={activeTab === id}
              className={`arm-modal-tab ${activeTab === id ? "active" : ""}`}
              onClick={() => setActiveTab(id)}
            >
              <Icon size={14} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        <div className="arm-modal-body">
          {activeTab === "details" && (
            <div>
              <div className="arm-detail-grid">
                <div className="arm-detail-item">
                  <div className="arm-detail-key"><AlertTriangle size={13} aria-hidden="true" /><span>DAMAGE TYPE</span></div>
                  <div className="arm-detail-val">{report.ai_damage_type ?? "—"}</div>
                </div>

                <div className="arm-detail-item">
                  <div className="arm-detail-key"><TrendingUp size={13} aria-hidden="true" /><span>SEVERITY</span></div>
                  <div className={`arm-detail-val severity-pill ${toClass(report.ai_severity ?? "")}`}>
                    {(report.ai_severity ?? "—").toString().toUpperCase()}
                  </div>
                </div>

                <div className="arm-detail-item">
                  <div className="arm-detail-key"><Clock size={13} aria-hidden="true" /><span>SUBMITTED</span></div>
                  <div className="arm-detail-val">{fmtDate(report.created_at)}</div>
                </div>

                <div className="arm-detail-item">
                  <div className="arm-detail-key"><MapPin size={13} aria-hidden="true" /><span>BARANGAY</span></div>
                  <div className="arm-detail-val">{report.barangay ?? "—"}</div>
                </div>

                <div className="arm-detail-item">
                  <div className="arm-detail-key"><MapPin size={13} aria-hidden="true" /><span>STREET</span></div>
                  <div className="arm-detail-val">{report.street_name ?? "—"}</div>
                </div>

                {report.latitude != null && report.longitude != null && (
                  <div className="arm-detail-item">
                    <div className="arm-detail-key"><MapPin size={13} aria-hidden="true" /><span>COORDINATES</span></div>
                    <div className="arm-detail-val">{report.latitude.toFixed(5)}, {report.longitude.toFixed(5)}</div>
                  </div>
                )}

                {report.upvote_count > 0 && (
                  <div className="arm-detail-item">
                    <div className="arm-detail-key"><Activity size={13} aria-hidden="true" /><span>UPVOTES</span></div>
                    <div className="arm-detail-val">{report.upvote_count} people</div>
                  </div>
                )}

                {report.ai_confidence != null && (
                  <div className="arm-detail-item arm-detail-item--full">
                    <div className="arm-detail-key"><Shield size={13} aria-hidden="true" /><span>AI CONFIDENCE</span></div>
                    <div className="arm-confidence-wrap">
                      <span className="arm-confidence-text">{(report.ai_confidence * 100).toFixed(1)}%</span>
                      <span className="arm-confidence-track">
                        <span
                          className="arm-confidence-fill"
                          style={{ width: `${Math.min(100, report.ai_confidence * 100)}%` }}
                        />
                      </span>
                    </div>
                  </div>
                )}

                {report.description && (
                  <div className="arm-detail-item arm-detail-item--full">
                    <div className="arm-detail-key"><Info size={13} aria-hidden="true" /><span>DESCRIPTION</span></div>
                    <p className="arm-detail-desc-text">{report.description}</p>
                  </div>
                )}
              </div>

              {status === "DECLINED" && report.decline_reason && (
                <div className="decline-reason">
                  <AlertTriangle size={15} />
                  <span><strong>Reason:</strong> {report.decline_reason}</span>
                </div>
              )}

              {report.is_flagged_fake && (
                <div className="ai-flag-badge" role="alert">
                  <AlertTriangle size={15} />
                  <span>
                    Flagged as possibly AI-generated
                    {report.fake_confidence != null &&
                      ` (${(report.fake_confidence * 100).toFixed(0)}% confidence)`}
                  </span>
                </div>
              )}
            </div>
          )}
          {activeTab === "timeline" && <ReportTimeline report={report} />}

          {activeTab === "media" && (
            <div className="arm-media-tab-wrap">
              <div className="arm-media-block">
                <p className="arm-media-block-label">
                  <ImageIcon size={13} aria-hidden="true" /> DAMAGE EVIDENCE
                </p>
                <div className="arm-modal-media">
                  {imageUrl && isVideo ? (
                    <video src={imageUrl} controls style={{ width: "100%", borderRadius: 10 }} />
                  ) : imageUrl && !imgError ? (
                    <button
                      type="button"
                      className="arm-media-zoom-btn"
                      onClick={() => openLightbox([{ url: imageUrl, label: `Report #${report.id} media` }], 0)}
                      aria-label="Expand image"
                    >
                      <img
                        src={imageUrl}
                        alt={`Report #${report.id} media`}
                        onError={() => setImgError(true)}
                        loading="lazy"
                      />
                      <span className="arm-media-zoom-hint"><ZoomIn size={14} /> Tap to expand</span>
                    </button>
                  ) : (
                    <div className="no-image">
                      <ImageOff size={32} />
                      <span>No image available</span>
                    </div>
                  )}
                </div>
              </div>

              {report.frame_detections?.length > 0 && (
                <div className="arm-media-block">
                  <p className="arm-media-block-label">
                    Detection Frames ({report.frame_detections.length})
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: 8 }}>
                    {(() => {
                      const framesWithImages = report.frame_detections.filter((f) => f.image_url);
                      return report.frame_detections.map((fd) => (
                        <button
                          key={fd.id}
                          type="button"
                          onClick={() => {
                            if (!fd.image_url) return;
                            const items = framesWithImages.map((f) => ({
                              url: resolveMediaUrl(f.image_url),
                              label: `${f.damage_type} ${Math.round(f.confidence * 100)}%`,
                            }));
                            const startIndex = framesWithImages.findIndex((f) => f.id === fd.id);
                            openLightbox(items, startIndex);
                          }}
                          style={{ border: "none", padding: 0, cursor: fd.image_url ? "pointer" : "default", borderRadius: 8, overflow: "hidden", position: "relative" }}
                        >
                          {fd.image_url && (
                            <img src={resolveMediaUrl(fd.image_url)} alt={fd.damage_type} style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", display: "block" }} />
                          )}
                          <span style={{ position: "absolute", bottom: 2, left: 2, fontSize: "0.6rem", fontWeight: 700, background: "rgba(0,0,0,0.6)", color: "#fff", padding: "1px 5px", borderRadius: 6 }}>
                            {fd.damage_type} {Math.round(fd.confidence * 100)}%
                          </span>
                        </button>
                      ));
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}
          {activeTab === "completion" && isResolved && (
            <div className="arm-completion-tab">
              {compLoading ? (
                <p className="arm-compl-loading">Loading completion details…</p>
              ) : compError === "no-linked-project" ? (
                <p className="arm-compl-empty">
                  This report is resolved, but no repair project has been linked to it yet.
                  Please check back later or contact support if this persists.
                </p>
              ) : compError === "fetch-failed" ? (
                <p className="arm-compl-empty">
                  Couldn't load completion details right now. Please try again later.
                </p>
              ) : !completion ? (
                <p className="arm-compl-empty">No completion details available yet.</p>
              ) : (
                <>
                  <div className="arm-info-grid">
                    {completion.completed_at && (
                      <div className="arm-info-card">
                        <div className="arm-info-hdr"><Calendar size={13} aria-hidden="true" /><span>COMPLETED ON</span></div>
                        <div className="arm-info-body">
                          <div className="arm-info-row"><span className="arm-info-lbl">Date</span><span className="arm-info-val">{fmtDate(completion.completed_at)}</span></div>
                        </div>
                      </div>
                    )}
                    {completion.actual_cost != null && (
                      <div className="arm-info-card">
                        <div className="arm-info-hdr"><Wallet size={13} aria-hidden="true" /><span>REPAIR COST</span></div>
                        <div className="arm-info-body">
                          <div className="arm-info-row">
                            <span className="arm-info-lbl">Total</span>
                            <span className="arm-info-val arm-cost-val">
                              ₱{Number(completion.actual_cost).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                    {completion.notes && (
                      <div className="arm-info-card arm-info-card--full">
                        <div className="arm-info-hdr"><Info size={13} aria-hidden="true" /><span>REPAIR NOTES</span></div>
                        <div className="arm-info-body"><p className="arm-info-desc-text">{completion.notes}</p></div>
                      </div>
                    )}
                  </div>

                  {completion.completion_photos?.length > 0 && (
                    <div className="arm-compl-photos">
                      <p className="arm-compl-photos-lbl"><Camera size={13} /> Completion Photos</p>
                      <div className="arm-compl-photos-row">
                        {completion.completion_photos.map((ph, phIdx) => {
                          const url = resolveMediaUrl(ph.file_url);
                          return (
                            <button
                              key={ph.id}
                              type="button"
                              className="arm-compl-photo-btn"
                              onClick={() => openLightbox(
                                completion.completion_photos.map((p) => ({
                                  url: resolveMediaUrl(p.file_url),
                                  label: p.file_name ?? "Completion photo",
                                })),
                                phIdx
                              )}
                              aria-label="Expand completion photo"
                            >
                              <img
                                src={url}
                                alt={ph.file_name ?? "Completion photo"}
                                className="arm-compl-photo"
                              />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {lightboxUrl && (
        <div
          className="arm-lightbox-overlay"
          onClick={closeLightbox}
          role="dialog"
          aria-modal="true"
          aria-label="Expanded photo"
        >
          <button
            className="arm-lightbox-close"
            onClick={closeLightbox}
            aria-label="Close preview"
          >
            <X size={22} />
          </button>

          <div
            className="arm-lightbox-body"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {lightboxItems.length > 1 && (
              <button
                type="button"
                className="arm-lightbox-nav arm-lightbox-prev"
                onClick={lightboxPrev}
                aria-label="Previous image"
              >
                <ChevronLeft size={22} />
              </button>
            )}

            <img
              src={lightboxUrl}
              alt={lightboxItems[lightboxIndex]?.label ?? "Expanded view"}
              className="arm-lightbox-img"
            />

            {lightboxItems.length > 1 && (
              <button
                type="button"
                className="arm-lightbox-nav arm-lightbox-next"
                onClick={lightboxNext}
                aria-label="Next image"
              >
                <ChevronRight size={22} />
              </button>
            )}

            {lightboxItems.length > 1 && (
              <div className="arm-lightbox-counter">
                {lightboxIndex + 1} / {lightboxItems.length}
                {lightboxItems[lightboxIndex]?.label ? ` — ${lightboxItems[lightboxIndex].label}` : ""}
              </div>
            )}
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}

function SortIcon({ field, sortField, sortDir }) {
  if (sortField !== field) return <ChevronUp size={11} style={{ opacity: 0.25 }} />;
  return sortDir === "asc"
    ? <ChevronUp   size={11} style={{ color: "var(--primary)" }} />
    : <ChevronDown size={11} style={{ color: "var(--primary)" }} />;
}

function AllReports() {
  const [filters, setFilters]           = useState({ type: "All", severity: "All", status: "All" });
  const [activeFilters, setActiveFilters] = useState({});
  const [selectedReport, setSelectedReport] = useState(null);
  const [drawerOpen, setDrawerOpen]     = useState(false);
  const [search,    setSearch]          = useState("");
  const [sortField, setSortField]       = useState("id");
  const [sortDir,   setSortDir]         = useState("desc");

  const { reports, loading, error, page, setPage, total, pageSize, refetch } = useReports({
    mine:        false,
    status:      activeFilters.status      ?? null,
    barangay:    activeFilters.barangay    ?? null,
    damage_type: activeFilters.type        ?? null,
    severity:    activeFilters.severity    ?? null,
  });

  // ── Client-side search + sort (operates on the current page only) ──────────
  const displayReports = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? reports.filter((r) =>
          String(r.id).includes(q) ||
          (r.barangay    ?? "").toLowerCase().includes(q) ||
          (r.street_name ?? "").toLowerCase().includes(q) ||
          (r.description ?? "").toLowerCase().includes(q)
        )
      : reports;

    const FIELD_MAP = {
      id:         (r) => r.id,
      type:       (r) => r.ai_damage_type ?? "",
      severity:   (r) => r.ai_severity    ?? "",
      status:     (r) => r.status         ?? "",
      created_at: (r) => r.created_at     ?? "",
    };
    const getValue = FIELD_MAP[sortField] ?? FIELD_MAP.id;

    return [...filtered].sort((a, b) => {
      const av = getValue(a);
      const bv = getValue(b);
      const cmp = typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [reports, search, sortField, sortDir]);

  const handleSort = useCallback((field) => {
    setSortField((prev) => {
      if (prev === field) { setSortDir((d) => d === "asc" ? "desc" : "asc"); return field; }
      setSortDir("asc");
      return field;
    });
  }, []);

  const applyFilters = useCallback(() => {
    setActiveFilters({
      // Backend ReportStatus enum values are lowercase ("pending", "in_progress", …)
      status:   filters.status   !== "All" ? filters.status.toLowerCase()   : null,
      // DamageType enum values are lowercase ("crack", "pothole")
      type:     filters.type     !== "All" ? filters.type.toLowerCase()     : null,
      // SeverityLevel enum values are lowercase ("critical", "non_critical")
      severity: filters.severity !== "All" ? filters.severity.toLowerCase() : null,
    });
    setDrawerOpen(false);
  }, [filters]);

  const resetFilters = useCallback(() => {
    setFilters({ type: "All", severity: "All", status: "All" });
    setActiveFilters({});
    setDrawerOpen(false);
  }, []);

  const handleRowClick = useCallback((report) => setSelectedReport(report), []);
  const closeModal     = useCallback(() => setSelectedReport(null), []);

  return (
    <div className="allreports-container">
      <div className="allreports-filters">
        <div className="allreports-header">
          <Database size={18} style={{ color: "var(--primary)", flexShrink: 0 }} />
          <h2>All Reports</h2>
          <span className="report-count">{total} total</span>
        </div>
        <div className="allreports-search-row">
          <div className="allreports-search-wrap">
            <Search size={14} className="allreports-search-icon" aria-hidden="true" />
            <input
              type="search"
              className="allreports-search-input"
              placeholder="Search this page by ID, street, or barangay…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search current page"
            />
          </div>
          {search && (
            <span className="allreports-search-note" role="status" aria-live="polite">
              {displayReports.length} match{displayReports.length !== 1 ? "es" : ""} on this page
            </span>
          )}
        </div>
        <button
          className="filter-toggle-btn"
          onClick={() => setDrawerOpen(!drawerOpen)}
          aria-expanded={drawerOpen}
        >
          <span>Filters</span>
          <ChevronDown size={16} className={drawerOpen ? "chevron-rotate" : ""} />
        </button>
        <div className={`filter-drawer ${drawerOpen ? "open" : ""}`}>
          <div className="filters-row-allreports">
            <div className="filter-group-allreports">
              <label>Damage Type</label>
              <div className="filter-buttons-allreports">
                {["All", "Crack", "Pothole"].map((type) => (
                  <button
                    key={type}
                    className={filters.type === type ? "active" : ""}
                    onClick={() => setFilters((f) => ({ ...f, type }))}
                    aria-pressed={filters.type === type}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
            <div className="filter-group-allreports">
              <label htmlFor="ar-severity">Severity</label>
              <div className="custom-select-allreports">
                <select
                  id="ar-severity"
                  value={filters.severity}
                  onChange={(e) => setFilters((f) => ({ ...f, severity: e.target.value }))}
                >
                  <option value="All">All Severity</option>
                  <option value="non_critical">Non-Critical</option>
                  <option value="critical">Critical</option>
                </select>
                <ChevronDown size={15} className="select-icon" />
              </div>
            </div>
            <div className="filter-group-allreports">
              <label htmlFor="ar-status">Status</label>
              <div className="custom-select-allreports">
                <select
                  id="ar-status"
                  value={filters.status}
                  onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
                >
                  <option value="All">All Status</option>
                  <option value="PENDING">Pending</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="VERIFIED">Verified</option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="DECLINED">Declined</option>
                </select>
                <ChevronDown size={15} className="select-icon" />
              </div>
            </div>
            <div className="filter-actions">
              <button className="apply-filter-btn" onClick={applyFilters}>Apply</button>
              <button className="reset-filter-btn" onClick={resetFilters}>Reset</button>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="reports-error-banner" role="alert">
          <span className="flex-center">
            <AlertTriangle size={17} className="inline-icon" />
            {error}
          </span>
          <button onClick={refetch} className="retry-btn-small">Retry</button>
        </div>
      )}

      <div className="allreports-table-container">
        {loading ? (
          <div className="sk-table-wrap">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonTableRow key={i} cols={[3, 2, 1.5, 1.5, 1.5]} />
            ))}
          </div>
        ) : (
          <table className="allreports-table" aria-label="All reports">
            <thead>
              <tr>
                <th scope="col" className="th-sortable" onClick={() => handleSort("id")} aria-sort={sortField === "id" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Activity size={13} /> Report <SortIcon field="id" sortField={sortField} sortDir={sortDir} />
                  </span>
                </th>
                <th scope="col" className="th-sortable" onClick={() => handleSort("type")} aria-sort={sortField === "type" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    Type <SortIcon field="type" sortField={sortField} sortDir={sortDir} />
                  </span>
                </th>
                <th scope="col" className="th-sortable" onClick={() => handleSort("severity")} aria-sort={sortField === "severity" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <TrendingUp size={13} /> Severity <SortIcon field="severity" sortField={sortField} sortDir={sortDir} />
                  </span>
                </th>
                <th scope="col" className="th-sortable" onClick={() => handleSort("status")} aria-sort={sortField === "status" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Shield size={13} /> Status <SortIcon field="status" sortField={sortField} sortDir={sortDir} />
                  </span>
                </th>
                <th scope="col" className="th-sortable" onClick={() => handleSort("created_at")} aria-sort={sortField === "created_at" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Calendar size={13} /> Date <SortIcon field="created_at" sortField={sortField} sortDir={sortDir} />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {displayReports.length > 0 ? (
                displayReports.map((report) => (
                  <tr
                    key={report.id}
                    onClick={() => handleRowClick(report)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleRowClick(report);
                      }
                    }}
                    className="clickable-row"
                    tabIndex={0}
                    role="button"
                    aria-label={`View Report #${report.id}`}
                  >
                    <td>
                      <strong>Report #{report.id}</strong>
                      <div className="report-location-allreports" title={report.barangay}>
                        <MapPin size={11} />
                        {report.barangay ?? report.street_name ?? "—"}
                      </div>
                    </td>
                    <td>{report.ai_damage_type ?? "—"}</td>
                    <td>
                      <span className={`severity ${toClass(report.ai_severity ?? "")}`}>
                        {report.ai_severity ?? "—"}
                      </span>
                    </td>
                    <td>
                      <span className={`status ${toClass(report.status ?? "")}`}>
                        {report.status ?? "—"}
                      </span>
                    </td>
                    <td>{fmtDate(report.created_at)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="no-data-allreports">
                    No reports found matching the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {!loading && (
        <Pagination page={page} setPage={setPage} total={total} pageSize={pageSize} />
      )}

      {selectedReport && (
        <ReportModal report={selectedReport} onClose={closeModal} />
      )}
    </div>
  );
}

export default AllReports;