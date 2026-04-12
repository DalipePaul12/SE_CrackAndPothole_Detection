import { useState, useEffect } from "react";
import { getMyProfile, updateMyProfile, changePassword } from "../api/users";

export function useUser() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      try {
        const data = await getMyProfile();
        setProfile(data);
      } catch (err) {
        setError(err.detail || "Failed to load profile.");
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  const update = async (data) => {
    setSaving(true);
    try {
      const updated = await updateMyProfile(data);
      setProfile(updated);
      return updated;
    } finally {
      setSaving(false);
    }
  };

  const updatePassword = async (current_password, new_password) => {
    await changePassword(current_password, new_password);
  };

  return { profile, loading, error, saving, update, updatePassword };
}