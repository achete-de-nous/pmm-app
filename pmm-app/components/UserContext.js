"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { apiList, apiCreate, apiPost } from "@/lib/api-client";

const UserContext = createContext(null);
const STORAGE_KEY = "pmm_current_user";

export function UserProvider({ children }) {
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUserState] = useState("");
  const [authed, setAuthed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const refreshUsers = async () => {
    const data = await apiList("users");
    setUsers(data);
    return data;
  };

  useEffect(() => {
    (async () => {
      const data = await refreshUsers();
      // Identity is only trusted for the current browser session (sessionStorage),
      // never persisted across sessions, so a PIN is always required on a fresh visit.
      const saved = typeof window !== "undefined" ? window.sessionStorage.getItem(STORAGE_KEY) : "";
      if (saved && data.some((u) => u.name === saved && u.active !== false)) {
        setCurrentUserState(saved);
        setAuthed(true);
      }
      setLoaded(true);
    })();
  }, []);

  // Verifies the PIN for a given user id against the server, and only then
  // marks that identity as the active, authenticated "Siapa kamu" user.
  const login = async (userId, pin) => {
    const result = await apiPost("/api/users/pin", { action: "verify", userId, pin });
    if (!result.ok) {
      throw new Error(result.needsSetup ? "User ini belum memiliki PIN. Hubungi teman satu tim untuk mengatur PIN." : "PIN salah.");
    }
    const user = users.find((u) => u.id === userId) || (await refreshUsers()).find((u) => u.id === userId);
    if (!user) throw new Error("User tidak ditemukan");
    setCurrentUserState(user.name);
    setAuthed(true);
    if (typeof window !== "undefined") window.sessionStorage.setItem(STORAGE_KEY, user.name);
  };

  // Clears the active identity. Switching to a different (or the same) user
  // always requires going through login() with the correct PIN again.
  const logout = () => {
    setCurrentUserState("");
    setAuthed(false);
    if (typeof window !== "undefined") window.sessionStorage.removeItem(STORAGE_KEY);
  };

  // Registers a brand-new user with their own PIN, then logs them straight in
  // (they just chose that PIN themselves, so no separate verification needed).
  const addUser = async (name, pin) => {
    const created = await apiCreate("users", { name, pin }, name);
    await refreshUsers();
    setCurrentUserState(name);
    setAuthed(true);
    if (typeof window !== "undefined") window.sessionStorage.setItem(STORAGE_KEY, name);
    return created;
  };

  return (
    <UserContext.Provider value={{ users, currentUser, authed, login, logout, addUser, refreshUsers, loaded }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within UserProvider");
  return ctx;
}
