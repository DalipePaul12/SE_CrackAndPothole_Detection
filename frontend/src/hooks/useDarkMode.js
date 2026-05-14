import { useEffect, useState } from "react";

const STORAGE_KEY = "snap2fix-theme";

function getInitialDark() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) return stored === "dark";
  } catch {}
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
  ) ?? false;
}

export function useDarkMode() {
  const [isDark, setIsDark] = useState(getInitialDark);

  useEffect(() => {
    // Apply to both <html> and <body> so :root and body.dark selectors both work
    document.documentElement.classList.toggle("dark", isDark);
    document.body.classList.toggle("dark", isDark);
    try {
      localStorage.setItem(STORAGE_KEY, isDark ? "dark" : "light");
    } catch {}
  }, [isDark]);

  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === STORAGE_KEY) setIsDark(e.newValue === "dark");
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const toggle   = () => setIsDark((prev) => !prev);
  const setDark  = () => setIsDark(true);
  const setLight = () => setIsDark(false);

  return { isDark, toggle, setDark, setLight };
}