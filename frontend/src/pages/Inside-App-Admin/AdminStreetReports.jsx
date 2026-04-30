import React, { useEffect, useState, useCallback } from "react";
import "./AdminStreetReports.css";
import AdminSidebar from "../../components/AdminSidebar.jsx";
import AdminHeader from "../../components/AdminHeader.jsx";
import { getReports } from "../../api/reports";

function isCoordinateString(str) {
  if (!str) return false;
  // Matches patterns like "14.68649, 120.95642"
  return /^-?\d{1,3}(\.\d+)?\s*,\s*-?\d{1,3}(\.\d+)?$/.test(str.trim());
}

function groupByLocation(reports) {
  const map = {};
  reports.forEach((r) => {
    const street = r.street_name || r.location_address || "Unnamed Street";
    const brgy = r.barangay || "Unknown Barangay";
    const key = `${street} | ${brgy}`;
    if (!map[key]) map[key] = { street, brgy, reports: [] };
    map[key].reports.push(r);
  });
  return map;
}

const STATUS_LABEL = { pending: "Pending", verified: "Verified", in_progress: "In Progress", resolved: "Resolved", declined: "Declined" };

function AdminStreetReports() {
  const [allReports, setAllReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedRow, setExpandedRow] = useState(null);
  const [selectedReport, setSelected] = useState(null);
  const [filters, setFilters] = useState({
    type: "All",
    severity: "All",
    status: "All",
    searchQuery: ""
  });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await getReports({ page_size: 500 });
    
    if (!res.success) { 
      setError(res.error); 
      setLoading(false); 
      return; 
    }

    let reportsData = res.data?.results ?? [];
    
    // 1. Instantly show the reports to the user
    setAllReports(reportsData);
    setLoading(false);

    // 2. Background Task: Convert any raw coordinates into real street names
    const geoCache = {};
    const updatedReports = [...reportsData];
    let stateNeedsUpdate = false;

    for (let i = 0; i < updatedReports.length; i++) {
      let r = updatedReports[i];
      let addressString = r.street_name || r.location_address || "";

      if (isCoordinateString(addressString)) {
        const [lat, lon] = addressString.split(',').map(s => s.trim());
        const cacheKey = `${lat},${lon}`;

        if (!geoCache[cacheKey]) {
          try {
            // We use OpenStreetMap (Nominatim). 
            // The 1-second delay is required to not get banned from their free server.
            await new Promise(resolve => setTimeout(resolve, 1000));
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`);
            const data = await response.json();
            
            // Extract the base street name
            let streetName = data.address?.road || data.address?.neighbourhood || data.address?.suburb || "Unnamed Road";
            
            // Add the house/building number if it exists in the data
            if (data.address?.house_number) {
              streetName = `${streetName} ${data.address.house_number}`;
            }

            geoCache[cacheKey] = streetName;
          } catch (error) {
            geoCache[cacheKey] = "Unknown Road";
          }
        }

        // Replace the coordinate with the real street name + number
        updatedReports[i] = { 
          ...r, 
          street_name: geoCache[cacheKey], 
          location_address: geoCache[cacheKey] 
        };
        stateNeedsUpdate = true;
      }
    }

    // 3. Re-render the table with the human-readable streets
    if (stateNeedsUpdate) {
      setAllReports([...updatedReports]);
    }

  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const damageType = (r) => r.ai_damage_type ?? r.damage_type ?? "—";
  const severity = (r) => r.ai_severity ?? r.severity ?? "—";
  const dateStr = (r) => r.created_at ? new Date(r.created_at).toLocaleDateString() : "—";

  const locationGroups = groupByLocation(allReports);
  const rowData = Object.entries(locationGroups).map(([key, data]) => ({
    key,
    street: data.street,
    barangay: data.brgy,
    reports: data.reports,
    total: data.reports.length,
    potholes: data.reports.filter((r) => damageType(r).toLowerCase() === "pothole").length,
    cracks: data.reports.filter((r) => damageType(r).toLowerCase() === "crack").length,
    critical: data.reports.filter((r) => severity(r).toLowerCase().includes("critical") && !severity(r).toLowerCase().includes("non")).length,
    latestDate: data.reports.map((r) => r.created_at).sort().reverse()[0],
  }));

  const filteredRows = rowData.filter((row) => {
    const q = filters.searchQuery.toLowerCase();
    const matchSearch = !q ||
                        row.street.toLowerCase().includes(q) ||
                        row.barangay.toLowerCase().includes(q) ||
                        row.reports.some(r => (r.exact_address || "").toLowerCase().includes(q));

    const matchType = filters.type === "All" || (filters.type === "Pothole" && row.potholes > 0) || (filters.type === "Crack" && row.cracks > 0);
    const matchSeverity = filters.severity === "All" || (filters.severity === "Critical" && row.critical > 0) || (filters.severity === "Non-Critical" && (row.total - row.critical) > 0);
    const matchStatus = filters.status === "All" || row.reports.some((r) => r.status === filters.status);

    return matchSearch && matchType && matchSeverity && matchStatus;
  });

  return (
    <>
      <AdminSidebar />
      <AdminHeader />

      <div className="asr-container">
        <div className="asr-filters-card">
          <div className="asr-header">
            <h2>Street Intelligence Matrix</h2>
            <span className="asr-total-badge">{allReports.length} Dispatches</span>
          </div>
          
          <div className="asr-filters-row">
            <div className="admin-filter-group" style={{ flex: 1 }}>
              <label>Search Address / Landmark</label>
              <input 
                type="text" 
                className="admin-search-input" 
                placeholder="e.g. Rizal Ave, Block 4..."
                value={filters.searchQuery}
                onChange={(e) => setFilters({...filters, searchQuery: e.target.value})}
              />
            </div>

            <div className="admin-filter-group">
              <label>Damage Type</label>
              <div className="admin-filter-buttons">
                {["All", "Crack", "Pothole"].map((t) => (
                  <button key={t} className={filters.type === t ? "active" : ""} onClick={() => setFilters({ ...filters, type: t })}>{t}</button>
                ))}
              </div>
            </div>

            <div className="admin-filter-group">
              <label>Severity</label>
              <div className="admin-custom-select">
                <select value={filters.severity} onChange={(e) => setFilters({ ...filters, severity: e.target.value })}>
                  <option value="All">All Severity</option>
                  <option value="Critical">Critical Only</option>
                  <option value="Non-Critical">Non-Critical</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {error && <div className="admin-error-banner">{error}</div>}

        <div className="asr-table-card">
          <table className="asr-table">
            <thead>
              <tr>
                <th className="col-expand"></th>
                <th>Street Segment</th>
                <th>Barangay</th>
                <th>Total Issues</th>
                <th>Damage Spread</th>
                <th>Priority</th>
                <th>Latest Update</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" className="admin-no-data">Syncing geographic data…</td></tr>
              ) : filteredRows.length > 0 ? (
                filteredRows.map((row) => (
                  <React.Fragment key={row.key}>
                    <tr
                      className={`asr-street-row ${expandedRow === row.key ? "expanded" : ""}`}
                      onClick={() => setExpandedRow((p) => p === row.key ? null : row.key)}
                    >
                      <td className="col-expand">
                        <span className={`chevron ${expandedRow === row.key ? "open" : ""}`}>›</span>
                      </td>
                      <td className="asr-street-name">
                        {isCoordinateString(row.street) ? (
                           <span style={{color: '#888', fontStyle: 'italic'}}>Translating coordinates...</span>
                        ) : (
                           row.street
                        )}
                      </td>
                      <td>{row.barangay}</td>
                      <td><span className="asr-total-pill">{row.total}</span></td>
                      <td>
                        <div className="asr-type-badges">
                          {row.potholes > 0 && <span className="type-badge pothole">{row.potholes} Pothole{row.potholes > 1 ? "s" : ""}</span>}
                          {row.cracks   > 0 && <span className="type-badge crack">{row.cracks} Crack{row.cracks > 1 ? "s" : ""}</span>}
                        </div>
                      </td>
                      <td>
                        {row.critical > 0 ? <span className="sev-badge critical">{row.critical} Critical</span> : <span className="sev-badge non-critical">Standard</span>}
                      </td>
                      <td>{row.latestDate ? new Date(row.latestDate).toLocaleDateString() : "—"}</td>
                    </tr>

                    {expandedRow === row.key && (
                      <>
                        <tr className="asr-child-header-row">
                          <td></td>
                          <td colSpan={6}>
                            <div className="asr-child-header">
                              <span>Exact damage coordinates for <strong>{row.street}, {row.barangay}</strong></span>
                            </div>
                          </td>
                        </tr>
                        {row.reports.map((r) => {
                          // Extract the most accurate address string available
                          const displayAddress = r.exact_address || r.street_name || r.location_address || "No address provided";
                          
                          return (
                            <tr key={r.id} className="asr-child-row clickable-row" onClick={(e) => { e.stopPropagation(); setSelected(r); }}>
                              <td></td>
                              <td>
                                <strong className="asr-report-id">#{String(r.id).padStart(4, "0")}</strong>
                                <div className="asr-exact-address" title={displayAddress}>
                                  {displayAddress}
                                </div>
                              </td>
                              <td>
                                {r.latitude && r.longitude ? (
                                  <a 
                                    href={`https://www.google.com/maps/search/?api=1&query=${r.latitude},${r.longitude}`}
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="asr-map-link"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    📍 View on Map
                                  </a>
                                ) : (
                                  <span className="asr-no-coords">No GPS Data</span>
                                )}
                              </td>
                              <td><span className={`type-badge ${damageType(r).toLowerCase()}`}>{damageType(r)}</span></td>
                              <td><span className={`admin-severity ${severity(r).toLowerCase().replace(/[\s_]/g, "-")}`}>{severity(r)}</span></td>
                              <td><span className={`admin-status ${r.status?.toLowerCase().replace(/[\s_]/g, "-")}`}>{STATUS_LABEL[r.status] ?? r.status}</span></td>
                              <td>{dateStr(r)}</td>
                            </tr>
                          );
                        })}
                        <tr className="asr-spacer-row"><td colSpan={7}></td></tr>
                      </>
                    )}
                  </React.Fragment>
                ))
              ) : (
                <tr><td colSpan="7" className="admin-no-data">No locations match your parameters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        
        {selectedReport && <StreetReportModal report={selectedReport} onClose={() => setSelected(null)} />}
      </div>
    </>
  );
}

function StreetReportModal({ report: r, onClose }) {
  const damageType = r.ai_damage_type ?? r.damage_type ?? "—";
  const severity = r.ai_severity ?? r.severity ?? "—";
  const mediaUrl = r.media_attachments?.[0]?.file_url;
  const mediaType = r.media_attachments?.[0]?.media_type;
  const fullUrl = mediaUrl ? `${import.meta.env.VITE_API_URL || ""}${mediaUrl}` : null;
  
  // Also updated the modal to use the fallback chain
  const displayAddress = r.exact_address || r.street_name || r.location_address || "—";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose}>×</button>
        <h3 className="modal-title">Report Details</h3>
        <div className="modal-body">
          <div className="modal-left">
            <div className="reporter-info">
              <div className="info-row"><strong>Report:</strong> Report#{String(r.id).padStart(3, "0")}</div>
              <div className="info-row"><strong>Reporter:</strong> {r.owner?.full_name ?? "Anonymous"}</div>
              <div className="info-row"><strong>Contact:</strong> {r.owner?.phone ?? "—"}</div>
            </div>
            <div className="info-card">
              <p><strong>Damage Type:</strong> {damageType}</p>
              <p><strong>Severity:</strong> {severity}</p>
              <p><strong>Status:</strong> {STATUS_LABEL[r.status] ?? r.status}</p>
              <p><strong>Additional Info:</strong></p>
              <p className="additional-info">{r.description ?? "—"}</p>
            </div>
            <div className="location-info">
              <p><strong>Exact Address:</strong> {displayAddress}</p>
              <p><strong>Barangay:</strong> {r.barangay || "—"}</p>
              <p><strong>City/Municipality:</strong> {r.municipality || "Malabon"}</p>
              <p><strong>Coordinates:</strong> {r.latitude ? `${r.latitude}, ${r.longitude}` : "N/A"}</p>
            </div>
          </div>
          <div className="modal-right">
            <div className="modal-media">
              {fullUrl ? (
                mediaType === "video"
                  ? <video src={fullUrl} controls style={{ width: "100%", borderRadius: 8 }} />
                  : <img src={fullUrl} alt="Report" style={{ width: "100%", borderRadius: 8, objectFit: "cover" }} />
              ) : (
                <div className="modal-no-media">No media attached</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminStreetReports;