import { api } from "./client";

export const getMyProfile = async () => {
  const res = await api.get("/users/me");

  return {
    success: res?.success ?? false,
    data: res?.data ?? null,
    error: res?.error ?? null,
  };
};

export const updateMyProfile = async (payload) => {
  const res = await api.patch("/users/me", payload);

  return {
    success: res?.success ?? false,
    data: res?.data ?? null,
    error: res?.error ?? null,
  };
};

export const changePassword = async (current_password, new_password) => {
  api.post("/users/me/password", {
    current_password,
    new_password,
  });
  
  return {
    success: res?.success ?? false,
    data: res?.data ?? null,
    error: res?.error ?? null,
  };
};