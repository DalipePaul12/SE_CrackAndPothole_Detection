import { useEffect, useState } from "react";
import { decideRepairReview, getAvailableContractors, getRepairReview, getRepairReviewHistory, getRepairReviewPhoto } from "../api/projects";
import ReportEvidence, { hasSubmissionEvidence } from "./ReportEvidence";
import { resolveMediaUrl } from "../utils/mediaUrl";
import "./RepairReviewPanel.css";

function RepairPhoto({ projectId, attemptId, photoId, number }) {
  const [photo, setPhoto] = useState(null);
  useEffect(() => {
    let active = true;
    let url;
    getRepairReviewPhoto(projectId, attemptId, photoId).then(result => {
      if (!active) return;
      if (result.success) url = URL.createObjectURL(result.blob);
      setPhoto(url || false);
    });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [projectId, attemptId, photoId]);

  if (photo === false) return <p role="alert">Repair photo {number} could not load. Reopen this tab to retry.</p>;
  if (!photo) return <p>Loading repair photo {number}…</p>;
  return <a href={photo} target="_blank" rel="noreferrer">
    <img src={photo} alt={`Repair photo ${number}`} />
  </a>;
}

const attemptDate = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila",
});
const attemptOutcome = { approved: "Approved", retake_requested: "Retake requested", withdrawn: "Withdrawn" };

function PreviousAttempt({ projectId, attempt }) {
  const [open, setOpen] = useState(false);
  const photoCount = attempt.photo_ids.length;
  return <details className="repair-history-attempt" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>
      <strong>{attemptOutcome[attempt.status] ?? attempt.status}</strong>
      <time dateTime={attempt.created_at}>{attemptDate.format(new Date(attempt.created_at))}</time>
      <span>{photoCount} {photoCount === 1 ? "photo" : "photos"}</span>
    </summary>
    {open && <div className="repair-history-attempt-body">
      {attempt.decided_at && <p>Decision on <time dateTime={attempt.decided_at}>
        {attemptDate.format(new Date(attempt.decided_at))}
      </time></p>}
      {attempt.reason && <p><strong>Reason</strong> {attempt.reason}</p>}
      {photoCount ? <div className="repair-history-photos">
        {attempt.photo_ids.map((photoId, index) => <RepairPhoto key={photoId} projectId={projectId}
          attemptId={attempt.id} photoId={photoId} number={index + 1} />)}
      </div> : <p>No repair photos available.</p>}
    </div>}
  </details>;
}

function PreviousAttempts({ projectId, latestId }) {
  const [request, setRequest] = useState({ beforeId: latestId });
  const [attempts, setAttempts] = useState([]);
  const [nextBeforeId, setNextBeforeId] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getRepairReviewHistory(projectId, request.beforeId).then(result => {
      if (!active) return;
      if (result.success) {
        setAttempts(previous => [...previous, ...result.data.attempts]);
        setNextBeforeId(result.data.next_before_id);
      } else {
        setError(result.error || "Could not load previous attempts.");
      }
      setLoading(false);
    });
    return () => { active = false; };
  }, [projectId, request]);

  const load = beforeId => {
    setError("");
    setLoading(true);
    setRequest({ beforeId });
  };

  return <div className="repair-history-list">
    {attempts.map(attempt => <PreviousAttempt key={attempt.id} projectId={projectId} attempt={attempt} />)}
    {loading ? <p role="status">Loading attempts…</p>
      : error ? <>
        <p role="alert">{error}</p>
        <button type="button" className="action-btn ab-verify" onClick={() => load(request.beforeId)}>Retry</button>
      </> : nextBeforeId != null ? <button type="button" className="action-btn ab-verify"
        onClick={() => load(nextBeforeId)}>Load older attempts</button>
        : !attempts.length && <p>No previous attempts.</p>}
  </div>;
}

export default function RepairReviewPanel({ projectId, report, onDecision }) {
  const [review, setReview] = useState(undefined);
  const [reason, setReason] = useState("");
  const [form, setForm] = useState(null);
  const [contractorList, setContractorList] = useState(null);
  const [replacementId, setReplacementId] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadVersion, setLoadVersion] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    let active = true;
    getRepairReview(projectId).then(result => {
      if (!active) return;
      setReview(result.data ?? null);
      setError(result.success ? "" : result.error);
    });
    return () => { active = false; };
  }, [projectId, loadVersion]);

  const openWithdrawal = async () => {
    setForm("withdraw_and_reassign");
    setContractorList(null);
    setReplacementId("");
    setError("");
    setContractorList(await getAvailableContractors());
  };

  const decide = async decision => {
    setSaving(true);
    setError("");
    const contractorId = decision === "withdraw_and_reassign" ? Number(replacementId) : undefined;
    const result = await decideRepairReview(projectId, review.id, decision, reason.trim(), contractorId);
    setSaving(false);
    if (!result.success) {
      setError(result.error || "Could not save the decision.");
      return;
    }
    onDecision();
  };

  if (!review) return <div className="repair-review">
    {error ? <><p role="alert">{error}</p><button type="button" onClick={() => setLoadVersion(n => n + 1)}>Retry</button></>
      : <p>{review === undefined ? "Loading repair review…" : "No repair proof has been submitted."}</p>}
  </div>;

  const withdrawing = form === "withdraw_and_reassign";
  const replacements = (contractorList?.data ?? []).filter(contractor => contractor.id !== review.contractor_id);

  return <div className="repair-review">
    <div className="repair-review-comparison">
      <section>
        <h3>Original damage</h3>
        {hasSubmissionEvidence(report) ? <ReportEvidence report={report} />
          : report.video_path ? <video src={resolveMediaUrl(report.video_path)} controls aria-label="Original damage video" />
            : report.image_url ? <img src={resolveMediaUrl(report.image_url)} alt="Original damage" />
              : <p>No original evidence available.</p>}
      </section>
      <section>
        <h3>Repair photos</h3>
        {review.photo_ids.map((id, index) => <RepairPhoto key={id} projectId={projectId}
          attemptId={review.id} photoId={id} number={index + 1} />)}
      </section>
    </div>
    <p><strong>Contractor notes</strong> {review.notes}</p>
    {review.actual_cost != null && <p><strong>Actual cost</strong> ₱{review.actual_cost.toLocaleString("en-PH")}</p>}
    {!!review.materials?.length && <p><strong>Materials</strong> {review.materials.map(item => item.name).filter(Boolean).join(", ")}</p>}
    {review.status === "retake_requested" && <p><strong>Retake requested</strong> {review.reason}</p>}
    {review.status === "approved" && <p>Repair approved.</p>}
    {review.status === "withdrawn" && <p><strong>Withdrawn</strong> {review.reason}</p>}
    {error && <p role="alert">{error}</p>}
    {review.status === "pending" && <div className="repair-review-actions">
      {form ? <>
        <label htmlFor="repair-decision-reason">Reason for {withdrawing ? "withdrawal" : "retake"}</label>
        <textarea id="repair-decision-reason" value={reason} maxLength={2000}
          disabled={saving} onChange={e => setReason(e.target.value)} />
        {withdrawing && <>
          <label htmlFor="repair-replacement">Replacement contractor</label>
          <select id="repair-replacement" value={replacementId} disabled={saving || !replacements.length}
            onChange={e => setReplacementId(e.target.value)}>
            <option value="">Choose contractor</option>
            {replacements.map(contractor => <option key={contractor.id} value={contractor.id}>
              {contractor.full_name || contractor.email}
            </option>)}
          </select>
          {!contractorList && <p role="status">Loading contractors…</p>}
          {contractorList && !contractorList.success && <>
            <p role="alert">{contractorList.error || "Could not load contractors."}</p>
            <button type="button" className="action-btn" onClick={openWithdrawal}>Retry</button>
          </>}
          {contractorList?.success && !replacements.length && <p>No replacement contractors available.</p>}
        </>}
        <button type="button" className="action-btn ab-reject" disabled={saving || !reason.trim() || (withdrawing && !replacementId)}
          onClick={() => decide(form)}>{withdrawing ? "Confirm withdrawal and reassignment" : "Send retake request"}</button>
        <button type="button" className="action-btn" disabled={saving}
          onClick={() => { setForm(null); setReason(""); setError(""); }}>Back</button>
      </> : <>
        {review.can_approve_or_retake ? <>
          <button type="button" className="action-btn ab-complete" disabled={saving} onClick={() => decide("approve")}>Approve repair</button>
          <button type="button" className="action-btn ab-reject" disabled={saving} onClick={() => setForm("request_retake")}>Request retake</button>
        </> : <p>The original assignment is gone. Choose a replacement to continue the repair.</p>}
        <button type="button" className="action-btn ab-reject" disabled={saving} onClick={openWithdrawal}>Withdraw and reassign</button>
      </>}
    </div>}
    <details className="repair-history" onToggle={event => {
      if (event.target === event.currentTarget) setHistoryOpen(event.currentTarget.open);
    }}>
      <summary><strong>Previous attempts</strong></summary>
      {historyOpen && <PreviousAttempts key={`${projectId}-${review.id}`} projectId={projectId} latestId={review.id} />}
    </details>
  </div>;
}
