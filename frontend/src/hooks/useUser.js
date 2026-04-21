import { useState, useEffect, useRef } from "react";
import {
  getMyProfile,
  updateMyProfile,
  changePassword,
} from "../api/users";

export function useUser() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const abortRef = useRef(false);

  useEffect(() => {
    const token = localStorage.getItem("access_token");

    if (!token) {
      setLoading(false);
      return;
    }

    abortRef.current = false;

    const fetchProfile = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await getMyProfile();

        if (!res?.success) {
          throw new Error(res?.error || "Failed to load profile");
        }

        if (!abortRef.current) {
          setProfile(res.data);
        }
      } catch (err) {
        if (!abortRef.current) {
          setError(err.message || "Failed to load profile");
        }
      } finally {
        if (!abortRef.current) {
          setLoading(false);
        }
      }
    };

    fetchProfile();

    return () => {
      abortRef.current = true;
    };
  }, []);

  const update = async (data) => {
    try {
      setSaving(true);
      setError(null);

      const res = await updateMyProfile(data);

      if (!res?.success) {
        throw new Error(res?.error || "Update failed");
      }

      setProfile(res.data);
      return res.data;
    } catch (err) {
      setError(err.message || "Update failed");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const updatePassword = async (current_password, new_password) => {
    try {
      setError(null);

      const res = await changePassword(current_password, new_password);

      if (!res?.success) {
        throw new Error(res?.error || "Password update failed");
      }

      return true;
    } catch (err) {
      setError(err.message || "Password update failed");
      return false;
    }
  };

  return {
    profile,
    loading,
    error,
    saving,
    update,
    updatePassword,
  };
}