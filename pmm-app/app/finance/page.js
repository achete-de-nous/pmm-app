"use client";
import { useEffect, useMemo, useState } from "react";
import { apiList, apiCreate, apiUpdate, apiDelete } from "@/lib/api-client";
import { useUser } from "@/components/UserContext";
import { useToast } from "@/components/ToastContext";
import Modal from "@/components/Modal";
import ConfirmDialog from "@/components/ConfirmDialog";
import EmptyState from "@/components/EmptyState";

const idr = (n) => "Rp" + Math.round(n || 0).toLocaleString("id-ID");
const num = (v) => Number(v) || 0;
const uid = () => Math.random().toString(36).slice(2, 10);

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

function buildCostLines(cogs, qty) {
  if (!cogs) return [];
  const lines = (cogs.materials || []).map((m) => ({
    label: m.materialName,
    unitCost: num(m.total),
    totalCost: num(m.total) * qty,
    termins: [],
  }));
  lines.push({ label: "Harga Jahit", unitCost: num(cogs.hargaJahit), totalCost: num(cogs.hargaJahit) * qty, termins: [] });
  return lines;
}

export default function FinancePage() {
  const { currentUser } = useUser();
  const { showToast } = useToast();
  const [plans, setPlans] = useState([]);
  const [cogsRecords, setCogsRecords] = useState([]);
  const [records, setRecords] = useState([]);

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [month, setMonth] = useState("");
  const [batchId, setBatchId] = useState("");
  const [costLines, setCostLines] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [paymentTarget, setPaymentTarget] = useState(null);

  const refresh = async () => {
    const [p, c, f] = await Promise.all([apiList("productionPlans"), apiList("cogsRecords"), apiList("financeRecords")]);
    setPlans(p);
    setCogsRecords(c);
    setRecords(f);
  };

  useEffect(() => {
    refresh();
  }, []);

  const selectedPlan = plans.find((p) => p.id === batchId);

  const openAdd = () => {
    setEditing(null);
    setMonth("");
    setBatchId("");
    setCostLines([]);
    setAddOpen(true);
  };

  const openEdit = (r) => {
    setEditing(r);
    setMonth(r.month);
    setBatchId(r.batchId);
    setCostLines(r.costLines || []);
    setAddOpen(true);
  };

  const onPickBatch = (id) => {
    setBatchId(id);
    const plan = plans.find((p) => p.id === id);
    if (!plan) {
      setCostLines([]);
      return;
    }
    const cogs = resolveCogs(plan.vendorId, plan.articleName, plan.plannedQty, cogsRecords);
    setCostLines(buildCostLines(cogs, num(plan.plannedQty)));
  };

  const addTermin = (lineIdx) => {
    setCostLines((lines) =>
      lines.map((l, i) => (i === lineIdx ? { ...l, termins: [...l.termins, { id: uid(), date: "", percent: "", paid: false }] } : l))
    );
  };
  const updateTermin = (lineIdx, terminId, patch) => {
    setCostLines((lines) =>
      lines.map((l, i) =>
        i === lineIdx ? { ...l, termins: l.termins.map((t) => (t.id === terminId ? { ...t, ...patch } : t)) } : l
      )
    );
  };
  const removeTermin = (lineIdx, terminId) => {
    setCostLines((lines) =>
      lines.map((l, i) => (i === lineIdx ? { ...l, termins: l.termins.filter((t) => t.id !== terminId) } : l))
    );
  };

  const totalCost = costLines.reduce((s, l) => s + num(l.totalCost), 0);

  const submit = async (e) => {
    e.preventDefault();
    const plan = plans.find((p) => p.id === batchId);
    if (!month || !plan) {
      showToast("Bulan dan Batch wajib diisi", "error");
      return;
    }
    const payload = {
      month,
      batchId: plan.id,
      batchLabel: plan.batch,
      articleName: plan.articleName,
      qty: num(plan.plannedQty),
      costLines: costLines.map((l) => ({
        ...l,
        termins: l.termins.map((t) => ({ ...t, amount: (num(t.percent) / 100) * num(l.totalCost) })),
      })),
      totalCost,
    };
    try {
      if (editing) {
        await apiUpdate("financeRecords", editing.id, payload, currentUser);
        showToast("Finance diupdate");
      } else {
        await apiCreate("financeRecords", { ...payload, paid: false }, currentUser);
        showToast("Finance disimpan");
      }
      setAddOpen(false);
      refresh();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const confirmDelete = async () => {
    try {
      await apiDelete("financeRecords", deleteTarget.id, currentUser);
      showToast("Finance dihapus");
      setDeleteTarget(null);
      refresh();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const allTermins = (r) => (r.costLines || []).flatMap((l, li) => l.termins.map((t, ti) => ({ ...t, lineIdx: li, label: l.label })));

  const openPayment = (r) => setPaymentTarget(r);

  const toggleTerminPaid = async (r, lineIdx, terminId) => {
    const newCostLines = r.costLines.map((l, i) =>
      i === lineIdx
        ? { ...l, termins: l.termins.map((t) => (t.id === terminId ? { ...t, paid: !t.paid, paidAt: !t.paid ? new Date().toISOString() : null } : t)) }
        : l
    );
    const allPaid = newCostLines.every((l) => l.termins.every((t) => t.paid));
    try {
      const updated = await apiUpdate("financeRecords", r.id, { costLines: newCostLines, paid: allPaid }, currentUser);
      setPaymentTarget(updated);
      refresh();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">Finance</div>
        <button className="btn-primary" onClick={openAdd}>
          + Finance
        </button>
      </div>

      {records.length === 0 ? (
        <EmptyState title="Belum ada data finance." />
      ) : (
        <div className="flex flex-col gap-2">
          {records.map((r) => {
            const termins = allTermins(r);
            const paidCount = termins.filter((t) => t.paid).length;
            return (
              <div key={r.id} className="card flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-medium">
                    {r.articleName} · Batch {r.batchLabel}
                  </div>
                  <div className="text-xs text-gray-500">
                    {r.month} · Qty {r.qty} · {paidCount}/{termins.length} termin dibayar
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-xs text-gray-500">Total Cost</div>
                    <div className="font-semibold">{idr(r.totalCost)}</div>
                  </div>
                  {r.paid && <span className="text-xs px-2 py-0.5 rounded-full border border-green-300 text-green-700">Paid</span>}
                  <button className="btn-secondary text-xs" onClick={() => openEdit(r)}>
                    Edit
                  </button>
                  <button className="btn-secondary text-xs" onClick={() => openPayment(r)}>
                    Update Payment
                  </button>
                  <button className="text-xs text-gray-400 hover:text-red-600 px-2" onClick={() => setDeleteTarget(r)}>
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={editing ? "Edit Finance" : "Add Finance"} wide>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Bulan</label>
              <input type="month" className="input" value={month} onChange={(e) => setMonth(e.target.value)} />
            </div>
            <div>
              <label className="label">Batch</label>
              <select className="input" value={batchId} onChange={(e) => onPickBatch(e.target.value)}>
                <option value="">Pilih batch</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.articleName} · Batch {p.batch}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {selectedPlan && (
            <div className="grid grid-cols-2 gap-3 text-sm bg-gray-50 rounded-lg px-3 py-2">
              <div>
                <div className="text-xs text-gray-500">Article Name</div>
                <div className="font-medium">{selectedPlan.articleName}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Qty</div>
                <div className="font-medium">{selectedPlan.plannedQty}</div>
              </div>
            </div>
          )}

          {costLines.length > 0 && (
            <div className="flex flex-col gap-3">
              <div className="label mb-0">Production Cost</div>
              {costLines.map((line, li) => (
                <div key={li} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium text-sm">{line.label}</div>
                    <div className="text-sm text-gray-500">{idr(line.totalCost)}</div>
                  </div>
                  <div className="flex flex-col gap-2">
                    {line.termins.map((t) => (
                      <div key={t.id} className="flex items-center gap-2">
                        <input
                          type="date"
                          className="input py-1 text-xs"
                          value={t.date}
                          onChange={(e) => updateTermin(li, t.id, { date: e.target.value })}
                        />
                        <input
                          type="number"
                          className="input py-1 text-xs w-24"
                          placeholder="%"
                          value={t.percent}
                          onChange={(e) => updateTermin(li, t.id, { percent: e.target.value })}
                        />
                        <span className="text-xs text-gray-500 whitespace-nowrap w-28">
                          {idr((num(t.percent) / 100) * num(line.totalCost))}
                        </span>
                        <button type="button" className="text-xs text-gray-400 hover:text-red-600" onClick={() => removeTermin(li, t.id)}>
                          ×
                        </button>
                      </div>
                    ))}
                    <button type="button" className="text-xs text-gray-500 underline self-start" onClick={() => addTermin(li)}>
                      + Termin
                    </button>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between text-base font-semibold border-t border-gray-100 pt-2">
                <span>Total Cost</span>
                <span>{idr(totalCost)}</span>
              </div>
            </div>
          )}

          <button type="submit" className="btn-primary mt-2">
            Save
          </button>
        </form>
      </Modal>

      <Modal open={!!paymentTarget} onClose={() => setPaymentTarget(null)} title="Update Payment">
        <div className="flex flex-col gap-2">
          {paymentTarget &&
            allTermins(paymentTarget).map((t) => (
              <label key={t.id} className="flex items-center gap-2 border border-gray-100 rounded-lg px-3 py-2 text-sm">
                <input type="checkbox" checked={!!t.paid} onChange={() => toggleTerminPaid(paymentTarget, t.lineIdx, t.id)} />
                <span className="flex-1">
                  {t.label} · {t.date || "-"} · {t.percent}%
                </span>
                <span className="font-medium">{idr((num(t.percent) / 100) * num(paymentTarget.costLines[t.lineIdx].totalCost))}</span>
              </label>
            ))}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Hapus Finance"
        message={`Yakin ingin menghapus data finance "${deleteTarget?.articleName}" batch ${deleteTarget?.batchLabel}?`}
        confirmLabel="Hapus"
        danger
      />
    </div>
  );
}
