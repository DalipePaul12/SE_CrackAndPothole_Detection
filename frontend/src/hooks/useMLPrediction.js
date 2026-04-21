import { useState } from "react";
import { api } from "../api/client";

export default function useMLPrediction() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [prediction, setPrediction] = useState(null);

  const classify = async (file_id) => {
    if (!file_id) {
      setError("Missing file id");
      return null;
    }

    setLoading(true);
    setError(null);
    setPrediction(null);

    try {
      const res = await api.post("/ml/classify", { file_id });

      if (!res.success) {
        throw new Error(res.error || "Classification failed");
      }

      const data = res.data;

      if (!data?.label || typeof data?.confidence !== "number") {
        throw new Error("Invalid ML response");
      }

      setPrediction(data);
      return data;
    } catch (err) {
      setError(err.message || "Classification failed");
      return null;
    } finally {
      setLoading(false);
    }
  };

  return {
    classify,
    loading,
    error,
    prediction,
  };
}