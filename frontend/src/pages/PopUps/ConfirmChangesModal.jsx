import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle, Info, AlertCircle } from "lucide-react";
import "./ConfirmChangesModal.css";

function ConfirmChangesModal({
  title = "Confirm",
  message = "Are you sure?",
  confirmText = "Confirm",
  onConfirm,
  onCancel,
  variant = "default",
  hideCancel = false,
}) {
  const icon =
    variant === "danger"  ? <AlertTriangle  size={28} className="ccm-icon danger"  /> :
    variant === "warning" ? <AlertCircle    size={28} className="ccm-icon warning" /> :
    variant === "success" ? <CheckCircle    size={28} className="ccm-icon success" /> :
                            <Info           size={28} className="ccm-icon default" />;

  return createPortal(
    <div className="ccm-overlay" onClick={hideCancel ? onConfirm : onCancel}>
      <div className="ccm-modal" onClick={(e) => e.stopPropagation()}>
        {icon}
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="ccm-actions">
          {!hideCancel && (
            <button className="ccm-cancel" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button
            className={`ccm-confirm ${variant !== "default" ? variant : ""}`}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default ConfirmChangesModal;