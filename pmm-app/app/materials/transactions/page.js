"use client";
import { useEffect, useMemo, useState } from "react";
import { apiList, apiCreate, apiUpdate, apiDelete } from "@/lib/api-client";
import { useUser } from "@/components/UserContext";
import { useToast } from "@/components/ToastContext";
import Modal from "@/components/Modal";
import ConfirmDialog from "@/components/ConfirmDialog";
import EmptyState from "@/components/EmptyState";
import SearchableSelect from "@/components/SearchableSelect";

const UNITS = ["Meter", "Pcs"];
const num = (v) => Number(v) || 0;
const idr = (n) => "Rp" + Math.round(n || 0).toLocaleString("id-ID");

const TRANSACTION_TYPES = ["Pembelian Bahan", "Perpindahan Bahan"];
const TABS = ["Pembelian Bahan", "Perpindahan Bahan", "All"];

const emptyForm = {
  transactionType: "Pembelian Bahan",
  fromLoc: "",
  toLoc: "",
  materialName: "",
  quantity: "",
  unit: "",
  deliveryDate: "",
  reference: "",
  note: "",
};

export default function MaterialTransactionsPage() {
  const { currentUser } = useUser();
  const { showToast } = useToast();
  const [materials, setMaterials] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [materialSearch, setMaterialSearch] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [tab, setTab] = useState("All");
  const [deleteTarget, setDeleteTarget] = useState(null);

  const refresh = async () => {
    const [m, v, t] = await Promise.all([apiList("materials"), apiList("vendors"), apiList("materialTransactions")]);
    setMaterials(m);
    setVendors(v);
    setTransactions(t);
  };

  useEffect(() => {
    refresh();
  }, []);

  const vendorName = (id) => vendors.find((v) => v.id === id)?.name || id;
  const sewingVendors = useMemo(() => vendors.filter((v) => (v.vendorType || "").toLowerCase() === "sewing"), [vendors]);

  // Pembelian Bahan: Dari/Ke boleh Vendor manapun (Dari = supplier/source,
  // Ke = vendor yang menerima/menyimpan bahan - hanya ini yang masuk Trial Balance).
  // Perpindahan Bahan: Dari/Ke hanya boleh Warehouse atau Vendor ber-type Sewing.
  const locationOptions = useMemo(() => {
    if (form.transactionType === "Perpindahan Bahan") {
      return [
        { value: "Warehouse", label: "Warehouse" },
        ...sewingVendors.map((v) => ({ value: v.id, label: v.name })),
      ];
    }
    return vendors.map((v) => ({ value: v.id, label: v.name }));
  }, [form.transactionType, vendors, sewingVendors]);

  const locationLabel = (id) => (id === "Warehouse" ? "Warehouse" : vendorName(id));

  const filteredMaterialOptions = useMemo(() => {
    const q = materialSearch.trim().toLowerCase();
    if (!q) return materials;
    return materials.filter((m) => m.name.toLowerCase().includes(q));
  }, [materials, materialSearch]);

  const selectedMaterial = materials.find((m) => m.name === form.materialName);
  const pricePerUnit = num(selectedMaterial?.currentCOGS);
  const materialCost = num(form.quantity) * pricePerUnit;

  const selectMaterial = (name) => {
    const mat = materials.find((m) => m.name === name);
    setForm((f) => ({ ...f, materialName: name, unit: mat?.unit || f.unit }));
  };

  const setTransactionType = (transactionType) => {
    setForm((f) => ({ ...f, transactionType, fromLoc: "", toLoc: "" }));
  };

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setMaterialSearch("");
    setOpen(true);
  };

  const openEdit = (t) => {
    setEditing(t);
    setForm({
      transactionType: t.transactionType || "Pembelian Bahan",
      fromLoc: t.source || "",
      toLoc: t.destination || "",
      materialName: t.materialName || "",
      quantity: t.quantity ?? "",
      unit: t.unit || "",
      deliveryDate: t.deliveryDate || "",
      reference: t.reference || "",
      note: t.note || "",
    });
    setMaterialSearch("");
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.materialName || !form.quantity || !form.toLoc || !form.fromLoc) {
      showToast("Dari, Ke, Material, dan Quantity wajib diisi", "error");
      return;
    }
    if (form.fromLoc === form.toLoc) {
      showToast("Dari dan Ke tidak boleh sama", "error");
      return;
    }
    const payload = {
      transactionType: form.transactionType,
      materialName: form.materialName,
      quantity: Number(form.quantity),
      unit: form.unit,
      materialCost,
      source: form.fromLoc,
      destination: form.toLoc,
      deliveryDate: form.deliveryDate,
      reference: form.reference,
      note: form.note,
    };
    try {
      if (editing) {
        await apiUpdate("materialTransactions", editing.id, payload, currentUser);
        showToast("Transaksi material diupdate");
      } else {
        await apiCreate("materialTransactions", payload, currentUser);
        showToast("Transaksi material disimpan");
      }
      setOpen(false);
      setEditing(null);
      setForm(emptyForm);
      setMaterialSearch("");
      refresh();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiDelete("materialTransactions", deleteTarget.id, currentUser);
      showToast("Transaksi dihapus");
      setDeleteTarget(null);
      refresh();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  // Legacy transactions created before `transactionType` existed default to
  // "Pembelian Bahan" for tab purposes (field/category used to decide which
  // tab a transaction belongs to, per REVISI 3 point A).
  const typeOf = (t) => t.transactionType || "Pembelian Bahan";

  const sorted = useMemo(
    () => transactions.slice().sort((a, b) => (b.deliveryDate || b.createdAt || "").localeCompare(a.deliveryDate || a.createdAt || "")),
    [transactions]
  );

  const filteredRows = useMemo(() => {
    if (tab === "All") return sorted;
    return sorted.filter((t) => typeOf(t) === tab);
  }, [sorted, tab]);

  const countFor = (t) => (t === "All" ? transactions.length : transactions.filter((x) => typeOf(x) === t).length);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-lg font-semibold">Material Transactions</div>
        <button className="btn-primary" onClick={openAdd}>
          + Material Transaction
        </button>
      </div>

      <div className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`text-sm px-3 py-1.5 rounded-full border ${
              tab === t ? "bg-ink text-white border-ink" : "border-gray-200 text-gray-600"
            }`}
          >
            {t} ({countFor(t)})
          </button>
        ))}
      </div>

      {filteredRows.length === 0 ? (
        <EmptyState title="Belum ada material transaction." />
      ) : (
        <div className="overflow-x-auto card p-0">
          <table className="w-full text-sm table-wide">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th>Date</th>
                <th>Jenis</th>
                <th>Material</th>
                <th className="text-right">Qty</th>
                <th>Unit</th>
                <th>Dari</th>
                <th>Ke</th>
                <th>Info</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((t) => (
                <tr key={t.id} className="border-t border-gray-100">
                  <td className="whitespace-nowrap">{t.deliveryDate || "-"}</td>
                  <td className="whitespace-nowrap">
                    <span className="badge">{typeOf(t)}</span>
                  </td>
                  <td className="font-medium">{t.materialName}</td>
                  <td className="text-right">{t.quantity}</td>
                  <td>{t.unit}</td>
                  <td className="text-gray-500">{locationLabel(t.source)}</td>
                  <td className="text-gray-500">{locationLabel(t.destination)}</td>
                  <td className="text-gray-400 text-xs">{t.reference || t.note || "-"}</td>
                  <td className="whitespace-nowrap">
                    <button className="text-xs text-gray-400 hover:text-ink px-1.5 py-1" onClick={() => openEdit(t)}>
                      Edit
                    </button>
                    <button className="text-xs text-gray-400 hover:text-red-600 px-1.5 py-1" onClick={() => setDeleteTarget(t)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit Material Transaction" : "Add Material Transaction"} wide>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div>
            <label className="label">Jenis Transaksi</label>
            <div className="flex gap-2">
              {TRANSACTION_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTransactionType(t)}
                  className={`text-sm px-3 py-1.5 rounded-full border ${
                    form.transactionType === t ? "bg-ink text-white border-ink" : "border-gray-200 text-gray-600"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            {form.transactionType === "Pembelian Bahan" ? (
              <div className="text-xs text-gray-400 mt-1">
                Dari = vendor supplier/source bahan (tidak dicatat ke Trial Balance). Ke = vendor yang menerima/menyimpan bahan.
              </div>
            ) : (
              <div className="text-xs text-gray-400 mt-1">
                Dari/Ke hanya boleh Warehouse atau Vendor dengan Vendor Type Sewing.
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Dari</label>
              <SearchableSelect
                value={form.fromLoc}
                onChange={(v) => setForm({ ...form, fromLoc: v })}
                options={locationOptions}
                placeholder="Pilih lokasi"
              />
            </div>
            <div>
              <label className="label">Ke</label>
              <SearchableSelect
                value={form.toLoc}
                onChange={(v) => setForm({ ...form, toLoc: v })}
                options={locationOptions}
                placeholder="Pilih lokasi"
              />
            </div>
          </div>

          <div>
            <label className="label">Material</label>
            <input
              className="input mb-1"
              placeholder="Cari material..."
              value={materialSearch}
              onChange={(e) => setMaterialSearch(e.target.value)}
            />
            <select className="input" value={form.materialName} onChange={(e) => selectMaterial(e.target.value)}>
              <option value="">Pilih material</option>
              {filteredMaterialOptions.map((m) => (
                <option key={m.id} value={m.name}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Quantity</label>
              <input type="number" className="input" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
            </div>
            <div>
              <label className="label">Unit</label>
              <select className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                <option value="">Pilih unit</option>
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Delivery Date</label>
            <input type="date" className="input" value={form.deliveryDate} onChange={(e) => setForm({ ...form, deliveryDate: e.target.value })} />
          </div>

          <div className="bg-gray-50 rounded-lg px-3 py-2 flex items-center justify-between text-sm">
            <span className="text-gray-500">Material Cost (Qty × Harga/Unit {idr(pricePerUnit)})</span>
            <span className="font-semibold">{idr(materialCost)}</span>
          </div>

          <div>
            <label className="label">Reference</label>
            <input className="input" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
          </div>
          <div>
            <label className="label">Note</label>
            <input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
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
        title="Hapus Transaksi"
        message={`Yakin ingin menghapus transaksi "${deleteTarget?.materialName}" (${deleteTarget?.quantity} ${deleteTarget?.unit})? Trial Balance akan otomatis ikut ter-update.`}
        confirmLabel="Hapus"
        danger
      />
    </div>
  );
}
