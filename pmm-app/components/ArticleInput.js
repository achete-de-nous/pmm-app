"use client";
import { useMemo, useState } from "react";

// Free-text input for Article Name with autocomplete suggestions.
// Does NOT require picking from the list - user can type a brand new name.
export default function ArticleInput({ value, onChange, articles, placeholder }) {
  const [open, setOpen] = useState(false);

  const suggestions = useMemo(() => {
    if (!value) return [];
    const v = value.toLowerCase();
    return articles.filter((a) => a.name.toLowerCase().includes(v)).slice(0, 6);
  }, [value, articles]);

  return (
    <div className="relative">
      <input
        className="input"
        value={value}
        placeholder={placeholder || "Article Name"}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && suggestions.length > 0 && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {suggestions.map((a) => (
            <button
              type="button"
              key={a.id}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
              onMouseDown={() => {
                onChange(a.name);
                setOpen(false);
              }}
            >
              {a.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
