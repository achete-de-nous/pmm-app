"use client";
import { useEffect, useMemo, useState } from "react";
import { apiList, apiPost } from "@/lib/api-client";
import { useUser } from "@/components/UserContext";
import { useToast } from "@/components/ToastContext";
import Modal from "@/components/Modal";
import ConfirmDialog from "@/components/ConfirmDialog";
import EmptyState from "@/components/EmptyState";

const idr = (n) => "Rp" + Math.round(n || 0).toLocaleString("id-ID");
const num = (v) => Number(v) || 0;
const UNITS = ["Meter", "Pcs"];
const SEWING_TYPE = "Sewing";

const emptyRow = () => ({ materialName: "", fabricCategory: "", usage: "", pricePerUnit: "", unit: "" });
const MODAL_TITLES = { add: "Add COGS", change: "Change COGS", edit: "Edit COGS" };

export default function CogsPage() {
  const { currentUser } = useUser();
  const { showToast } = useToast();
  const [vendors, setVendors] = useState([]);
  const [products, setProducts] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [cogsRecords, setCogsRecords] = useState([]);

  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [modalMode, setModalMode] = useState(null); // "add" | "change" | "edit"
  const [form, setForm] = useState({ vendorId: "", productNameNoVariant: "", moq: "", hargaJahit: "", note: "" });
  const [rows, setRows] = useState([emptyRow()]);
  const [matchedRecord, setMatchedRecord] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [filterVendor, setFilterVendor] = useState("");
  const [filterProduct, setFilterProduct] = useState("");

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

  // COGS Vendor dropdown only shows vendors whose Vendor Type is "Sewing".
  const sewingVendors = useMemo(
    () => vendors.filter((v) => (v.vendorType || "").toLowerCase() === SEWING_TYPE.toLowerCase()),
    [vendors]
  );

  // Filter options are drawn from vendors/products actually present in COGS data.
  const filterVendorOptions = useMemo(() => {
    const map = new Map();
    cogsRecords.forEach((c) => {
      if (c.vendorId) map.set(c.vendorId, c.vendorName);
    });
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [cogsRecords]);

  const filterProductOptions = useMemo(() => {
    return Array.from(new Set(cogsRecords.map((c) => c.productName).filter(Boolean)));
  }, [cogsRecords]);

  const matchesFilter = (c) => {
    if (filterVendor && c.vendorId !== filterVendor) return false;
    if (filterProduct && c.productName !== filterProduct) return false;
    return true;
  };

  const currentRecords = useMemo(
    () => cogsRecords.filter((c) => c.isCurrent && !c.deleted).filter(matchesFilter),
    [cogsRecords, filterVendor, filterProduct]
  );
  const historyRecords = useMemo(
    () =>
      cogsRecords
        .filter((c) => !c.isCurrent)
        .filter(matchesFilter)
        .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")),
    [cogsRecords, filterVendor, filterProduct]
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

  // Open the Edit modal directly from a specific card - pre-fills everything from
  // that exact record and never re-looks-it-up by combo (unlike "change").
  const openEditRecord = (record) => {
    setModalMode("edit");
    setMatchedRecord(record);
    setForm({
      vendorId: record.vendorId,
      productNameNoVariant: record.productName,
      moq: record.moq,
      hargaJahit: record.hargaJahit,
      note: "",
    });
    setRows(
      record.materials.map((m) => ({
        materialName: m.materialName,
        fabricCategory: m.fabricCategory || "",
        usage: m.usage,
        pricePerUnit: m.pricePerUnit,
        unit: m.unit,
      }))
    );
  };

  // In "change" mode (the dropdown flow), look up the existing current record once
  // vendor+product+moq are all filled in. "edit" mode skips this - matchedRecord is
  // already fixed to the specific card the person clicked Edit on.
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
          fabricCategory: m.fabricCategory || "",
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
      fabricCategory: mat?.category || "",
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
    if ((modalMode === "change" || modalMode === "edit") && !matchedRecord) {
      showToast("Tidak ditemukan COGS aktif untuk kombinasi ini. Gunakan Add COGS.", "error");
      return;
    }
    setSaving(true);
    try {
      // Both "change" (dropdown flow) and "edit" (per-card button) hit the same
      // backend "change" action: supersede the matched record with a new version.
      const backendAction = modalMode === "add" ? "add" : "change";
      await apiPost("/api/cogs", {
        action: backendAction,
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

  const confirmDelete = async () => {
    try {
      await apiPost("/api/cogs", { action: "delete", id: deleteTarget.id, user: currentUser });
      showToast("COGS dihapus");
      setDeleteTarget(null);
      refresh();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const resetFilters = () => {
    setFilterVendor("");
    setFilterProduct("");
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between relative gap-3 flex-wrap">
        <div className="text-lg font-semibold">COGS</div>
        <div className="flex flex-col items-end gap-2">
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
          <div className="flex gap-2 items-center flex-wrap justify-end">
            <select className="input text-xs py-1.5" value={filterVendor} onChange={(e) => setFilterVendor(e.target.value)}>
              <option value="">Semua Vendor</option>
              {filterVendorOptions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            <select className="input text-xs py-1.5" value={filterProduct} onChange={(e) => setFilterProduct(e.target.value)}>
              <option value="">Semua Product</option>
              {filterProductOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            {(filterVendor || filterProduct) && (
              <button className="text-xs text-gray-400 hover:text-ink" onClick={resetFilters}>
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      <div>
        <div className="font-medium mb-2 text-sm text-gray-600">Current COGS</div>
        {currentRecords.length === 0 ? (
          <EmptyState
            title={
              filterVendor || filterProduct
                ? "Tidak ada COGS untuk filter ini."
                : "Belum ada COGS. Gunakan Add COGS untuk membuat yang pertama."
            }
          />
        ) : (
          <div className="flex flex-col gap-3">
            {currentRecords.map((c) => (
              <div key={c.id} className="card">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{c.productName}</div>
                    <div className="text-xs text-gray-500">
                      {c.vendorName} · MOQ {c.moq} pcs
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-gray-500">Total COGS</div>
                    <div className="font-semibold">{idr(c.totalCOGS)}</div>
                  </div>
                </div>
                <div className="mt-3 text-sm overflow-x-auto">
                  <table className="w-full">
                    <thead className="text-left text-gray-500 text-xs">
                      <tr>
                        <th className="py-1">Bahan</th>
                        <th className="py-1">Category</th>
                        <th className="py-1 text-right">Usage</th>
                        <th className="py-1 text-right">Harga/Unit</th>
                        <th className="py-1 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.materials.map((m, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="py-1">{m.materialName}</td>
                          <td className="py-1 text-gray-500">{m.fabricCategory || "-"}</td>
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
                  {c.editedBy ? (
                    <>
                      Diedit oleh {c.editedBy} · {c.editedAt ? new Date(c.editedAt).toLocaleString("id-ID") : ""}
                    </>
                  ) : (
                    <>
                      Dibuat oleh {c.createdBy} · {c.createdAt ? new Date(c.createdAt).toLocaleString("id-ID") : ""}
                    </>
                  )}
                </div>
                <div className="flex gap-2 mt-3">
                  <button className="btn-secondary text-xs" onClick={() => openEditRecord(c)}>
                    Edit
                  </button>
                  <button className="text-xs text-gray-400 hover:text-red-600 px-3 py-2" onClick={() => setDeleteTarget(c)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="font-medium mb-2 text-sm text-gray-600">COGS History</div>
        {historyRecords.length === 0 ? (
          <EmptyState title="Belum ada perubahan atau penghapusan COGS." />
        ) : (
          <div className="overflow-x-auto card p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Vendor</th>
                  <th className="px-3 py-2 text-right">MOQ</th>
                  <th className="px-3 py-2 text-right">Total COGS</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">By</th>
                  <th className="px-3 py-2">At</th>
                </tr>
              </thead>
              <tbody>
                {historyRecords.map((h) => (
                  <tr key={h.id} className="border-t border-gray-100 text-gray-500">
                    <td className="px-3 py-2">{h.productName}</td>
                    <td className="px-3 py-2">{h.vendorName}</td>
                    <td className="px-3 py-2 text-right">{h.moq}</td>
                    <td className="px-3 py-2 text-right">{idr(h.totalCOGS)}</td>
                    <td className="px-3 py-2">
                      {h.deleted ? (
                        <span className="text-red-600 text-xs px-2 py-0.5 rounded-full border border-red-200">Deleted</span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full border border-gray-200">Superseded</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{h.deleted ? h.deletedBy : h.createdBy}</td>
                    <td className="px-3 py-2">
                      {h.deleted
                        ? h.deletedAt
                          ? new Date(h.deletedAt).toLocaleString("id-ID")
                          : ""
                        : h.createdAt
                        ? new Date(h.createdAt).toLocaleString("id-ID")
                        : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={!!modalMode} onClose={() => setModalMode(null)} title={MODAL_TITLES[modalMode] || ""} wide>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Vendor (Sewing)</label>
              <select className="input" value={form.vendorId} onChange={(e) => setForm({ ...form, vendorId: e.target.value })}>
                <option value="">Pilih vendor</option>
                {sewingVendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
              {sewingVendors.length === 0 && (
                <div className="text-xs text-gray-400 mt-1">
                  Belum ada vendor dengan Vendor Type "Sewing". Tambahkan dulu di tab Vendors.
                </div>
              )}
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
                      <label className="label">Fabric Category</label>
                      <select className="input bg-gray-50 text-gray-500" value={row.fabricCategory} disabled>
                        <option value="">{row.fabricCategory || "-"}</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div>
                      <label className="label">Penggunaan Bahan</label>
                      <input
                        type="number"
                        className="input"
                        value={row.usage}
                        onChange={(e) => updateRow(idx, { usage: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="label">Harga Bahan per Unit</label>
                      <input
                        type="number"
                        className="input"
                        value={row.pricePerUnit}
                        onChange={(e) => updateRow(idx, { pricePerUnit: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="mt-2">
                    <label className="label">Unit</label>
                    <select className="input" value={row.unit} onChange={(e) => updateRow(idx, { unit: e.target.value })}>
                      <option value="">Pilih unit</option>
                      {UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
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
            disabled={saving || ((modalMode === "change" || modalMode === "edit") && !matchedRecord)}
            className="btn-primary mt-2"
          >
            {saving ? "Menyimpan..." : "Simpan"}
          </button>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Hapus COGS"
        message={`Yakin ingin menghapus COGS "${deleteTarget?.productName}" (${deleteTarget?.vendorName}, MOQ ${deleteTarget?.moq})? Data tetap tersimpan di COGS History beserta siapa dan kapan yang menghapus.`}
        confirmLabel="Hapus"
        danger
      />
    </div>
  );
}
