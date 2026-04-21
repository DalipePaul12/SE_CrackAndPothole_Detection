import { useState } from "react";
import { uploadMedia } from "../api/media";

export default function useUploadMedia() {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const upload = async (reportId, file) => {
    if (!reportId) {
      setError("Report ID is required before uploading media");
      return null;
    }

    if (!file) {
      setError("No file selected");
      return null;
    }

    const imageTypes = ["image/jpeg", "image/png", "image/webp"];
    const videoTypes = ["video/mp4"];
    const allowedTypes = [...imageTypes, ...videoTypes];

    if (!allowedTypes.includes(file.type)) {
      setError("Invalid file type. Allowed: JPEG, PNG, WebP, MP4");
      return null;
    }

    const isVideo   = videoTypes.includes(file.type);
    const maxBytes  = isVideo ? 150 * 1024 * 1024 : 50 * 1024 * 1024;
    const maxLabel  = isVideo ? "150 MB" : "50 MB";

    if (file.size > maxBytes) {
      setError(`File too large (max ${maxLabel})`);
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await uploadMedia(reportId, file);

      if (!res.success) {
        throw new Error(res.error || "Upload failed");
      }

      return res.data;
    } catch (err) {
      setError(err.message || "Upload failed");
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { upload, loading, error };
}