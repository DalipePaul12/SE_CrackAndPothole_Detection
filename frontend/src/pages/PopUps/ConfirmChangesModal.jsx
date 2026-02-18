import "./ConfirmChangesModal.css";

function ConfirmChangesModal({
  title = "Confirm Changes",
  message = "Are you sure you want to apply these changes?",
  confirmText = "Confirm",
  onConfirm,
  onCancel,
  variant = "default", // "default" | "danger"
  hideCancel = false
}) {
  return (
    <div className="confirm-overlay">
      <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>

        <h3>{title}</h3>
        <p>{message}</p>

        <div className="confirm-actions">
        {!hideCancel && (
          <button className="confirm-cancel" onClick={onCancel}>
            Cancel
          </button>
        )}

          <button
            className={`confirm-confirm ${
              variant === "danger" ? "danger" : ""
            }`}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>

      </div>
    </div>
  );
}

export default ConfirmChangesModal;