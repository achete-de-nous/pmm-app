"use client";
import { useEffect, useMemo, useState } from "react";
import { apiList, apiCreate, apiUpdate, apiDelete } from "@/lib/api-client";
import { useUser } from "@/components/UserContext";
import { useToast } from "@/components/ToastContext";
import Modal from "@/components/Modal";
import ConfirmDialog from "@/components/ConfirmDialog";
import EmptyState from "@/components/EmptyState";
import SearchableSelect from "@/components/SearchableSelect";

const idr = (n) => "Rp" + Math.round(n || 0).toLocaleString("id-ID");
const num = (v) => Number(v) || 0;

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

function monthKey(dateStr) {
  if (!dateStr) return "";
  return String(dateStr).slice(0, 7);
}

// Total Defect (Total QTY) must balance as: Total QTY = Returned Qty + Major + Minor.
function balanceDiff(totalQty, returnedQty, majorQty, minorQty) {
  return num(totalQty) - (num(returnedQty) + num(majorQty) + num(minorQty));
}

const emptyForm = { wipDate: "", planId: "", totalQty: "", majorQty: "", minorQty: "", returnedQty: "" };

export default function DefectsPage() {
  const { currentUser } = useUser();
  const { showToast } = useToast();
  const [plans, setPlans] = useState([]);
  const [cogsRecords, setCogsRecords] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [defects, setDefects] = useState([]);

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const [returnTarget, setReturnTarget] = useState(null);
  const [returnValue, setReturnValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const refresh = async () => {
    const [p, c, v, d] = await Promise.all([
      apiList("productionPlans"),
      apiList("cogsRecords"),
      apiList("vendors"),
      apiList("defectRecords"),
    ]);
    setPlans(p);
    setCogsRecords(c);
    setVendors(v);
    setDefects(d);
  };

  useEffect(() => {
    refresh();
  }, []);

  const vendorName = (id) => vendors.find((v) => v.id === id)?.name || "-";

  const wipDateOptions = useMemo(() => Array.from(new Set(plans.map((p) => p.wipDate).filter(Boolean))).sort(), [plans]);

  // Production Reference: "Batch - Product Name - Vendor", sourced from
  // Production and auto-filtered to the same month as the selected Date.
  const productionRefOptions = useMemo(() => {
    const month = monthKey(form.wipDate);
    const list = month ? plans.filter((p) => monthKey(p.wipDate) === month) : plans;
    return list.map((p) => ({
      value: p.id,
      label: `${p.batch || "-"} - ${p.articleName} - ${vendorName(p.vendorId)}`,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans, vendors, form.wipDate]);

  const selectedPlan = plans.find((p) => p.id === form.planId);
  const selectedCogs = selectedPlan
    ? resolveCogs(selectedPlan.vendorId, selectedPlan.productNameNoVariant || selectedPlan.articleName, selectedPlan.plannedQty, cogsRecords)
    : null;
  const cogsPerUnit = selectedCogs?.totalCOGS || 0;
  const previewCost = num(form.totalQty) * cogsPerUnit;
  const formDiff = balanceDiff(form.totalQty, form.returnedQty, form.majorQty, form.minorQty);
  const formBalanced = formDiff === 0;

  const totals = useMemo(() => {
    return defects.reduce(
      (acc, d) => {
        acc.totalDefect += num(d.totalQty);
        acc.totalReturned += num(d.returnedQty);
        acc.major += num(d.majorQty);
        acc.minor += num(d.minorQty);
        acc.cost += num(d.cost);
        return acc;
      },
      { totalDefect: 0, totalReturned: 0, major: 0, minor: 0, cost: 0 }
    );
  }, [defects]);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setAddOpen(true);
  };

  const openEdit = (d) => {
    setEditing(d);
    setForm({
      wipDate: d.wipDate,
      planId: d.planId,
      totalQty: d.totalQty ?? "",
      majorQty: d.majorQty ?? "",
      minorQty: d.minorQty ?? "",
      returnedQty: d.returnedQty ?? "",
    });
    setAddOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.planId || form.totalQty === "") {
      showToast("Date, Production Reference, dan Total Qty wajib diisi", "error");
      return;
    }
    const plan = plans.find((p) => p.id === form.planId);
    const cogs = resolveCogs(plan.vendorId, plan.productNameNoVariant || plan.articleName, plan.plannedQty, cogsRecords);
    const cogsPerUnitNow = cogs?.totalCOGS || 0;
    const totalQty = num(form.totalQty);
    const majorQty = num(form.majorQty);
    const minorQty = num(form.minorQty);
    const returnedQty = num(form.returnedQty);
    const payload = {
      wipDate: form.wipDate,
      planId: plan.id,
      batchLabel: plan.batch,
      articleName: plan.articleName,
      vendorId: plan.vendorId,
      vendorName: vendorName(plan.vendorId),
      cogsPerUnit: cogsPerUnitNow,
      totalQty,
      majorQty,
      minorQty,
      returnedQty,
      cost: totalQty * cogsPerUnitNow,
    };
    try {
      if (editing) {
        await apiUpdate("defectRecords", editing.id, payload, currentUser);
        showToast("Defect diupdate");
      } else {
        await apiCreate("defectRecords", payload, currentUser);
        showToast("Defect disimpan");
      }
      if (balanceDiff(totalQty, returnedQty, majorQty, minorQty) !== 0) {
        showToast(
          `Perhatian: Total QTY belum balance dengan Returned + Major + Minor (selisih ${balanceDiff(totalQty, returnedQty, majorQty, minorQty)})`,
          "error"
        );
      }
      setAddOpen(false);
      setForm(emptyForm);
      setEditing(null);
      refresh();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  // ---- Update Return: a lightweight quick-action separate from the full
  // Edit modal, just to log/correct Total Returned Qty for a defect record.
  const openReturn = (d) => {
    setReturnTarget(d);
    setReturnValue(d.returnedQty ?? "");
  };

  const submitReturn = async (e) => {
    e.preventDefault();
    if (!returnTarget) return;
    const returnedQty = num(returnValue);
    try {
      await apiUpdate("defectRecords", returnTarget.id, { returnedQty }, currentUser);
      const diff = balanceDiff(returnTarget.totalQty, returnedQty, returnTarget.majorQty, returnTarget.minorQty);
      showToast(diff === 0 ? "Return diupdate" : `Return diupdate (selisih ${diff} - perbaiki input lain jika perlu)`);
      setReturnTarget(null);
      refresh();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  // ---- Delete (per row + bulk) ----
  const confirmDeleteOne = async () => {
    if (!deleteTarget) return;
    try {
      await apiDelete("defectRecords", deleteTarget.id, currentUser);
      showToast("Defect dihapus");
      setDeleteTarget(null);
      setSelectedIds((ids) => ids.filter((id) => id !== deleteTarget.id));
      refresh();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  };
  const toggleSelectAll = () => {
    setSelectedIds((ids) => (ids.length === defects.length ? [] : defects.map((d) => d.id)));
  };

  const confirmBulkDelete = async () => {
    try {
      await Promise.all(selectedIds.map((id) => apiDelete("defectRecords", id, currentUser)));
      showToast(`${selectedIds.length} defect dihapus`);
      setSelectedIds([]);
      setBulkDeleteOpen(false);
      refresh();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">Defect Qty</div>
        <div className="flex items-center gap-2">
          {selectedIds.length > 0 && (
            <button className="text-xs text-red-600 hover:underline px-2" onClick={() => setBulkDeleteOpen(true)}>
              Delete Selected ({selectedIds.length})
            </button>
          )}
          <button className="btn-primary" onClick={openAdd}>
            + Defect
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="card">
          <div className="label">Total Defect Qty</div>
          <div className="text-xl font-semibold">{totals.totalDefect}</div>
        </div>
        <div className="card">
          <div className="label">Total Returned Qty</div>
          <div className="text-xl font-semibold">{totals.totalReturned}</div>
        </div>
        <div className="card">
          <div className="label">Major Defect</div>
          <div className="text-xl font-semibold">{totals.major}</div>
        </div>
        <div className="card">
          <div className="label">Minor Defect</div>
          <div className="text-xl font-semibold">{totals.minor}</div>
        </div>
        <div className="card">
          <div className="label">Cost</div>
          <div className="text-xl font-semibold">{idr(totals.cost)}</div>
        </div>
      </div>

      {defects.length === 0 ? (
        <EmptyState title="Belum ada defect tercatat." />
      ) : (
        <div className="overflow-x-auto card p-0">
          <table className="w-full text-sm table-wide">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={defects.length > 0 && selectedIds.length === defects.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th>Date</th>
                <th>Product</th>
                <th>Batch</th>
                <th>Vendor</th>
                <th className="text-right">Total Qty</th>
                <th className="text-right">Major</th>
                <th className="text-right">Minor</th>
                <th className="text-right">Total Returned Qty</th>
                <th className="text-right">Cost</th>
                <th>Balance</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {defects.map((d) => {
                const diff = balanceDiff(d.totalQty, d.returnedQty, d.majorQty, d.minorQty);
                return (
                  <tr key={d.id} className="border-t border-gray-100">
                    <td>
                      <input type="checkbox" checked={selectedIds.includes(d.id)} onChange={() => toggleSelect(d.id)} />
                    </td>
                    <td className="whitespace-nowrap">{d.wipDate}</td>
                    <td className="font-medium">{d.articleName}</td>
                    <td>{d.batchLabel}</td>
                    <td>{d.vendorName}</td>
                    <td className="text-right">{d.totalQty ?? 0}</td>
                    <td className="text-right">{d.majorQty ?? 0}</td>
                    <td className="text-right">{d.minorQty ?? 0}</td>
                    <td className="text-right">{d.returnedQty ?? 0}</td>
                    <td className="text-right font-semibold whitespace-nowrap">{idr(d.cost)}</td>
                    <td className="whitespace-nowrap">
                      {diff === 0 ? (
                        <span className="badge-green">Balance</span>
                      ) : (
                        <span className="badge-red" title="Total QTY harus sama dengan Returned + Major + Minor">
                          Selisih {diff}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap">
                      <button className="text-xs text-gray-400 hover:text-ink px-1.5 py-1" onClick={() => openEdit(d)}>
                        Edit
                      </button>
                      <button className="text-xs text-gray-400 hover:text-ink px-1.5 py-1" onClick={() => openReturn(d)}>
                        Update Return
                      </button>
                      <button className="text-xs text-gray-400 hover:text-red-600 px-1.5 py-1" onClick={() => setDeleteTarget(d)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={editing ? "Edit Defect" : "Add Defect"} wide>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div>
            <label className="label">Date (WIP Date)</label>
            <select
              className="input"
              value={form.wipDate}
              onChange={(e) => setForm({ ...form, wipDate: e.target.value, planId: "" })}
            >
              <option value="">Pilih tanggal</option>
              {wipDateOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Production Reference (Batch - Product - Vendor)</label>
            <SearchableSelect
              value={form.planId}
              onChange={(v) => setForm({ ...form, planId: v })}
              options={productionRefOptions}
              placeholder={form.wipDate ? "Pilih production reference" : "Pilih Date dulu untuk mempersempit pilihan"}
            />
            {!form.wipDate && (
              <div className="text-xs text-gray-400 mt-1">
                Tanpa Date dipilih, semua production reference ditampilkan. Pilih Date untuk otomatis filter ke bulan yang sama.
              </div>
            )}
          </div>

          <div>
            <label className="label">Total QTY</label>
            <input type="number" className="input" value={form.totalQty} onChange={(e) => setForm({ ...form, totalQty: e.target.value })} />
          </div>
          <div>
            <label className="label">Total Returned Qty</label>
            <input
              type="number"
              className="input"
              value={form.returnedQty}
              onChange={(e) => setForm({ ...form, returnedQty: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Major</label>
              <input type="number" className="input" value={form.majorQty} onChange={(e) => setForm({ ...form, majorQty: e.target.value })} />
            </div>
            <div>
              <label className="label">Minor</label>
              <input type="number" className="input" value={form.minorQty} onChange={(e) => setForm({ ...form, minorQty: e.target.value })} />
            </div>
          </div>

          {!formBalanced && (
            <div className="bg-amber-50 text-amber-800 text-sm rounded-lg px-3 py-2">
              ⚠️ Total defect belum balance. Selisih: {formDiff}. Total QTY harus sama dengan Total Returned Qty + Major + Minor.
              Perbaiki input secara manual - sistem tidak akan mengubah angka otomatis.
            </div>
          )}

          {selectedPlan && (
            <div className="bg-gray-50 rounded-lg px-3 py-2 flex items-center justify-between text-sm">
              <span className="text-gray-500">Cost (COGS {idr(cogsPerUnit)} × Total QTY)</span>
              <span className="font-semibold">{idr(previewCost)}</span>
            </div>
          )}
          <button type="submit" className="btn-primary mt-2">
            Simpan
          </button>
        </form>
      </Modal>

      <Modal open={!!returnTarget} onClose={() => setReturnTarget(null)} title="Update Return">
        <form onSubmit={submitReturn} className="flex flex-col gap-3">
          <div className="text-sm text-gray-500">
            {returnTarget?.articleName} · Batch {returnTarget?.batchLabel}
          </div>
          <div>
            <label className="label">Total Returned Qty</label>
            <input type="number" className="input" value={returnValue} onChange={(e) => setReturnValue(e.target.value)} />
          </div>
          <button type="submit" className="btn-primary mt-2">
            Simpan
          </button>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDeleteOne}
        title="Hapus Defect"
        message={`Yakin ingin menghapus defect "${deleteTarget?.articleName}" (Batch ${deleteTarget?.batchLabel})? Data akan hilang permanen.`}
        confirmLabel="Hapus"
        danger
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={confirmBulkDelete}
        title="Hapus Defect Terpilih"
        message={`Yakin ingin menghapus ${selectedIds.length} defect yang dipilih? Data akan hilang permanen.`}
        confirmLabel="Hapus"
        danger
      />
    </div>
  );
}
