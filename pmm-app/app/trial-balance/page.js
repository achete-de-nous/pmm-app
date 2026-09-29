"use client";
import { useEffect, useMemo, useState } from "react";
import { apiList, apiCalc, apiPost } from "@/lib/api-client";
import { useUser } from "@/components/UserContext";
import EmptyState from "@/components/EmptyState";

const idr = (n) => "Rp" + Math.round(n || 0).toLocaleString("id-ID");

export default function TrialBalancePage() {
  const { currentUser } = useUser();
  const [materials, setMaterials] = useState([]);
  const [rows, setRows] = useState([]);
  const [checks, setChecks] = useState({});
  const [materialFilter, setMaterialFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async (filter) => {
    setLoading(true);
    const [m, r, c] = await Promise.all([
      apiList("materials"),
      apiCalc("trial-balance", filter ? { materialName: filter } : {}),
      apiList("reconciliations"),
    ]);
    setMaterials(m);
    setRows(r);
    const map = {};
    c.forEach((row) => {
      map[row.rowKey] = row.value ?? "";
    });
    setChecks(map);
    setLoading(false);
  };

  useEffect(() => {
    load(materialFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materialFilter]);

  const saveCheck = async (row, value) => {
    setChecks((c) => ({ ...c, [row.rowKey]: value }));
    try {
      await apiPost("/api/trial-balance/check", {
        rowKey: row.rowKey,
        materialName: row.materialName,
        value,
        user: currentUser,
      });
    } catch {
      // best-effort - the input already reflects the value locally
    }
  };

  const sortedRows = useMemo(() => rows.slice().sort((a, b) => (a.date || "").localeCompare(b.date || "")), [rows]);

  return (
    <div className="flex flex-col gap-6">
      <div className="text-lg font-semibold">Trial Balance</div>

      <div className="flex gap-2 items-center">
        <select className="input w-auto" value={materialFilter} onChange={(e) => setMaterialFilter(e.target.value)}>
          <option value="">Semua Material</option>
          {materials.map((m) => (
            <option key={m.id} value={m.name}>
              {m.name}
            </option>
          ))}
        </select>
        {materialFilter && (
          <button className="text-xs text-gray-400 hover:text-ink" onClick={() => setMaterialFilter("")}>
            Reset
          </button>
        )}
      </div>

      <div className="text-xs text-gray-400 -mt-3">
        Trial Balance dihitung otomatis: transaksi material (masuk/keluar) dikurangi penggunaan material untuk
        production, diurutkan dari tanggal paling awal ke paling akhir.
      </div>

      {loading ? (
        <div className="text-sm text-gray-400">Memuat...</div>
      ) : sortedRows.length === 0 ? (
        <EmptyState title="Belum ada data transaksi atau production untuk direkonsiliasi." />
      ) : (
        <div className="overflow-x-auto card p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-3 py-2">Tanggal</th>
                <th className="px-3 py-2">Material</th>
                <th className="px-3 py-2">Lokasi</th>
                <th className="px-3 py-2">Tipe</th>
                <th className="px-3 py-2">Keterangan</th>
                <th className="px-3 py-2 text-right">Qty +/-</th>
                <th className="px-3 py-2 text-right">Running Balance</th>
                <th className="px-3 py-2 text-right">Nilai</th>
                <th className="px-3 py-2">Check</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r) => (
                <tr key={r.rowKey} className="border-t border-gray-100">
                  <td className="px-3 py-2 whitespace-nowrap">{r.date ? new Date(r.date).toLocaleDateString("id-ID") : "-"}</td>
                  <td className="px-3 py-2 font-medium">{r.materialName}</td>
                  <td className="px-3 py-2 text-gray-500">{r.locationLabel}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border ${
                        r.type === "Production Usage" ? "border-amber-200 text-amber-700" : "border-gray-200 text-gray-600"
                      }`}
                    >
                      {r.type}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-500">{r.description}</td>
                  <td className={`px-3 py-2 text-right ${r.qtyChange < 0 ? "text-red-600" : "text-green-700"}`}>
                    {r.qtyChange > 0 ? "+" : ""}
                    {Math.round(r.qtyChange * 100) / 100} {r.unit}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    {Math.round(r.runningBalance * 100) / 100} {r.unit}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-500">{idr(r.valueChange)}</td>
                  <td className="px-3 py-2">
                    <input
                      className="input py-1 text-xs w-28"
                      placeholder="Catatan"
                      defaultValue={checks[r.rowKey] || ""}
                      onBlur={(e) => saveCheck(r, e.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
