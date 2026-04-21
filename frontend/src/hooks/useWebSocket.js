import { useEffect, useRef, useState, useCallback } from "react";

const WS_BASE =
  import.meta.env.VITE_WS_URL || "ws://127.0.0.1:8000/ws";

export function useWebSocket(onMessage) {
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);
  const mountedRef = useRef(false);

  const [connected, setConnected] = useState(false);

  const connect = useCallback(() => {
    const token = localStorage.getItem("access_token");
    if (!token) return;

    const ws = new WebSocket(`${WS_BASE}?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data && typeof data === "object") {
          onMessage?.(data);
        }
      } catch {}
    };

    ws.onclose = () => {
      setConnected(false);

      if (!mountedRef.current) return;

      reconnectRef.current = setTimeout(() => {
        connect();
      }, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [onMessage]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;

      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
      }

      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return {
    connected,
  };
}