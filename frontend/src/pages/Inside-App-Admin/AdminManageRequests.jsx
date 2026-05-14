import React, { useEffect, useState, useCallback } from "react";
import "./AdminManageRequests.css";
import { getReports, updateReport } from "../../api/reports";
import { sendNotification } from "../../api/notifications";
import {
  Check, X, Mail, Camera, Video, MapPin, CheckCircle, XCircle,
  User, AlertTriangle, Calendar, Clock, ChevronDown, Navigation,
  FileText, Image, MessageSquare, Activity, Shield, Send
} from "lucide-react";

const BASE_URL = import.meta.env.VITE_API_URL || "";

const damageType = (r) => r.ai_damage_type ?? r.damage_type ?? "—";
const severity   = (r) => r.ai_severity    ?? r.severity    ?? "—";
const location   = (r) => r.location_address ?? r.barangay  ?? "—";
const streetName = (r) => r.street_name ?? r.exact_address ?? "—";
const barangayName = (r) => r.barangay ?? "—";
const dateStr    = (r) =>
  r.created_at ? new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
const timeStr    = (r) =>
  r.created_at ? new Date(r.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "—";
const mediaUrl   = (r, base = "") => {
  const url = r.media_attachments?.[0]?.file_url;
  return url ? `${base}${url}` : null;
};
const mediaCount = (r) => r.media_attachments?.length ?? 0;
const aiConfidence = (r) => r.ai_confidence ?? r.confidence ?? null;

export default function AdminManageRequests() {
  const [filters, setFilters] = useState({ type: "All", severity: "All" });
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [selectedReport, setSelected] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [declineDialog, setDeclineDialog] = useState(null);
  const [messageDialog, setMessageDialog] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [toast,         setToast]         = useState(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchPending = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await getReports({ page_size: 100 });
    if (!res.success) {
      setError(res.error);
      setLoading(false);
      return;
    }
    const all = res.data?.results ?? [];
    setReports(all.filter((r) => r.status?.toLowerCase() === "pending"));
    setLoading(false);
  }, []);

  useEffect(() => { fetchPending(); }, [fetchPending]);

  const filtered = reports.filter((r) => {
    const dt  = damageType(r).toLowerCase();
    const sev = severity(r).toLowerCase();
    return (
      (filters.type     === "All" || dt  === filters.type.toLowerCase()) &&
      (filters.severity === "All" || sev === filters.severity)
    );
  });

  const handleConfirm = async (id) => {
    setActionLoading(id + "-confirm");
    const res = await updateReport(id, { status: "VERIFIED" });
    if (res.success) {
      setReports(prev => prev.filter(r => r.id !== id));
      if (selectedReport?.id === id) setSelected(null);
      showToast("Report confirmed and moved to In Progress");
    } else {
      showToast(res.error || "Failed to confirm report.", "error");
    }
    setActionLoading(null);
    setConfirmDialog(null);
  };

  const handleDecline = async (id, reason) => {
    setActionLoading(id + "-decline");
    const res = await updateReport(id, {
      status:         "DECLINED",
      decline_reason: reason.trim(),
    });
    if (res.success) {
      setReports(prev => prev.filter(r => r.id !== id));
      if (selectedReport?.id === id) setSelected(null);
      showToast("Report declined successfully.");
    } else {
      showToast(res.error || "Failed to decline report.", "error");
    }
    setActionLoading(null);
    setDeclineDialog(null);
  };

  const handleSendMessage = async (report, subject, body) => {
    try {
      await sendNotification({
        user_id:   report.owner?.id,
        report_id: report.id,
        title:     subject,
        message:   body,
        type:      "info",
      });
      showToast(`Message sent to ${report.owner?.full_name ?? "reporter"}`);
    } catch {
      showToast("Failed to send message.", "error");
    }
    setMessageDialog(null);
  };

  const handleAssign = async (reportId, assignee) => {
    const res = await updateReport(reportId, { assigned_to: assignee, status: "ASSIGNED" });
    if (res.success) {
      setReports(prev => prev.map(r => r.id === reportId ? { ...r, assigned_to: assignee, status: "assigned" } : r));
      if (selectedReport?.id === reportId) {
        setSelected(prev => ({ ...prev, assigned_to: assignee, status: "assigned" }));
      }
      showToast(`Assigned to ${assignee}`);
    } else {
      showToast("Failed to assign.", "error");
    }
  };

  return (
    <>
      {toast && (
        <div className={`amr-toast amr-toast--${toast.type}`}>
          {toast.msg}
        </div>
      )}

      <div className="admin-manage-container">
        <div className="admin-filters-container">
          <h2>Manage Requests</h2>
          <div className="admin-filters-row">
            <div className="admin-filter-group">
              <label>Damage Type</label>
              <div className="admin-filter-buttons">
                {["All", "Crack", "Pothole"].map((t) => (
                  <button
                    key={t}
                    className={filters.type === t ? "active" : ""}
                    onClick={() => setFilters({ ...filters, type: t })}
                  >{t}</button>
                ))}
              </div>
            </div>

            <div className="admin-filter-group">
              <label>Severity</label>
              <div className="admin-custom-select">
                <select
                  value={filters.severity}
                  onChange={(e) => setFilters({ ...filters, severity: e.target.value })}
                >
                  <option value="All">All Severity</option>
                  <option value="non-critical">Non-Critical</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {error && <div className="admin-error-banner">{error}</div>}

        <div className="submissions-table-container">
          <table className="submissions-table">
            <thead>
              <tr>
                <th>Report</th>
                <th>Type</th>
                <th>Severity</th>
                <th>Action</th>
                <th>Date</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" className="no-data">Loading…</td></tr>
              ) : filtered.length > 0 ? (
                filtered.map((r) => {
                  const thumb = mediaUrl(r, BASE_URL);
                  const mediaIsVideo = r.media_attachments?.[0]?.media_type === "video";
                  return (
                    <tr key={r.id}>
                      <td>
                        <div className="report-cell">
                          {thumb && !mediaIsVideo && (
                            <img className="report-thumb" src={thumb} alt="report" loading="lazy" />
                          )}
                          {thumb && mediaIsVideo && (
                            <div className="report-thumb report-thumb--video"><Video size={24} /></div>
                          )}
                          {!thumb && (
                            <div className="report-thumb report-thumb--empty"><Camera size={24} /></div>
                          )}
                          <div>
                            <strong>Report#{String(r.id).padStart(3, "0")}</strong>
                            <div className="report-location" title={location(r)}>
                              {location(r)}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td>{damageType(r)}</td>

                      <td>
                        <span className={`severity ${severity(r).toLowerCase()}`}>
                          {severity(r)}
                        </span>
                      </td>

                      <td>
                        <div className="admin-action-buttons">
                          <button
                            className="admin-confirm-btn"
                            disabled={!!actionLoading}
                            onClick={() =>
                              setConfirmDialog({
                                id:   r.id,
                                name: `Report#${String(r.id).padStart(3, "0")}`,
                              })
                            }
                          >Confirm</button>
                          <button
                            className="admin-decline-btn"
                            disabled={!!actionLoading}
                            onClick={() =>
                              setDeclineDialog({
                                id:   r.id,
                                name: `Report#${String(r.id).padStart(3, "0")}`,
                              })
                            }
                          >Decline</button>
                        </div>
                      </td>

                      <td>{dateStr(r)}</td>

                      <td>
                        <button
                          className="amr-view-btn"
                          onClick={() => setSelected(r)}
                        >View Details</button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr><td colSpan="6" className="no-data">No pending requests</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedReport && (
        <RequestModal
          report={selectedReport}
          base={BASE_URL}
          onClose={() => setSelected(null)}
          onConfirm={(r) => {
            setSelected(null);
            setConfirmDialog({ id: r.id, name: `Report#${String(r.id).padStart(3, "0")}` });
          }}
          onDecline={(r) => {
            setSelected(null);
            setDeclineDialog({ id: r.id, name: `Report#${String(r.id).padStart(3, "0")}` });
          }}
          onMessage={(r) => { setSelected(null); setMessageDialog(r); }}
          onAssign={handleAssign}
          actionLoading={actionLoading}
        />
      )}

      {confirmDialog && (
        <ConfirmActionDialog
          title="Confirm Report"
          message={`Are you sure you want to confirm ${confirmDialog.name}? It will be moved to In Progress.`}
          confirmLabel="Yes, Confirm"
          confirmClass="amr-dialog-confirm"
          onConfirm={() => handleConfirm(confirmDialog.id)}
          onCancel={() => setConfirmDialog(null)}
          loading={actionLoading === confirmDialog.id + "-confirm"}
        />
      )}

      {declineDialog && (
        <DeclineDialog
          name={declineDialog.name}
          onDecline={(reason) => handleDecline(declineDialog.id, reason)}
          onCancel={() => setDeclineDialog(null)}
          loading={actionLoading === declineDialog.id + "-decline"}
        />
      )}

      {messageDialog && (
        <MessageDialog
          report={messageDialog}
          onSend={handleSendMessage}
          onCancel={() => setMessageDialog(null)}
        />
      )}
    </>
  );
}

function RequestModal({ report: r, base, onClose, onConfirm, onDecline, onMessage, onAssign, actionLoading }) {
  const [activeTab, setActiveTab] = useState("details");
  const [assignee, setAssignee] = useState(r.assigned_to || "");

  const loc     = r.location_address ?? r.barangay ?? "—";
  const dtype   = r.ai_damage_type   ?? r.damage_type ?? "—";
  const sev     = r.ai_severity      ?? r.severity    ?? "—";
  const conf    = aiConfidence(r);
  const mUrl    = r.media_attachments?.[0]?.file_url;
  const mType   = r.media_attachments?.[0]?.media_type;
  const fullUrl = mUrl ? `${base}${mUrl}` : null;
  const mCount  = mediaCount(r);
  const status  = r.status ?? "pending";
  const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);

  const tabs = [
    { id: "details", label: "Details", icon: FileText },
    { id: "media",   label: "Media",   icon: Image, badge: mCount > 0 ? mCount : null },
    { id: "notes",   label: "Notes",   icon: MessageSquare },
    { id: "actions", label: "Actions", icon: Shield, badge: 2 },
    { id: "updates", label: "Updates", icon: Activity },
  ];

  const workers = [
    "Juan dela Cruz", "Maria Santos", "Pedro Reyes",
    "Ana Garcia", "Marco Villanueva", "Liza Mendoza"
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content amr-detail-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose}><X size={20} /></button>

        <div className="amr-modal-header">
          <div className="amr-modal-id">
            <span className="amr-id-code">RPT-{String(r.id).padStart(5, "0")}</span>
            <span className={`amr-status-badge st-${status.toLowerCase()}`}>{statusLabel}</span>
            {conf !== null && (
              <span className="amr-ai-badge">AI {Math.round(conf * 100)}%</span>
            )}
          </div>
        </div>

        <div className="amr-modal-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`amr-tab ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <tab.icon size={16} />
              {tab.label}
              {tab.badge && <span className="amr-tab-badge">{tab.badge}</span>}
            </button>
          ))}
        </div>

        <div className="amr-modal-body">
          {activeTab === "details" && (
            <div className="amr-detail-grid">
              <div className="amr-info-card">
                <div className="amr-card-header">
                  <User size={16} />
                  <span>REPORTER</span>
                </div>
                <div className="amr-card-body">
                  <div className="amr-info-row">
                    <span className="amr-info-label">Name</span>
                    <span className="amr-info-value">{r.owner?.full_name ?? "Anonymous"}</span>
                  </div>
                  <div className="amr-info-row">
                    <span className="amr-info-label">Contact</span>
                    <span className="amr-info-value">{r.owner?.phone ?? "—"}</span>
                  </div>
                  <div className="amr-info-row">
                    <span className="amr-info-label">Email</span>
                    <span className="amr-info-value">{r.owner?.email ?? "—"}</span>
                  </div>
                </div>
              </div>

              <div className="amr-info-card">
                <div className="amr-card-header">
                  <AlertTriangle size={16} />
                  <span>DAMAGE INFO</span>
                </div>
                <div className="amr-card-body">
                  <div className="amr-info-row">
                    <span className="amr-info-label">Type</span>
                    <span className="amr-info-value">{dtype}</span>
                  </div>
                  <div className="amr-info-row">
                    <span className="amr-info-label">Severity</span>
                    <span className={`amr-info-value severity ${sev.toLowerCase()}`}>{sev}</span>
                  </div>
                  {conf !== null && (
                    <div className="amr-info-row">
                      <span className="amr-info-label">AI Confidence</span>
                      <span className="amr-info-value amr-confidence">{Math.round(conf * 100)}%</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="amr-info-card">
                <div className="amr-card-header">
                  <MapPin size={16} />
                  <span>LOCATION</span>
                </div>
                <div className="amr-card-body">
                  <div className="amr-info-row">
                    <span className="amr-info-label">Address</span>
                    <span className="amr-info-value">{loc}</span>
                  </div>
                  <div className="amr-info-row">
                    <span className="amr-info-label">Street</span>
                    <span className="amr-info-value">{streetName(r)}</span>
                  </div>
                  <div className="amr-info-row">
                    <span className="amr-info-label">Barangay</span>
                    <span className="amr-info-value">{barangayName(r)}</span>
                  </div>
                </div>
              </div>

              <div className="amr-info-card">
                <div className="amr-card-header">
                  <Calendar size={16} />
                  <span>TIMELINE</span>
                </div>
                <div className="amr-card-body">
                  <div className="amr-info-row">
                    <span className="amr-info-label">Submitted</span>
                    <span className="amr-info-value">{dateStr(r)}</span>
                  </div>
                  <div className="amr-info-row">
                    <span className="amr-info-label">Updated</span>
                    <span className="amr-info-value">{r.updated_at ? dateStr({ created_at: r.updated_at }) : dateStr(r)}</span>
                  </div>
                </div>
              </div>

              <div className="amr-info-card amr-full-width">
                <div className="amr-card-header">
                  <Shield size={16} />
                  <span>ASSIGNMENT</span>
                </div>
                <div className="amr-card-body amr-assign-body">
                  <div className="amr-assign-select-wrap">
                    <select
                      className="amr-assign-select"
                      value={assignee}
                      onChange={(e) => setAssignee(e.target.value)}
                    >
                      <option value="">Unassigned</option>
                      {workers.map((w) => (
                        <option key={w} value={w}>{w}</option>
                      ))}
                    </select>
                    <ChevronDown size={16} className="amr-select-icon" />
                  </div>
                  <button
                    className="amr-assign-btn"
                    onClick={() => assignee && onAssign(r.id, assignee)}
                    disabled={!assignee || actionLoading}
                  >
                    Assign
                  </button>
                </div>
              </div>

              <div className="amr-full-width amr-map-btn-wrap">
                <button className="amr-map-btn">
                  <Navigation size={16} />
                  View on Map
                </button>
              </div>
            </div>
          )}

          {activeTab === "media" && (
            <div className="amr-media-tab">
              {fullUrl ? (
                mType === "video" ? (
                  <video src={fullUrl} controls className="amr-media-main" />
                ) : (
                  <img src={fullUrl} alt="Report" className="amr-media-main" />
                )
              ) : (
                <div className="amr-media-empty">
                  <Camera size={48} />
                  <p>No media attached</p>
                </div>
              )}
              {mCount > 1 && (
                <div className="amr-media-thumbs">
                  {r.media_attachments.map((att, i) => (
                    <div key={i} className="amr-media-thumb">
                      {att.media_type === "video" ? (
                        <Video size={20} />
                      ) : (
                        <img src={`${base}${att.file_url}`} alt="" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "notes" && (
            <div className="amr-notes-tab">
              <div className="amr-note-card">
                <p className="amr-note-text">{r.description ?? "No additional notes provided."}</p>
                <span className="amr-note-meta">{dateStr(r)} · {timeStr(r)}</span>
              </div>
            </div>
          )}

          {activeTab === "actions" && (
            <div className="amr-actions-tab">
              <div className="amr-action-card">
                <div className="amr-action-header">
                  <CheckCircle size={20} className="amr-action-icon confirm" />
                  <div>
                    <h4>Confirm Report</h4>
                    <p>Verify and move this report to In Progress</p>
                  </div>
                </div>
                <button
                  className="amr-action-btn confirm"
                  disabled={!!actionLoading}
                  onClick={() => onConfirm(r)}
                >
                  <Check size={16} /> Confirm
                </button>
              </div>

              <div className="amr-action-card">
                <div className="amr-action-header">
                  <XCircle size={20} className="amr-action-icon decline" />
                  <div>
                    <h4>Decline Report</h4>
                    <p>Reject this report with a reason</p>
                  </div>
                </div>
                <button
                  className="amr-action-btn decline"
                  disabled={!!actionLoading}
                  onClick={() => onDecline(r)}
                >
                  <X size={16} /> Decline
                </button>
              </div>

              <div className="amr-action-card">
                <div className="amr-action-header">
                  <Mail size={20} className="amr-action-icon message" />
                  <div>
                    <h4>Send Message</h4>
                    <p>Contact the reporter directly</p>
                  </div>
                </div>
                <button
                  className="amr-action-btn message"
                  onClick={() => onMessage(r)}
                >
                  <Send size={16} /> Message
                </button>
              </div>
            </div>
          )}

          {activeTab === "updates" && (
            <div className="amr-updates-tab">
              <div className="amr-update-item">
                <div className="amr-update-dot" />
                <div className="amr-update-content">
                  <p>Report submitted</p>
                  <span>{dateStr(r)} · {timeStr(r)}</span>
                </div>
              </div>
              {r.assigned_to && (
                <div className="amr-update-item">
                  <div className="amr-update-dot assigned" />
                  <div className="amr-update-content">
                    <p>Assigned to {r.assigned_to}</p>
                    <span>{dateStr(r)}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ConfirmActionDialog({ title, message, confirmLabel, confirmClass, onConfirm, onCancel, loading }) {
  return (
    <div className="amr-dialog-overlay" onClick={onCancel}>
      <div className="amr-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="amr-dialog-icon amr-dialog-icon--confirm"><CheckCircle size={28} /></div>
        <h3 className="amr-dialog-title">{title}</h3>
        <p className="amr-dialog-msg">{message}</p>
        <div className="amr-dialog-actions">
          <button className="amr-dialog-cancel" onClick={onCancel} disabled={loading}>Cancel</button>
          <button className={confirmClass} onClick={onConfirm} disabled={loading}>
            {loading ? "Processing…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeclineDialog({ name, onDecline, onCancel, loading }) {
  const [reason, setReason] = useState("");
  const valid = reason.trim().length >= 5;

  return (
    <div className="amr-dialog-overlay" onClick={onCancel}>
      <div className="amr-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="amr-dialog-icon amr-dialog-icon--decline"><XCircle size={28} /></div>
        <h3 className="amr-dialog-title">Decline {name}</h3>
        <p className="amr-dialog-msg">Please provide a reason for declining this report.</p>
        <textarea
          className="amr-dialog-textarea"
          placeholder="Enter reason (min 5 characters)…"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
        />
        <div className="amr-dialog-actions">
          <button className="amr-dialog-cancel" onClick={onCancel} disabled={loading}>Cancel</button>
          <button
            className="amr-dialog-decline"
            onClick={() => onDecline(reason)}
            disabled={!valid || loading}
          >
            {loading ? "Declining…" : "Decline Report"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageDialog({ report, onSend, onCancel }) {
  const [subject, setSubject] = useState(
    `Regarding Report#${String(report.id).padStart(3, "0")}`
  );
  const [body, setBody] = useState("");
  const valid = body.trim().length >= 10;
  const name  = report.owner?.full_name ?? "the reporter";

  return (
    <div className="amr-dialog-overlay" onClick={onCancel}>
      <div className="amr-dialog amr-dialog--wide" onClick={(e) => e.stopPropagation()}>
        <div className="amr-dialog-icon amr-dialog-icon--message"><Mail size={28} /></div>
        <h3 className="amr-dialog-title">Message {name}</h3>
        <p className="amr-dialog-msg">
          Send a message to <strong>{name}</strong>
          {report.owner?.phone ? ` (${report.owner.phone})` : ""} about this report.
        </p>

        <label className="amr-dialog-label">Subject</label>
        <input
          className="amr-dialog-input"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />

        <label className="amr-dialog-label">Message</label>
        <textarea
          className="amr-dialog-textarea"
          placeholder="Write your message here (min 10 characters)…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
        />

        <div className="amr-dialog-actions">
          <button className="amr-dialog-cancel" onClick={onCancel}>Cancel</button>
          <button
            className="amr-dialog-send"
            onClick={() => onSend(report, subject, body)}
            disabled={!valid}
          >Send Message <Mail size={16} /></button>
        </div>
      </div>
    </div>
  );
}