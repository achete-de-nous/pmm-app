"use client";
import { useState } from "react";
import { useUser } from "./UserContext";

// Blocks the entire app (nav, pages, every form) until the person picks or
// registers who they are. Nothing here can be bypassed - there is no way to
// reach any data-mutating screen without a currentUser set first.
export default function UserGate({ children }) {
  const { users, currentUser, setCurrentUser, addUser, loaded } = useUser();
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!loaded) return null;

  if (!currentUser) {
    const handleAdd = async (e) => {
      e.preventDefault();
      const name = newName.trim();
      if (!name) return;
      setBusy(true);
      setError("");
      try {
        await addUser(name);
      } catch (err) {
        setError(err.message);
      } finally {
        setBusy(false);
      }
    };

    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-4">
        <div className="w-full max-w-xs flex flex-col gap-4">
          <div className="text-center mb-2">
            <div className="text-lg font-semibold tracking-tight">Siapa kamu?</div>
            <div className="text-sm text-gray-500">Pilih atau isi namamu untuk mulai menggunakan aplikasi</div>
          </div>

          {users.length > 0 && (
            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => setCurrentUser(u.name)}
                  className="text-left px-3 py-2.5 rounded-lg border border-gray-200 hover:border-ink"
                >
                  {u.name}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={handleAdd} className="flex flex-col gap-2">
            {users.length > 0 && <div className="text-xs text-gray-400 text-center">atau daftar sebagai user baru</div>}
            <input
              autoFocus={users.length === 0}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nama baru"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            {error && <div className="text-sm text-red-600">{error}</div>}
            <button type="submit" disabled={busy || !newName.trim()} className="bg-ink text-white rounded-lg py-2.5 font-medium disabled:opacity-40">
              {busy ? "Menyimpan..." : "Mulai"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return children;
}
