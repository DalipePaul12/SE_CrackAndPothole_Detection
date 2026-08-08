import { useState, useEffect, useCallback, useRef } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import UserSidebar from "./UserSidebar";
import BottomTabBar from "./BottomTabBar";
import AppHeader from "./AppHeader";
import ChatbotWidget from "./ChatbotWidget";
import { useAuth } from "../hooks/useAuth";
import { useNotifications } from "../pages/Contexts/NotificationContext";
import "./UserLayout.css";

const TYPE_ICON = {
  success: "✅",
  warning: "⚠️",
  error:   "❌",
  info:    "🔔",
};

function NotificationToast({ notif, onDismiss }) {
  const navigate = useNavigate();
  const icon = TYPE_ICON[notif?.type] ?? "🔔";

  const handleClick = () => {
    onDismiss();
    navigate("/dashboard/notifications");
  };

  return (
    <div className={`notif-toast notif-toast--${notif?.type ?? "info"}`} role="alert">
      <span className="notif-toast-icon">{icon}</span>
      <div className="notif-toast-body" onClick={handleClick}>
        <p className="notif-toast-title">{notif?.title}</p>
        <p className="notif-toast-msg">{notif?.message}</p>
      </div>
      <button className="notif-toast-close" onClick={onDismiss} aria-label="Dismiss">×</button>
    </div>
  );
}

function UserLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => window.innerWidth < 1024);
  const [toasts, setToasts] = useState([]);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const timerRef = useRef({});

  const { user } = useAuth();
  const { liveNotification } = useNotifications();

  useEffect(() => {
    if (!liveNotification) return;
    const id = liveNotification._ts;
    setToasts(prev => [...prev, { ...liveNotification, _toastId: id }]);
    timerRef.current[id] = setTimeout(() => dismissToast(id), 5000);
    return () => clearTimeout(timerRef.current[id]);
  }, [liveNotification]);

  const dismissToast = (id) => {
    clearTimeout(timerRef.current[id]);
    setToasts(prev => prev.filter(t => t._toastId !== id));
  };

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      if (mobile) {
        setIsCollapsed(true);
        setIsSidebarOpen(false);
      } else {
        setIsCollapsed(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const toggleSidebar  = useCallback(() => setIsSidebarOpen(prev => !prev), []);
  const closeSidebar   = useCallback(() => setIsSidebarOpen(false), []);
  const toggleCollapse = useCallback(() => setIsCollapsed(prev => !prev), []);

  // Lock body scroll when sidebar drawer is open (matches admin/contractor behaviour)
  useEffect(() => {
    document.body.style.overflow = isSidebarOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isSidebarOpen]);

return (
    <div className="user-layout">
      <UserSidebar 
        isOpen={isSidebarOpen}
        onClose={closeSidebar}
        isCollapsed={isCollapsed}
        onToggleCollapse={toggleCollapse}
        onReportModalChange={setIsReportModalOpen}
      />

      <AppHeader 
        onMenuClick={toggleSidebar}
        isCollapsed={isCollapsed}
        isSidebarOpen={isSidebarOpen}
      />

      <main className={`user-main-content ${isCollapsed ? 'collapsed' : ''}`}>
        <Outlet />
      </main>

      {isSidebarOpen && <div className="sidebar-backdrop" onClick={closeSidebar} />}

      <BottomTabBar 
      onOpenMore={toggleSidebar} 
      onReportModalChange={setIsReportModalOpen}
      />

      {toasts.length > 0 && (
        <div className="notif-toast-stack">
          {toasts.map(t => (
            <NotificationToast
              key={t._toastId}
              notif={t}
              onDismiss={() => dismissToast(t._toastId)}
            />
          ))}
        </div>
      )}

      {!isSidebarOpen && !isReportModalOpen && (
        <ChatbotWidget
          userName={user?.full_name || user?.name || null}
          pendingReportCount={user?.pending_reports_count ?? null}
        />
      )}
    </div>
  );
}

export default UserLayout;