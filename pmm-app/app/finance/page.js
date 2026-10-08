"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import { apiList, apiUpdate, apiPost } from "@/lib/api-client";
import { useUser } from "@/components/UserContext";
import { useToast } from "@/components/ToastContext";
import EmptyState from "@/components/EmptyState";
import { computeFinanceProgress, isCategoryFullyPaid } from "@/lib/calc";

const idr = (n) => "Rp" + Math.round(n || 0).toLocaleString("id-ID");
const num = (v) => Number(v) || 0;

const PAYMENT_STATUSES = ["Pending", "DP Paid", "Paid"];
const PAYMENT_STATUS_LABEL = { Pending: "Pending", "DP Paid": "DP Paid", Paid: "Paid (Lunas)" };

function monthKey(dateStr) {
  if (!dateStr) return "";
  return String(dateStr).slice(0, 7);
}
function monthLabel(key) {
  if (!key) return "Belum Dijadwalkan";
  const [y, m] = key.split("-");
  const names = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ];
  return `${names[Number(m) - 1] || m} ${y}`;
}

export default function FinancePage() {
  const { currentUser } = useUser();
  const { showToast } = useToast();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [view, setView] = useState("ALL"); // "ALL" | "DONE"
  const [expandedId, setExpandedId] = useState(null);
  const [editState, setEditState] = useState({}); // `${financeId}:${categoryKey}` -> draft fields

  const refresh = async () => setRecords(await apiList("financeRecords"));

  const sync = async (showResult) => {
    setSyncing(true);
    try {
      const result = await apiPost("/api/finance/sync", { user: currentUser });
      setRecords(result.records);
      if (showResult && result.created > 0) {
        showToast(`${result.created} Finance record baru dibuat dari Production Plan yang Confirmed`);
      }
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await sync(false);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const viewRecords = useMemo(
    () => records.filter((r) => (view === "DONE" ? r.financeProgress === "Done" : true)),
    [records, view]
  );

  const doneCount = records.filter((r) => r.financeProgress === "Done").length;

  // ---- Dashboard: overall Remaining Cost + Pending Payment by Month ----
  const overallRemaining = useMemo(
    () => records.reduce((s, r) => s + (r.categories || []).reduce((s2, c) => s2 + Math.max(0, num(c.remaining)), 0), 0),
    [records]
  );
  const pendingByMonth = useMemo(() => {
    const map = {};
    for (const r of records) {
      for (const c of r.categories || []) {
        if (isCategoryFullyPaid(c)) continue;
        // Mismatch handling: once an Actual Payment Date exists, bucket by
        // that real month; otherwise forecast using the Planned Payment Date.
        const key = monthKey(c.actualPaymentDate) || monthKey(c.plannedPaymentDate) || "";
        if (!map[key]) map[key] = 0;
        map[key] += Math.max(0, num(c.remaining));
      }
    }
    return Object.entries(map)
      .map(([key, amount]) => ({ key, amount }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }, [records]);

  // ---- Per-category edit ----
  const editKey = (recordId, catKey) => `${recordId}:${catKey}`;

  const startEdit = (record, cat) => {
    setEditState((s) => ({
      ...s,
      [editKey(record.id, cat.key)]: {
        dp: cat.dp ?? 0,
        plannedPaymentDate: cat.plannedPaymentDate || "",
        actualPaymentDate: cat.actualPaymentDate || "",
        paymentStatus: cat.paymentStatus || "Pending",
      },
    }));
  };

  const updateEdit = (record, cat, patch) => {
    setEditState((s) => ({ ...s, [editKey(record.id, cat.key)]: { ...s[editKey(record.id, cat.key)], ...patch } }));
  };

  const saveCategory = async (record, cat) => {
    const draft = editState[editKey(record.id, cat.key)];
    if (!draft) return;
    const dp = Math.min(num(draft.dp), num(cat.totalCost));
    const remaining = num(cat.totalCost) - dp;
    const newCategories = record.categories.map((c) =>
      c.key === cat.key
        ? {
            ...c,
            dp,
            remaining,
            plannedPaymentDate: draft.plannedPaymentDate || null,
            actualPaymentDate: draft.actualPaymentDate || null,
            paymentStatus: draft.paymentStatus,
          }
        : c
    );
    const financeProgress = computeFinanceProgress(newCategories);
    try {
      const updated = await apiUpdate("financeRecords", record.id, { categories: newCategories, financeProgress }, currentUser);
      setRecords((rs) => rs.map((r) => (r.id === record.id ? updated : r)));
      showToast(
        financeProgress === "Done" && record.financeProgress !== "Done"
          ? `Finance "${record.articleName}" lunas semua kategori - pindah ke tab DONE`
          : "Payment diupdate"
      );
      setEditState((s) => {
        const copy = { ...s };
        delete copy[editKey(record.id, cat.key)];
        return copy;
      });
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-lg font-semibold">Finance</div>
        <button className="btn-secondary text-xs" onClick={() => sync(true)} disabled={syncing}>
          {syncing ? "Sync..." : "Sync dari Production (Confirmed)"}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="card">
          <div className="label">Remaining Cost (Total COGS - Total Paid)</div>
          <div className="text-2xl font-semibold">{idr(overallRemaining)}</div>
        </div>
        <div className="card">
          <div className="label">Pending Payment by Month</div>
          {pendingByMonth.length === 0 ? (
            <div className="text-sm text-gray-400 mt-1">Tidak ada pending payment.</div>
          ) : (
            <div className="flex flex-col gap-1 mt-1">
              {pendingByMonth.map((row) => (
                <div key={row.key || "none"} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{monthLabel(row.key)}</span>
                  <span className="font-medium">{idr(row.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        {["ALL", "DONE"].map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`text-sm px-3 py-1.5 rounded-full border ${
              view === v ? "bg-ink text-white border-ink" : "border-gray-200 text-gray-600"
            }`}
          >
            {v === "ALL" ? `All (${records.length})` : `Done (${doneCount})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-gray-400">Memuat...</div>
      ) : viewRecords.length === 0 ? (
        <EmptyState
          title={
            view === "DONE"
              ? "Belum ada Finance yang lunas semua kategori."
              : "Belum ada Finance. Finance otomatis muncul dari Production Plan berstatus Confirmed yang sudah punya COGS."
          }
        />
      ) : (
        <div className="overflow-x-auto card p-0">
          <table className="w-full text-sm table-wide">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th></th>
                <th>WIP Date</th>
                <th>Ready OPS</th>
                <th>Ready PROD</th>
                <th>Delayed PROD</th>
                <th>Vendor Sewing</th>
                <th>Product Name</th>
                <th className="text-right">COGS</th>
                <th>Finance Progress</th>
              </tr>
            </thead>
            <tbody>
              {viewRecords.map((r) => {
                const isOpen = expandedId === r.id;
                return (
                  <Fragment key={r.id}>
                    <tr
                      className="border-t border-gray-100 cursor-pointer hover:bg-gray-50"
                      onClick={() => setExpandedId(isOpen ? null : r.id)}
                    >
                      <td className="px-3 py-2.5 text-gray-400 text-xs">{isOpen ? "▲" : "▼"}</td>
                      <td className="whitespace-nowrap">{r.wipDate || "-"}</td>
                      <td className="whitespace-nowrap">{r.readyStockOpsDate || "-"}</td>
                      <td className="whitespace-nowrap">{r.readyStockProdDate || "-"}</td>
                      <td className="whitespace-nowrap text-red-600">{r.delayDateProd || "-"}</td>
                      <td>{r.vendorName}</td>
                      <td className="font-medium min-w-[180px]">
                        {r.articleName} <span className="text-gray-400">· Batch {r.batchLabel}</span>
                      </td>
                      <td className="text-right whitespace-nowrap">{idr(r.totalCOGS)}</td>
                      <td>
                        <span className={r.financeProgress === "Done" ? "badge-green" : "badge-amber"}>
                          {r.financeProgress === "Done" ? "Done" : "Pending"}
                        </span>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-t border-gray-100 bg-gray-50/60">
                        <td colSpan={9} className="px-4 py-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            {(r.categories || []).map((cat) => {
                              const draft = editState[editKey(r.id, cat.key)];
                              const isEditing = !!draft;
                              return (
                                <div key={cat.key} className="border border-gray-200 rounded-lg p-3 bg-white">
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="font-medium text-sm">{cat.label}</div>
                                    {isCategoryFullyPaid(cat) && <span className="badge-green">Lunas</span>}
                                  </div>
                                  <div className="text-xs text-gray-500 flex justify-between">
                                    <span>Total Cost</span>
                                    <span className="font-medium text-ink">{idr(cat.totalCost)}</span>
                                  </div>

                                  {isEditing ? (
                                    <div className="flex flex-col gap-2 mt-2">
                                      <div>
                                        <label className="label">DP</label>
                                        <input
                                          type="number"
                                          className="input py-1 text-xs"
                                          value={draft.dp}
                                          onChange={(e) => updateEdit(r, cat, { dp: e.target.value })}
                                        />
                                      </div>
                                      <div className="text-xs text-gray-500 flex justify-between">
                                        <span>Remaining</span>
                                        <span className="font-medium">{idr(Math.max(0, num(cat.totalCost) - num(draft.dp)))}</span>
                                      </div>
                                      <div>
                                        <label className="label">Planned Payment Date</label>
                                        <input
                                          type="date"
                                          className="input py-1 text-xs"
                                          value={draft.plannedPaymentDate}
                                          onChange={(e) => updateEdit(r, cat, { plannedPaymentDate: e.target.value })}
                                        />
                                      </div>
                                      <div>
                                        <label className="label">Actual Payment Date</label>
                                        <input
                                          type="date"
                                          className="input py-1 text-xs"
                                          value={draft.actualPaymentDate}
                                          onChange={(e) => updateEdit(r, cat, { actualPaymentDate: e.target.value })}
                                        />
                                      </div>
                                      <div>
                                        <label className="label">Payment Status</label>
                                        <select
                                          className="input py-1 text-xs"
                                          value={draft.paymentStatus}
                                          onChange={(e) => updateEdit(r, cat, { paymentStatus: e.target.value })}
                                        >
                                          {PAYMENT_STATUSES.map((s) => (
                                            <option key={s} value={s}>
                                              {PAYMENT_STATUS_LABEL[s]}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                      <button
                                        type="button"
                                        className="btn-primary text-xs py-1.5 mt-1"
                                        onClick={() => saveCategory(r, cat)}
                                      >
                                        Simpan
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex flex-col gap-1 mt-2 text-xs text-gray-600">
                                      <div className="flex justify-between">
                                        <span>DP</span>
                                        <span>{idr(cat.dp)}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>Remaining</span>
                                        <span className="font-medium text-ink">{idr(cat.remaining)}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>Planned</span>
                                        <span>{cat.plannedPaymentDate || "-"}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>Actual</span>
                                        <span>{cat.actualPaymentDate || "-"}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>Status</span>
                                        <span>{PAYMENT_STATUS_LABEL[cat.paymentStatus] || cat.paymentStatus}</span>
                                      </div>
                                      <button
                                        type="button"
                                        className="btn-secondary text-xs py-1 mt-1"
                                        onClick={() => startEdit(r, cat)}
                                      >
                                        Update Payment
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
