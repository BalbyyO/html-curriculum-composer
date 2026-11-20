import { useEffect, useId, useRef } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  function handleClose() {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const outcome = dialog.returnValue;
    dialog.returnValue = '';
    if (outcome === 'confirm') {
      onConfirm();
    } else {
      onCancel();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={handleClose}
      className="hcc-block m-auto w-full max-w-md p-0 text-[var(--hcc-ink)]"
    >
      <div className="flex flex-col">
        <div className="hcc-block-header px-5 py-3">
          <h3 id={titleId} className="text-sm font-bold uppercase tracking-wide text-[var(--hcc-ink)]">
            {title}
          </h3>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <p className="text-sm text-[var(--hcc-ink-muted)] leading-relaxed">{message}</p>
          <form method="dialog" className="flex justify-end gap-2 pt-1">
            <button
              type="submit"
              value="cancel"
              autoFocus
              className="hcc-btn px-3.5 py-2 text-xs"
            >
              {cancelLabel}
            </button>
            <button
              type="submit"
              value="confirm"
              className="hcc-btn hcc-btn-danger px-3.5 py-2 text-xs"
            >
              {confirmLabel}
            </button>
          </form>
        </div>
      </div>
    </dialog>
  );
}
