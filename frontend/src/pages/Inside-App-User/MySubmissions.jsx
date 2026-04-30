import React, { useState, useEffect, useCallback } from "react";
import "./MySubmissions.css";

import Sidebar   from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";

import { useReports } from "../../hooks/useReports";

const BASE_URL = import.meta.env.VITE_API_URL || "";

const toClass  = (str = "") => str.toLowerCase().replaceAll(" ", "-").replaceAll("_", "-");
const fmtDate  = (iso) => iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—";
const mediaUrl = (attachment) => attachment?.file_url ? `${BASE_URL}${attachment.file_url}` : null;

const STATUS_LABEL = {
  PENDING:     "Pending",
  IN_PROGRESS: "In Progress",
  VERIFIED:    "Verified",
  RESOLVED:    "Resolved",
  DECLINED:    "Declined",
};

function Pagination({ page, setPage, total, pageSize = 15 }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  return (
    <div className="pagination">
      <button className="page-btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>‹ Prev</button>
      <span className="page-info">Page {page} of {totalPages} · {total} report{total !== 1 ? "s" : ""}</span>
      <button className="page-btn" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next ›</button>
    </div>
  );
}

function NoteComposer({ reportId, onSent }) {
  const [text, setText]       = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent]       = useState(false);
  const [err, setErr]         = useState(null);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSending(true);
    setErr(null);
    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch(`${BASE_URL}/api/v1/reports/${reportId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: trimmed }),
      });
      if (!res.ok) throw new Error("Failed to send message.");
      setText("");
      setSent(true);
      setTimeout(() => setSent(false), 3000);
      if (onSent) onSent();
    } catch (e) {
      setErr(e.message || "Could not send message.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="note-composer">
      <p className="note-label">💬 Send a note to admin</p>
      <textarea
        className="note-textarea"
        rows={3}
        maxLength={500}
        placeholder="Ask about your report, provide more details, or follow up…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={sending}
      />
      <div className="note-footer">
        <span className="note-char">{text.length}/500</span>
        {err && <span className="note-err">{err}</span>}
        {sent && <span className="note-sent">✓ Sent!</span>}
        <button
          className="note-send-btn"
          onClick={handleSend}
          disabled={sending || !text.trim()}
        >
          {sending ? "Sending…" : "Send Message"}
        </button>
      </div>
    </div>
  );
}

function ReportModal({ report, onClose }) {
  const [comments, setComments]   = useState([]);
  const [imgError1, setImgError1] = useState(false);
  const [imgError2, setImgError2] = useState(false);
  const [activeTab, setActiveTab] = useState("details");

  const originalAttachment = report.media_attachments?.[0];
  const proofAttachment    = report.media_attachments?.[1];
  const originalUrl        = !imgError1 ? mediaUrl(originalAttachment) : null;
  const proofUrl           = !imgError2 ? mediaUrl(proofAttachment)    : null;
  const isResolved         = report.status === "RESOLVED";

  const loadComments = useCallback(() => {
    const token = localStorage.getItem("access_token");
    fetch(`${BASE_URL}/api/v1/reports/${report.id}/comments`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => setComments(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [report.id]);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose} aria-label="Close">×</button>

        <div className="modal-header">
          <div>
            <h3 className="modal-title">Report #{report.id}</h3>
            <p className="modal-subtitle">{report.barangay ?? report.street_name ?? "—"}</p>
          </div>
          <div className="modal-status-pill">
            <span className={`status-badge ${toClass(report.status ?? "")}`}>
              {STATUS_LABEL[report.status] ?? report.status ?? "—"}
            </span>
          </div>
        </div>

        <div className="modal-tabs">
          {["details", "media", "messages"].map((tab) => (
            <button
              key={tab}
              className={`modal-tab ${activeTab === tab ? "active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === "details" ? "📋 Details" : tab === "media" ? "🖼 Media" : "💬 Messages"}
              {tab === "messages" && comments.length > 0 && (
                <span className="tab-badge">{comments.length}</span>
              )}
            </button>
          ))}
        </div>

        <div className="modal-body">
          {activeTab === "details" && (
            <div className="tab-details">
              <div className="detail-grid">
                <div className="detail-item">
                  <span className="detail-key">Damage Type</span>
                  <span className="detail-val">{report.ai_damage_type ?? "—"}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-key">Severity</span>
                  <span className={`detail-val severity ${toClass(report.ai_severity ?? "")}`}>
                    {report.ai_severity ?? "—"}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-key">AI Confidence</span>
                  <span className="detail-val">
                    {report.ai_confidence != null ? `${(report.ai_confidence * 100).toFixed(1)}%` : "—"}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-key">Submitted</span>
                  <span className="detail-val">{fmtDate(report.created_at)}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-key">Barangay</span>
                  <span className="detail-val">{report.barangay ?? "—"}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-key">Street</span>
                  <span className="detail-val">{report.street_name ?? "—"}</span>
                </div>
                {report.upvote_count > 0 && (
                  <div className="detail-item">
                    <span className="detail-key">Upvotes</span>
                    <span className="detail-val">👍 {report.upvote_count}</span>
                  </div>
                )}
              </div>

              {report.description && (
                <div className="detail-description">
                  <span className="detail-key">Description</span>
                  <p>{report.description}</p>
                </div>
              )}

              {report.status === "DECLINED" && report.decline_reason && (
                <div className="decline-reason">
                  <strong>Decline Reason:</strong> {report.decline_reason}
                </div>
              )}

              {report.is_flagged_fake && (
                <div className="ai-flag-badge">⚠️ Flagged as possibly AI-generated — pending admin review</div>
              )}
            </div>
          )}

          {activeTab === "media" && (
            <div className="tab-media">
              <div className="media-block">
                <p className="media-label">📸 Damage Evidence</p>
                <div className="modal-media">
                  {originalUrl ? (
                    originalAttachment.media_type === "video"
                      ? <video src={originalUrl} controls />
                      : <img src={originalUrl} alt="Damage" onError={() => setImgError1(true)} />
                  ) : <div className="no-image">No media uploaded</div>}
                </div>
              </div>

              {isResolved && (
                <div className="media-block">
                  <p className="media-label">🔧 Repair Proof</p>
                  <div className="modal-media">
                    {proofUrl ? (
                      proofAttachment.media_type === "video"
                        ? <video src={proofUrl} controls />
                        : <img src={proofUrl} alt="Repair proof" onError={() => setImgError2(true)} />
                    ) : <div className="no-image">No repair photo uploaded</div>}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "messages" && (
            <div className="tab-messages">
              <NoteComposer reportId={report.id} onSent={loadComments} />

              {comments.length > 0 ? (
                <div className="comments-thread">
                  <p className="thread-label">Message thread</p>
                  {comments.map((c) => (
                    <div key={c.id} className={`comment-bubble ${c.user?.role === "admin" ? "admin-bubble" : "user-bubble"}`}>
                      <div className="bubble-header">
                        <span className="bubble-author">
                          {c.user?.role === "admin" ? "🛡 Admin" : "👤 " + (c.user?.full_name ?? "You")}
                        </span>
                        <span className="bubble-date">{fmtDate(c.created_at)}</span>
                      </div>
                      <p className="bubble-text">{c.content}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="no-messages">No messages yet. Send a note to start the conversation.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ReportCard({ report, onView }) {
  const [imgError, setImgError] = useState(false);
  const attachment = report.media_attachments?.[0];
  const thumbUrl   = !imgError ? mediaUrl(attachment) : null;

  return (
    <div className="report-card" onClick={() => onView(report)} tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onView(report); } }}
      role="button" aria-label={`View report #${report.id}`}>
      <div className="card-thumb">
        {thumbUrl ? (
          attachment.media_type === "video"
            ? <div className="thumb-video-placeholder">▶ Video</div>
            : <img src={thumbUrl} alt="Report thumbnail" onError={() => setImgError(true)} />
        ) : (
          <div className="thumb-placeholder">📷</div>
        )}
      </div>
      <div className="card-body">
        <div className="card-top">
          <span className="card-id">Report #{report.id}</span>
          <span className={`status-badge ${toClass(report.status ?? "")}`}>
            {STATUS_LABEL[report.status] ?? report.status ?? "—"}
          </span>
        </div>
        <p className="card-location">{report.barangay ?? report.street_name ?? "—"}</p>
        <div className="card-meta">
          <span className="card-type">{report.ai_damage_type ?? "—"}</span>
          <span className={`severity-chip ${toClass(report.ai_severity ?? "")}`}>{report.ai_severity ?? "—"}</span>
          <span className="card-date">{fmtDate(report.created_at)}</span>
        </div>
      </div>
      <button className="card-view-btn" onClick={(e) => { e.stopPropagation(); onView(report); }} aria-label="View details">
        View
      </button>
    </div>
  );
}

function MySubmissions() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [typeFilter, setTypeFilter]   = useState("All");
  const [sevFilter, setSevFilter]     = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selectedReport, setSelectedReport] = useState(null);

  const { reports, loading, error, page, setPage, total, refetch } =
    useReports({ mine: true, status: statusFilter !== "All" ? statusFilter : null });

  const filtered = reports.filter((r) => {
    const type = r.ai_damage_type ?? "";
    const sev  = r.ai_severity    ?? "";
    return (
      (typeFilter === "All" || type.toLowerCase() === typeFilter.toLowerCase()) &&
      (sevFilter  === "All" || sev.toLowerCase()  === sevFilter.toLowerCase())
    );
  });

  const handleStatusChange = useCallback((val) => {
    setStatusFilter(val);
    setPage(1);
  }, [setPage]);

  return (
    <>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <AppHeader onMenuClick={() => setSidebarOpen(true)} />
      {sidebarOpen && (
        <div className="sidebar-overlay active" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}

      <div className="my-submissions-container">

        {/* ── Header + Filters ── */}
        <div className="submissions-header-card">
          <div className="header-row">
            <div>
              <h2 className="page-title">My Reports</h2>
              <p className="page-sub">{total} submission{total !== 1 ? "s" : ""}</p>
            </div>
          </div>

          <div className="filters-row">
            <div className="filter-group">
              <label className="filter-label">Type</label>
              <div className="filter-chips">
                {["All", "Crack", "Pothole"].map((t) => (
                  <button key={t} className={`chip ${typeFilter === t ? "chip-active" : ""}`}
                    onClick={() => setTypeFilter(t)}>{t}</button>
                ))}
              </div>
            </div>

            <div className="filter-group">
              <label className="filter-label">Severity</label>
              <div className="filter-chips">
                {["All", "low", "critical"].map((s) => (
                  <button key={s} className={`chip ${sevFilter === s ? "chip-active" : ""}`}
                    onClick={() => setSevFilter(s)}>
                    {s === "All" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-group">
              <label className="filter-label">Status</label>
              <div className="custom-select">
                <select value={statusFilter} onChange={(e) => handleStatusChange(e.target.value)}>
                  <option value="All">All Status</option>
                  <option value="PENDING">Pending</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="VERIFIED">Verified</option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="DECLINED">Declined</option>
                </select>
              </div>
            </div>

            <button className="reset-btn" onClick={() => { setTypeFilter("All"); setSevFilter("All"); handleStatusChange("All"); }}>
              Reset
            </button>
          </div>
        </div>

        {error && (
          <div className="error-banner">
            <span>⚠ {error}</span>
            <button onClick={refetch} className="retry-btn">Retry</button>
          </div>
        )}

        {/* ── Desktop Table ── */}
        <div className="submissions-table-wrapper">
          {loading ? (
            <div className="skeleton-list">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton-row" />)}
            </div>
          ) : (
            <table className="submissions-table">
              <thead>
                <tr>
                  <th>Evidence</th>
                  <th>Report</th>
                  <th>Type</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length > 0 ? filtered.map((report) => (
                  <TableRow key={report.id} report={report} onView={setSelectedReport} />
                )) : (
                  <tr><td colSpan="7" className="no-data">No submissions found.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Mobile Cards ── */}
        <div className="mobile-cards">
          {loading ? (
            <div className="skeleton-list">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton-row" />)}
            </div>
          ) : filtered.length > 0 ? (
            filtered.map((report) => (
              <ReportCard key={report.id} report={report} onView={setSelectedReport} />
            ))
          ) : (
            <div className="no-data-mobile">No submissions found.</div>
          )}
        </div>

        {!loading && <Pagination page={page} setPage={setPage} total={total} pageSize={15} />}
      </div>

      {selectedReport && (
        <ReportModal report={selectedReport} onClose={() => setSelectedReport(null)} />
      )}
    </>
  );
}

function TableRow({ report, onView }) {
  const [imgError, setImgError] = useState(false);
  const attachment = report.media_attachments?.[0];
  const thumbUrl   = !imgError ? mediaUrl(attachment) : null;

  return (
    <tr className="table-row" onClick={() => onView(report)} tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onView(report); } }}>
      <td className="thumb-cell">
        <div className="row-thumb">
          {thumbUrl ? (
            attachment.media_type === "video"
              ? <div className="thumb-video-icon">▶</div>
              : <img src={thumbUrl} alt="thumb" onError={() => setImgError(true)} />
          ) : (
            <div className="thumb-empty">📷</div>
          )}
        </div>
      </td>
      <td>
        <strong className="report-id">#{report.id}</strong>
        <div className="report-loc">{report.barangay ?? report.street_name ?? "—"}</div>
      </td>
      <td className="td-type">{report.ai_damage_type ?? "—"}</td>
      <td><span className={`severity-chip ${toClass(report.ai_severity ?? "")}`}>{report.ai_severity ?? "—"}</span></td>
      <td><span className={`status-badge ${toClass(report.status ?? "")}`}>{STATUS_LABEL[report.status] ?? "—"}</span></td>
      <td className="td-date">{fmtDate(report.created_at)}</td>
      <td className="td-action">
        <button className="view-btn" onClick={(e) => { e.stopPropagation(); onView(report); }}>
          View Details
        </button>
      </td>
    </tr>
  );
}

export default MySubmissions;