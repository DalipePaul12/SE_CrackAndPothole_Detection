// frontend/src/hooks/useUser.js
//
// Provides the current authenticated user's profile data and actions.
// DO NOT delete useUsers.js — that file is for admin user-list management.
// This file is specifically for the logged-in user's own profile.
//
// What each page gets from this hook:
//   MyProfile.jsx    -> { profile, loading, update, saving }
//   CreateReport.jsx -> { profile }
//   Settings.jsx     -> { updatePassword }

import { useState, useEffect } from "react";
import { getMyProfile, updateMyProfile, changePassword } from "../api/users";

export function useUser() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [saving, setSaving]   = useState(false);

  // -- Fetch profile on mount ------------------------------------------------
  useEffect(() => {
    const token = localStorage.getItem("access_token");

    // Don't attempt fetch if there's no token (user not logged in)
    if (!token) {
      setLoading(false);
      return;
    }

    let cancelled = false; // prevent state update on unmounted component

    const fetchProfile = async () => {
      try {
        const data = await getMyProfile();
        if (!cancelled) setProfile(data);
      } catch (err) {
        if (!cancelled) setError(err?.detail || "Failed to load profile.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchProfile();

    return () => { cancelled = true; };
  }, []);

  // -- Update profile fields (full_name, profile_picture_url, etc.) ----------
  // Usage in MyProfile.jsx: await update({ full_name: "..." })
  const update = async (data) => {
    setSaving(true);
    try {
      const updated = await updateMyProfile(data);
      setProfile(updated);
      return updated;
    } catch (err) {
      throw err; // let the calling component handle the error message
    } finally {
      setSaving(false);
    }
  };

  // -- Change password -------------------------------------------------------
  // Usage in Settings.jsx: await updatePassword(currentPassword, newPassword)
  const updatePassword = async (current_password, new_password) => {
    await changePassword(current_password, new_password);
  };

  return {
    profile,        // object | null  -- the logged-in user's profile data
    loading,        // boolean        -- true while fetching profile
    error,          // string | null  -- fetch error message
    saving,         // boolean        -- true while update() is running
    update,         // async fn       -- update profile fields
    updatePassword, // async fn       -- change password
  };
}