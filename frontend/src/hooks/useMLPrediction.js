import { useCallback, useRef, useState } from "react";
import { analyzeMedia } from "../api/ml";
import { api } from "../api/client";

const BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const REALTIME_ENDPOINT = `${BASE_URL}/api/v1/ml/analyze/realtime`;
const REALTIME_TIMEOUT_MS = 900;

function normalizeAiValidation(raw) {
  return {
    is_ai_generated: raw?.is_ai_generated ?? false,
    confidence:      raw?.confidence      ?? 0,
    status:          raw?.status          ?? "unknown",
    model:           raw?.model           ?? null,
    raw_scores:      raw?.raw_scores      ?? {},
  };
}

function normalizePrediction(raw) {
  if (!raw) return null;
  return {
    label:             raw.label             ?? "uncertain",
    confidence:        raw.confidence        ?? 0,
    severity:          raw.severity          ?? null,
    boxes:             raw.boxes             ?? [],
    norm_bbox:         raw.norm_bbox         ?? null,
    distance:          raw.distance          ?? null,
    inference_time_ms: raw.inference_time_ms ?? null,
  };
}

function normalizeRealtimeResult(raw) {
  return {
    detected:   raw?.detected   ?? false,
    prediction: normalizePrediction(raw?.prediction ?? null),
  };
}

export default function useMLPrediction() {
  const [loading,           setLoading]           = useState(false);
  const [error,             setError]             = useState(null);
  const [prediction,        setPrediction]        = useState(null);
  const [aiValidation,      setAiValidation]      = useState(null);
  const [analysisComplete,  setAnalysisComplete]  = useState(false);

  const [realtimeResult,    setRealtimeResult]    = useState(null);
  const [realtimeLoading,   setRealtimeLoading]   = useState(false);
  const [realtimeError,     setRealtimeError]     = useState(null);

  const analysisIdRef = useRef(0);

  const reset = useCallback(() => {
    analysisIdRef.current++;
    setLoading(false);
    setError(null);
    setPrediction(null);
    setAiValidation(null);
    setAnalysisComplete(false);
    setRealtimeResult(null);
    setRealtimeError(null);
  }, []);

  const analyzeFile = useCallback(async (file) => {
    if (!file) {
      setError("No file provided.");
      return null;
    }

    const thisId = ++analysisIdRef.current;
    setLoading(true);
    setError(null);
    setPrediction(null);
    setAiValidation(null);
    setAnalysisComplete(false);

    try {
      const result = await analyzeMedia(file);

      if (analysisIdRef.current !== thisId) return null;

      if (!result.success) {
        setError(result.error ?? "Analysis failed.");
        setAnalysisComplete(true);
        return null;
      }

      const av   = normalizeAiValidation(result.data?.ai_validation);
      const pred = normalizePrediction(result.data?.prediction);

      setAiValidation(av);
      setPrediction(pred);
      setAnalysisComplete(true);

      return { ai_validation: av, prediction: pred };
    } catch (err) {
      if (analysisIdRef.current !== thisId) return null;
      setError(err.message ?? "Unexpected analysis error.");
      setAnalysisComplete(true);
      return null;
    } finally {
      if (analysisIdRef.current === thisId) setLoading(false);
    }
  }, []);

  const analyzeFrame = useCallback(async (blob) => {
    if (!blob) return null;

    const formData = new FormData();
    formData.append("file", blob, "frame.jpg");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REALTIME_TIMEOUT_MS);

    setRealtimeLoading(true);
    setRealtimeError(null);

    try {
      const token    = localStorage.getItem("access_token");
      const response = await fetch(REALTIME_ENDPOINT, {
        method:      "POST",
        body:        formData,
        signal:      controller.signal,
        credentials: "include",
        headers:     token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) {
        setRealtimeLoading(false);
        return null;
      }

      const body   = await response.json();
      const result = normalizeRealtimeResult(body?.data ?? body);

      setRealtimeResult(result);
      return result;
    } catch (err) {
      if (err.name !== "AbortError") {
        setRealtimeError("Frame analysis failed — retrying…");
      }
      return null;
    } finally {
      clearTimeout(timer);
      setRealtimeLoading(false);
    }
  }, []);

  const classify = useCallback(async (file_id) => {
    if (!file_id) {
      setError("Missing file id.");
      return null;
    }

    setLoading(true);
    setError(null);
    setPrediction(null);

    try {
      const res = await api.post("/ml/classify", { file_id });

      if (!res.success) throw new Error(res.error ?? "Classification failed.");

      const { label, confidence } = res.data ?? {};
      if (!label || typeof confidence !== "number") {
        throw new Error("Invalid ML response structure.");
      }

      const pred = normalizePrediction(res.data);
      setPrediction(pred);
      return pred;
    } catch (err) {
      setError(err.message ?? "Classification failed.");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    analyzeFile,
    loading,
    error,
    prediction,
    aiValidation,
    analysisComplete,
    analyzeFrame,
    realtimeResult,
    realtimeLoading,
    realtimeError,
    classify,
    reset,
  };
}