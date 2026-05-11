import React, { createContext, useContext } from "react";
import { useAuth } from "../../hooks/useAuth";


const AuthContext = createContext(null);

function AppPreloader() {
  return (
    <div style={{
      position:       "fixed",
      inset:          0,
      display:        "flex",
      flexDirection:  "column",
      alignItems:     "center",
      justifyContent: "center",
      background:     "var(--bg, #0d1f12)",
      zIndex:         9999,
      gap:            "1.25rem",
    }}>
      {/* Animated logo ring */}
      <div style={{ position: "relative", width: 64, height: 64 }}>
        <svg
          viewBox="0 0 64 64"
          width="64"
          height="64"
          style={{ animation: "spin 1.2s linear infinite" }}
        >
          <circle
            cx="32" cy="32" r="28"
            fill="none"
            stroke="var(--accent, #2ba81d)"
            strokeWidth="4"
            strokeDasharray="100 60"
            strokeLinecap="round"
          />
        </svg>
        <div style={{
          position:  "absolute",
          inset:     0,
          display:   "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize:  "1.4rem",
        }}>
          ...
        </div>
      </div>

      <p style={{
        color:      "var(--subtext, #86a98a)",
        fontSize:   "0.85rem",
        fontFamily: "inherit",
        letterSpacing: "0.05em",
        margin:     0,
      }}>
        Restoring your session…
      </p>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ── Provider — wraps the whole app ────────────────────────────────────────────
export function AuthProvider({ children }) {
  const auth = useAuth();

  if (auth.isLoading) {
    return <AppPreloader />;
  }

  return (
    <AuthContext.Provider value={auth}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Consumer hook ─────────────────────────────────────────────────────────────
export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuthContext must be used inside <AuthProvider>");
  }
  return ctx;
}