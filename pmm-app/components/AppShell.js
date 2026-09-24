"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useUser } from "./UserContext";
import ConfirmDialog from "./ConfirmDialog";

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
  const { currentUser, logout } = useUser();
  const [confirmLogout, setConfirmLogout] = useState(false);

  return (
    <div className="min-h-screen bg-white text-ink font-sans">
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="font-semibold tracking-tight">Production &amp; Material</div>
          <button
            onClick={() => setConfirmLogout(true)}
            className="text-sm border border-gray-300 rounded-full px-3 py-1.5 flex items-center gap-1.5"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-ink inline-block" />
            {currentUser}
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

      <ConfirmDialog
        open={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        onConfirm={() => {
          setConfirmLogout(false);
          logout();
        }}
        title="Ganti User"
        message={`Keluar dari sesi "${currentUser}"? Untuk masuk lagi sebagai user manapun (termasuk dirimu sendiri), PIN harus dimasukkan ulang.`}
        confirmLabel="Keluar"
      />
    </div>
  );
}
