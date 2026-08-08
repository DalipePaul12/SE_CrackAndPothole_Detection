import "./ContractorHeader.css";

export default function ContractorHeader({ title = "Contractor Panel", isCollapsed }) {
  return (
    <header className={`contractor-header${isCollapsed ? " collapsed" : ""}`}>
      <div className="contractor-header-left">
        <h2 className="contractor-header-title">{title}</h2>
      </div>
    </header>
  );
}