import { api } from "./client";

export const uploadMedia = async (reportId, file) => {
  const formData = new FormData();
  formData.append("file", file);
  const res = await api.upload(`/media/upload?report_id=${reportId}`, formData);
  return {
    success: res?.success ?? false,
    data: res?.data ?? null,
    error: res?.error ?? null,
  };
};

export const getMediaByReport = async (reportId) => {
  const res = await api.get(`/media/report/${reportId}`);
  return {
    success: res?.success ?? false,
    data: Array.isArray(res?.data) ? res.data : [],
    error: res?.error ?? null,
  };
};

export const deleteMedia = async (mediaId) => {
  const res = await api.delete(`/media/${mediaId}`);
  return {
    success: res?.success ?? false,
    data: res?.data ?? null,
    error: res?.error ?? null,
  };
};