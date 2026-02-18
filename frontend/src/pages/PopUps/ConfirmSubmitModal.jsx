
import "./ConfirmSubmitModal.css"; 

function ConfirmSubmitModal({ 
  title, 
  message, 
  onConfirm, 
  onCancel,
  confirmText = "Confirm",
  cancelText = "Cancel",
  hideCancel = false,
}) {


  return (
    <div className="confirm-overlay">
      <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p>{message}</p>

        <div className="confirm-actions">
         {!hideCancel && (
            <button className="confirm-cancel" onClick={onCancel}>
              {cancelText}
            </button>
          )}

          <button className="confirm-confirm" onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmSubmitModal; 