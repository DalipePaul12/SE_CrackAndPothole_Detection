/**
 * useOfflineQueue.js
 *
 * Basic offline support for report submission.
 *  - Detects navigator.onLine plus 'online' / 'offline' events.
 *  - Lets callers persist a pending report (payload + media file, as base64)
 *    to localStorage instead of failing when there is no connection.
 *  - Automatically retries queued submissions, in order, once the
 *    connection is restored, using the existing createReport/uploadMedia
 *    API functions (the submission contract in ../api/reports.js is
 *    untouched).
 *
 * This module does NOT change what gets sent to the backend — it only
 * decides *when* to send it.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createReport, uploadMedia } from "../api/reports";

const QUEUE_KEY = "snap2fix_offline_report_queue";

// ── localStorage helpers ─────────────────────────────────────────────────────

function readQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(queue) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (err) {
    // Storage full/unavailable — nothing more we can do here safely.
    console.warn("Could not persist offline report queue:", err);
  }
}

function makeQueueId() {
  return `off_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ── File <-> base64 helpers ──────────────────────────────────────────────────

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function base64ToFile(dataUrl, name, type) {
  const [meta, base64Data] = dataUrl.split(",");
  const mime = type || (meta.match(/data:(.*);base64/) || [])[1] || "application/octet-stream";
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], name || "offline-upload", { type: mime });
}

// ── Public queue helpers (usable outside React, e.g. from other hooks) ──────

/**
 * Persist a report (and optional media file) to the offline queue so it can
 * be retried automatically once the connection comes back.
 */
export async function enqueueOfflineReport(payload, file = null) {
  const entry = {
    queueId: makeQueueId(),
    createdAt: new Date().toISOString(),
    payload,
    file: null,
  };

  if (file) {
    entry.file = {
      name: file.name,
      type: file.type,
      dataUrl: await fileToBase64(file),
    };
  }

  const queue = readQueue();
  queue.push(entry);
  writeQueue(queue);
  return entry.queueId;
}

export function getOfflineQueue() {
  return readQueue();
}

export function getOfflineQueueCount() {
  return readQueue().length;
}

export function removeFromOfflineQueue(queueId) {
  writeQueue(readQueue().filter((item) => item.queueId !== queueId));
}

/** Merge `updates` into the stored queue item, keeping it queued. */
function updateQueueItem(queueId, updates) {
  const queue = readQueue();
  const idx = queue.findIndex((item) => item.queueId === queueId);
  if (idx === -1) return;
  queue[idx] = { ...queue[idx], ...updates };
  writeQueue(queue);
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Tracks online/offline state and drives automatic retry of any reports
 * saved via enqueueOfflineReport(). Call `onResult` to surface a
 * toast/notification for each queued item as it succeeds or fails.
 */
export function useOfflineQueue({ onResult } = {}) {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [queueCount, setQueueCount] = useState(() => getOfflineQueueCount());
  const processingRef = useRef(false);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const refreshQueueCount = useCallback(() => {
    setQueueCount(getOfflineQueueCount());
  }, []);

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    if (!navigator.onLine) return;

    processingRef.current = true;
    try {
      let queue = readQueue();

      let index = 0;
      while (index < queue.length) {
        const item = queue[index];

        // If the report was already created on a previous attempt (partial
        // failure — report succeeded, media upload didn't), don't re-create
        // it. Only retry the media upload against the stored report ID.
        if (item.reportId) {
          if (!item.file) {
            // No media to retry (shouldn't normally happen) — nothing left
            // to do for this item, so drop it.
            removeFromOfflineQueue(item.queueId);
            onResultRef.current?.({ id: item.queueId, success: true, reportId: item.reportId });
            queue = readQueue();
            continue;
          }

          try {
            const file = base64ToFile(item.file.dataUrl, item.file.name, item.file.type);
            const uploadRes = await uploadMedia(item.reportId, file);
            if (!uploadRes.success) {
              throw new Error(uploadRes.error || "Media upload failed");
            }

            removeFromOfflineQueue(item.queueId);
            onResultRef.current?.({ id: item.queueId, success: true, reportId: item.reportId });
            queue = readQueue();
            continue;
          } catch (err) {
            // Report already exists — keep the item queued (status stays
            // "media_failed") and move on to the next item instead of
            // blocking the whole queue on a media-only failure.
            updateQueueItem(item.queueId, { status: "media_failed" });
            onResultRef.current?.({
              id: item.queueId,
              success: false,
              partial: true,
              reportId: item.reportId,
              error: err.message || "Media upload failed",
            });
            index += 1;
            continue;
          }
        }

        try {
          const reportRes = await createReport(item.payload);
          if (!reportRes.success) {
            throw new Error(reportRes.error || "Failed to submit queued report");
          }

          const reportId = reportRes.data?.id ?? reportRes.data?.report_id;

          if (item.file && reportId) {
            const file = base64ToFile(item.file.dataUrl, item.file.name, item.file.type);
            const uploadRes = await uploadMedia(reportId, file);
            if (!uploadRes.success) {
              // Report was created successfully — keep the item queued with
              // the report ID so the next retry only re-attempts the media
              // upload, instead of re-creating the report.
              updateQueueItem(item.queueId, { reportId, status: "media_failed" });
              onResultRef.current?.({
                id: item.queueId,
                success: false,
                partial: true,
                reportId,
                error: uploadRes.error || "Media upload failed",
              });
              index += 1;
              queue = readQueue();
              continue;
            }
          }

          removeFromOfflineQueue(item.queueId);
          onResultRef.current?.({ id: item.queueId, success: true, reportId });
        } catch (err) {
          // Report itself couldn't be created (likely still offline / network
          // hiccup) — stop processing so remaining queued reports keep their
          // order for the next retry.
          onResultRef.current?.({
            id: item.queueId,
            success: false,
            error: err.message || "Failed to submit queued report. It will retry automatically.",
          });
          break;
        }

        queue = readQueue();
      }
    } finally {
      processingRef.current = false;
      refreshQueueCount();
    }
  }, [refreshQueueCount]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      processQueue();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Attempt a retry on mount too, in case items were queued in a
    // previous session and the app reloaded while already online.
    if (navigator.onLine) processQueue();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [processQueue]);

  return { isOnline, queueCount, refreshQueueCount };
}
