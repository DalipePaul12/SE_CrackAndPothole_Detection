// src/hooks/useWebSocket.js
import { useEffect, useRef, useState, useCallback } from "react";
import { tokenStorage } from "../api/client";

// ✅ Use tokenStorage (same source of truth as the rest of the app)
// Fall back to a relative WS URL (uses Vite proxy in dev, same host in prod)
// VITE_WS_URL should be set explicitly in production (e.g. wss://yourapp.com/ws)
const _wsEnv = import.meta.env.VITE_WS_URL;
const WS_BASE = _wsEnv
  ? _wsEnv
  : `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws`;
const MAX_RETRIES = 3;

/**
 * useWebSocket — connects to /ws, authenticates via first message,
 * and calls onMessage for every inbound JSON event.
 *
 * Authentication flow (token NOT in URL — see ws.py for server side):
 *   1. Connect to WS_BASE  (no query params)
 *   2. On open: send { type: "auth", token: "<access_token>" }
 *   3. Server responds with { event: "connected" } on success
 *   4. Subsequent messages are notification events
 *
 * Reconnect strategy: exponential backoff capped at 10s, max MAX_RETRIES attempts.
 * After MAX_RETRIES failures the hook stops reconnecting and the app
 * falls back to HTTP polling (if implemented in the parent component).
 */
export function useWebSocket(onMessage) {
  const wsRef         = useRef(null);
  const reconnectRef  = useRef(null);
  const mountedRef    = useRef(false);
  const retryCountRef = useRef(0);

  // Keep onMessage ref fresh so changing the callback doesn't cause reconnects
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const [connected, setConnected] = useState(false);

  const connect = useCallback(() => {
    const token = tokenStorage.getAccess(); // ✅ consistent token source
    if (!token) {
      // Not logged in — don't attempt WebSocket
      return;
    }

    if (retryCountRef.current >= MAX_RETRIES) {
      console.warn(
        `[WS] Unavailable after ${MAX_RETRIES} retries — falling back to HTTP polling.`
      );
      return;
    }

    // ✅ No token in URL — server expects it as the first message
    const ws = new WebSocket(WS_BASE);
    wsRef.current = ws;

    ws.onopen = () => {
      retryCountRef.current = 0; // reset backoff counter on success
      setConnected(true);

      // ✅ Send auth as first message — keeps token out of server logs
      ws.send(JSON.stringify({ type: "auth", token }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (!data || typeof data !== "object") return;

        // Skip the internal "connected" confirmation — not a user-facing event
        if (data.event === "connected") return;

        onMessageRef.current?.(data);
      } catch {
        // Silently ignore non-JSON / malformed messages (keepalive frames, etc.)
      }
    };

    ws.onclose = (event) => {
      setConnected(false);
      wsRef.current = null;

      if (!mountedRef.current) return; // component unmounted — stop reconnecting

      // Normal closure (1000/1001) or auth rejection (4001/4002/4003) — don't retry
      if (event.code === 1000 || event.code === 1001 || event.code >= 4000) {
        if (event.code >= 4000) {
          console.warn(`[WS] Auth rejected (code=${event.code}) — not reconnecting.`);
        }
        return;
      }

      // Exponential backoff: 2s → 4s → 6s, capped at 10s
      retryCountRef.current += 1;
      const delay = Math.min(2000 * retryCountRef.current, 10000);
      console.info(`[WS] Reconnecting in ${delay}ms (attempt ${retryCountRef.current}/${MAX_RETRIES})`);

      reconnectRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      // Force close so onclose fires and handles the reconnect/backoff logic
      ws.close();
    };
  }, []); // empty deps — all external state accessed via refs

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;

      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }

      if (wsRef.current) {
        wsRef.current.close(1000, "Component unmounted");
        wsRef.current = null;
      }
    };
  }, [connect]);

  return { connected };
}