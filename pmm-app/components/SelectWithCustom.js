"use client";
import { useState } from "react";

// A <select> that also lets the user add a brand-new option inline.
// `options` = array of strings already available (defaults + previously custom-added).
// `onAddOption(newValue)` is called when the user types a new option - the parent
// is responsible for persisting it (e.g. saving to a "vendorTypes" collection).
export default function SelectWithCustom({ value, onChange, options, onAddOption, placeholder }) {
  const [adding, setAdding] = useState(false);
  const [newValue, setNewValue] = useState("");

  if (adding) {
    return (
      <div className="flex gap-2">
        <input
          autoFocus
          className="input"
          placeholder="Nama baru"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (newValue.trim()) {
                onAddOption(newValue.trim());
                onChange(newValue.trim());
              }
              setAdding(false);
              setNewValue("");
            }
            if (e.key === "Escape") {
              setAdding(false);
              setNewValue("");
            }
          }}
        />
        <button
          type="button"
          className="btn-secondary whitespace-nowrap"
          onClick={() => {
            if (newValue.trim()) {
              onAddOption(newValue.trim());
              onChange(newValue.trim());
            }
            setAdding(false);
            setNewValue("");
          }}
        >
          Simpan
        </button>
        <button
          type="button"
          className="text-gray-400 px-2"
          onClick={() => {
            setAdding(false);
            setNewValue("");
          }}
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <select
      className="input"
      value={value}
      onChange={(e) => {
        if (e.target.value === "__add_new__") {
          setAdding(true);
        } else {
          onChange(e.target.value);
        }
      }}
    >
      <option value="">{placeholder || "Pilih"}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
      <option value="__add_new__">+ Tambah baru...</option>
    </select>
  );
}
