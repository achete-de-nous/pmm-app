"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiList, apiCreate, apiUpdate, apiDelete } from "@/lib/api-client";
import { useUser } from "@/components/UserContext";
import { useToast } from "@/components/ToastContext";
import Modal from "@/components/Modal";
import ConfirmDialog from "@/components/ConfirmDialog";
import EmptyState from "@/components/EmptyState";
import SelectWithCustom from "@/components/SelectWithCustom";

const DEFAULT_VENDOR_TYPES = ["Fabric", "Sewing", "Accessories", "Packaging", "Dyeing & Printing", "Bordir"];

const emptyForm = {
  name: "",
  vendorCode: "",
  vendorType: "",
  contactPerson: "",
  phone: "",
  email: "",
  address: "",
  website: "",
  notes: "",
};

export default function VendorsPage() {
  const { currentUser } = useUser();
  const { showToast } = useToast();
  const [vendors, setVendors] = useState([]);
  const [vendorTypes, setVendorTypes] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");

  const refresh = async () => {
    const [v, vt] = await Promise.all([apiList("vendors"), apiList("vendorTypes")]);
    setVendors(v);
    setVendorTypes(vt);
  };

  useEffect(() => {
    refresh();
  }, []);

  const typeOptions = Array.from(new Set([...DEFAULT_VENDOR_TYPES, ...vendorTypes.map((t) => t.name)]));

  const handleAddType = async (name) => {
    const exists = typeOptions.some((t) => t.toLowerCase() === name.toLowerCase());
    if (!exists) {
      await apiCreate("vendorTypes", { name }, currentUser);
      refresh();
    }
  };

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (v) => {
    setEditing(v);
    setForm({
      name: v.name || "",
      vendorCode: v.vendorCode || "",
      vendorType: v.vendorType || "",
      contactPerson: v.contactPerson || "",
      phone: v.phone || "",
      email: v.email || "",
      address: v.address || "",
      website: v.website || "",
      notes: v.notes || "",
    });
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    const missing = [];
    if (!form.name.trim()) missing.push("Vendor Name");
    if (!form.vendorType.trim()) missing.push("Vendor Type");
    if (!form.contactPerson.trim()) missing.push("Contact Person");
    if (!form.phone.trim()) missing.push("Phone");
    if (!form.address.trim()) missing.push("Address");
    if (missing.length > 0) {
      showToast(`Wajib diisi: ${missing.join(", ")}`, "error");
      return;
    }
    try {
      // Edits always go through apiUpdate (patch) so existing vendor data is
      // updated in place, never reset/recreated.
      if (editing) {
        await apiUpdate("vendors", editing.id, form, currentUser);
        showToast("Vendor diupdate");
      } else {
        await apiCreate("vendors", form, currentUser);
        showToast("Vendor disimpan");
      }
      setOpen(false);
      setForm(emptyForm);
      setEditing(null);
      refresh();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const confirmDelete = async () => {
    try {
      await apiDelete("vendors", deleteTarget.id, currentUser);
      showToast(`${deleteTarget.name} dihapus`);
      setDeleteTarget(null);
      refresh();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const filteredVendors = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vendors.filter((v) => {
      if (filterType && v.vendorType !== filterType) return false;
      if (!q) return true;
      return (v.name || "").toLowerCase().includes(q) || (v.vendorType || "").toLowerCase().includes(q);
    });
  }, [vendors, search, filterType]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">Vendors</div>
        <button className="btn-primary" onClick={openAdd}>
          + Vendor
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <input
          className="input flex-1 min-w-[160px]"
          placeholder="Cari Vendor Name atau Vendor Type..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input w-auto" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="">Semua Vendor Type</option>
          {typeOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        {(search || filterType) && (
          <button
            className="text-xs text-gray-400 hover:text-ink self-center"
            onClick={() => {
              setSearch("");
              setFilterType("");
            }}
          >
            Reset
          </button>
        )}
      </div>

      {filteredVendors.length === 0 ? (
        <EmptyState title={vendors.length === 0 ? "No vendors yet. Add your first vendor." : "Tidak ada vendor yang cocok."} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filteredVendors.map((v) => (
            <div key={v.id} className="card">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/vendors/${v.id}`} className="min-w-0">
                  <div className="font-medium truncate">{v.name}</div>
                  {v.vendorType && (
                    <span className="inline-block text-xs px-2 py-0.5 rounded-full border border-gray-200 text-gray-600 mt-1">
                      {v.vendorType}
                    </span>
                  )}
                  <div className="text-sm text-gray-500 mt-1">{v.contactPerson || "-"}</div>
                  <div className="text-sm text-gray-500">{v.phone || v.email || ""}</div>
                </Link>
                <div className="flex gap-1 shrink-0">
                  <button className="text-xs text-gray-400 hover:text-ink px-2 py-1" onClick={() => openEdit(v)}>
                    Edit
                  </button>
                  <button className="text-xs text-gray-400 hover:text-red-600 px-2 py-1" onClick={() => setDeleteTarget(v)}>
                    Delete
                  </button>
                </div>
              </div>
              {v.website && (
                <a
                  href={/^https?:\/\//.test(v.website) ? v.website : `https://${v.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 underline block mt-1"
                >
                  {v.website}
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit Vendor" : "Add Vendor"}>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div>
            <label className="label">Vendor Name *</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Vendor Code</label>
              <input className="input" value={form.vendorCode} onChange={(e) => setForm({ ...form, vendorCode: e.target.value })} />
            </div>
            <div>
              <label className="label">Vendor Type *</label>
              <SelectWithCustom
                value={form.vendorType}
                onChange={(v) => setForm({ ...form, vendorType: v })}
                options={typeOptions}
                onAddOption={handleAddType}
                placeholder="Pilih tipe"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Contact Person *</label>
              <input className="input" value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
            </div>
            <div>
              <label className="label">Phone *</label>
              <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="label">Address *</label>
            <input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div>
            <label className="label">Website</label>
            <input
              className="input"
              placeholder="https://..."
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Notes</label>
            <input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <button type="submit" className="btn-primary mt-2">
            Simpan
          </button>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Hapus Vendor"
        message={`Yakin ingin menghapus "${deleteTarget?.name}"? Data historical (production plan, transaksi material) yang sudah merujuk ke vendor ini akan tetap ada, tetapi tidak lagi terhubung ke vendor aktif.`}
        confirmLabel="Hapus"
        danger
      />
    </div>
  );
}
