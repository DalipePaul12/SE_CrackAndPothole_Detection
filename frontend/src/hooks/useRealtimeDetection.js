import { useEffect, useRef, useState, useCallback } from "react";
import { RealtimeDetectionSocket } from "../api/ml.js";

/**
 * useRealtimeDetection — custom hook for WebSocket-based realtime road damage detection.
 *
 * Fixes applied vs original:
 *
 *   FIX A (stale closure on isActive):
 *     The original returned `isActive: socketRef.current?.ws?.readyState === WebSocket.OPEN`
 *     inline in the return object.  Because the return object is recomputed only when the
 *     hook re-renders, and socketRef is a ref (mutation does not trigger re-render), this
 *     value was always stale — it would read the socket state at the last render time, not
 *     the current moment.  Fixed by promoting isActive to a proper useState boolean that is
 *     set explicitly on connect and disconnect.
 *
 *   FIX B (captureFrame returns a Promise inside useCallback but the caller uses .then()):
 *     captureFrame() conditionally returns `null` (synchronous) or a Promise.  The caller
 *     in sendLoop did `.then()` on the return value without null-checking, which throws
 *     "Cannot read properties of null (reading 'then')" when the video element is not
 *     ready.  Fixed by always returning a resolved Promise (Promise.resolve(null)) in the
 *     early-exit path so `.then()` is always safe.
 *
 *   FIX C (captureCanvasRef never cleaned up):
 *     The off-screen canvas created in captureFrame() was stored in a ref and never
 *     removed from memory.  While not a DOM leak (it is never appended to the document),
 *     the ImageData buffers it holds grow proportionally to frame size and are never
 *     released.  Fixed by nullifying captureCanvasRef in the stop() cleanup path.
 *
 *   FIX D (sendLoop calls captureFrame before video is attached):
 *     requestAnimationFrame starts immediately in start(), before the getUserMedia stream
 *     is attached to videoRef and before play() resolves.  The readyState guard inside
 *     captureFrame handles this safely, but the RAF loop burns CPU on no-ops until the
 *     stream is ready.  Fixed by starting the RAF loop only after videoRef.play() resolves.
 */

export function useRealtimeDetection(fps = 12) {
  const [detections, setDetections] = useState([]);
  const [error, setError] = useState(null);
  const [fpsActual, setFpsActual] = useState(0);

  // FIX A: isActive is now a proper state value so consumers re-render correctly.
  const [isActive, setIsActive] = useState(false);

  const socketRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const captureCanvasRef = useRef(null);   // off-screen capture canvas
  const rafRef = useRef(null);
  const frameTimerRef = useRef(0);
  const lastFrameTimeRef = useRef(0);
  const frameCountRef = useRef(0);

  // ── captureFrame ────────────────────────────────────────────────────────────
  const captureFrame = useCallback(() => {
    const video = videoRef.current;

    // FIX B: Return a resolved Promise instead of null so .then() is always safe.
    if (!video || video.readyState < 2) return Promise.resolve(null);

    if (!captureCanvasRef.current) {
      captureCanvasRef.current = document.createElement("canvas");
    }

    const cap = captureCanvasRef.current;
    cap.width = 320;
    cap.height = 240;

    cap.getContext("2d").drawImage(video, 0, 0, 320, 240);

    // Returns a Promise<Blob|null>
    return new Promise((resolve) => {
      cap.toBlob(resolve, "image/jpeg", 0.8);
    });
  }, []);

  // ── sendLoop ─────────────────────────────────────────────────────────────────
  const sendLoop = useCallback(() => {
    rafRef.current = requestAnimationFrame(sendLoop);

    frameCountRef.current++;
    const now = performance.now();

    // Update FPS counter every second
    if (now - lastFrameTimeRef.current >= 1000) {
      setFpsActual(
        Math.round(frameCountRef.current * 1000 / (now - lastFrameTimeRef.current))
      );
      frameCountRef.current = 0;
      lastFrameTimeRef.current = now;
    }

    // Throttle to requested fps
    if (now - frameTimerRef.current < 1000 / fps) return;
    frameTimerRef.current = now;

    // FIX B: captureFrame() always returns a Promise now — .then() is safe.
    captureFrame().then((blob) => {
      if (blob && socketRef.current?.ws?.readyState === WebSocket.OPEN) {
        socketRef.current.sendFrame(blob);
      }
    });
  }, [fps, captureFrame]);

  // ── start ────────────────────────────────────────────────────────────────────
  const start = useCallback(async () => {
    setError(null);
    setDetections([]);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;

        // FIX D: Await play() before starting the RAF loop.
        // Previously, requestAnimationFrame fired immediately — before the video
        // element had a valid readyState — burning CPU on no-op iterations.
        await videoRef.current.play();
      }

      socketRef.current = new RealtimeDetectionSocket((img) => {
        const canvas = canvasRef.current;
        if (canvas && videoRef.current) {
          const ctx = canvas.getContext("2d");
          canvas.width = videoRef.current.videoWidth;
          canvas.height = videoRef.current.videoHeight;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        }
      });

      socketRef.current.connect();

      // FIX A: Set isActive to true now that stream + socket are both live.
      setIsActive(true);

      // FIX D: Start RAF only after play() has resolved.
      frameCountRef.current = 0;
      lastFrameTimeRef.current = performance.now();
      frameTimerRef.current = 0;
      rafRef.current = requestAnimationFrame(sendLoop);

    } catch (err) {
      setError(
        err.name === "NotAllowedError"
          ? "Camera access denied"
          : "Camera unavailable"
      );
    }
  }, [sendLoop]);

  // ── stop ─────────────────────────────────────────────────────────────────────
  const stop = useCallback(() => {
    // Stop animation loop
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    // Disconnect WebSocket
    socketRef.current?.disconnect();
    socketRef.current = null;

    // Stop media tracks
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }

    // FIX C: Release the off-screen capture canvas so its ImageData buffers
    // are freed.  The canvas is not in the DOM, but the pixel buffers it holds
    // (320×240×4 bytes per frame) accumulate if the canvas is reused without
    // ever being released across multiple start/stop cycles.
    captureCanvasRef.current = null;

    // FIX A: Update isActive state so consumers re-render correctly.
    setIsActive(false);
    setDetections([]);
    setError(null);
    setFpsActual(0);
    frameCountRef.current = 0;
  }, []);

  // ── cleanup on unmount ───────────────────────────────────────────────────────
  useEffect(() => {
    return () => stop();
  }, [stop]);

  return {
    start,
    stop,
    detections,
    error,
    fpsActual,
    videoRef,
    canvasRef,
    // FIX A: isActive is now a reactive state value, not a stale ref read.
    isActive,
  };
}