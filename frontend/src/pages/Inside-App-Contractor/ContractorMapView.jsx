import { useMemo } from "react";
import { useContractorProjects } from "../../hooks/useContractorProjects";
import { getReportPin } from "../../utils/reportPin";
import { RoadDamageMap } from "../Inside-App-User/MapView";

const MAP_STATUS = { SCHEDULED: "pending", IN_PROGRESS: "in_progress", COMPLETED: "resolved" };

export default function ContractorMapView() {
  const { projects, loading, error, refetch } = useContractorProjects();
  const reports = useMemo(() => {
    const byReport = new Map();
    for (const project of projects) {
      const { report } = project;
      const id = report?.id ?? project.report_id;
      const status = MAP_STATUS[project.status?.toUpperCase()];
      const pin = report && getReportPin(report);
      if (!pin || id == null || !status || byReport.get(id)?.projectId > project.id) continue;
      byReport.set(id, {
        ...report, id, projectId: project.id, status, created_at: project.created_at,
        latitude: pin[0], longitude: pin[1],
      });
    }
    return [...byReport.values()];
  }, [projects]);

  return <RoadDamageMap contractor reports={reports} loading={loading} error={error} refetch={refetch} />;
}
