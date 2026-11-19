import { useLayoutEffect, useRef } from "react";

export function useNativeDialog(ref, open = true) {
  useLayoutEffect(() => {
    if (!open) return;
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [ref, open]);
}

export default function ReportDialog({ label, onClose, children }) {
  const ref = useRef(null);
  useNativeDialog(ref);

  return (
    <dialog ref={ref} aria-label={label} onClick={(event) => event.stopPropagation()}
      style={{
        position: "fixed", inset: 0, width: "100%", height: "100%", maxWidth: "none",
        maxHeight: "none", margin: 0, padding: 0, border: 0, background: "transparent",
        overflow: "hidden",
      }}
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}>
      {children}
    </dialog>
  );
}
