export async function apiList(type) {
  const res = await fetch(`/api/data/${type}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Gagal memuat data");
  return json.data;
}

export async function apiCreate(type, data, user) {
  const res = await fetch(`/api/data/${type}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...data, user }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Gagal menyimpan data");
  return json.data;
}

export async function apiUpdate(type, id, patch, user) {
  const res = await fetch(`/api/data/${type}/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...patch, user }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Gagal update data");
  return json.data;
}

export async function apiDelete(type, id, user) {
  const res = await fetch(`/api/data/${type}/${id}?user=${encodeURIComponent(user || "")}`, { method: "DELETE" });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Gagal menghapus data");
  return json.data;
}

export async function apiCalc(kind, params = {}) {
  const qs = new URLSearchParams({ kind, ...params }).toString();
  const res = await fetch(`/api/calc?${qs}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Gagal menghitung data");
  return json.data;
}

export async function apiPost(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Gagal memproses permintaan");
  return json.data;
}
