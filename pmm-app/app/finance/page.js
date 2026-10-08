"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import { apiList, apiUpdate, apiPost } from "@/lib/api-client";
import { useUser } from "@/components/UserContext";
import { useToast } from "@/components/ToastContext";
import EmptyState from "@/components/EmptyState";
import { DP_MODES, PAYMENT_TERM_MODES, computeFinanceTotals } from "@/lib/calc";

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
  const [draftById, setDraftById] = useState({}); // financeId -> { dp, payments }

  const sync = async (showResult) => {
    setSyncing(true);
    try {
      const result = await apiPost("/api/finance/sync", { user: currentUser });
      setRecords(result.records);
      if (showResult) {
        const parts = [];
        if (result.created) parts.push(`${result.created} Finance baru dari Production yang Confirmed`);
        if (result.removed) parts.push(`${result.removed} Finance dihapus (plan On Hold/terhapus)`);
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

  // ---- Draft editing (DP + Payment Term list) per expanded record ----
  const startEdit = (record) => {
    setDraftById((s) => ({
      ...s,
      [record.id]: {
        dp: record.dp || { mode: "10%", amount: 0 },
        payments: (record.payments || []).map((p) => ({ ...p })),
      },
    }));
  };

  const draftFor = (record) => draftById[record.id];

  const updateDp = (record, patch) => {
    setDraftById((s) => ({ ...s, [record.id]: { ...s[record.id], dp: { ...s[record.id].dp, ...patch } } }));
  };

  const addPayment = (record) => {
    setDraftById((s) => ({
      ...s,
      [record.id]: {
        ...s[record.id],
        payments: [...s[record.id].payments, { id: uid(), mode: "Sisanya", amount: 0, date: "" }],
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

  const cancelEdit = (record) => {
    setDraftById((s) => {
      const copy = { ...s };
      delete copy[record.id];
      return copy;
    });
  };

  const saveRecord = async (record) => {
    const draft = draftFor(record);
    if (!draft) return;
    const patch = { dp: draft.dp, payments: draft.payments };
    const { financeProgress } = computeFinanceTotals({ ...record, ...patch });
    try {
      const updated = await apiUpdate("financeRecords", record.id, { ...patch, financeProgress }, currentUser);
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
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-lg font-semibold">Finance</div>
        <button className="btn-secondary text-xs" onClick={() => sync(true)} disabled={syncing}>
          {syncing ? "Sync..." : "Sync dari Production (Confirmed)"}
        </button>
      </div>

      <div className="card max-w-xs">
        <div className="label">Remaining Cost {monthFilter ? `- ${monthLabel(monthFilter)}` : ""}</div>
        <div className="text-2xl font-semibold">{idr(overallRemaining)}</div>
      </div>

      <div className="flex gap-2 items-center flex-wrap">
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
          <option value="">Semua Bulan</option>
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
                <th className="text-right">COGS /unit</th>
                <th className="text-right">Total Harga Bahan Utama</th>
                <th className="text-right">Remaining</th>
                <th>Finance Progress</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const isOpen = expandedId === r.id;
                const draft = draftFor(r);
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
                      <td className="text-right whitespace-nowrap">{idr(r.cogsPerUnit)}</td>
                      <td className="text-right whitespace-nowrap font-medium">{idr(r.totalHargaBahanUtama)}</td>
                      <td className="text-right whitespace-nowrap">{idr(r.remaining)}</td>
                      <td>
                        <span className={r.financeProgress === "Done" ? "badge-green" : "badge-amber"}>
                          {r.financeProgress === "Done" ? "Done" : "Pending"}
                        </span>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-t border-gray-100 bg-gray-50/60">
                        <td colSpan={11} className="px-4 py-4">
                          <div className="flex items-center justify-between text-sm mb-3">
                            <div className="text-gray-500">
                              Total Harga Bahan Utama (COGS {idr(r.cogsPerUnit)} × Qty {r.qty}) ={" "}
                              <span className="font-semibold text-ink">{idr(r.totalHargaBahanUtama)}</span>
                            </div>
                            {!draft && (
                              <button className="btn-secondary text-xs" onClick={() => startEdit(r)}>
                                Update Pembayaran
                              </button>
                            )}
                          </div>

                          {!draft ? (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                              <div className="border border-gray-200 rounded-lg p-3 bg-white">
                                <div className="text-xs text-gray-500">DP</div>
                                <div className="font-medium">
                                  {r.dp?.mode || "-"} · {idr(r.dpAmount)}
                                </div>
                              </div>
                              <div className="border border-gray-200 rounded-lg p-3 bg-white sm:col-span-2">
                                <div className="text-xs text-gray-500 mb-1">Payment Term / Pelunasan</div>
                                {(!r.payments || r.payments.length === 0) ? (
                                  <div className="text-gray-400 text-xs">Belum ada termin pembayaran.</div>
                                ) : (
                                  <div className="flex flex-col gap-1">
                                    {r.payments.map((p, i) => (
                                      <div key={p.id} className="flex items-center justify-between">
                                        <span>
                                          Termin {i + 1} ({p.mode}) {p.date ? `· ${p.date}` : ""}
                                        </span>
                                        <span className="font-medium">{idr(p.amount)}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <div className="flex items-center justify-between border-t border-gray-100 mt-2 pt-2 font-semibold">
                                  <span>Remaining</span>
                                  <span>{idr(r.remaining)}</span>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-4">
                              <div className="border border-gray-200 rounded-lg p-3 bg-white max-w-sm">
                                <div className="label">DP</div>
                                <select
                                  className="input mb-2"
                                  value={draft.dp.mode}
                                  onChange={(e) => updateDp(r, { mode: e.target.value })}
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
                                    className="input"
                                    placeholder="Nominal DP"
                                    value={draft.dp.amount}
                                    onChange={(e) => updateDp(r, { amount: e.target.value })}
                                  />
                                ) : (
                                  <div className="text-sm text-gray-500">
                                    = {idr((parseFloat(draft.dp.mode) / 100) * num(r.totalHargaBahanUtama))}
                                  </div>
                                )}
                              </div>

                              <div className="border border-gray-200 rounded-lg p-3 bg-white">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="label mb-0">Payment Term / Pelunasan</div>
                                  <button type="button" className="btn-secondary text-xs" onClick={() => addPayment(r)}>
                                    + Tambah Termin
                                  </button>
                                </div>
                                {draft.payments.length === 0 ? (
                                  <div className="text-xs text-gray-400">Belum ada termin. Klik + Tambah Termin.</div>
                                ) : (
                                  <div className="flex flex-col gap-2">
                                    {draft.payments.map((p, i) => (
                                      <div key={p.id} className="flex items-center gap-2 flex-wrap">
                                        <span className="text-xs text-gray-400 w-16">Termin {i + 1}</span>
                                        <select
                                          className="input py-1 text-xs w-32"
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
                                            className="input py-1 text-xs w-32"
                                            placeholder="Nominal"
                                            value={p.amount}
                                            onChange={(e) => updatePayment(r, p.id, { amount: e.target.value })}
                                          />
                                        ) : (
                                          <span className="text-xs text-gray-500 w-32">dihitung otomatis</span>
                                        )}
                                        <input
                                          type="date"
                                          className="input py-1 text-xs w-36"
                                          value={p.date || ""}
                                          onChange={(e) => updatePayment(r, p.id, { date: e.target.value })}
                                        />
                                        <button
                                          type="button"
                                          className="text-xs text-gray-400 hover:text-red-600"
                                          onClick={() => removePayment(r, p.id)}
                                        >
                                          Hapus
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                <button type="button" className="btn-primary text-xs" onClick={() => saveRecord(r)}>
                                  Simpan
                                </button>
                                <button type="button" className="text-xs text-gray-400" onClick={() => cancelEdit(r)}>
                                  Batal
                                </button>
                              </div>
                            </div>
                          )}
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
