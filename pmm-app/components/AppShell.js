"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useUser } from "./UserContext";
import Modal from "./Modal";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/production", label: "Production" },
  { href: "/sales", label: "Weekly Sales" },
  { href: "/materials", label: "Materials" },
  { href: "/materials/transactions", label: "Transactions" },
  { href: "/vendors", label: "Vendors" },
  { href: "/products", label: "Product" },
  { href: "/cogs", label: "COGS" },
  { href: "/reconciliation", label: "Reconciliation" },
  { href: "/settings", label: "Settings" },
];

export default function AppShell({ children }) {
  const pathname = usePathname();
  const { users, currentUser, setCurrentUser, addUser } = useUser();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const handlePick = (name) => {
    setCurrentUser(name);
    setPickerOpen(false);
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    await addUser(newName.trim());
    setNewName("");
    setPickerOpen(false);
  };

  return (
    <div className="min-h-screen bg-white text-ink font-sans">
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="font-semibold tracking-tight">Production &amp; Material</div>
          <button
            onClick={() => setPickerOpen(true)}
            className="text-sm border border-gray-300 rounded-full px-3 py-1.5 flex items-center gap-1.5"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-ink inline-block" />
            {currentUser || "Siapa kamu?"}
          </button>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2 no-scrollbar">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap text-sm px-3 py-1.5 rounded-full border ${
                  active ? "bg-ink text-white border-ink" : "border-gray-200 text-gray-600"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="px-4 py-5 max-w-5xl mx-auto">{children}</main>

      <Modal open={pickerOpen} onClose={() => setPickerOpen(false)} title="Siapa kamu?">
        <div className="flex flex-col gap-2 mb-4">
          {users.length === 0 && <div className="text-sm text-gray-500">Belum ada user. Tambahkan nama di bawah.</div>}
          {users.map((u) => (
            <button
              key={u.id}
              onClick={() => handlePick(u.name)}
              className={`text-left px-3 py-2 rounded-lg border ${
                currentUser === u.name ? "border-ink bg-gray-50 font-medium" : "border-gray-200"
              }`}
            >
              {u.name}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nama baru"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <button onClick={handleAdd} className="bg-ink text-white rounded-lg px-4 py-2 text-sm">
            Tambah
          </button>
        </div>
      </Modal>
    </div>
  );
}
