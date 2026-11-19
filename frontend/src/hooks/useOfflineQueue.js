/**
 * useOfflineQueue.js
 *
 * Basic offline support for report submission.
 *  - Detects navigator.onLine plus 'online' / 'offline' events.
 *  - Lets callers persist a pending report (payload + media files, as base64)
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
import { reconcileReport, reconcileMedia } from "../api/reports";

const QUEUE_KEY = "snap2fix_offline_report_queue";
const QUEUE_CHANGED = "snap2fix:offline-queue-changed";
let processing = null;

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
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  window.dispatchEvent(new Event(QUEUE_CHANGED));
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
 * Persist a report (and optional media files) to the offline queue so it can
 * be retried automatically once the connection comes back.
 */
export async function enqueueOfflineReport(payload, media = [], reportId = null) {
  const files = Array.isArray(media) ? media : media ? [media] : [];
  const entry = {
    queueId: makeQueueId(),
    createdAt: new Date().toISOString(),
    payload,
    reportId,
    files: await Promise.all(files.map(async (entry) => {
      const file = entry.file ?? entry;
      return { name: file.name, type: file.type, dataUrl: await fileToBase64(file), uploadId: entry.uploadId };
    })),
  };
  writeQueue([...readQueue(), entry]);
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
export function useOfflineQueue({ onResult, userId } = {}) {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [queueItems, setQueueItems] = useState(readQueue);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const refreshQueueCount = useCallback(() => {
    setQueueItems(readQueue());
  }, []);

  const processQueue = useCallback(() => {
    if (processing) return processing;
    if (!navigator.onLine || userId == null) return;

    const sync = async () => {
      let queue = readQueue();

      let index = 0;
      while (index < queue.length) {
        const item = queue[index];
        if (String(item.payload?.user_id) !== String(userId) || item.needsConfirmation) {
          index += 1;
          continue;
        }

        let reportId = item.reportId;
        const files = item.files ?? (item.file ? [item.file] : []);

        if ((!reportId && !item.payload?.capture_metadata?.submission_id) || files.some((file) => !file.uploadId)) {
          onResultRef.current?.({
            id: item.queueId, success: false, reportId,
            error: "This older queued submission has no receipt. Check My Submissions before trying again.",
          });
          index += 1;
          continue;
        }

        try {
          if (!reportId) {
            const result = await reconcileReport(item.payload);
            if (result.detail?.code === "nearby_duplicate_confirmation_required") {
              updateQueueItem(item.queueId, { needsConfirmation: result.detail });
              index += 1;
              continue;
            }
            if (!result.success) throw new Error(result.error || "Failed to submit queued report");
            reportId = result.data?.id ?? result.data?.report_id;
            if (!reportId) throw new Error("Server did not return a report ID.");
            updateQueueItem(item.queueId, { reportId });
          }

          for (const [fileIndex, saved] of files.entries()) {
            const file = base64ToFile(saved.dataUrl, saved.name, saved.type);
            const result = await reconcileMedia(reportId, file, saved.uploadId);
            if (!result.success) throw new Error(result.error || "Media upload failed");
            updateQueueItem(item.queueId, { files: files.slice(fileIndex + 1), file: null });
          }

          removeFromOfflineQueue(item.queueId);
          onResultRef.current?.({ id: item.queueId, success: true, reportId });
          queue = readQueue();
        } catch (err) {
          onResultRef.current?.({
            id: item.queueId, success: false, partial: !!reportId, reportId,
            error: err.message || "Failed to submit queued report.",
          });
          if (!reportId) break;
          index += 1;
        }
      }
    };
    processing = sync().finally(() => {
      processing = null;
      refreshQueueCount();
    });
    return processing;
  }, [refreshQueueCount, userId]);

  const resumeQueuedReport = async (queueId, payload) => {
    await processing;
    const item = readQueue().find((entry) => entry.queueId === queueId);
    if (!item || String(item.payload?.user_id) !== String(userId)) return null;
    updateQueueItem(queueId, { payload, needsConfirmation: null });
    await processQueue();
    return readQueue().find((entry) => entry.queueId === queueId);
  };

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      processQueue();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener(QUEUE_CHANGED, refreshQueueCount);

    // Attempt a retry on mount too, in case items were queued in a
    // previous session and the app reloaded while already online.
    if (navigator.onLine) processQueue();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener(QUEUE_CHANGED, refreshQueueCount);
    };
  }, [processQueue, refreshQueueCount]);

  const confirmationItems = queueItems.filter((item) =>
    userId != null && String(item.payload?.user_id) === String(userId) && item.needsConfirmation);
  return { isOnline, queueCount: queueItems.length, refreshQueueCount, confirmationItems, resumeQueuedReport };
}
