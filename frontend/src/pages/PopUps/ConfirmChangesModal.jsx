import "./ConfirmChangesModal.css";

function ConfirmChangesModal({
  title = "Confirm Changes",
  message = "Are you sure you want to apply these changes?",
  confirmText = "Confirm",
  onConfirm,
  onCancel,
  variant = "default", // "default" | "danger"
}) {
  return (
    <div className="confirm-overlay">
      <div className="confirm-modal">

        <h3>{title}</h3>
        <p>{message}</p>

        <div className="confirm-actions">
          <button
            className="confirm-cancel"
            onClick={onCancel}
          >
            Cancel
          </button>

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