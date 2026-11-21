import { Navigation } from "lucide-react";
import { Link } from "react-router-dom";
import { getReportPin } from "../utils/reportPin";

export default function ReportDirectionsLink({ report, projectId, className, onClick }) {
  if (!getReportPin(report)) return <span>No map pin saved</span>;
  const map = projectId == null ? "/adminpanel/map" : "/contractorpanel/map";

  return (
    <Link className={className} to={`${map}?directions=${projectId ?? report.id}`}
      state={{ startDirections: true }} onClick={onClick}>
      <Navigation size={14} aria-hidden="true" />
      Get directions
    </Link>
  );
}
