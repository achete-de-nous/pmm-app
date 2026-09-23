"use client";
import { useEffect, useState } from "react";
import { apiList, apiCreate, apiCalc } from "@/lib/api-client";
import { useUser } from "@/components/UserContext";
import { useToast } from "@/components/ToastContext";
import Modal from "@/components/Modal";
import EmptyState from "@/components/EmptyState";

export default function ReconciliationPage() {
  const { currentUser } = useUser();
  const { showToast } = useToast();
  const [balances, setBalances] = useState([]);
  const [history, setHistory] = useState([]);
  const [open, setOpen] = useState(null);
  const [manualCount, setManualCount] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState("");

  const refresh = async () => {
    const [mb, h] = await Promise.all([apiCalc("material-balances"), apiList("reconciliations")]);
    setBalances(mb);
    setHistory(h);
  };

  useEffect(() => {
    refresh();
  }, []);

  const openModal = (row) => {
    setOpen(row);
    setManualCount(String(row.qty));
    setNote("");
    setDate("");
  };

  const submit = async (e) => {
    e.preventDefault();
    try {
      const systemBalance = open.qty;
      const count = Number(manualCount);
      const variance = count - systemBalance;
      const variancePct = systemBalance !== 0 ? (variance / systemBalance) * 100 : 0;
      await apiCreate(
        "reconciliations",
        {
          materialName: open.materialName,
          location: open.location,
          locationLabel: open.locationLabel,
          systemBalance,
          manualCount: count,
          variance,
          variancePct,
          note,
          date,
        },
        currentUser
      );
      showToast("Reconciliation disimpan");
      setOpen(null);
      refresh();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="text-lg font-semibold">Month-End Reconciliation</div>

      <div>
        <div className="font-medium mb-2 text-sm text-gray-600">System Balance per Material / Location</div>
        {balances.length === 0 ? (
          <EmptyState title="Belum ada balance untuk direkonsiliasi." />
        ) : (
          <div className="overflow-x-auto card p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-3 py-2">Material</th>
                  <th className="px-3 py-2">Location</th>
                  <th className="px-3 py-2 text-right">System Balance</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {balances.map((r) => (
                  <tr key={`${r.materialName}-${r.location}`} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-medium">{r.materialName}</td>
                    <td className="px-3 py-2">{r.locationLabel}</td>
                    <td className="px-3 py-2 text-right">
                      {r.qty} {r.unit}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button className="btn-secondary text-xs" onClick={() => openModal(r)}>
                        Count
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <div className="font-medium mb-2 text-sm text-gray-600">Reconciliation History</div>
        {history.length === 0 ? (
          <EmptyState title="Belum ada reconciliation." />
        ) : (
          <div className="overflow-x-auto card p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-3 py-2">Material</th>
                  <th className="px-3 py-2">Location</th>
                  <th className="px-3 py-2 text-right">System</th>
                  <th className="px-3 py-2 text-right">Manual</th>
                  <th className="px-3 py-2 text-right">Variance</th>
                  <th className="px-3 py-2 text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-medium">{h.materialName}</td>
                    <td className="px-3 py-2">{h.locationLabel}</td>
                    <td className="px-3 py-2 text-right">{h.systemBalance}</td>
                    <td className="px-3 py-2 text-right">{h.manualCount}</td>
                    <td className={`px-3 py-2 text-right ${h.variance !== 0 ? "text-red-600" : ""}`}>{h.variance}</td>
                    <td className="px-3 py-2 text-right">{Number(h.variancePct).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={!!open} onClose={() => setOpen(null)} title={`Reconcile - ${open?.materialName || ""}`}>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="text-sm text-gray-500">
            System Balance: <span className="font-medium text-ink">{open?.qty}</span> {open?.unit}
          </div>
          <div>
            <label className="label">Manual Count</label>
            <input type="number" className="input" value={manualCount} onChange={(e) => setManualCount(e.target.value)} />
          </div>
          <div>
            <label className="label">Date</label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Note</label>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <button type="submit" className="btn-primary mt-2">
            Simpan
          </button>
        </form>
      </Modal>
    </div>
  );
}
