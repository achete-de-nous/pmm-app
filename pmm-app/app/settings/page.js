"use client";
import { useEffect, useState } from "react";
import { apiList, apiDelete, apiPost } from "@/lib/api-client";
import { useUser } from "@/components/UserContext";
import { useToast } from "@/components/ToastContext";
import EmptyState from "@/components/EmptyState";

export default function SettingsPage() {
  const { users, currentUser, addUser, refreshUsers } = useUser();
  const { showToast } = useToast();
  const [newName, setNewName] = useState("");
  const [pinForm, setPinForm] = useState({ pin: "", newPin: "" });
  const [audit, setAudit] = useState([]);

  useEffect(() => {
    apiList("auditHistory").then((data) =>
      setAudit(data.slice(0, 100).sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || "")))
    );
  }, []);

  const submitAddUser = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      await addUser(newName.trim());
      setNewName("");
      showToast("User ditambahkan");
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const deleteUser = async (u) => {
    try {
      await apiDelete("users", u.id, currentUser);
      showToast(`${u.name} dihapus dari daftar user aktif`);
      refreshUsers();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const changePin = async (e) => {
    e.preventDefault();
    try {
      await apiPost("/api/pin", { action: "change", pin: pinForm.pin, newPin: pinForm.newPin });
      showToast("PIN berhasil diubah");
      setPinForm({ pin: "", newPin: "" });
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="text-lg font-semibold">Settings</div>

      <div className="card">
        <div className="font-medium mb-3">Change PIN</div>
        <form onSubmit={changePin} className="flex flex-col gap-3 max-w-sm">
          <div>
            <label className="label">Current PIN</label>
            <input type="password" className="input" value={pinForm.pin} onChange={(e) => setPinForm({ ...pinForm, pin: e.target.value })} />
          </div>
          <div>
            <label className="label">New PIN</label>
            <input type="password" className="input" value={pinForm.newPin} onChange={(e) => setPinForm({ ...pinForm, newPin: e.target.value })} />
          </div>
          <button type="submit" className="btn-primary">
            Update PIN
          </button>
        </form>
      </div>

      <div className="card">
        <div className="font-medium mb-3">Users</div>
        <div className="text-xs text-gray-400 mb-3">
          User yang dihapus tidak lagi bisa dipilih untuk login, tetapi seluruh histori aktivitas yang pernah mereka
          lakukan tetap tersimpan dan tetap menampilkan nama mereka.
        </div>
        <div className="flex flex-col gap-2 mb-3">
          {users.map((u) => (
            <div key={u.id} className="flex items-center justify-between border border-gray-100 rounded-lg px-3 py-2">
              <span>{u.name}</span>
              <button className="text-xs text-gray-400 hover:text-red-600" onClick={() => deleteUser(u)}>
                Delete
              </button>
            </div>
          ))}
        </div>
        <form onSubmit={submitAddUser} className="flex gap-2">
          <input className="input flex-1" placeholder="Nama user baru" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button type="submit" className="btn-primary">
            Tambah
          </button>
        </form>
      </div>

      <div>
        <div className="font-medium mb-2 text-sm text-gray-600">Audit History (100 terbaru)</div>
        {audit.length === 0 ? (
          <EmptyState title="Belum ada aktivitas." />
        ) : (
          <div className="flex flex-col gap-1">
            {audit.map((a) => (
              <div key={a.id} className="text-sm border-b border-gray-100 py-2 flex justify-between gap-3">
                <span>
                  <span className="font-medium">{a.user}</span> {a.summary}
                </span>
                <span className="text-gray-400 whitespace-nowrap text-xs">
                  {a.timestamp ? new Date(a.timestamp).toLocaleString("id-ID") : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
