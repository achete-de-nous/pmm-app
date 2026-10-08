"use client";
import { useEffect, useMemo, useState } from "react";
import { apiList, apiCreate, apiUpdate, apiPost } from "@/lib/api-client";
import { useUser } from "@/components/UserContext";
import { useToast } from "@/components/ToastContext";
import Modal from "@/components/Modal";
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

const emptyForm = { wipDate: "", planId: "", majorQty: "", minorQty: "" };

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
  const [returnForm, setReturnForm] = useState({ qty: "", major: "", minor: "", success: "" });

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
  const historyQtySoFar = (editing?.returnHistory || []).reduce((s, h) => s + num(h.major) + num(h.minor), 0);
  const totalQtyPreview = num(form.majorQty) + num(form.minorQty) + historyQtySoFar;
  const previewCost = totalQtyPreview * cogsPerUnit;

  const totals = useMemo(() => {
    return defects.reduce(
      (acc, d) => {
        acc.totalDefect += num(d.majorQty) + num(d.minorQty);
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
    // Edit changes the *original* observed defect qty, not the post-return
    // totals - the form shows initialMajorQty/initialMinorQty (falling back
    // to majorQty/minorQty for legacy records with no returnHistory yet).
    setForm({
      wipDate: d.wipDate,
      planId: d.planId,
      majorQty: d.initialMajorQty ?? d.majorQty,
      minorQty: d.initialMinorQty ?? d.minorQty,
    });
    setAddOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.planId || (form.majorQty === "" && form.minorQty === "")) {
      showToast("Date, Production Reference, dan Qty wajib diisi", "error");
      return;
    }
    const plan = plans.find((p) => p.id === form.planId);
    const cogs = resolveCogs(plan.vendorId, plan.productNameNoVariant || plan.articleName, plan.plannedQty, cogsRecords);
    const cogsPerUnitNow = cogs?.totalCOGS || 0;
    const initialMajorQty = num(form.majorQty);
    const initialMinorQty = num(form.minorQty);
    // Preserve whatever Update Return history already exists on top of the
    // (possibly just-edited) original defect qty - editing never wipes it.
    const returnHistory = editing?.returnHistory || [];
    const histMajor = returnHistory.reduce((s, h) => s + num(h.major), 0);
    const histMinor = returnHistory.reduce((s, h) => s + num(h.minor), 0);
    const majorQty = initialMajorQty + histMajor;
    const minorQty = initialMinorQty + histMinor;
    const totalQty = majorQty + minorQty;
    const payload = {
      wipDate: form.wipDate,
      planId: plan.id,
      batchLabel: plan.batch,
      articleName: plan.articleName,
      vendorId: plan.vendorId,
      vendorName: vendorName(plan.vendorId),
      cogsPerUnit: cogsPerUnitNow,
      initialMajorQty,
      initialMinorQty,
      majorQty,
      minorQty,
      totalQty,
      cost: totalQty * cogsPerUnitNow,
    };
    try {
      if (editing) {
        await apiUpdate("defectRecords", editing.id, payload, currentUser);
        showToast("Defect diupdate");
      } else {
        await apiCreate("defectRecords", { ...payload, returnedQty: 0, returnHistory: [] }, currentUser);
        showToast("Defect disimpan");
      }
      setAddOpen(false);
      setForm(emptyForm);
      setEditing(null);
      refresh();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const openReturn = (d) => {
    setReturnTarget(d);
    setReturnForm({ qty: "", major: "", minor: "", success: "" });
  };

  const submitReturn = async (e) => {
    e.preventDefault();
    try {
      const updated = await apiPost(`/api/defects/${returnTarget.id}/return`, {
        action: "add",
        qty: Number(returnForm.qty),
        major: Number(returnForm.major) || 0,
        minor: Number(returnForm.minor) || 0,
        success: Number(returnForm.success) || 0,
        user: currentUser,
      });
      showToast("Return diupdate");
      setReturnTarget(updated);
      setReturnForm({ qty: "", major: "", minor: "", success: "" });
      refresh();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  // Deletes one mistaken return-history entry - only that entry's
  // contribution is subtracted; the defect's original Major/Minor qty and
  // every other return entry stay untouched.
  const deleteReturnEntry = async (returnId) => {
    try {
      const updated = await apiPost(`/api/defects/${returnTarget.id}/return`, {
        action: "delete",
        returnId,
        user: currentUser,
      });
      showToast("Return history dihapus");
      setReturnTarget(updated);
      refresh();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">Defect Qty</div>
        <button className="btn-primary" onClick={openAdd}>
          + Defect
        </button>
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
                <th>Date</th>
                <th>Product</th>
                <th>Batch</th>
                <th>Vendor</th>
                <th className="text-right">Total Qty</th>
                <th className="text-right">Major</th>
                <th className="text-right">Minor</th>
                <th className="text-right">Total Returned Qty</th>
                <th className="text-right">Cost</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {defects.map((d) => (
                <tr key={d.id} className="border-t border-gray-100">
                  <td className="whitespace-nowrap">{d.wipDate}</td>
                  <td className="font-medium">{d.articleName}</td>
                  <td>{d.batchLabel}</td>
                  <td>{d.vendorName}</td>
                  <td className="text-right">{d.totalQty ?? num(d.majorQty) + num(d.minorQty)}</td>
                  <td className="text-right">{d.majorQty}</td>
                  <td className="text-right">{d.minorQty}</td>
                  <td className="text-right">{d.returnedQty}</td>
                  <td className="text-right font-semibold whitespace-nowrap">{idr(d.cost)}</td>
                  <td className="whitespace-nowrap">
                    <button className="text-xs text-gray-400 hover:text-ink px-1.5 py-1" onClick={() => openEdit(d)}>
                      Edit
                    </button>
                    <button className="text-xs text-gray-400 hover:text-ink px-1.5 py-1" onClick={() => openReturn(d)}>
                      Update Return
                    </button>
                  </td>
                </tr>
              ))}
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Qty Major</label>
              <input type="number" className="input" value={form.majorQty} onChange={(e) => setForm({ ...form, majorQty: e.target.value })} />
            </div>
            <div>
              <label className="label">Qty Minor</label>
              <input type="number" className="input" value={form.minorQty} onChange={(e) => setForm({ ...form, minorQty: e.target.value })} />
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg px-3 py-2 flex items-center justify-between text-sm">
            <span className="text-gray-500">Total Qty (Major + Minor)</span>
            <span className="font-semibold">{totalQtyPreview}</span>
          </div>
          <div className="bg-gray-50 rounded-lg px-3 py-2 flex items-center justify-between text-sm">
            <span className="text-gray-500">Total Returned Qty</span>
            <span className="font-semibold">{editing?.returnedQty || 0}</span>
          </div>
          {selectedPlan && (
            <div className="bg-gray-50 rounded-lg px-3 py-2 flex items-center justify-between text-sm">
              <span className="text-gray-500">Cost (COGS {idr(cogsPerUnit)} × Total Qty)</span>
              <span className="font-semibold">{idr(previewCost)}</span>
            </div>
          )}
          <button type="submit" className="btn-primary mt-2">
            Simpan
          </button>
        </form>
      </Modal>

      <Modal open={!!returnTarget} onClose={() => setReturnTarget(null)} title={`Update Return - ${returnTarget?.articleName || ""}`}>
        <form onSubmit={submitReturn} className="flex flex-col gap-3">
          <div className="text-xs text-gray-500">
            Total Major + Minor + Success harus sama dengan Qty yang direturn pada update ini. Major/Minor/Total Returned Qty
            terakumulasi dari seluruh history return.
          </div>
          <div>
            <label className="label">Qty yang direturn (update ini)</label>
            <input type="number" className="input" value={returnForm.qty} onChange={(e) => setReturnForm({ ...returnForm, qty: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="label">Major</label>
              <input type="number" className="input" value={returnForm.major} onChange={(e) => setReturnForm({ ...returnForm, major: e.target.value })} />
            </div>
            <div>
              <label className="label">Minor</label>
              <input type="number" className="input" value={returnForm.minor} onChange={(e) => setReturnForm({ ...returnForm, minor: e.target.value })} />
            </div>
            <div>
              <label className="label">Success</label>
              <input type="number" className="input" value={returnForm.success} onChange={(e) => setReturnForm({ ...returnForm, success: e.target.value })} />
            </div>
          </div>
          {returnTarget && (
            <div className="text-xs text-gray-400">
              Total Returned Qty saat ini: {returnTarget.returnedQty || 0} → akan menjadi{" "}
              {(returnTarget.returnedQty || 0) + (Number(returnForm.qty) || 0)} setelah disimpan.
            </div>
          )}
          <button type="submit" className="btn-primary mt-2">
            Simpan
          </button>
        </form>

        {returnTarget && (returnTarget.returnHistory || []).length > 0 && (
          <div className="mt-5 pt-4 border-t border-gray-100">
            <div className="label mb-2">Return History</div>
            <div className="flex flex-col gap-2">
              {returnTarget.returnHistory.map((h) => (
                <div key={h.id} className="flex items-center justify-between text-xs border border-gray-100 rounded-lg px-3 py-2">
                  <div>
                    <div>
                      Qty {h.qty} (Major {h.major} / Minor {h.minor} / Success {h.success})
                    </div>
                    <div className="text-gray-400 mt-0.5">
                      {h.date ? new Date(h.date).toLocaleString("id-ID") : ""} oleh {h.user}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="text-gray-400 hover:text-red-600 px-2"
                    onClick={() => deleteReturnEntry(h.id)}
                    title="Hapus entry ini (untuk kesalahan input) - tidak mempengaruhi data defect lainnya"
                  >
                    Hapus
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
