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
      className="m-auto w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-0 text-slate-100 shadow-2xl"
    >
      <div className="p-5 flex flex-col gap-4">
        <h3 id={titleId} className="text-base font-bold text-slate-100">
          {title}
        </h3>
        <p className="text-sm text-slate-300 leading-relaxed">{message}</p>
        <form method="dialog" className="flex justify-end gap-2 pt-1">
          <button
            type="submit"
            value="cancel"
            autoFocus
            className="rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            type="submit"
            value="confirm"
            className="rounded-lg bg-red-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-red-500 cursor-pointer"
          >
            {confirmLabel}
          </button>
        </form>
      </div>
    </dialog>
  );
}
