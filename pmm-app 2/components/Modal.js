"use client";

export default function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-0 sm:px-4">
      <div
        className={`bg-white w-full ${wide ? "sm:max-w-2xl" : "sm:max-w-md"} rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 sticky top-0 bg-white">
          <div className="font-semibold">{title}</div>
          <button onClick={onClose} className="text-gray-400 hover:text-ink text-xl leading-none px-2">
            ×
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
