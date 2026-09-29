"use client";
import { useEffect, useMemo, useState } from "react";
import { apiList, apiCreate, apiUpdate, apiPost } from "@/lib/api-client";
import { useUser } from "@/components/UserContext";
import { useToast } from "@/components/ToastContext";
import Modal from "@/components/Modal";
import EmptyState from "@/components/EmptyState";

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
  const plansForDate = useMemo(() => plans.filter((p) => p.wipDate === form.wipDate), [plans, form.wipDate]);
  const selectedPlan = plans.find((p) => p.id === form.planId);
  const selectedCogs = selectedPlan
    ? resolveCogs(selectedPlan.vendorId, selectedPlan.articleName, selectedPlan.plannedQty, cogsRecords)
    : null;
  const cogsPerUnit = selectedCogs?.totalCOGS || 0;
  const previewCost = (num(form.majorQty) + num(form.minorQty)) * cogsPerUnit;

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
    setForm({ wipDate: d.wipDate, planId: d.planId, majorQty: d.majorQty, minorQty: d.minorQty });
    setAddOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.planId || (form.majorQty === "" && form.minorQty === "")) {
      showToast("Date, Batch, dan Qty wajib diisi", "error");
      return;
    }
    const plan = plans.find((p) => p.id === form.planId);
    const cogs = resolveCogs(plan.vendorId, plan.articleName, plan.plannedQty, cogsRecords);
    const cogsPerUnitNow = cogs?.totalCOGS || 0;
    const majorQty = num(form.majorQty);
    const minorQty = num(form.minorQty);
    const payload = {
      wipDate: form.wipDate,
      planId: plan.id,
      batchLabel: plan.batch,
      articleName: plan.articleName,
      vendorId: plan.vendorId,
      vendorName: vendorName(plan.vendorId),
      cogsPerUnit: cogsPerUnitNow,
      majorQty,
      minorQty,
      cost: (majorQty + minorQty) * cogsPerUnitNow,
    };
    try {
      if (editing) {
        await apiUpdate("defectRecords", editing.id, payload, currentUser);
        showToast("Defect diupdate");
      } else {
        await apiCreate("defectRecords", { ...payload, returnedQty: 0 }, currentUser);
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
      await apiPost(`/api/defects/${returnTarget.id}/return`, {
        qty: Number(returnForm.qty),
        major: Number(returnForm.major) || 0,
        minor: Number(returnForm.minor) || 0,
        success: Number(returnForm.success) || 0,
        user: currentUser,
      });
      showToast("Return diupdate");
      setReturnTarget(null);
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
        <div className="flex flex-col gap-2">
          {defects.map((d) => (
            <div key={d.id} className="card flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="font-medium">
                  {d.articleName} · Batch {d.batchLabel}
                </div>
                <div className="text-xs text-gray-500">
                  {d.wipDate} · {d.vendorName} · Major {d.majorQty} / Minor {d.minorQty} / Returned {d.returnedQty}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-xs text-gray-500">Cost</div>
                  <div className="font-semibold">{idr(d.cost)}</div>
                </div>
                <button className="btn-secondary text-xs" onClick={() => openEdit(d)}>
                  Edit
                </button>
                <button className="btn-secondary text-xs" onClick={() => openReturn(d)}>
                  Update Return
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={editing ? "Edit Defect" : "Add Defect"}>
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
          {form.wipDate && (
            <div>
              <label className="label">Batch</label>
              <select className="input" value={form.planId} onChange={(e) => setForm({ ...form, planId: e.target.value })}>
                <option value="">Pilih batch</option>
                {plansForDate.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.articleName} · Batch {p.batch}
                  </option>
                ))}
              </select>
            </div>
          )}
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
          {selectedPlan && (
            <div className="bg-gray-50 rounded-lg px-3 py-2 flex items-center justify-between text-sm">
              <span className="text-gray-500">Cost (COGS {idr(cogsPerUnit)} × Qty)</span>
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
          <div className="text-xs text-gray-500">Total Major + Minor + Success harus sama dengan Qty yang direturn.</div>
          <div>
            <label className="label">Qty yang direturn</label>
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
          <button type="submit" className="btn-primary mt-2">
            Simpan
          </button>
        </form>
      </Modal>
    </div>
  );
}
