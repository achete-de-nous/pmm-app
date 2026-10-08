"use client";
import { useEffect, useMemo, useState } from "react";
import { apiList, apiUpdate, apiPost } from "@/lib/api-client";
import { useUser } from "@/components/UserContext";
import { useToast } from "@/components/ToastContext";
import EmptyState from "@/components/EmptyState";
import { DP_MODES, PAYMENT_TERM_MODES, PAYMENT_STATUSES, computeFinanceTotals } from "@/lib/calc";

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

export default function FinancePage() {
  const { currentUser } = useUser();
  const { showToast } = useToast();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [view, setView] = useState("ALL"); // "ALL" | "DONE"
  const [monthFilter, setMonthFilter] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [draftById, setDraftById] = useState({});

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
  const overallRemaining = useMemo(
    () => (monthFilter ? enriched.filter((r) => monthKey(r.wipDate) === monthFilter) : enriched).reduce((s, r) => s + r.remaining, 0),
    [enriched, monthFilter]
  );

  // ---- Combined payment rows helper: DP is always the first (locked) row ----
  const paymentRows = (record) => [
    { id: "dp", kind: "dp", label: "DP", ...record.dp, amount: record.dpAmount },
    ...(record.payments || []).map((p, i) => ({ ...p, kind: "termin", label: `Termin ${i + 1}` })),
  ];

  const startEdit = (record) => {
    setDraftById((s) => ({
      ...s,
      [record.id]: {
        dp: { mode: record.dp?.mode || "10%", amount: record.dp?.amount || 0, date: record.dp?.date || "", status: record.dp?.status || "Pending", proof: record.dp?.proof || "" },
        payments: (record.payments || []).map((p) => ({ ...p })),
      },
    }));
  };

  const cancelEdit = (record) => {
    setDraftById((s) => {
      const copy = { ...s };
      delete copy[record.id];
      return copy;
    });
  };

  const updateDp = (record, patch) => {
    setDraftById((s) => ({ ...s, [record.id]: { ...s[record.id], dp: { ...s[record.id].dp, ...patch } } }));
  };

  const addPayment = (record) => {
    setDraftById((s) => ({
      ...s,
      [record.id]: {
        ...s[record.id],
        payments: [...s[record.id].payments, { id: uid(), mode: "Sisanya", amount: 0, date: "", status: "Pending", proof: "" }],
      },
    }));
  };

  const updatePayment = (record, paymentId, patch) => {
    setDraftById((s) => ({
      ...s,
      [record.id]: {
        ...s[record.id],
        payments: s[record.id].payments.map((p) => (p.id === paymentId ? { ...p, ...patch } : p)),
      },
    }));
  };

  const removePayment = (record, paymentId) => {
    setDraftById((s) => ({
      ...s,
      [record.id]: { ...s[record.id], payments: s[record.id].payments.filter((p) => p.id !== paymentId) },
    }));
  };

  const saveRecord = async (record) => {
    const draft = draftById[record.id];
    if (!draft) return;
    const { financeProgress } = computeFinanceTotals({ ...record, ...draft });
    try {
      const updated = await apiUpdate("financeRecords", record.id, { ...draft, financeProgress }, currentUser);
      setRecords((rs) => rs.map((r) => (r.id === record.id ? updated : r)));
      showToast(
        financeProgress === "Done" && record.financeProgress !== "Done"
          ? `"${record.articleName}" lunas - pindah ke tab Done`
          : "Finance diupdate"
      );
      cancelEdit(record);
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
        <select className="input w-auto ml-auto" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}>
          <option value="">Month: All</option>
          {monthOptions.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400">Memuat...</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={
            view === "DONE"
              ? "Belum ada Finance yang lunas."
              : "Belum ada Finance. Finance otomatis muncul dari Production Plan berstatus Confirmed yang sudah punya COGS."
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((r) => {
            const isOpen = expandedId === r.id;
            const draft = draftById[r.id];
            const rows = paymentRows(r);
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
                      <div className="text-xs text-gray-400">Total Harga Bahan Utama</div>
                      <div className="font-semibold">{idr(r.totalHargaBahanUtama)}</div>
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
                    <div>
                      <div className="label mb-1">Material Cost</div>
                      {(r.materials || []).length === 0 ? (
                        <div className="text-xs text-gray-400">Tidak ada material pada COGS ini.</div>
                      ) : (
                        <div className="overflow-x-auto border border-gray-200 rounded-lg bg-white">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-left text-gray-500">
                              <tr>
                                <th className="px-3 py-1.5">Material</th>
                                <th className="px-3 py-1.5 text-right">Qty</th>
                                <th className="px-3 py-1.5">Unit</th>
                                <th className="px-3 py-1.5 text-right">COGS</th>
                                <th className="px-3 py-1.5 text-right">Total Payment</th>
                              </tr>
                            </thead>
                            <tbody>
                              {r.materials.map((m, i) => (
                                <tr key={i} className="border-t border-gray-100">
                                  <td className="px-3 py-1.5">{m.materialName}</td>
                                  <td className="px-3 py-1.5 text-right">{m.qtyTotal}</td>
                                  <td className="px-3 py-1.5">{m.unit}</td>
                                  <td className="px-3 py-1.5 text-right">{idr(m.cogsPerUnit)}</td>
                                  <td className="px-3 py-1.5 text-right font-medium">{idr(m.totalPayment)}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="border-t border-gray-200 font-semibold">
                                <td className="px-3 py-1.5" colSpan={4}>
                                  Total Harga Bahan Utama
                                </td>
                                <td className="px-3 py-1.5 text-right">{idr(r.totalHargaBahanUtama)}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <div className="label mb-0">Payment</div>
                        {!draft && (
                          <button className="btn-secondary text-xs" onClick={() => startEdit(r)}>
                            Update Pembayaran
                          </button>
                        )}
                      </div>

                      {!draft ? (
                        <div className="overflow-x-auto border border-gray-200 rounded-lg bg-white">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-left text-gray-500">
                              <tr>
                                <th className="px-3 py-1.5">Term</th>
                                <th className="px-3 py-1.5">Payment</th>
                                <th className="px-3 py-1.5 text-right">Amount</th>
                                <th className="px-3 py-1.5">Date</th>
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
                                  <td className="px-3 py-1.5">{row.date || "-"}</td>
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
                        <div className="flex flex-col gap-2 border border-gray-200 rounded-lg bg-white p-3">
                          <div className="flex items-center gap-2 flex-wrap text-xs">
                            <span className="w-16 text-gray-400">DP</span>
                            <select className="input py-1 text-xs w-28" value={draft.dp.mode} onChange={(e) => updateDp(r, { mode: e.target.value })}>
                              {DP_MODES.map((m) => (
                                <option key={m} value={m}>
                                  {m}
                                </option>
                              ))}
                            </select>
                            {draft.dp.mode === "Manual" ? (
                              <input
                                type="number"
                                className="input py-1 text-xs w-28"
                                placeholder="Nominal"
                                value={draft.dp.amount}
                                onChange={(e) => updateDp(r, { amount: e.target.value })}
                              />
                            ) : (
                              <span className="w-28 text-gray-500">dihitung otomatis</span>
                            )}
                            <input type="date" className="input py-1 text-xs w-32" value={draft.dp.date || ""} onChange={(e) => updateDp(r, { date: e.target.value })} />
                            <select className="input py-1 text-xs w-24" value={draft.dp.status} onChange={(e) => updateDp(r, { status: e.target.value })}>
                              {PAYMENT_STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                            <input
                              className="input py-1 text-xs flex-1 min-w-[120px]"
                              placeholder="Payment proof / reference"
                              value={draft.dp.proof || ""}
                              onChange={(e) => updateDp(r, { proof: e.target.value })}
                            />
                          </div>

                          {draft.payments.map((p, i) => (
                            <div key={p.id} className="flex items-center gap-2 flex-wrap text-xs">
                              <span className="w-16 text-gray-400">Termin {i + 1}</span>
                              <select
                                className="input py-1 text-xs w-28"
                                value={p.mode}
                                onChange={(e) => updatePayment(r, p.id, { mode: e.target.value })}
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
                                  className="input py-1 text-xs w-28"
                                  placeholder="Nominal"
                                  value={p.amount}
                                  onChange={(e) => updatePayment(r, p.id, { amount: e.target.value })}
                                />
                              ) : (
                                <span className="w-28 text-gray-500">dihitung otomatis</span>
                              )}
                              <input
                                type="date"
                                className="input py-1 text-xs w-32"
                                value={p.date || ""}
                                onChange={(e) => updatePayment(r, p.id, { date: e.target.value })}
                              />
                              <select
                                className="input py-1 text-xs w-24"
                                value={p.status}
                                onChange={(e) => updatePayment(r, p.id, { status: e.target.value })}
                              >
                                {PAYMENT_STATUSES.map((s) => (
                                  <option key={s} value={s}>
                                    {s}
                                  </option>
                                ))}
                              </select>
                              <input
                                className="input py-1 text-xs flex-1 min-w-[120px]"
                                placeholder="Payment proof / reference"
                                value={p.proof || ""}
                                onChange={(e) => updatePayment(r, p.id, { proof: e.target.value })}
                              />
                              <button type="button" className="text-gray-400 hover:text-red-600" onClick={() => removePayment(r, p.id)}>
                                Hapus
                              </button>
                            </div>
                          ))}

                          <button type="button" className="btn-secondary text-xs self-start" onClick={() => addPayment(r)}>
                            + Tambah Termin
                          </button>

                          <div className="flex items-center gap-2 pt-2 border-t border-gray-100 mt-1">
                            <button type="button" className="btn-primary text-xs" onClick={() => saveRecord(r)}>
                              Simpan
                            </button>
                            <button type="button" className="text-xs text-gray-400" onClick={() => cancelEdit(r)}>
                              Batal
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
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
