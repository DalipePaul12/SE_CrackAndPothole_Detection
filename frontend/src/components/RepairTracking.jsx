import React, { useEffect, useState } from "react";
import { api } from "../api/client";
import { resolveMediaUrl } from "../utils/mediaUrl";
import "./RepairTracking.css";

const root = "/repair-tracking";

function useTracking(url) {
  const [version, refresh] = React.useReducer(n => n + 1, 0);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    setError("");
    api.get(url).then(res => {
      if (!active) return;
      if (res.success) setData(res.data);
      else setError(String(res.error || "Could not load repairs."));
    });
    return () => { active = false; };
  }, [url, version]);
  async function save(request, confirmation) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const res = await request();
      if (!res.success) throw Error(typeof res.error === "string" ? res.error : "Could not save. Please retry.");
      setMessage(confirmation || "");
      refresh();
      return true;
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return { data, error, message, save, busy, refresh };
}

function Feedback({ view }) {
  if (view.error) return <p role="alert">{view.error} <button onClick={view.refresh}>Retry</button></p>;
  if (view.message) return <p role="status">{view.message}</p>;
  return view.data === null ? <p role="status">Loading repairs…</p> : null;
}

function Photos({ urls, label }) {
  return <div className="repair-photos">{urls?.map((url, i) => <a key={url} href={resolveMediaUrl(url)} target="_blank" rel="noreferrer">
    <img loading="lazy" src={resolveMediaUrl(url)} alt={label + " " + (i + 1)} /></a>)}</div>;
}

export function ResidentRepairs() {
  const followed = useTracking(root + "/following");
  const schedule = useTracking(root + "/schedule");
  useEffect(() => {
    window.addEventListener("report-follow-changed", followed.refresh);
    return () => window.removeEventListener("report-follow-changed", followed.refresh);
  }, [followed.refresh]);
  const [street, setStreet] = useState("");
  const [barangay, setBarangay] = useState("");
  useEffect(() => {
    if (location.hash === "#repair-tracking") document.getElementById("repair-tracking")?.scrollIntoView();
  }, []);
  const groups = new Map();
  for (const row of schedule.data || []) {
    if ((barangay && row.barangay !== barangay) || !(row.street_name || "").toLowerCase().includes(street.trim().toLowerCase())) continue;
    if (!groups.has(row.scheduled_date)) groups.set(row.scheduled_date, []);
    groups.get(row.scheduled_date).push(row);
  }
  return <div id="repair-tracking" className="repair-tracking repair-columns">
    <section><h3>Followed reports</h3><Feedback view={followed} />
      {followed.data?.length === 0 && <p>You can follow nearby damage when creating a report.</p>}
      {followed.data?.map(r => <article key={r.id}><strong>#{r.id} · {[r.street_name, r.barangay].filter(Boolean).join(", ")}</strong>
        <p>{r.status.replaceAll("_", " ")}{r.scheduled_date && " · " + r.scheduled_date}</p>
        <Photos urls={r.photos} label="Approved repair photo" />
        <button disabled={followed.busy} onClick={() => followed.save(() => api.delete(root + "/" + r.id + "/follow"))}>Unfollow</button>
      </article>)}
    </section>
    <section><h3>Upcoming repairs</h3><Feedback view={schedule} />
      <div className="repair-fields"><label>Barangay<select value={barangay} onChange={e => setBarangay(e.target.value)}>
        <option value="">All barangays</option>{[...new Set(schedule.data?.map(r => r.barangay).filter(Boolean))].sort().map(b => <option key={b}>{b}</option>)}</select></label>
        <label>Street<input type="search" value={street} onChange={e => setStreet(e.target.value)} /></label></div>
      {schedule.data && !groups.size && <p>No upcoming repairs match.</p>}
      {[...groups].map(([day, rows]) => <article key={day}><strong>{day}</strong>
        {rows.map(r => <p key={r.id}>#{r.id} · {[r.street_name, r.barangay].filter(Boolean).join(", ")}</p>)}</article>)}
    </section></div>;
}

export function AdminRepairTracking({ report }) {
  const path = root + "/" + report.id;
  const view = useTracking(path + "/details");
  const closed = report.status === "resolved";
  const pending = view.data?.inspections.find(i => !i.result);
  return <section className="repair-tracking vmr-card vmr-card--full"><h3>Repair tracking</h3><Feedback view={view}/>
    {view.data && <>
      {view.data.source_report && <p>Inspection follow-up for <a href={`/adminpanel/managereports?report=${view.data.source_report}`}>report #{view.data.source_report}</a></p>}
      {view.data.has_project && ["pending","verified","assigned","in_progress"].includes(report.status) &&
        <form onSubmit={e => { e.preventDefault(); const day = e.currentTarget.elements.day.value;
          view.save(() => api.put(path + "/schedule", {scheduled_date: day || null}), day ? "Repair schedule saved." : "Repair schedule cleared."); }}>
          <label>Planned repair date<input key={view.data.scheduled_date} name="day" type="date" defaultValue={view.data.scheduled_date || ""}/></label>
          <button disabled={view.busy}>Save schedule</button></form>}
      {closed && <form onSubmit={e => { e.preventDefault(); const day = e.currentTarget.elements.day.value;
        view.save(() => api.post(path + "/inspections", {visit_date: day}), "Inspection scheduled."); }}>
        <label>Inspection date<input key={pending?.visit_date} name="day" required type="date" defaultValue={pending?.visit_date || ""}/></label>
        <button disabled={view.busy}>{pending ? "Reschedule inspection" : "Schedule inspection"}</button></form>}
      {view.data.inspections.map(v => <article key={v.id}><strong>Inspection · {v.visit_date}</strong>
        {v.result ? <><p>{v.result === "passed" ? "Passed" : "Needs more work"} · {v.notes}</p>
          {v.followup_id && <p><a href={`/adminpanel/managereports?report=${v.followup_id}`}>Follow-up report #{v.followup_id}</a></p>}<Photos urls={v.photos} label="Inspection photo"/></> :
          <form onSubmit={e => {e.preventDefault(); const body = new FormData(e.currentTarget);
            if (!body.get("photos")?.size) body.delete("photos");
            view.save(() => api.upload(path + "/inspections/" + v.id + "/result", body), "Inspection saved.");}}>
            <label>Result<select name="result" required defaultValue=""><option value="" disabled>Select result</option>
              <option value="passed">Passed</option><option value="needs_work">Needs more work</option></select></label>
            <label>Inspection notes<textarea required maxLength={2000} name="notes"/></label>
            <label>Photos (up to five)<input name="photos" type="file" multiple accept="image/jpeg,image/png,image/webp"/></label>
            <button disabled={view.busy}>Save inspection</button></form>}
      </article>)}
      {!closed && !view.data.has_project && !view.data.source_report && <p>Assign a contractor to schedule this repair.</p>}
    </>}
  </section>;
}
