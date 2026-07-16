/**
 * ContractorHeader — thin wrapper around AdminHeader.
 * Reuses AdminHeader's full implementation and CSS; only overrides the title.
 */
import AdminHeader from "./AdminHeader";

export default function ContractorHeader({ onMenuClick, isSidebarOpen, isCollapsed }) {
  return (
    <AdminHeader
      title="Contractor Panel"
      onMenuClick={onMenuClick}
      isSidebarOpen={isSidebarOpen}
      isCollapsed={isCollapsed}
    />
  );
}
