"use client";
import { useEffect, useState } from "react";
import { apiPost } from "@/lib/api-client";

const SESSION_KEY = "pmm_authed";

export default function PinGate({ children }) {
  const [authed, setAuthed] = useState(false);
  const [checked, setChecked] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const ok = typeof window !== "undefined" && window.sessionStorage.getItem(SESSION_KEY) === "1";
    setAuthed(ok);
    setChecked(true);
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await apiPost("/api/pin", { action: "verify", pin });
      if (data.ok) {
        window.sessionStorage.setItem(SESSION_KEY, "1");
        setAuthed(true);
      } else {
        setError("PIN salah. Coba lagi.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!checked) return null;

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-4">
        <form onSubmit={submit} className="w-full max-w-xs flex flex-col gap-4">
          <div className="text-center mb-2">
            <div className="text-lg font-semibold tracking-tight">Production & Material</div>
            <div className="text-sm text-gray-500">Masukkan PIN untuk melanjutkan</div>
          </div>
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="PIN"
            className="border border-gray-300 rounded-lg px-4 py-3 text-center text-lg tracking-[0.5em]"
          />
          {error && <div className="text-sm text-red-600 text-center">{error}</div>}
          <button
            type="submit"
            disabled={busy || pin.length === 0}
            className="bg-ink text-white rounded-lg py-3 font-medium disabled:opacity-40"
          >
            {busy ? "Memeriksa..." : "Masuk"}
          </button>
        </form>
      </div>
    );
  }

  return children;
}
