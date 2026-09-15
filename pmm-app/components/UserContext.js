"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { apiList, apiCreate } from "@/lib/api-client";

const UserContext = createContext(null);
const STORAGE_KEY = "pmm_current_user";

export function UserProvider({ children }) {
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUserState] = useState("");
  const [loaded, setLoaded] = useState(false);

  const refreshUsers = async () => {
    const data = await apiList("users");
    setUsers(data);
    return data;
  };

  useEffect(() => {
    (async () => {
      const data = await refreshUsers();
      const saved = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : "";
      if (saved && data.some((u) => u.name === saved)) {
        setCurrentUserState(saved);
      }
      setLoaded(true);
    })();
  }, []);

  const setCurrentUser = (name) => {
    setCurrentUserState(name);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, name);
  };

  const addUser = async (name) => {
    const created = await apiCreate("users", { name }, name);
    await refreshUsers();
    setCurrentUser(name);
    return created;
  };

  return (
    <UserContext.Provider value={{ users, currentUser, setCurrentUser, addUser, refreshUsers, loaded }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within UserProvider");
  return ctx;
}
