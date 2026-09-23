"use client";
import Modal from "./Modal";

export default function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel, danger }) {
  return (
    <Modal open={open} onClose={onClose} title={title || "Konfirmasi"}>
      <div className="flex flex-col gap-4">
        <div className="text-sm text-gray-600">{message}</div>
        <div className="flex gap-2 justify-end">
          <button className="btn-secondary" onClick={onClose}>
            Batal
          </button>
          <button
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${danger ? "bg-red-600" : "bg-ink"}`}
            onClick={onConfirm}
          >
            {confirmLabel || "Konfirmasi"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
