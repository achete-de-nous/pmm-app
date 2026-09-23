"use client";
import { useEffect, useMemo, useState } from "react";
import { apiList, apiPost } from "@/lib/api-client";
import { useUser } from "@/components/UserContext";
import { useToast } from "@/components/ToastContext";
import Modal from "@/components/Modal";
import EmptyState from "@/components/EmptyState";
import AutocompleteInput from "@/components/AutocompleteInput";

const idr = (n) => "Rp" + Math.round(n || 0).toLocaleString("id-ID");
const num = (v) => Number(v) || 0;
const UNITS = ["Meter", "Pcs"];

const emptyRow = () => ({ materialName: "", usage: "", pricePerUnit: "", unit: "" });

export default function CogsPage() {
  const { currentUser } = useUser();
  const { showToast } = useToast();
  const [vendors, setVendors] = useState([]);
  const [products, setProducts] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [cogsRecords, setCogsRecords] = useState([]);

  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [modalMode, setModalMode] = useState(null); // "add" | "change"
  const [form, setForm] = useState({ vendorId: "", productNameNoVariant: "", moq: "", hargaJahit: "", note: "" });
  const [rows, setRows] = useState([emptyRow()]);
  const [matchedRecord, setMatchedRecord] = useState(null);
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    const [v, p, m, c] = await Promise.all([
      apiList("vendors"),
      apiList("products"),
      apiList("materials"),
      apiList("cogsRecords"),
    ]);
    setVendors(v);
    setProducts(p);
    setMaterials(m);
    setCogsRecords(c);
  };

  useEffect(() => {
    refresh();
  }, []);

  const productOptions = useMemo(() => {
    const set = new Set(products.map((p) => p.productNameNoVariant).filter(Boolean));
    return Array.from(set);
  }, [products]);

  const currentRecords = useMemo(() => cogsRecords.filter((c) => c.isCurrent), [cogsRecords]);
  const historyRecords = useMemo(
    () => cogsRecords.filter((c) => !c.isCurrent).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")),
    [cogsRecords]
  );

  const resetForm = () => {
    setForm({ vendorId: "", productNameNoVariant: "", moq: "", hargaJahit: "", note: "" });
    setRows([emptyRow()]);
    setMatchedRecord(null);
  };

  const openModal = (mode) => {
    setModalMode(mode);
    resetForm();
    setActionMenuOpen(false);
  };

  // In "change" mode, look up the existing current record once vendor+product+moq are all filled in.
  useEffect(() => {
    if (modalMode !== "change") return;
    if (!form.vendorId || !form.productNameNoVariant || form.moq === "") {
      setMatchedRecord(null);
      return;
    }
    const found = currentRecords.find(
      (c) => c.vendorId === form.vendorId && c.productName === form.productNameNoVariant && num(c.moq) === num(form.moq)
    );
    setMatchedRecord(found || null);
    if (found) {
      setRows(
        found.materials.map((m) => ({
          materialName: m.materialName,
          usage: m.usage,
          pricePerUnit: m.pricePerUnit,
          unit: m.unit,
        }))
      );
      setForm((f) => ({ ...f, hargaJahit: found.hargaJahit, note: "" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalMode, form.vendorId, form.productNameNoVariant, form.moq, currentRecords]);

  const updateRow = (idx, patch) => {
    setRows((r) => r.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };

  const selectMaterial = (idx, materialName) => {
    const mat = materials.find((m) => m.name.toLowerCase() === materialName.toLowerCase());
    updateRow(idx, {
      materialName,
      pricePerUnit: mat ? mat.currentCOGS ?? "" : rows[idx].pricePerUnit,
      unit: mat?.unit || rows[idx].unit,
    });
  };

  const addRow = () => setRows((r) => [...r, emptyRow()]);
  const removeRow = (idx) => setRows((r) => r.filter((_, i) => i !== idx));

  const rowTotals = rows.map((r) => num(r.usage) * num(r.pricePerUnit));
  const totalMaterials = rowTotals.reduce((s, t) => s + t, 0);
  const totalCOGS = totalMaterials + num(form.hargaJahit);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.vendorId || !form.productNameNoVariant || form.moq === "") {
      showToast("Vendor, Product, dan MOQ wajib diisi", "error");
      return;
    }
    const validRows = rows.filter((r) => r.materialName && r.usage !== "");
    if (validRows.length === 0) {
      showToast("Minimal 1 material wajib ditambahkan", "error");
      return;
    }
    if (modalMode === "change" && !matchedRecord) {
      showToast("Tidak ditemukan COGS aktif untuk kombinasi ini. Gunakan Add COGS.", "error");
      return;
    }
    setSaving(true);
    try {
      await apiPost("/api/cogs", {
        action: modalMode,
        vendorId: form.vendorId,
        productNameNoVariant: form.productNameNoVariant,
        moq: form.moq,
        materials: validRows,
        hargaJahit: form.hargaJahit,
        note: form.note,
        user: currentUser,
        supersedeId: matchedRecord?.id,
      });
      showToast(modalMode === "add" ? "COGS baru disimpan" : "COGS diperbarui");
      setModalMode(null);
      resetForm();
      refresh();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between relative">
        <div className="text-lg font-semibold">COGS</div>
        <div className="relative">
          <button className="btn-primary" onClick={() => setActionMenuOpen((o) => !o)}>
            + COGS
          </button>
          {actionMenuOpen && (
            <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-20">
              <button className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50" onClick={() => openModal("add")}>
                Add COGS
              </button>
              <button className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50" onClick={() => openModal("change")}>
                Change COGS
              </button>
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="font-medium mb-2 text-sm text-gray-600">Current COGS</div>
        {currentRecords.length === 0 ? (
          <EmptyState title="Belum ada COGS. Gunakan Add COGS untuk membuat yang pertama." />
        ) : (
          <div className="flex flex-col gap-3">
            {currentRecords.map((c) => (
              <div key={c.id} className="card">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium">{c.productName}</div>
                    <div className="text-xs text-gray-500">
                      {c.vendorName} · MOQ {c.moq} pcs
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-500">Total COGS</div>
                    <div className="font-semibold">{idr(c.totalCOGS)}</div>
                  </div>
                </div>
                <div className="mt-3 text-sm">
                  <table className="w-full">
                    <thead className="text-left text-gray-500 text-xs">
                      <tr>
                        <th className="py-1">Bahan</th>
                        <th className="py-1 text-right">Usage</th>
                        <th className="py-1 text-right">Harga/Unit</th>
                        <th className="py-1 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.materials.map((m, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="py-1">{m.materialName}</td>
                          <td className="py-1 text-right">
                            {m.usage} {m.unit}
                          </td>
                          <td className="py-1 text-right">{idr(m.pricePerUnit)}</td>
                          <td className="py-1 text-right">{idr(m.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3 text-sm border-t border-gray-100 pt-3">
                  <div>
                    <div className="text-xs text-gray-500">Total Bahan</div>
                    <div>{idr(c.totalMaterials)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Harga Jahit</div>
                    <div>{idr(c.hargaJahit)}</div>
                  </div>
                </div>
                <div className="text-xs text-gray-400 mt-2">
                  Diupdate oleh {c.updatedBy} · {c.updatedAt ? new Date(c.updatedAt).toLocaleString("id-ID") : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="font-medium mb-2 text-sm text-gray-600">COGS History</div>
        {historyRecords.length === 0 ? (
          <EmptyState title="Belum ada perubahan COGS." />
        ) : (
          <div className="overflow-x-auto card p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Vendor</th>
                  <th className="px-3 py-2 text-right">MOQ</th>
                  <th className="px-3 py-2 text-right">Total COGS</th>
                  <th className="px-3 py-2">User</th>
                  <th className="px-3 py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {historyRecords.map((h) => (
                  <tr key={h.id} className="border-t border-gray-100 text-gray-500">
                    <td className="px-3 py-2">{h.productName}</td>
                    <td className="px-3 py-2">{h.vendorName}</td>
                    <td className="px-3 py-2 text-right">{h.moq}</td>
                    <td className="px-3 py-2 text-right">{idr(h.totalCOGS)}</td>
                    <td className="px-3 py-2">{h.createdBy}</td>
                    <td className="px-3 py-2">{h.createdAt ? new Date(h.createdAt).toLocaleDateString("id-ID") : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={!!modalMode} onClose={() => setModalMode(null)} title={modalMode === "add" ? "Add COGS" : "Change COGS"} wide>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Vendor</label>
              <select className="input" value={form.vendorId} onChange={(e) => setForm({ ...form, vendorId: e.target.value })}>
                <option value="">Pilih vendor</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Product</label>
              <select
                className="input"
                value={form.productNameNoVariant}
                onChange={(e) => setForm({ ...form, productNameNoVariant: e.target.value })}
              >
                <option value="">Pilih product</option>
                {productOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label">MOQ</label>
            <input type="number" className="input" value={form.moq} onChange={(e) => setForm({ ...form, moq: e.target.value })} />
          </div>

          {modalMode === "change" && form.vendorId && form.productNameNoVariant && form.moq !== "" && !matchedRecord && (
            <div className="text-sm text-red-600 border border-red-200 bg-red-50 rounded-lg px-3 py-2">
              Tidak ditemukan COGS aktif untuk kombinasi Vendor + Product + MOQ ini. Gunakan <strong>Add COGS</strong> untuk membuat baru.
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Materials</label>
              <button type="button" className="btn-secondary text-xs" onClick={addRow}>
                + Add Material
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {rows.map((row, idx) => (
                <div key={idx} className="border border-gray-200 rounded-lg p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="label">Nama Bahan</label>
                      <select className="input" value={row.materialName} onChange={(e) => selectMaterial(idx, e.target.value)}>
                        <option value="">Pilih material</option>
                        {materials.map((m) => (
                          <option key={m.id} value={m.name}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">Penggunaan Bahan</label>
                      <input
                        type="number"
                        className="input"
                        value={row.usage}
                        onChange={(e) => updateRow(idx, { usage: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div>
                      <label className="label">Harga Bahan per Unit</label>
                      <input
                        type="number"
                        className="input"
                        value={row.pricePerUnit}
                        onChange={(e) => updateRow(idx, { pricePerUnit: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="label">Unit</label>
                      <AutocompleteInput value={row.unit} onChange={(v) => updateRow(idx, { unit: v })} options={UNITS} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2 text-sm">
                    <span className="text-gray-500">Total Bahan</span>
                    <span className="font-medium">{idr(num(row.usage) * num(row.pricePerUnit))}</span>
                  </div>
                  {rows.length > 1 && (
                    <button
                      type="button"
                      className="text-xs text-gray-400 hover:text-red-600 mt-2"
                      onClick={() => removeRow(idx)}
                    >
                      Hapus baris ini
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-gray-100 pt-3 flex flex-col gap-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Total Bahan Semuanya</span>
              <span className="font-medium">{idr(totalMaterials)}</span>
            </div>
            <div>
              <label className="label">Harga Jahit</label>
              <input
                type="number"
                className="input"
                value={form.hargaJahit}
                onChange={(e) => setForm({ ...form, hargaJahit: e.target.value })}
              />
            </div>
            <div className="flex items-center justify-between text-base font-semibold border-t border-gray-100 pt-2">
              <span>Total COGS</span>
              <span>{idr(totalCOGS)}</span>
            </div>
          </div>

          <div>
            <label className="label">Note</label>
            <input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>

          <button
            type="submit"
            disabled={saving || (modalMode === "change" && !matchedRecord)}
            className="btn-primary mt-2"
          >
            {saving ? "Menyimpan..." : "Simpan"}
          </button>
        </form>
      </Modal>
    </div>
  );
}
