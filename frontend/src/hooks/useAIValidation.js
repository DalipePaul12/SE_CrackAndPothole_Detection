import { useState } from "react";
import { api } from "../api/client";

export default function useAIValidation() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const validate = async (file_id) => {
    if (!file_id) {
      setError("Missing file id");
      return null;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await api.post("/ai/validate", { file_id });

      if (!res.success) {
        throw new Error(res.error || "Validation failed");
      }

      const data = res.data;

      if (data.is_ai_generated) {
        throw new Error("AI-generated content is not allowed");
      }

      setResult(data);
      return data;
    } catch (err) {
      setError(err.message || "Validation failed");
      return null;
    } finally {
      setLoading(false);
    }
  };

  return {
    validate,
    loading,
    error,
    result,
  };
}