import { useEffect, useRef, useState, useCallback } from "react";
import { RealtimeDetectionSocket } from "../api/ml.js";

export function useRealtimeDetection(fps = 12) {
  const [detections, setDetections] = useState([]);
  const [error, setError] = useState(null);
  const [fpsActual, setFpsActual] = useState(0);
  
  const socketRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const captureCanvasRef = useRef(null);
  const rafRef = useRef(null);
  const frameTimerRef = useRef(0);
  const lastFrameTimeRef = useRef(0);
  const frameCountRef = useRef(0);

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return null;

    if (!captureCanvasRef.current) {
      captureCanvasRef.current = document.createElement("canvas");
    }
    
    const cap = captureCanvasRef.current;
    cap.width = 320;
    cap.height = 240;
    
    const ctx = cap.getContext("2d");
    ctx.drawImage(video, 0, 0, 320, 240);
    
    return new Promise(resolve => {
      cap.toBlob(resolve, "image/jpeg", 0.8);
    });
  }, []);

  const sendLoop = useCallback((timestamp) => {
    rafRef.current = requestAnimationFrame(sendLoop);
    
    frameCountRef.current++;
    const now = performance.now();
    
    if (now - lastFrameTimeRef.current >= 1000) {
      setFpsActual(Math.round(frameCountRef.current * 1000 / (now - lastFrameTimeRef.current)));
      frameCountRef.current = 0;
      lastFrameTimeRef.current = now;
    }

    if (now - frameTimerRef.current < 1000 / fps) return;
    frameTimerRef.current = now;

    captureFrame().then(blob => {
      if (blob && socketRef.current?.ws?.readyState === WebSocket.OPEN) {
        socketRef.current.sendFrame(blob);
      }
    });
  }, [fps, captureFrame]);

  const start = useCallback(async () => {
    setError(null);
    setDetections([]);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: "environment", 
          width: { ideal: 1280 }, 
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        }
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
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
      rafRef.current = requestAnimationFrame(sendLoop);
      
    } catch (err) {
      setError(err.name === "NotAllowedError" 
        ? "Camera access denied" 
        : "Camera unavailable"
      );
    }
  }, [sendLoop]);

  const stop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    
    socketRef.current?.disconnect();
    
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    
    setDetections([]);
    setError(null);
    setFpsActual(0);
    frameCountRef.current = 0;
  }, []);

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
    isActive: !!socketRef.current?.ws?.OPEN
  };
}