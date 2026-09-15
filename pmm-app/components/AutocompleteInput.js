"use client";
import { useMemo, useState } from "react";

// Free-text input with suggestions from `options` (array of strings).
// User is never forced to pick from the list.
export default function AutocompleteInput({ value, onChange, options, placeholder }) {
  const [open, setOpen] = useState(false);

  const suggestions = useMemo(() => {
    if (!value) return [];
    const v = value.toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(v)).slice(0, 6);
  }, [value, options]);

  return (
    <div className="relative">
      <input
        className="input"
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && suggestions.length > 0 && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {suggestions.map((o) => (
            <button
              type="button"
              key={o}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
              onMouseDown={() => {
                onChange(o);
                setOpen(false);
              }}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
