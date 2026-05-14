import { useEffect, useRef, useState } from "react";

export function useScrollAnimation(options = {}) {
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  // Stable options ref to avoid re-running effect
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      {
        threshold: optionsRef.current.threshold ?? 0.15,
        rootMargin: optionsRef.current.rootMargin ?? "0px 0px -50px 0px",
      }
    );

    const current = ref.current;
    if (current) observer.observe(current);

    return () => {
      if (current) observer.unobserve(current);
    };
  }, []); // Empty deps — set up once, toggle on every scroll

  return [ref, isVisible];
}