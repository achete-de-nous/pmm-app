"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { apiList, apiCreate, apiUpdate, apiDelete, apiPost } from "@/lib/api-client";
import { useUser } from "@/components/UserContext";
import { useToast } from "@/components/ToastContext";
import Modal from "@/components/Modal";
import ConfirmDialog from "@/components/ConfirmDialog";
import EmptyState from "@/components/EmptyState";
import SearchableSelect from "@/components/SearchableSelect";
import { downloadProductionTemplate, parseProductionFile, classifyProductionRows } from "@/lib/productionImport";

const idr = (n) => "Rp" + Math.round(n || 0).toLocaleString("id-ID");
const num = (v) => Number(v) || 0;
const STATUSES = ["Pending", "Confirmed", "Partially Fulfilled", "Fulfilled", "Delayed", "DONE"];
const RETENTION_MONTHS = 3;
const WARN_DAYS = 7;

const emptyForm = {
  articleName: "",
  batch: "",
  wipDate: "",
  readyStockOpsDate: "",
  readyStockProdDate: "",
  vendorId: "",
  plannedQty: "",
  note: "",
};

function addMonths(dateStr, months) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  d.setMonth(d.getMonth() + months);
  return d;
}

function monthKey(dateStr) {
  if (!dateStr) return "";
  return String(dateStr).slice(0, 7);
}

function monthLabel(key) {
  if (!key) return "";
  const [y, m] = key.split("-");
  const names = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ];
  return `${names[Number(m) - 1] || m} ${y}`;
}

// Resolves the current, non-deleted COGS record for a vendor+product combo,
// tiered by MOQ (the highest MOQ that is <= plannedQty).
function resolveCogs(vendorId, productName, plannedQty, cogsRecords) {
  const candidates = cogsRecords.filter(
    (c) => c.isCurrent && !c.deleted && c.vendorId === vendorId && c.productName === productName
  );
  if (candidates.length === 0) return null;
  const qty = num(plannedQty);
  const sorted = candidates.slice().sort((a, b) => num(a.moq) - num(b.moq));
  const fitting = sorted.filter((c) => num(c.moq) <= qty);
  return fitting.length > 0 ? fitting[fitting.length - 1] : sorted[0];
}

export default function ProductionPage() {
  const { currentUser } = useUser();
  const { showToast } = useToast();
  const [products, setProducts] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [plans, setPlans] = useState([]);
  const [cogsRecords, setCogsRecords] = useState([]);

  const [monthFilter, setMonthFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selected, setSelected] = useState([]);

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState("Confirmed");

  const [fulfillOpen, setFulfillOpen] = useState(null);
  const [fulfillQty, setFulfillQty] = useState("");

  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState([]);
  const [importError, setImportError] = useState(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  const refresh = async () => {
    const [p, v, pl, c] = await Promise.all([
      apiList("products"),
      apiList("vendors"),
      apiList("productionPlans"),
      apiList("cogsRecords"),
    ]);
    setProducts(p);
    setVendors(v);
    setPlans(pl);
    setCogsRecords(c);
  };

  useEffect(() => {
    refresh();
  }, []);

  const sewingVendors = useMemo(() => vendors.filter((v) => (v.vendorType || "").toLowerCase() === "sewing"), [vendors]);
  const vendorName = (id) => vendors.find((v) => v.id === id)?.name || "-";

  const articleOptions = useMemo(() => {
    const set = new Set(products.map((p) => p.productNameNoVariant).filter(Boolean));
    return Array.from(set).map((n) => ({ value: n, label: n }));
  }, [products]);

  const priceForArticle = (articleName) => products.find((p) => p.productNameNoVariant === articleName)?.price || 0;

  const enrichedPlans = useMemo(() => {
    return plans.map((p) => {
      const cogs = resolveCogs(p.vendorId, p.articleName, p.plannedQty, cogsRecords);
      const cogsValue = cogs?.totalCOGS || 0;
      const price = priceForArticle(p.articleName);
      return { ...p, cogsValue, price, margin: price - cogsValue };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans, cogsRecords, products]);

  const monthOptions = useMemo(() => {
    const set = new Set(plans.map((p) => monthKey(p.wipDate)).filter(Boolean));
    return Array.from(set).sort();
  }, [plans]);

  const monthFiltered = useMemo(
    () => (monthFilter ? enrichedPlans.filter((p) => monthKey(p.wipDate) === monthFilter) : enrichedPlans),
    [enrichedPlans, monthFilter]
  );

  const statusFiltered = useMemo(
    () => (statusFilter === "All" ? monthFiltered : monthFiltered.filter((p) => p.status === statusFilter)),
    [monthFiltered, statusFilter]
  );

  const overall = useMemo(() => {
    const planned = monthFiltered.reduce((s, p) => s + num(p.plannedQty), 0);
    const fulfilled = monthFiltered.reduce((s, p) => s + num(p.fulfilledQty), 0);
    return { planned, fulfilled, progress: planned ? Math.round((fulfilled / planned) * 100) : 0 };
  }, [monthFiltered]);

  // ---- Retention warning banner (auto-delete every 3 months, H-7 export) ----
  const retentionWarnings = useMemo(() => {
    const now = new Date();
    return plans.filter((p) => {
      const del = addMonths(p.wipDate, RETENTION_MONTHS);
      if (!del) return false;
      const daysLeft = (del - now) / (1000 * 60 * 60 * 24);
      return daysLeft <= WARN_DAYS;
    });
  }, [plans]);

  const exportRetentionWarnings = () => {
    const rows = retentionWarnings.map((p) => ({
      "Article Name": p.articleName,
      Batch: p.batch,
      "WIP Date": p.wipDate,
      "Ready Stock (OPS)": p.readyStockOpsDate,
      "Ready Stock (PROD)": p.readyStockProdDate,
      Vendor: vendorName(p.vendorId),
      "Planned Qty": p.plannedQty,
      "Fulfilled Qty": p.fulfilledQty,
      Status: p.status,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Production Export");
    XLSX.writeFile(wb, `Production_Export_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // ---- Add / Edit ----
  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setAddOpen(true);
  };

  const openEdit = (p) => {
    setEditing(p);
    setForm({
      articleName: p.articleName || "",
      batch: p.batch || "",
      wipDate: p.wipDate || "",
      readyStockOpsDate: p.readyStockOpsDate || "",
      readyStockProdDate: p.readyStockProdDate || "",
      vendorId: p.vendorId || "",
      plannedQty: p.plannedQty ?? "",
      note: p.note || "",
    });
    setAddOpen(true);
  };

  const submitPlan = async (e) => {
    e.preventDefault();
    const missing = [];
    if (!form.articleName) missing.push("Article Name");
    if (!form.wipDate) missing.push("WIP Date");
    if (!form.readyStockOpsDate) missing.push("Ready Stock Date (OPS)");
    if (!form.plannedQty) missing.push("Planned Qty");
    if (!form.vendorId) missing.push("Vendor");
    if (!form.batch) missing.push("Batch");
    if (missing.length > 0) {
      showToast(`Wajib diisi: ${missing.join(", ")}`, "error");
      return;
    }
    const readyStockProdDate = form.readyStockProdDate || form.readyStockOpsDate;
    try {
      const payload = {
        articleName: form.articleName,
        batch: form.batch,
        wipDate: form.wipDate,
        readyStockOpsDate: form.readyStockOpsDate,
        readyStockProdDate,
        vendorId: form.vendorId,
        plannedQty: Number(form.plannedQty),
        note: form.note,
      };
      if (editing) {
        await apiUpdate("productionPlans", editing.id, payload, currentUser);
        showToast("Production plan diupdate");
      } else {
        await apiCreate(
          "productionPlans",
          { ...payload, delayDate: null, fulfilledQty: 0, fulfilledDate: null, status: "Pending" },
          currentUser
        );
        showToast("Production plan disimpan");
      }
      setAddOpen(false);
      setForm(emptyForm);
      setEditing(null);
      refresh();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const confirmDelete = async () => {
    try {
      await apiDelete("productionPlans", deleteTarget.id, currentUser);
      showToast("Production plan dihapus");
      setDeleteTarget(null);
      refresh();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  // ---- Bulk actions ----
  const toggleSelect = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleSelectAll = () => {
    const ids = statusFiltered.map((p) => p.id);
    setSelected((s) => (ids.every((id) => s.includes(id)) ? s.filter((id) => !ids.includes(id)) : Array.from(new Set([...s, ...ids]))));
  };

  const applyBulkStatus = async () => {
    try {
      await Promise.all(selected.map((id) => apiUpdate("productionPlans", id, { status: bulkStatus }, currentUser)));
      showToast(`${selected.length} production plan diupdate ke status ${bulkStatus}`);
      setBulkStatusOpen(false);
      setSelected([]);
      refresh();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const applyBulkDelete = async () => {
    try {
      await Promise.all(selected.map((id) => apiDelete("productionPlans", id, currentUser)));
      showToast(`${selected.length} production plan dihapus`);
      setBulkDeleteConfirm(false);
      setSelected([]);
      refresh();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  // ---- Fulfilled Qty ----
  const openFulfill = (plan) => {
    setFulfillOpen(plan);
    setFulfillQty(String(plan.fulfilledQty || 0));
  };

  const submitFulfill = async (e) => {
    e.preventDefault();
    try {
      await apiPost(`/api/production-plans/${fulfillOpen.id}/fulfill`, {
        fulfilledQty: Number(fulfillQty),
        user: currentUser,
      });
      showToast("Fulfilled qty diupdate");
      setFulfillOpen(null);
      refresh();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  // ---- Import ----
  const openImport = () => {
    setImportRows([]);
    setImportError(null);
    setImportOpen(true);
  };
  const closeImport = () => {
    setImportOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };
  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportRows([]);
    setImportError(null);
    try {
      const { headerError, rows } = await parseProductionFile(file);
      if (headerError) {
        setImportError(headerError);
        return;
      }
      setImportRows(classifyProductionRows(rows, products, sewingVendors));
    } catch (err) {
      setImportError(err.message);
    }
  };
  const importHasErrors = importRows.some((r) => r.status === "error");
  const importValidCount = importRows.filter((r) => r.status === "valid").length;
  const confirmImport = async () => {
    setImporting(true);
    try {
      const rows = importRows.filter((r) => r.status === "valid");
      const result = await apiPost("/api/production/import", { rows, user: currentUser });
      showToast(`${result.created} production plan diimport${result.errors?.length ? `, ${result.errors.length} gagal` : ""}`);
      closeImport();
      refresh();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-lg font-semibold">Production</div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={openImport}>
            Import File
          </button>
          <button className="btn-primary" onClick={openAdd}>
            + Production Plan
          </button>
        </div>
      </div>

      {retentionWarnings.length > 0 && (
        <div className="border border-amber-300 bg-amber-50 rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm text-amber-800">
            {retentionWarnings.length} production plan akan otomatis dihapus dalam {WARN_DAYS} hari (data lebih dari{" "}
            {RETENTION_MONTHS} bulan). Export dulu sebelum terhapus.
          </div>
          <button className="btn-secondary text-xs" onClick={exportRetentionWarnings}>
            Export Now
          </button>
        </div>
      )}

      <div className="flex gap-2 items-center flex-wrap">
        <select className="input w-auto" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}>
          <option value="">Semua Bulan</option>
          {monthOptions.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
      </div>

      <div className="card">
        <div className="label">Overall Progress {monthFilter ? `- ${monthLabel(monthFilter)}` : ""}</div>
        <div className="flex items-center justify-between text-sm mb-2">
          <span>
            {overall.fulfilled} / {overall.planned} pcs fulfilled
          </span>
          <span className="font-semibold">{overall.progress}%</span>
        </div>
        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-ink" style={{ width: `${overall.progress}%` }} />
        </div>
      </div>

      <div>
        <div className="label mb-1">Production Progress</div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {["All", ...STATUSES].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`whitespace-nowrap text-sm px-3 py-1.5 rounded-full border ${
                statusFilter === s ? "bg-ink text-white border-ink" : "border-gray-200 text-gray-600"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {selected.length > 0 && (
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          <span className="text-sm">{selected.length} dipilih</span>
          <button className="btn-secondary text-xs" onClick={() => setBulkStatusOpen(true)}>
            Ubah Status
          </button>
          <button className="text-xs text-red-600 px-2" onClick={() => setBulkDeleteConfirm(true)}>
            Hapus Terpilih
          </button>
          <button className="text-xs text-gray-400 ml-auto" onClick={() => setSelected([])}>
            Batal
          </button>
        </div>
      )}

      {statusFiltered.length === 0 ? (
        <EmptyState title="Belum ada production plan." />
      ) : (
        <div className="overflow-x-auto card p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-2 py-2">
                  <input
                    type="checkbox"
                    checked={statusFiltered.length > 0 && statusFiltered.every((p) => selected.includes(p.id))}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="px-3 py-2">WIP Date</th>
                <th className="px-3 py-2">Ready OPS</th>
                <th className="px-3 py-2">Ready PROD</th>
                <th className="px-3 py-2">Delay Date</th>
                <th className="px-3 py-2">Batch</th>
                <th className="px-3 py-2">Vendor</th>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2 text-right">COGS</th>
                <th className="px-3 py-2 text-right">Margin</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {statusFiltered.map((p) => (
                <tr key={p.id} className="border-t border-gray-100">
                  <td className="px-2 py-2">
                    <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggleSelect(p.id)} />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{p.wipDate || "-"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{p.readyStockOpsDate || "-"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{p.readyStockProdDate || "-"}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-red-600">{p.delayDate || "-"}</td>
                  <td className="px-3 py-2">{p.batch || "-"}</td>
                  <td className="px-3 py-2">{vendorName(p.vendorId)}</td>
                  <td className="px-3 py-2 font-medium">{p.articleName}</td>
                  <td className="px-3 py-2 text-right">{idr(p.cogsValue)}</td>
                  <td className="px-3 py-2 text-right">{idr(p.margin)}</td>
                  <td className="px-3 py-2 text-right">{idr(p.price)}</td>
                  <td className="px-3 py-2 text-right">
                    {p.fulfilledQty || 0}/{p.plannedQty}
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-xs px-2 py-0.5 rounded-full border border-gray-200 whitespace-nowrap">{p.status}</span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <button className="text-xs text-gray-400 hover:text-ink px-1.5 py-1" onClick={() => openFulfill(p)}>
                      Fulfill
                    </button>
                    <button className="text-xs text-gray-400 hover:text-ink px-1.5 py-1" onClick={() => openEdit(p)}>
                      Edit
                    </button>
                    <button className="text-xs text-gray-400 hover:text-red-600 px-1.5 py-1" onClick={() => setDeleteTarget(p)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={editing ? "Edit Production Plan" : "Add Production Plan"} wide>
        <form onSubmit={submitPlan} className="flex flex-col gap-3">
          <div>
            <label className="label">Article Name *</label>
            <SearchableSelect
              value={form.articleName}
              onChange={(v) => setForm({ ...form, articleName: v })}
              options={articleOptions}
              placeholder="Pilih article (dari Product)"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Batch *</label>
              <input className="input" value={form.batch} onChange={(e) => setForm({ ...form, batch: e.target.value })} />
            </div>
            <div>
              <label className="label">Planned Qty *</label>
              <input
                type="number"
                className="input"
                value={form.plannedQty}
                onChange={(e) => setForm({ ...form, plannedQty: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">WIP Date *</label>
              <input type="date" className="input" value={form.wipDate} onChange={(e) => setForm({ ...form, wipDate: e.target.value })} />
            </div>
            <div>
              <label className="label">Ready Stock Date (OPS) *</label>
              <input
                type="date"
                className="input"
                value={form.readyStockOpsDate}
                onChange={(e) => setForm({ ...form, readyStockOpsDate: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="label">Ready Stock Date (PROD)</label>
            <input
              type="date"
              className="input"
              value={form.readyStockProdDate}
              onChange={(e) => setForm({ ...form, readyStockProdDate: e.target.value })}
            />
            <div className="text-xs text-gray-400 mt-1">Kosongkan untuk memakai tanggal yang sama dengan Ready Stock Date (OPS).</div>
          </div>
          <div>
            <label className="label">Vendor (Sewing) *</label>
            <select className="input" value={form.vendorId} onChange={(e) => setForm({ ...form, vendorId: e.target.value })}>
              <option value="">Pilih vendor</option>
              {sewingVendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
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

      <Modal open={!!fulfillOpen} onClose={() => setFulfillOpen(null)} title={`Update Fulfilled - ${fulfillOpen?.articleName || ""}`}>
        <form onSubmit={submitFulfill} className="flex flex-col gap-3">
          <div>
            <label className="label">Fulfilled Qty (Planned: {fulfillOpen?.plannedQty})</label>
            <input type="number" className="input" value={fulfillQty} onChange={(e) => setFulfillQty(e.target.value)} />
          </div>
          <button type="submit" className="btn-primary mt-2">
            Simpan
          </button>
        </form>
      </Modal>

      <Modal open={bulkStatusOpen} onClose={() => setBulkStatusOpen(false)} title={`Ubah Status (${selected.length} plan)`}>
        <div className="flex flex-col gap-3">
          <select className="input" value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button className="btn-primary" onClick={applyBulkStatus}>
            Terapkan
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Hapus Production Plan"
        message={`Yakin ingin menghapus production plan "${deleteTarget?.articleName}" batch ${deleteTarget?.batch}?`}
        confirmLabel="Hapus"
        danger
      />

      <ConfirmDialog
        open={bulkDeleteConfirm}
        onClose={() => setBulkDeleteConfirm(false)}
        onConfirm={applyBulkDelete}
        title="Hapus Production Plan Terpilih"
        message={`Yakin ingin menghapus ${selected.length} production plan yang dipilih?`}
        confirmLabel="Hapus"
        danger
      />

      <Modal open={importOpen} onClose={closeImport} title="Import Production dari File">
        <div className="flex flex-col gap-4">
          <div className="text-sm text-gray-500">
            Header: <span className="font-mono text-xs">Article Name | WIP Date | Ready Stock (OPS) | Planned Qty | Vendor</span>
          </div>
          <button type="button" className="btn-secondary self-start" onClick={downloadProductionTemplate}>
            Download Production Template
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleImportFile}
            className="block w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
          />
          {importError && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{importError}</div>}
          {importRows.length > 0 && (
            <>
              <div className="overflow-x-auto max-h-64 overflow-y-auto border border-gray-100 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-left text-gray-500 sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5">Baris</th>
                      <th className="px-2 py-1.5">Article Name</th>
                      <th className="px-2 py-1.5">WIP Date</th>
                      <th className="px-2 py-1.5">Ready OPS</th>
                      <th className="px-2 py-1.5 text-right">Qty</th>
                      <th className="px-2 py-1.5">Vendor</th>
                      <th className="px-2 py-1.5">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.map((r, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="px-2 py-1.5">{r.rowNumber}</td>
                        <td className="px-2 py-1.5">{r.articleName}</td>
                        <td className="px-2 py-1.5">{r.wipDate}</td>
                        <td className="px-2 py-1.5">{r.readyStockOps}</td>
                        <td className="px-2 py-1.5 text-right">{r.plannedQty}</td>
                        <td className="px-2 py-1.5">{r.vendorName}</td>
                        <td className="px-2 py-1.5">
                          {r.status === "valid" ? (
                            <span className="px-1.5 py-0.5 rounded text-[11px] bg-green-50 text-green-700">Valid</span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[11px] bg-red-50 text-red-700">{r.errors.join(", ")}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {importHasErrors && (
                <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">
                  Ada baris tidak valid. Baris tersebut tidak akan diimport - perbaiki file jika ingin baris itu ikut masuk.
                </div>
              )}
              <button
                type="button"
                className="btn-primary disabled:opacity-40"
                disabled={importValidCount === 0 || importing}
                onClick={confirmImport}
              >
                {importing ? "Mengimport..." : `Confirm Import (${importValidCount} baris valid)`}
              </button>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
