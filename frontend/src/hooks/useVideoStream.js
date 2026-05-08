/**
 * useVideoStream.js — Streams NDJSON from /analyze/video/stream
 *
 * FIXES vs original:
 *
 *   FIX 1 — stream() signature changed to accept a callbacks object:
 *     Original: stream(file)  — caller had no way to react to individual events.
 *     Fixed:    stream(file, { onProgress, onDone, onError })
 *     This lets CreateReport update liveVideoDetections on each "progress"
 *     event and update final state on "done", without polling shared state.
 *
 *   FIX 2 — NDJSON parsing hardened:
 *     Original split on "\n" but didn't handle "\r\n" line endings or
 *     chunks that arrive mid-line (network backpressure). Fixed with a
 *     persistent buffer that accumulates across reads.
 *
 *   FIX 3 — onError called on HTTP error status:
 *     Original only set component state on fetch failure; HTTP 4xx/5xx
 *     responses were silently ignored. Now onError is called with the
 *     error message so the caller can fallback to analyzeVideo().
 *
 *   FIX 4 — cancel() stops the ReadableStream reader, not just the AbortController:
 *     Calling abort() races with reader.read() — the reader can block
 *     indefinitely if the server keeps the connection open. Now cancel()
 *     also calls reader.cancel() directly so the loop exits immediately.
 */

import { useRef, useCallback } from "react";

const BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export function useVideoStream() {
  const abortRef  = useRef(null);
  const readerRef = useRef(null);   // FIX 4

  /**
   * stream(file, callbacks)
   *
   * @param {File} file
   * @param {Object} callbacks
   * @param {Function} [callbacks.onProgress] — called with each "progress" event object
   * @param {Function} [callbacks.onDone]     — called with the "done" event object
   * @param {Function} [callbacks.onError]    — called with an error message string
   */
  const stream = useCallback(async (file, callbacks = {}) => {
    const { onProgress, onDone, onError } = callbacks;

    // Abort any previous stream
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const token    = localStorage.getItem("access_token");
    const formData = new FormData();
    formData.append("file", file);

    let res;
    try {
      res = await fetch(`${BASE_URL}/api/v1/ml/analyze/video/stream`, {
        method:  "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body:    formData,
        signal:  abortRef.current.signal,
      });
    } catch (err) {
      // FIX 3: network error or abort
      if (err.name !== "AbortError") {
        onError?.("Stream connection failed.");
      }
      return;
    }

    // FIX 3: HTTP error
    if (!res.ok) {
      onError?.(`Server error ${res.status}`);
      return;
    }

    const reader  = res.body.getReader();
    readerRef.current = reader;   // FIX 4: store for cancel()
    const decoder = new TextDecoder();
    let buffer    = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // FIX 2: accumulate across chunks
        buffer += decoder.decode(value, { stream: true });

        // FIX 2: split on \n or \r\n
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop();  // last element is the incomplete line (may be "")

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          let event;
          try {
            event = JSON.parse(trimmed);
          } catch {
            continue; // malformed — skip
          }
          handleEvent(event, { onProgress, onDone });
        }
      }

      // Flush any remaining buffer content
      if (buffer.trim()) {
        try {
          const event = JSON.parse(buffer.trim());
          handleEvent(event, { onProgress, onDone });
        } catch {}
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        onError?.("Stream read error.");
      }
    } finally {
      readerRef.current = null;
    }
  }, []);

  function handleEvent(event, { onProgress, onDone }) {
    switch (event.type) {
      case "start":
        // Optionally expose start info via onProgress with processed=0
        onProgress?.({ processed: 0, total: event.total_frames ?? 0, detections: [] });
        break;

      case "progress":
        onProgress?.({
          processed:  event.processed  ?? 0,
          total:      event.total      ?? 0,
          // Normalise detections — backend may send boxes in different shapes
          detections: normaliseDetections(event.detections ?? []),
          frame_id:   event.frame_id,
          confidence: event.confidence,
        });
        break;

      case "done":
        onDone?.({
          detected:   event.detected    ?? false,
          prediction: event.prediction  ?? null,
          analytics:  event.analytics   ?? {},
          // detection_snapshots live inside analytics
        });
        break;

      default:
        break;
    }
  }

  /**
   * Normalise box shapes from backend into the standard
   * { label, confidence, severity, x_norm, y_norm, w_norm, h_norm } format.
   */
  function normaliseDetections(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map((d) => ({
      label:      d.label      ?? "unknown",
      confidence: d.confidence ?? 0,
      severity:   d.severity   ?? null,
      x_norm:     d.x_norm     ?? (d.bbox?.[0] ?? 0),
      y_norm:     d.y_norm     ?? (d.bbox?.[1] ?? 0),
      w_norm:     d.w_norm     ?? (d.bbox?.[2] ?? 0),
      h_norm:     d.h_norm     ?? (d.bbox?.[3] ?? 0),
    })).filter((d) => d.w_norm > 0 && d.h_norm > 0);
  }

  // FIX 4: cancel stops both abort controller AND reader
  const cancel = useCallback(() => {
    abortRef.current?.abort();
    readerRef.current?.cancel();
    readerRef.current = null;
  }, []);

  return { stream, cancel };
}