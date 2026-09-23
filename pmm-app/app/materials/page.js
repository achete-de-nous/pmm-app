"use client";
import { useEffect, useState } from "react";
import { apiList, apiCreate, apiUpdate, apiDelete, apiCalc } from "@/lib/api-client";
import { useUser } from "@/components/UserContext";
import { useToast } from "@/components/ToastContext";
import Modal from "@/components/Modal";
import ConfirmDialog from "@/components/ConfirmDialog";
import EmptyState from "@/components/EmptyState";
import SelectWithCustom from "@/components/SelectWithCustom";

const DEFAULT_FABRIC_CATEGORIES = [
  "Bahan utama",
  "Furing",
  "Kancing",
  "Zipper",
  "Tali gantungan dalam",
  "Bordir",
  "Celup",
  "Wash",
  "Renda",
];
const UNITS = ["Meter", "Pcs"];

const idr = (n) => "Rp" + Math.round(n || 0).toLocaleString("id-ID");

const emptyForm = { name: "", category: "", vendorId: "", currentCOGS: "", unit: "Meter", notes: "" };

export default function MaterialsPage() {
  const { currentUser } = useUser();
  const { showToast } = useToast();
  const [materials, setMaterials] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [categories, setCategories] = useState([]);
  const [balances, setBalances] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const refresh = async () => {
    const [m, v, c, wb] = await Promise.all([
      apiList("materials"),
      apiList("vendors"),
      apiList("materialCategories"),
      apiCalc("warehouse-balances"),
    ]);
    setMaterials(m);
    setVendors(v);
    setCategories(c);
    setBalances(wb);
  };

  useEffect(() => {
    refresh();
  }, []);

  const categoryOptions = Array.from(new Set([...DEFAULT_FABRIC_CATEGORIES, ...categories.map((c) => c.name)]));

  const handleAddCategory = async (name) => {
    const exists = categoryOptions.some((c) => c.toLowerCase() === name.toLowerCase());
    if (!exists) {
      await apiCreate("materialCategories", { name }, currentUser);
      refresh();
    }
  };

  const vendorName = (id) => vendors.find((v) => v.id === id)?.name || "-";

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (m) => {
    setEditing(m);
    setForm({
      name: m.name || "",
      category: m.category || "",
      vendorId: m.vendorId || "",
      currentCOGS: m.currentCOGS ?? "",
      unit: m.unit || "Meter",
      notes: m.notes || "",
    });
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name) {
      showToast("Nama material wajib diisi", "error");
      return;
    }
    try {
      const vendor = vendors.find((v) => v.id === form.vendorId);
      const payload = {
        name: form.name,
        category: form.category,
        vendorId: form.vendorId,
        vendorName: vendor?.name || "",
        currentCOGS: Number(form.currentCOGS) || 0,
        unit: form.unit,
        notes: form.notes,
      };
      if (editing) {
        await apiUpdate("materials", editing.id, payload, currentUser);
        showToast("Material diupdate");
      } else {
        await apiCreate("materials", payload, currentUser);
        showToast("Material disimpan");
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
      await apiDelete("materials", deleteTarget.id, currentUser);
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
        <div className="text-lg font-semibold">Materials</div>
        <button className="btn-primary" onClick={openAdd}>
          + Material
        </button>
      </div>

      <div>
        <div className="font-medium mb-2 text-sm text-gray-600">Material Master</div>
        {materials.length === 0 ? (
          <EmptyState title="No materials yet. Add your first material." />
        ) : (
          <div className="overflow-x-auto card p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Fabric Category</th>
                  <th className="px-3 py-2">Vendor Fabric Name</th>
                  <th className="px-3 py-2 text-right">Price / Unit</th>
                  <th className="px-3 py-2">Unit</th>
                  <th className="px-3 py-2">Notes</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {materials.map((m) => (
                  <tr key={m.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-medium">{m.name}</td>
                    <td className="px-3 py-2">{m.category || "-"}</td>
                    <td className="px-3 py-2">{m.vendorId ? vendorName(m.vendorId) : m.vendorName || "-"}</td>
                    <td className="px-3 py-2 text-right">{idr(m.currentCOGS)}</td>
                    <td className="px-3 py-2">{m.unit || "-"}</td>
                    <td className="px-3 py-2 text-gray-500">{m.notes || "-"}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button className="text-xs text-gray-400 hover:text-ink px-2 py-1" onClick={() => openEdit(m)}>
                        Edit
                      </button>
                      <button className="text-xs text-gray-400 hover:text-red-600 px-2 py-1" onClick={() => setDeleteTarget(m)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <div className="font-medium mb-2 text-sm text-gray-600">Warehouse Balance</div>
        {balances.length === 0 ? (
          <EmptyState title="Belum ada balance di warehouse." hint="Balance dihitung otomatis dari Material Transactions." />
        ) : (
          <div className="overflow-x-auto card p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-3 py-2">Material</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2">Unit</th>
                  <th className="px-3 py-2 text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((b) => (
                  <tr key={b.materialName} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-medium">{b.materialName}</td>
                    <td className="px-3 py-2 text-right">{b.qty}</td>
                    <td className="px-3 py-2">{b.unit}</td>
                    <td className="px-3 py-2 text-right">{idr(b.totalValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit Material" : "Add Material"}>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div>
            <label className="label">Material Name</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Fabric Category</label>
            <SelectWithCustom
              value={form.category}
              onChange={(v) => setForm({ ...form, category: v })}
              options={categoryOptions}
              onAddOption={handleAddCategory}
              placeholder="Pilih kategori"
            />
          </div>
          <div>
            <label className="label">Vendor Fabric Name</label>
            <select className="input" value={form.vendorId} onChange={(e) => setForm({ ...form, vendorId: e.target.value })}>
              <option value="">Pilih vendor</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Price per Unit</label>
              <input
                type="number"
                className="input"
                value={form.currentCOGS}
                onChange={(e) => setForm({ ...form, currentCOGS: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Unit</label>
              <select className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
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
        title="Hapus Material"
        message={`Yakin ingin menghapus "${deleteTarget?.name}"? Data historical (transaksi, COGS) yang sudah merujuk ke material ini akan tetap ada.`}
        confirmLabel="Hapus"
        danger
      />
    </div>
  );
}
