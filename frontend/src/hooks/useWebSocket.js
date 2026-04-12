import { useEffect, useRef, useCallback } from "react";

export function useWebSocket(onMessage) {
  const ws = useRef(null);
  const token = localStorage.getItem("access_token");

  const connect = useCallback(() => {
    if (!token) return;

    ws.current = new WebSocket(
      `ws://127.0.0.1:8000/ws?token=${token}`
    );

    ws.current.onopen = () => {
      console.log("WebSocket connected");
    };

    ws.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data); // pass to component: { event, title, message, ... }
      } catch {}
    };

    ws.current.onclose = () => {
      // Auto-reconnect after 3 seconds
      setTimeout(connect, 3000);
    };

    ws.current.onerror = (err) => {
      console.error("WebSocket error:", err);
      ws.current.close();
    };
  }, [token]);

  useEffect(() => {
    connect();
    return () => {
      if (ws.current) ws.current.close();
    };
  }, [connect]);
}