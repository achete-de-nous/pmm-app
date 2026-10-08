"use client";
import { useEffect, useMemo, useState } from "react";
import { apiList, apiCalc, apiPost } from "@/lib/api-client";
import { useUser } from "@/components/UserContext";
import EmptyState from "@/components/EmptyState";
import SearchableSelect from "@/components/SearchableSelect";

const idr = (n) => "Rp" + Math.round(n || 0).toLocaleString("id-ID");

export default function TrialBalancePage() {
  const { currentUser } = useUser();
  const [materials, setMaterials] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [rows, setRows] = useState([]);
  const [checks, setChecks] = useState({});
  const [materialFilter, setMaterialFilter] = useState("");
  const [vendorFilter, setVendorFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async (mFilter, vFilter) => {
    setLoading(true);
    const params = {};
    if (mFilter) params.materialName = mFilter;
    if (vFilter) params.vendorId = vFilter;
    const [m, v, r, c] = await Promise.all([
      apiList("materials"),
      apiList("vendors"),
      apiCalc("trial-balance", params),
      apiList("reconciliations"),
    ]);
    setMaterials(m);
    setVendors(v);
    setRows(r);
    const map = {};
    c.forEach((row) => {
      map[row.rowKey] = row.value ?? "";
    });
    setChecks(map);
    setLoading(false);
  };

  useEffect(() => {
    load(materialFilter, vendorFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materialFilter, vendorFilter]);

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

  const materialOptions = useMemo(
    () => [{ value: "", label: "All" }, ...materials.map((m) => ({ value: m.name, label: m.name }))],
    [materials]
  );
  const vendorOptions = useMemo(() => vendors.map((v) => ({ value: v.id, label: v.name })), [vendors]);

  const sortedRows = useMemo(() => rows.slice().sort((a, b) => (a.date || "").localeCompare(b.date || "")), [rows]);

  const resetFilters = () => {
    setMaterialFilter("");
    setVendorFilter("");
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="text-lg font-semibold">Trial Balance</div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
        <div>
          <label className="label">Material Name</label>
          <SearchableSelect
            value={materialFilter}
            onChange={setMaterialFilter}
            options={materialOptions}
            placeholder="Semua Material"
          />
        </div>
        <div>
          <label className="label">Vendor Name</label>
          <SearchableSelect
            value={vendorFilter}
            onChange={setVendorFilter}
            options={vendorOptions}
            placeholder="Semua Vendor"
          />
        </div>
      </div>
      {(materialFilter || vendorFilter) && (
        <button className="text-xs text-gray-400 hover:text-ink self-start -mt-2" onClick={resetFilters}>
          Reset filter
        </button>
      )}

      <div className="text-xs text-gray-400 -mt-1">
        Trial Balance dihitung otomatis: transaksi material (masuk/keluar) dikurangi penggunaan material untuk
        production, diurutkan dari tanggal paling awal ke paling akhir. Kolom Manual Check tidak mempengaruhi
        kalkulasi otomatis - hanya catatan verifikasi manual.
      </div>

      {loading ? (
        <div className="text-sm text-gray-400">Memuat...</div>
      ) : sortedRows.length === 0 ? (
        <EmptyState title="Belum ada data transaksi atau production untuk direkonsiliasi." />
      ) : (
        <div className="overflow-x-auto card p-0">
          <table className="w-full text-sm table-wide table-sticky">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th>Tanggal</th>
                <th>Material</th>
                <th>Lokasi</th>
                <th>Tipe</th>
                <th>Keterangan</th>
                <th className="text-right">Qty +/-</th>
                <th className="text-right">Running Balance</th>
                <th className="text-right">Nilai</th>
                <th>Manual Check</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r) => (
                <tr key={r.rowKey} className="border-t border-gray-100">
                  <td className="whitespace-nowrap">{r.date ? new Date(r.date).toLocaleDateString("id-ID") : "-"}</td>
                  <td className="font-medium">{r.materialName}</td>
                  <td className="text-gray-500">{r.locationLabel}</td>
                  <td>
                    <span
                      className={`badge ${r.type === "Production Usage" ? "border-amber-200 text-amber-700" : ""}`}
                    >
                      {r.type}
                    </span>
                  </td>
                  <td className="text-gray-500">{r.description}</td>
                  <td className={`text-right ${r.qtyChange < 0 ? "text-red-600" : "text-green-700"}`}>
                    {r.qtyChange > 0 ? "+" : ""}
                    {Math.round(r.qtyChange * 100) / 100} {r.unit}
                  </td>
                  <td className="text-right font-medium">
                    {Math.round(r.runningBalance * 100) / 100} {r.unit}
                  </td>
                  <td className="text-right text-gray-500">{idr(r.valueChange)}</td>
                  <td>
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
