"use client";
import { useMemo, useState } from "react";

// A dropdown that must be picked from `options` (array of {value,label}), with a
// search box to filter the list. Unlike AutocompleteInput, the value is always
// one of the given options - free text is not accepted.
export default function SearchableSelect({ value, onChange, options, placeholder }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  return (
    <div className="relative">
      <button
        type="button"
        className="input text-left flex items-center justify-between"
        onClick={() => setOpen((o) => !o)}
      >
        <span className={selected ? "" : "text-gray-400"}>{selected ? selected.label : placeholder || "Pilih"}</span>
        <span className="text-gray-400 text-xs">▼</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          <input
            autoFocus
            className="w-full border-b border-gray-100 px-3 py-2 text-sm outline-none"
            placeholder="Cari..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 && <div className="px-3 py-2 text-sm text-gray-400">Tidak ada hasil</div>}
            {filtered.map((o) => (
              <button
                type="button"
                key={o.value}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                onMouseDown={() => {
                  onChange(o.value);
                  setOpen(false);
                  setQuery("");
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
