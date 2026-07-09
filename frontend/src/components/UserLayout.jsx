import { useState, useEffect, useCallback, useRef } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import UserSidebar from "./UserSidebar";
import AppHeader from "./AppHeader";
import ChatbotWidget from "./ChatbotWidget";
import { useNotifications } from "../hooks/useNotifications";
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
  const timerRef = useRef({});

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

  return (
    <div className="user-layout">
      <button className="mobile-menu-btn" onClick={toggleSidebar} aria-label="Toggle sidebar">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {isSidebarOpen ? (
            <path d="M18 6L6 18M6 6l12 12" />
          ) : (
            <>
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </>
          )}
        </svg>
      </button>

      <UserSidebar 
        isOpen={isSidebarOpen}
        onClose={closeSidebar}
        isCollapsed={isCollapsed}
        onToggleCollapse={toggleCollapse}
      />

      <AppHeader 
        onMenuClick={toggleSidebar} 
        isCollapsed={isCollapsed}
      />

      <main className={`user-main-content ${isCollapsed ? 'collapsed' : ''}`}>
        <Outlet />
      </main>

      {isSidebarOpen && <div className="sidebar-backdrop" onClick={closeSidebar} />}

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

      <ChatbotWidget />
    </div>
  );
}

export default UserLayout;
