"use client";
import { useEffect, useState } from "react";
import { apiList, apiDelete, apiPost } from "@/lib/api-client";
import { useUser } from "@/components/UserContext";
import { useToast } from "@/components/ToastContext";
import Modal from "@/components/Modal";
import EmptyState from "@/components/EmptyState";

const PIN_RE = /^[0-9]{4,8}$/;

export default function SettingsPage() {
  const { users, currentUser, addUser, refreshUsers } = useUser();
  const { showToast } = useToast();
  const [newUserForm, setNewUserForm] = useState({ name: "", pin: "", confirmPin: "" });
  const [myPinForm, setMyPinForm] = useState({ currentPin: "", newPin: "", confirmPin: "" });
  const [resetTarget, setResetTarget] = useState(null);
  const [resetForm, setResetForm] = useState({ newPin: "", confirmPin: "" });
  const [appPinForm, setAppPinForm] = useState({ pin: "", newPin: "" });
  const [audit, setAudit] = useState([]);

  const currentUserObj = users.find((u) => u.name === currentUser);

  useEffect(() => {
    apiList("auditHistory").then((data) =>
      setAudit(data.slice(0, 100).sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || "")))
    );
  }, []);

  const submitAddUser = async (e) => {
    e.preventDefault();
    const name = newUserForm.name.trim();
    if (!name) return;
    if (!PIN_RE.test(newUserForm.pin)) {
      showToast("PIN harus 4-8 digit angka", "error");
      return;
    }
    if (newUserForm.pin !== newUserForm.confirmPin) {
      showToast("Konfirmasi PIN tidak sama dengan PIN", "error");
      return;
    }
    try {
      await addUser(name, newUserForm.pin);
      setNewUserForm({ name: "", pin: "", confirmPin: "" });
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

  const submitMyPin = async (e) => {
    e.preventDefault();
    if (!currentUserObj) return;
    if (!PIN_RE.test(myPinForm.newPin)) {
      showToast("PIN baru harus 4-8 digit angka", "error");
      return;
    }
    if (myPinForm.newPin !== myPinForm.confirmPin) {
      showToast("Konfirmasi PIN baru tidak sama", "error");
      return;
    }
    try {
      await apiPost("/api/users/pin", {
        action: "change",
        userId: currentUserObj.id,
        currentPin: myPinForm.currentPin,
        newPin: myPinForm.newPin,
        actingUser: currentUser,
      });
      showToast("PIN kamu berhasil diubah");
      setMyPinForm({ currentPin: "", newPin: "", confirmPin: "" });
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const openReset = (u) => {
    setResetTarget(u);
    setResetForm({ newPin: "", confirmPin: "" });
  };

  const submitReset = async (e) => {
    e.preventDefault();
    if (!resetTarget) return;
    if (!PIN_RE.test(resetForm.newPin)) {
      showToast("PIN baru harus 4-8 digit angka", "error");
      return;
    }
    if (resetForm.newPin !== resetForm.confirmPin) {
      showToast("Konfirmasi PIN baru tidak sama", "error");
      return;
    }
    try {
      await apiPost("/api/users/pin", {
        action: "set",
        userId: resetTarget.id,
        newPin: resetForm.newPin,
        actingUser: currentUser,
      });
      showToast(`PIN untuk ${resetTarget.name} berhasil di-reset`);
      setResetTarget(null);
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const changeAppPin = async (e) => {
    e.preventDefault();
    try {
      await apiPost("/api/pin", { action: "change", pin: appPinForm.pin, newPin: appPinForm.newPin });
      showToast("PIN aplikasi berhasil diubah");
      setAppPinForm({ pin: "", newPin: "" });
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="text-lg font-semibold">Settings</div>

      <div className="card">
        <div className="font-medium mb-1">PIN Saya ({currentUser})</div>
        <div className="text-xs text-gray-400 mb-3">
          PIN ini dipakai untuk masuk sebagai kamu di layar "Siapa kamu?". Jangan bagikan ke orang lain.
        </div>
        <form onSubmit={submitMyPin} className="flex flex-col gap-3 max-w-sm">
          <div>
            <label className="label">PIN Saat Ini</label>
            <input
              type="password"
              inputMode="numeric"
              className="input"
              value={myPinForm.currentPin}
              onChange={(e) => setMyPinForm({ ...myPinForm, currentPin: e.target.value })}
            />
          </div>
          <div>
            <label className="label">PIN Baru</label>
            <input
              type="password"
              inputMode="numeric"
              className="input"
              value={myPinForm.newPin}
              onChange={(e) => setMyPinForm({ ...myPinForm, newPin: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Konfirmasi PIN Baru</label>
            <input
              type="password"
              inputMode="numeric"
              className="input"
              value={myPinForm.confirmPin}
              onChange={(e) => setMyPinForm({ ...myPinForm, confirmPin: e.target.value })}
            />
          </div>
          <button type="submit" className="btn-primary">
            Update PIN Saya
          </button>
        </form>
      </div>

      <div className="card">
        <div className="font-medium mb-3">Users &amp; PIN</div>
        <div className="text-xs text-gray-400 mb-3">
          Setiap user punya PIN masing-masing untuk masuk sebagai dirinya. User yang dihapus tidak lagi bisa dipilih
          untuk login, tetapi seluruh histori aktivitas yang pernah mereka lakukan tetap tersimpan dan tetap
          menampilkan nama mereka. Gunakan "Reset PIN" kalau ada teman yang lupa PIN-nya.
        </div>
        <div className="flex flex-col gap-2 mb-3">
          {users.map((u) => (
            <div key={u.id} className="flex items-center justify-between border border-gray-100 rounded-lg px-3 py-2">
              <span>{u.name}</span>
              <div className="flex items-center gap-3">
                <button className="text-xs text-gray-400 hover:text-ink" onClick={() => openReset(u)}>
                  Reset PIN
                </button>
                <button className="text-xs text-gray-400 hover:text-red-600" onClick={() => deleteUser(u)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
        <form onSubmit={submitAddUser} className="flex flex-col gap-2 max-w-sm">
          <input
            className="input"
            placeholder="Nama user baru"
            value={newUserForm.name}
            onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })}
          />
          <input
            type="password"
            inputMode="numeric"
            className="input"
            placeholder="Buat PIN (4-8 digit angka)"
            value={newUserForm.pin}
            onChange={(e) => setNewUserForm({ ...newUserForm, pin: e.target.value })}
          />
          <input
            type="password"
            inputMode="numeric"
            className="input"
            placeholder="Konfirmasi PIN"
            value={newUserForm.confirmPin}
            onChange={(e) => setNewUserForm({ ...newUserForm, confirmPin: e.target.value })}
          />
          <button type="submit" className="btn-primary self-start">
            Tambah User
          </button>
        </form>
      </div>

      <div className="card">
        <div className="font-medium mb-1">PIN Aplikasi</div>
        <div className="text-xs text-gray-400 mb-3">
          PIN ini adalah kunci masuk aplikasi secara umum (bukan PIN per user), diminta sekali di awal sebelum layar
          "Siapa kamu?".
        </div>
        <form onSubmit={changeAppPin} className="flex flex-col gap-3 max-w-sm">
          <div>
            <label className="label">Current PIN</label>
            <input type="password" className="input" value={appPinForm.pin} onChange={(e) => setAppPinForm({ ...appPinForm, pin: e.target.value })} />
          </div>
          <div>
            <label className="label">New PIN</label>
            <input type="password" className="input" value={appPinForm.newPin} onChange={(e) => setAppPinForm({ ...appPinForm, newPin: e.target.value })} />
          </div>
          <button type="submit" className="btn-secondary self-start">
            Update PIN Aplikasi
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

      <Modal open={!!resetTarget} onClose={() => setResetTarget(null)} title={`Reset PIN — ${resetTarget?.name || ""}`}>
        <form onSubmit={submitReset} className="flex flex-col gap-3">
          <div className="text-sm text-gray-500">PIN lama tidak diperlukan untuk reset ini.</div>
          <div>
            <label className="label">PIN Baru</label>
            <input
              type="password"
              inputMode="numeric"
              className="input"
              value={resetForm.newPin}
              onChange={(e) => setResetForm({ ...resetForm, newPin: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Konfirmasi PIN Baru</label>
            <input
              type="password"
              inputMode="numeric"
              className="input"
              value={resetForm.confirmPin}
              onChange={(e) => setResetForm({ ...resetForm, confirmPin: e.target.value })}
            />
          </div>
          <button type="submit" className="btn-primary">
            Simpan PIN Baru
          </button>
        </form>
      </Modal>
    </div>
  );
}
