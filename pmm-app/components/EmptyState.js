export default function EmptyState({ title, hint }) {
  return (
    <div className="border border-dashed border-gray-300 rounded-xl py-12 px-6 text-center text-gray-500">
      <div className="font-medium text-ink mb-1">{title}</div>
      {hint && <div className="text-sm">{hint}</div>}
    </div>
  );
}
