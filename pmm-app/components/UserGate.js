"use client";
import { useState } from "react";
import { useUser } from "./UserContext";

const PIN_RE = /^[0-9]{4,8}$/;

export default function UserGate({ children }) {
  const { users, authed, login, addUser, loaded } = useUser();
  const [mode, setMode] = useState("select"); // select | pin | create
  const [selectedUser, setSelectedUser] = useState(null);
  const [pin, setPin] = useState("");
  const [createForm, setCreateForm] = useState({ name: "", pin: "", confirmPin: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!loaded) return null;
  if (authed) return children;

  const activeUsers = users.filter((u) => u.active !== false);

  const pickUser = (u) => {
    setSelectedUser(u);
    setPin("");
    setError("");
    setMode("pin");
  };

  const openCreate = () => {
    setCreateForm({ name: "", pin: "", confirmPin: "" });
    setError("");
    setMode("create");
  };

  const backToSelect = () => {
    setSelectedUser(null);
    setPin("");
    setError("");
    setMode("select");
  };

  const submitPin = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(selectedUser.id, pin);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitCreate = async (e) => {
    e.preventDefault();
    const name = createForm.name.trim();
    if (!name) return;
    if (!PIN_RE.test(createForm.pin)) {
      setError("PIN harus 4-8 digit angka");
      return;
    }
    if (createForm.pin !== createForm.confirmPin) {
      setError("Konfirmasi PIN tidak sama dengan PIN");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await addUser(name, createForm.pin);
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
          <div className="text-sm text-gray-500">
            {mode === "pin"
              ? `Masukkan PIN untuk masuk sebagai ${selectedUser?.name}`
              : mode === "create"
              ? "Daftarkan namamu dan buat PIN pribadi"
              : "Pilih namamu, lalu masukkan PIN untuk masuk"}
          </div>
        </div>

        {mode === "select" && (
          <>
            {activeUsers.length > 0 && (
              <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                {activeUsers.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => pickUser(u)}
                    className="text-left px-3 py-2.5 rounded-lg border border-gray-200 hover:border-ink"
                  >
                    {u.name}
                  </button>
                ))}
              </div>
            )}
            {activeUsers.length > 0 && <div className="text-xs text-gray-400 text-center">atau</div>}
            <button onClick={openCreate} className="text-sm text-gray-600 underline self-center">
              {activeUsers.length > 0 ? "Daftar sebagai user baru" : "Buat user pertama & PIN"}
            </button>
          </>
        )}

        {mode === "pin" && (
          <form onSubmit={submitPin} className="flex flex-col gap-2">
            <input
              autoFocus
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="PIN"
              className="border border-gray-300 rounded-lg px-4 py-3 text-center text-lg tracking-[0.5em]"
            />
            {error && <div className="text-sm text-red-600">{error}</div>}
            <button
              type="submit"
              disabled={busy || pin.length === 0}
              className="bg-ink text-white rounded-lg py-2.5 font-medium disabled:opacity-40"
            >
              {busy ? "Memeriksa..." : "Masuk"}
            </button>
            <button type="button" onClick={backToSelect} className="text-sm text-gray-400 underline self-center">
              ← Pilih user lain
            </button>
          </form>
        )}

        {mode === "create" && (
          <form onSubmit={submitCreate} className="flex flex-col gap-2">
            <input
              autoFocus
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              placeholder="Nama baru"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <input
              type="password"
              inputMode="numeric"
              value={createForm.pin}
              onChange={(e) => setCreateForm({ ...createForm, pin: e.target.value })}
              placeholder="Buat PIN (4-8 digit angka)"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <input
              type="password"
              inputMode="numeric"
              value={createForm.confirmPin}
              onChange={(e) => setCreateForm({ ...createForm, confirmPin: e.target.value })}
              placeholder="Konfirmasi PIN"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            {error && <div className="text-sm text-red-600">{error}</div>}
            <button
              type="submit"
              disabled={busy || !createForm.name.trim()}
              className="bg-ink text-white rounded-lg py-2.5 font-medium disabled:opacity-40"
            >
              {busy ? "Menyimpan..." : "Buat & Masuk"}
            </button>
            {activeUsers.length > 0 && (
              <button type="button" onClick={backToSelect} className="text-sm text-gray-400 underline self-center">
                ← Kembali
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
