import React, { useMemo } from "react";
import { FaRegCircleDot } from "react-icons/fa6";
import { IoMdCheckmarkCircleOutline } from "react-icons/io";
import "./ReportProgressTracker.css";

const STATUS_FLOW = [
  { key: "pending",     label: "Submitted"   },
  { key: "verified",    label: "Verified"     },
  { key: "in_progress", label: "In Progress"  },
  { key: "resolved",    label: "Resolved"     },
];

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function getStepIndex(status) {
  const s = status?.toLowerCase();
  return STATUS_FLOW.findIndex(step => step.key === s);
}

function ReportProgressTracker({ reports, loading }) {
  const latest = useMemo(() => {
    if (!reports || reports.length === 0) return null;
    return [...reports].sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    )[0];
  }, [reports]);

  const currentStep = latest ? getStepIndex(latest.status) : -1;

  if (loading) {
    return (
      <div className="dashboard-panel progress-tracker-panel">
        <h3>My Latest Report <FaRegCircleDot className="icon" /></h3>
        <div className="skeleton-panel-inner">
          <div className="skeleton-line short" style={{ marginBottom: "1rem" }} />
          <div className="skeleton-block" style={{ height: 80 }} />
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-panel progress-tracker-panel">
      <h3>My Latest Report <FaRegCircleDot className="icon" /></h3>

      {!latest ? (
        <p className="empty-state">No reports submitted yet.</p>
      ) : (
        <div className="progress-tracker-body">
          <div className="progress-report-meta">
            <span className="progress-report-id">Report #{latest.id}</span>
            <span className="progress-report-barangay">{latest.barangay ?? "Unknown"}</span>
            <span className="progress-report-time">{timeAgo(latest.created_at)}</span>
          </div>

          <div className="progress-steps">
            {STATUS_FLOW.map((step, i) => {
              const isDone    = i < currentStep;
              const isCurrent = i === currentStep;
              const isFuture  = i > currentStep;

              return (
                <React.Fragment key={step.key}>
                  <div className={`progress-step ${isDone ? "done" : ""} ${isCurrent ? "current" : ""} ${isFuture ? "future" : ""}`}>
                    <div className="progress-step-dot">
                      {isDone ? (
                        <IoMdCheckmarkCircleOutline className="step-check" />
                      ) : isCurrent ? (
                        <div className="step-pulse" />
                      ) : (
                        <div className="step-empty" />
                      )}
                    </div>
                    <span className="progress-step-label">{step.label}</span>
                  </div>
                  {i < STATUS_FLOW.length - 1 && (
                    <div className={`progress-connector ${i < currentStep ? "done" : ""}`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default ReportProgressTracker;