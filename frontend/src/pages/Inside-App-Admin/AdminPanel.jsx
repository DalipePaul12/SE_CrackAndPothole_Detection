import "./AdminPanel.css";
import { useState } from "react";

import AdminHeader from "../../components/AdminHeader";
import AdminSidebar from "../../components/AdminSidebar";

function AdminPanel() {
  const [activeTab, setActiveTab] = useState("dashboard");

  return (
    <>
    <AdminHeader />
    <AdminSidebar />

    <div className="admin-container">

      {/* Main Content */}

    </div>

    </>
  );
}

export default AdminPanel;