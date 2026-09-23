"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiList, apiCreate, apiUpdate, apiDelete } from "@/lib/api-client";
import { useUser } from "@/components/UserContext";
import { useToast } from "@/components/ToastContext";
import Modal from "@/components/Modal";
import ConfirmDialog from "@/components/ConfirmDialog";
import EmptyState from "@/components/EmptyState";
import SelectWithCustom from "@/components/SelectWithCustom";

const DEFAULT_VENDOR_TYPES = ["Fabric", "Sewing", "Accessories", "Packaging", "Dyeing & Printing", "Bordir"];

const emptyForm = { name: "", vendorCode: "", vendorType: "", contactPerson: "", phone: "", email: "", address: "", notes: "" };

export default function VendorsPage() {
  const { currentUser } = useUser();
  const { showToast } = useToast();
  const [vendors, setVendors] = useState([]);
  const [vendorTypes, setVendorTypes] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState(null);

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
      notes: v.notes || "",
    });
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name) return;
    try {
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">Vendors</div>
        <button className="btn-primary" onClick={openAdd}>
          + Vendor
        </button>
      </div>

      {vendors.length === 0 ? (
        <EmptyState title="No vendors yet. Add your first vendor." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {vendors.map((v) => (
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
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit Vendor" : "Add Vendor"}>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div>
            <label className="label">Vendor Name</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Vendor Code</label>
              <input className="input" value={form.vendorCode} onChange={(e) => setForm({ ...form, vendorCode: e.target.value })} />
            </div>
            <div>
              <label className="label">Vendor Type</label>
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
              <label className="label">Contact Person</label>
              <input className="input" value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="label">Address</label>
            <input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
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
