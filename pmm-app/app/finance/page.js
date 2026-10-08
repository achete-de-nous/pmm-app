"use client";
import { useEffect, useMemo, useState } from "react";
import { apiUpdate, apiPost } from "@/lib/api-client";
import { useUser } from "@/components/UserContext";
import { useToast } from "@/components/ToastContext";
import EmptyState from "@/components/EmptyState";
import { DP_MODES, PAYMENT_TERM_MODES, PAYMENT_STATUSES, computeFinanceTotals, flattenFinanceEntries } from "@/lib/calc";

const idr = (n) => "Rp" + Math.round(n || 0).toLocaleString("id-ID");
const num = (v) => Number(v) || 0;
const uid = () => Math.random().toString(36).slice(2, 10);

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
function statusBadge(status) {
  if (status === "Paid") return "badge-green";
  if (status === "DP Paid") return "badge-blue";
  return "badge-amber";
}

export default function FinancePage() {
  const { currentUser } = useUser();
  const { showToast } = useToast();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [view, setView] = useState("ALL"); // "ALL" | "DONE"
  const [monthFilter, setMonthFilter] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  // draftById[recordId][category] = { dp, payments }
  const [draftById, setDraftById] = useState({});
  const [showPendingByMonth, setShowPendingByMonth] = useState(false);

  const sync = async (showResult) => {
    setSyncing(true);
    try {
      const result = await apiPost("/api/finance/sync", { user: currentUser });
      setRecords(result.records);
      if (showResult) {
        const parts = [];
        if (result.created) parts.push(`${result.created} Finance baru`);
        if (result.removed) parts.push(`${result.removed} dihapus (plan On Hold/terhapus)`);
        showToast(parts.length > 0 ? parts.join(", ") : "Tidak ada perubahan");
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

  const monthOptions = useMemo(
    () => Array.from(new Set(records.map((r) => monthKey(r.wipDate)).filter(Boolean))).sort(),
    [records]
  );

  const enriched = useMemo(() => records.map((r) => ({ ...r, ...computeFinanceTotals(r) })), [records]);

  const filtered = useMemo(() => {
    let list = enriched;
    if (monthFilter) list = list.filter((r) => monthKey(r.wipDate) === monthFilter);
    if (view === "DONE") list = list.filter((r) => r.financeProgress === "Done");
    return list;
  }, [enriched, monthFilter, view]);

  const doneCount = useMemo(() => enriched.filter((r) => r.financeProgress === "Done").length, [enriched]);

  // Overall Remaining Cost = sum of each CATEGORY's own remaining (point E),
  // not one lump total - computeFinanceTotals already rolls that up per record.
  const overallRemaining = useMemo(
    () => (monthFilter ? enriched.filter((r) => monthKey(r.wipDate) === monthFilter) : enriched).reduce((s, r) => s + r.remaining, 0),
    [enriched, monthFilter]
  );

  // Pending Payment by Month (point F): bucketed by the month of each
  // category entry's PLANNED payment date while it's still Pending, plus the
  // actual cashflow bucketed by ACTUAL payment date once it's Paid.
  const pendingByMonth = useMemo(() => {
    const entries = flattenFinanceEntries(records);
    const planned = {};
    const actual = {};
    for (const e of entries) {
      if (e.status === "Paid" && e.actualDate) {
        const k = monthKey(e.actualDate);
        if (k) actual[k] = (actual[k] || 0) + num(e.amount);
      } else if (e.status !== "Paid" && e.plannedDate) {
        const k = monthKey(e.plannedDate);
        if (k) planned[k] = (planned[k] || 0) + num(e.amount);
      }
    }
    const months = Array.from(new Set([...Object.keys(planned), ...Object.keys(actual)])).sort();
    return months.map((m) => ({ month: m, planned: planned[m] || 0, actual: actual[m] || 0 }));
  }, [records]);

  const startEdit = (record, category) => {
    const cat = record.categories.find((c) => c.category === category);
    setDraftById((s) => ({
      ...s,
      [record.id]: {
        ...s[record.id],
        [category]: {
          dp: {
            mode: cat.dp?.mode || "10%",
            amount: cat.dp?.amount || 0,
            plannedDate: cat.dp?.plannedDate || "",
            actualDate: cat.dp?.actualDate || "",
            status: cat.dp?.status || "Pending",
            proof: cat.dp?.proof || "",
          },
          payments: (cat.payments || []).map((p) => ({ ...p })),
        },
      },
    }));
  };

  const cancelEdit = (record, category) => {
    setDraftById((s) => {
      const recDraft = { ...(s[record.id] || {}) };
      delete recDraft[category];
      return { ...s, [record.id]: recDraft };
    });
  };

  const updateDp = (record, category, patch) => {
    setDraftById((s) => ({
      ...s,
      [record.id]: { ...s[record.id], [category]: { ...s[record.id][category], dp: { ...s[record.id][category].dp, ...patch } } },
    }));
  };

  const addPayment = (record, category) => {
    setDraftById((s) => ({
      ...s,
      [record.id]: {
        ...s[record.id],
        [category]: {
          ...s[record.id][category],
          payments: [
            ...s[record.id][category].payments,
            { id: uid(), mode: "Sisanya", amount: 0, plannedDate: "", actualDate: "", status: "Pending", proof: "" },
          ],
        },
      },
    }));
  };

  const updatePayment = (record, category, paymentId, patch) => {
    setDraftById((s) => ({
      ...s,
      [record.id]: {
        ...s[record.id],
        [category]: {
          ...s[record.id][category],
          payments: s[record.id][category].payments.map((p) => (p.id === paymentId ? { ...p, ...patch } : p)),
        },
      },
    }));
  };

  const removePayment = (record, category, paymentId) => {
    setDraftById((s) => ({
      ...s,
      [record.id]: {
        ...s[record.id],
        [category]: { ...s[record.id][category], payments: s[record.id][category].payments.filter((p) => p.id !== paymentId) },
      },
    }));
  };

  const saveCategory = async (record, category) => {
    const draft = draftById[record.id]?.[category];
    if (!draft) return;
    const newCategories = record.categories.map((c) => (c.category === category ? { ...c, ...draft } : c));
    const { financeProgress } = computeFinanceTotals({ ...record, categories: newCategories });
    try {
      const updated = await apiUpdate("financeRecords", record.id, { categories: newCategories, financeProgress }, currentUser);
      setRecords((rs) => rs.map((r) => (r.id === record.id ? updated : r)));
      showToast(
        financeProgress === "Done" && record.financeProgress !== "Done"
          ? `"${record.articleName}" seluruh kategori lunas - pindah ke tab Done`
          : "Payment diupdate"
      );
      cancelEdit(record, category);
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-lg font-semibold">Finance</div>
        <button className="btn-secondary text-xs" onClick={() => sync(true)} disabled={syncing}>
          {syncing ? "Sync..." : "Sync dari Production"}
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="card py-2 px-3">
          <div className="label mb-0.5">Remaining Cost {monthFilter ? `- ${monthLabel(monthFilter)}` : "(semua)"}</div>
          <div className="text-xl font-semibold">{idr(overallRemaining)}</div>
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
              {v === "ALL" ? `All (${enriched.length})` : `Done (${doneCount})`}
            </button>
          ))}
        </div>
        <button className="text-xs text-gray-500 hover:text-ink underline" onClick={() => setShowPendingByMonth((v) => !v)}>
          {showPendingByMonth ? "Sembunyikan" : "Lihat"} Pending Payment by Month
        </button>
        <select className="input w-auto ml-auto" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}>
          <option value="">Month: All</option>
          {monthOptions.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
      </div>

      {showPendingByMonth && (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-3 py-2">Month</th>
                <th className="px-3 py-2 text-right">Pending Payment (Planned Date)</th>
                <th className="px-3 py-2 text-right">Actual Cashflow (Actual Date)</th>
              </tr>
            </thead>
            <tbody>
              {pendingByMonth.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-gray-400" colSpan={3}>
                    Belum ada planned/actual payment date yang diisi.
                  </td>
                </tr>
              ) : (
                pendingByMonth.map((row) => (
                  <tr key={row.month} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-medium">{monthLabel(row.month)}</td>
                    <td className="px-3 py-2 text-right">{idr(row.planned)}</td>
                    <td className="px-3 py-2 text-right text-green-700">{idr(row.actual)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-400">Memuat...</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={
            view === "DONE"
              ? "Belum ada Finance yang seluruh kategorinya lunas."
              : "Belum ada Finance. Finance otomatis muncul dari Production Plan berstatus Confirmed yang sudah punya COGS."
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((r) => {
            const isOpen = expandedId === r.id;
            return (
              <div key={r.id} className="card p-0 overflow-hidden">
                <div
                  className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 flex-wrap"
                  onClick={() => setExpandedId(isOpen ? null : r.id)}
                >
                  <div>
                    <div className="font-medium">
                      {r.articleName} <span className="text-gray-400">· Batch {r.batchLabel} · {r.vendorName}</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      WIP {r.wipDate || "-"} · Ready PROD {r.readyStockProdDate || "-"}
                      {r.delayDateProd ? <span className="text-red-500"> · Delay {r.delayDateProd}</span> : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <div className="text-right">
                      <div className="text-xs text-gray-400">Total Cost</div>
                      <div className="font-semibold">{idr(r.total)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-400">Remaining</div>
                      <div className="font-semibold">{idr(r.remaining)}</div>
                    </div>
                    <span className={r.financeProgress === "Done" ? "badge-green" : "badge-amber"}>
                      {r.financeProgress === "Done" ? "Done" : "Pending"}
                    </span>
                    <span className="text-gray-400 text-xs">{isOpen ? "▲" : "▼"}</span>
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-gray-100 px-4 py-4 flex flex-col gap-4 bg-gray-50/40">
                    {r.categories.length === 0 ? (
                      <div className="text-xs text-gray-400">Tidak ada material/kategori pada COGS ini.</div>
                    ) : (
                      r.categories.map((cat) => {
                        const draft = draftById[r.id]?.[cat.category];
                        const rows = [
                          { id: "dp", kind: "dp", label: "DP", ...cat.dp, amount: cat.dpAmount },
                          ...cat.payments.map((p, i) => ({ ...p, kind: "termin", label: `Termin ${i + 1}` })),
                        ];
                        return (
                          <div key={cat.category} className="border border-gray-200 rounded-lg bg-white overflow-hidden">
                            <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
                              <div className="font-medium text-sm">
                                {cat.category}
                                {cat.isService ? <span className="text-gray-400 text-xs"> · jasa jahit</span> : null}
                              </div>
                              <div className="flex items-center gap-3 text-xs">
                                <span>
                                  Total Cost: <span className="font-semibold">{idr(cat.total)}</span>
                                </span>
                                <span>
                                  Remaining: <span className="font-semibold">{idr(cat.remaining)}</span>
                                </span>
                                <span className={statusBadge(cat.status)}>{cat.status}</span>
                              </div>
                            </div>

                            {cat.materials.length > 0 && (
                              <div className="px-3 pt-2">
                                <table className="w-full text-xs">
                                  <thead className="text-left text-gray-400">
                                    <tr>
                                      <th className="py-1">Material</th>
                                      <th className="py-1 text-right">Qty</th>
                                      <th className="py-1">Unit</th>
                                      <th className="py-1 text-right">COGS</th>
                                      <th className="py-1 text-right">Total</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {cat.materials.map((m, i) => (
                                      <tr key={i} className="border-t border-gray-100">
                                        <td className="py-1">{m.materialName}</td>
                                        <td className="py-1 text-right">{m.qtyTotal}</td>
                                        <td className="py-1">{m.unit}</td>
                                        <td className="py-1 text-right">{idr(m.cogsPerUnit)}</td>
                                        <td className="py-1 text-right font-medium">{idr(m.totalPayment)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}

                            <div className="px-3 py-2">
                              <div className="flex items-center justify-between mb-1">
                                <div className="label mb-0">Payment Tracking</div>
                                {!draft && (
                                  <button className="btn-secondary text-xs" onClick={() => startEdit(r, cat.category)}>
                                    Update Pembayaran
                                  </button>
                                )}
                              </div>

                              {!draft ? (
                                <div className="overflow-x-auto border border-gray-200 rounded-lg">
                                  <table className="w-full text-sm">
                                    <thead className="bg-gray-50 text-left text-gray-500">
                                      <tr>
                                        <th className="px-3 py-1.5">Term</th>
                                        <th className="px-3 py-1.5">Mode</th>
                                        <th className="px-3 py-1.5 text-right">Amount</th>
                                        <th className="px-3 py-1.5">Planned Date</th>
                                        <th className="px-3 py-1.5">Actual Date</th>
                                        <th className="px-3 py-1.5">Status</th>
                                        <th className="px-3 py-1.5">Proof</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {rows.map((row) => (
                                        <tr key={row.id} className="border-t border-gray-100">
                                          <td className="px-3 py-1.5">{row.label}</td>
                                          <td className="px-3 py-1.5">{row.mode}</td>
                                          <td className="px-3 py-1.5 text-right font-medium">{idr(row.amount)}</td>
                                          <td className="px-3 py-1.5">{row.plannedDate || "-"}</td>
                                          <td className="px-3 py-1.5">{row.actualDate || "-"}</td>
                                          <td className="px-3 py-1.5">
                                            <span className={row.status === "Paid" ? "badge-green" : "badge-amber"}>{row.status}</span>
                                          </td>
                                          <td className="px-3 py-1.5 text-gray-500">{row.proof || "-"}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <div className="flex flex-col gap-2 border border-gray-200 rounded-lg p-3">
                                  <div className="flex items-center gap-2 flex-wrap text-xs">
                                    <span className="w-16 text-gray-400">DP</span>
                                    <select
                                      className="input py-1 text-xs w-24"
                                      value={draft.dp.mode}
                                      onChange={(e) => updateDp(r, cat.category, { mode: e.target.value })}
                                    >
                                      {DP_MODES.map((m) => (
                                        <option key={m} value={m}>
                                          {m}
                                        </option>
                                      ))}
                                    </select>
                                    {draft.dp.mode === "Manual" ? (
                                      <input
                                        type="number"
                                        className="input py-1 text-xs w-24"
                                        placeholder="Nominal"
                                        value={draft.dp.amount}
                                        onChange={(e) => updateDp(r, cat.category, { amount: e.target.value })}
                                      />
                                    ) : (
                                      <span className="w-24 text-gray-500">otomatis</span>
                                    )}
                                    <input
                                      type="date"
                                      className="input py-1 text-xs w-28"
                                      title="Planned Date"
                                      value={draft.dp.plannedDate || ""}
                                      onChange={(e) => updateDp(r, cat.category, { plannedDate: e.target.value })}
                                    />
                                    <input
                                      type="date"
                                      className="input py-1 text-xs w-28"
                                      title="Actual Date"
                                      value={draft.dp.actualDate || ""}
                                      onChange={(e) => updateDp(r, cat.category, { actualDate: e.target.value })}
                                    />
                                    <select
                                      className="input py-1 text-xs w-24"
                                      value={draft.dp.status}
                                      onChange={(e) => updateDp(r, cat.category, { status: e.target.value })}
                                    >
                                      {PAYMENT_STATUSES.map((s) => (
                                        <option key={s} value={s}>
                                          {s}
                                        </option>
                                      ))}
                                    </select>
                                    <input
                                      className="input py-1 text-xs flex-1 min-w-[100px]"
                                      placeholder="Proof/reference"
                                      value={draft.dp.proof || ""}
                                      onChange={(e) => updateDp(r, cat.category, { proof: e.target.value })}
                                    />
                                  </div>

                                  {draft.payments.map((p, i) => (
                                    <div key={p.id} className="flex items-center gap-2 flex-wrap text-xs">
                                      <span className="w-16 text-gray-400">Termin {i + 1}</span>
                                      <select
                                        className="input py-1 text-xs w-24"
                                        value={p.mode}
                                        onChange={(e) => updatePayment(r, cat.category, p.id, { mode: e.target.value })}
                                      >
                                        {PAYMENT_TERM_MODES.map((m) => (
                                          <option key={m} value={m}>
                                            {m}
                                          </option>
                                        ))}
                                      </select>
                                      {p.mode === "Manual" ? (
                                        <input
                                          type="number"
                                          className="input py-1 text-xs w-24"
                                          placeholder="Nominal"
                                          value={p.amount}
                                          onChange={(e) => updatePayment(r, cat.category, p.id, { amount: e.target.value })}
                                        />
                                      ) : (
                                        <span className="w-24 text-gray-500">otomatis</span>
                                      )}
                                      <input
                                        type="date"
                                        className="input py-1 text-xs w-28"
                                        title="Planned Date"
                                        value={p.plannedDate || ""}
                                        onChange={(e) => updatePayment(r, cat.category, p.id, { plannedDate: e.target.value })}
                                      />
                                      <input
                                        type="date"
                                        className="input py-1 text-xs w-28"
                                        title="Actual Date"
                                        value={p.actualDate || ""}
                                        onChange={(e) => updatePayment(r, cat.category, p.id, { actualDate: e.target.value })}
                                      />
                                      <select
                                        className="input py-1 text-xs w-24"
                                        value={p.status}
                                        onChange={(e) => updatePayment(r, cat.category, p.id, { status: e.target.value })}
                                      >
                                        {PAYMENT_STATUSES.map((s) => (
                                          <option key={s} value={s}>
                                            {s}
                                          </option>
                                        ))}
                                      </select>
                                      <input
                                        className="input py-1 text-xs flex-1 min-w-[100px]"
                                        placeholder="Proof/reference"
                                        value={p.proof || ""}
                                        onChange={(e) => updatePayment(r, cat.category, p.id, { proof: e.target.value })}
                                      />
                                      <button
                                        type="button"
                                        className="text-gray-400 hover:text-red-600"
                                        onClick={() => removePayment(r, cat.category, p.id)}
                                      >
                                        Hapus
                                      </button>
                                    </div>
                                  ))}

                                  <button
                                    type="button"
                                    className="btn-secondary text-xs self-start"
                                    onClick={() => addPayment(r, cat.category)}
                                  >
                                    + Tambah Termin
                                  </button>

                                  <div className="flex items-center gap-2 pt-2 border-t border-gray-100 mt-1">
                                    <button type="button" className="btn-primary text-xs" onClick={() => saveCategory(r, cat.category)}>
                                      Simpan
                                    </button>
                                    <button type="button" className="text-xs text-gray-400" onClick={() => cancelEdit(r, cat.category)}>
                                      Batal
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
