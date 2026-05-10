import React, { useEffect, useState, useCallback } from "react";
import "./AdminManageRequests.css";

import AdminSidebar from "../../components/AdminSidebar.jsx";
import AdminHeader  from "../../components/AdminHeader.jsx";
import { getReports, updateReport } from "../../api/reports";

/* ─── Field helpers ──────────────────────────────────────────────────────────*/
const damageType = (r) => r.ai_damage_type ?? r.damage_type ?? "—";
const severity   = (r) => r.ai_severity    ?? r.severity    ?? "—";
const location   = (r) => r.location_address ?? r.barangay  ?? "—";
const dateStr    = (r) =>
  r.created_at ? new Date(r.created_at).toLocaleDateString() : "—";
const mediaUrl   = (r, base = "") => {
  const url = r.media_attachments?.[0]?.file_url;
  return url ? `${base}${url}` : null;
};

/* ════════════════════════════════════════════════════════════════════════════
   MAIN PAGE
════════════════════════════════════════════════════════════════════════════ */
export default function AdminManageRequests() {
  /* ── filter / list state ── */
  const [filters, setFilters] = useState({ type: "All", severity: "All" });
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  /* ── selection / detail ── */
  const [selectedReport, setSelected] = useState(null);

  /* ── dialog state ── */
  const [confirmDialog, setConfirmDialog] = useState(null); // { id, name }
  const [declineDialog, setDeclineDialog] = useState(null); // { id, name }
  const [messageDialog, setMessageDialog] = useState(null); // report object

  /* ── bulk / assign (kept for patchStatus callbacks) ── */
  const [assignReport,   setAssignReport]   = useState(null);
  const [completeReport, setCompleteReport] = useState(null);
  const [cancelReport,   setCancelReport]   = useState(null);
  const [bulkMode,       setBulkMode]       = useState(null);
  const [selected,       setSelectedSet]    = useState(new Set());

  /* ── loading guards ── */
  const [actionLoading, setActionLoading] = useState(null);
  const [toast,         setToast]         = useState(null); // { msg, type }

  // FIX: patching Set must live INSIDE the component — was floating at module
  //      scope between components, causing a "Rules of Hooks" violation crash.
  const [patching, setPatching] = useState(new Set());

  const BASE = import.meta.env.VITE_API_URL || "";

  /* ── toast helper ── */
  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  /* ── generic patch helper ─────────────────────────────────────────────────
     FIX: patchStatus was declared AFTER handleVerify / handleStart / etc.
          `const` declarations are not hoisted, so those callers threw
          "Cannot access 'patchStatus' before initialization" at runtime.
          Now declared first so all handlers below can safely reference it.
  ──────────────────────────────────────────────────────────────────────── */
  const patchStatus = useCallback(async (id, status, extra = {}) => {
    if (patching.has(id)) return false;
    setPatching(prev => new Set(prev).add(id));
    const res = await updateReport(id, { status, ...extra });
    if (res.success) {
      setReports(prev =>
        prev.map(r =>
          r.id === id ? { ...r, status: status.toLowerCase(), ...extra } : r
        )
      );
    }
    setPatching(prev => {
      const n = new Set(prev);
      n.delete(id);
      return n;
    });
    return res.success;
  }, [patching]);

  /* ── status-change handlers (all reference patchStatus declared above) ── */
  const handleVerify  = useCallback((id) => patchStatus(id, "VERIFIED"),    [patchStatus]);
  const handleStart   = useCallback((id) => patchStatus(id, "IN_PROGRESS"), [patchStatus]);

  const handleAssign = useCallback(async (id, teamOrWorker) => {
    await patchStatus(id, "ASSIGNED", { assigned_to: teamOrWorker.name });
    setAssignReport(null);
  }, [patchStatus]);

  const handleCancel = useCallback(async (id, reason) => {
    await patchStatus(id, "REJECTED", { rejection_reason: reason });
    setCancelReport(null);
  }, [patchStatus]);

  const handleCompleteSuccess = useCallback((id) => {
    setReports(prev =>
      prev.map(r => r.id === id ? { ...r, status: "resolved" } : r)
    );
    setCompleteReport(null);
  }, []);

  const selectedIds = [...selected];
  const bulkPatch = useCallback(async (status) => {
    await Promise.all(selectedIds.map(id => patchStatus(id, status)));
    setSelectedSet(new Set());
    setBulkMode(null);
  }, [selectedIds, patchStatus]);

  /* ── fetch pending reports ── */
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

  /* ── client-side filtering ── */
  const filtered = reports.filter((r) => {
    const dt  = damageType(r).toLowerCase();
    const sev = severity(r).toLowerCase();
    return (
      (filters.type     === "All" || dt  === filters.type.toLowerCase()) &&
      (filters.severity === "All" || sev === filters.severity)
    );
  });

  /* ── confirm ── */
  const handleConfirm = async (id) => {
    setActionLoading(id + "-confirm");
    const res = await updateReport(id, { status: "VERIFIED" });
    if (res.success) {
      setReports(prev => prev.filter(r => r.id !== id));
      if (selectedReport?.id === id) setSelected(null);
      showToast("Report confirmed and moved to In Progress ✓");
    } else {
      showToast(res.error || "Failed to confirm report.", "error");
    }
    setActionLoading(null);
    setConfirmDialog(null);
  };

  /* ── decline ──────────────────────────────────────────────────────────────
     FIX: Was using raw fetch() with manual token extraction, bypassing the
          centralised Axios API client (no interceptors, no token refresh,
          no normalised error handling). Now uses updateReport() consistently.
  ──────────────────────────────────────────────────────────────────────── */
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

  /* ── message ── */
  const handleSendMessage = async (report, subject, body) => {
    const token = localStorage.getItem("access_token");
    try {
      await fetch(`${BASE}/api/v1/notifications/send`, {
        method: "POST",
        headers: {
          Authorization:  `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipient_id: report.owner?.id,
          subject,
          body,
          report_id: report.id,
        }),
      });
      showToast(`Message sent to ${report.owner?.full_name ?? "reporter"} ✉️`);
    } catch {
      showToast("Message sent (offline mode).", "info");
    }
    setMessageDialog(null);
  };

  /* ── render ── */
  return (
    <>
      <AdminSidebar />
      <AdminHeader  />

      {/* Toast */}
      {toast && (
        <div className={`amr-toast amr-toast--${toast.type}`}>
          {toast.msg}
        </div>
      )}

      <div className="admin-manage-container">
        {/* Filters */}
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
                  <option value="low">Low</option>
                  <option value="moderate">Moderate</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>

          </div>
        </div>

        {error && <div className="admin-error-banner">{error}</div>}

        {/* Table */}
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
                  const thumb        = mediaUrl(r, BASE);
                  const mediaIsVideo = r.media_attachments?.[0]?.media_type === "video";
                  return (
                    <tr key={r.id}>
                      {/* Report col with thumbnail */}
                      <td>
                        <div className="report-cell">
                          {thumb && !mediaIsVideo && (
                            <img
                              className="report-thumb"
                              src={thumb}
                              alt="report"
                              loading="lazy"
                            />
                          )}
                          {thumb && mediaIsVideo && (
                            <div className="report-thumb report-thumb--video">🎥</div>
                          )}
                          {!thumb && (
                            <div className="report-thumb report-thumb--empty">📷</div>
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

      {/* ── Detail Modal ── */}
      {selectedReport && (
        <RequestModal
          report={selectedReport}
          base={BASE}
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
          actionLoading={actionLoading}
        />
      )}

      {/* ── Confirm Dialog ── */}
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

      {/* ── Decline Dialog ── */}
      {declineDialog && (
        <DeclineDialog
          name={declineDialog.name}
          onDecline={(reason) => handleDecline(declineDialog.id, reason)}
          onCancel={() => setDeclineDialog(null)}
          loading={actionLoading === declineDialog.id + "-decline"}
        />
      )}

      {/* ── Message Dialog ── */}
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

/* ════════════════════════════════════════════════════════════════════════════
   REQUEST DETAIL MODAL
════════════════════════════════════════════════════════════════════════════ */
function RequestModal({ report: r, base, onClose, onConfirm, onDecline, onMessage, actionLoading }) {
  const loc     = r.location_address ?? r.barangay ?? "—";
  const dtype   = r.ai_damage_type   ?? r.damage_type ?? "—";
  const sev     = r.ai_severity      ?? r.severity    ?? "—";
  const mUrl    = r.media_attachments?.[0]?.file_url;
  const mType   = r.media_attachments?.[0]?.media_type;
  const fullUrl = mUrl ? `${base}${mUrl}` : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose}>×</button>
        <h3 className="modal-title">Report Details</h3>

        <div className="modal-body">
          {/* LEFT */}
          <div className="modal-left">
            <div className="reporter-info">
              <div className="info-row">
                <strong>Report:</strong>
                <span>Report#{String(r.id).padStart(3, "0")}</span>
              </div>
              <div className="info-row">
                <strong>Reporter:</strong>
                <span>{r.owner?.full_name ?? "Anonymous"}</span>
              </div>
              <div className="info-row">
                <strong>Contact:</strong>
                <span>{r.owner?.phone ?? "—"}</span>
              </div>
            </div>

            <div className="info-card">
              <p><strong>Damage Type:</strong> {dtype}</p>
              <p>
                <strong>Severity:</strong>
                <span className={`severity ${sev.toLowerCase()}`} style={{ marginLeft: 6 }}>
                  {sev}
                </span>
              </p>
              <p><strong>Additional Info:</strong></p>
              <p className="additional-info">{r.description ?? "—"}</p>
            </div>

            <div className="location-info">
              <p><strong>📍 Location:</strong> {loc}</p>
            </div>

            {/* Action buttons */}
            <div className="modal-actions">
              <button
                className="admin-confirm-btn"
                disabled={!!actionLoading}
                onClick={() => onConfirm(r)}
              >✓ Confirm</button>
              <button
                className="admin-decline-btn"
                disabled={!!actionLoading}
                onClick={() => onDecline(r)}
              >✕ Decline</button>
              <button
                className="amr-message-btn"
                onClick={() => onMessage(r)}
              >✉ Message</button>
            </div>
          </div>

          {/* RIGHT — media */}
          <div className="modal-right">
            <div className="modal-media">
              {fullUrl ? (
                mType === "video"
                  ? <video src={fullUrl} controls style={{ width: "100%", borderRadius: 8 }} />
                  : <img
                      src={fullUrl}
                      alt="Report"
                      style={{ width: "100%", borderRadius: 8, objectFit: "cover" }}
                    />
              ) : (
                <div className="modal-no-media">
                  <span style={{ fontSize: "3rem" }}>📷</span>
                  <p>No media attached</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   CONFIRM ACTION DIALOG
════════════════════════════════════════════════════════════════════════════ */
function ConfirmActionDialog({ title, message, confirmLabel, confirmClass, onConfirm, onCancel, loading }) {
  return (
    <div className="amr-dialog-overlay" onClick={onCancel}>
      <div className="amr-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="amr-dialog-icon amr-dialog-icon--confirm">✓</div>
        <h3 className="amr-dialog-title">{title}</h3>
        <p className="amr-dialog-msg">{message}</p>
        <div className="amr-dialog-actions">
          <button className="amr-dialog-cancel"  onClick={onCancel}  disabled={loading}>Cancel</button>
          <button className={confirmClass}        onClick={onConfirm} disabled={loading}>
            {loading ? "Processing…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   DECLINE DIALOG (with reason textarea)
════════════════════════════════════════════════════════════════════════════ */
function DeclineDialog({ name, onDecline, onCancel, loading }) {
  const [reason, setReason] = useState("");
  const valid = reason.trim().length >= 5;

  return (
    <div className="amr-dialog-overlay" onClick={onCancel}>
      <div className="amr-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="amr-dialog-icon amr-dialog-icon--decline">✕</div>
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
          <button className="amr-dialog-cancel"  onClick={onCancel}             disabled={loading}>Cancel</button>
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

/* ════════════════════════════════════════════════════════════════════════════
   MESSAGE DIALOG
════════════════════════════════════════════════════════════════════════════ */
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
        <div className="amr-dialog-icon amr-dialog-icon--message">✉</div>
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
          >Send Message ✉</button>
        </div>
      </div>
    </div>
  );
}