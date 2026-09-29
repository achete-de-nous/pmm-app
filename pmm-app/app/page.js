"use client";
import { useEffect, useState } from "react";
import { apiCalc } from "@/lib/api-client";
import EmptyState from "@/components/EmptyState";

const idr = (n) => "Rp" + Math.round(n || 0).toLocaleString("id-ID");

function StatCard({ label, value, sub }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState(null);

  useEffect(() => {
    apiCalc("dashboard").then(setData);
  }, []);

  if (!data) return <div className="text-sm text-gray-400">Memuat dashboard...</div>;

  if (data.isEmpty) {
    return (
      <EmptyState
        title="Belum ada data"
        hint="Mulai dengan menambahkan Material, Vendor, dan Product dari menu di atas."
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="text-lg font-semibold">Dashboard</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Total Materials" value={data.totalMaterials} />
        <StatCard label="Total Vendors" value={data.totalVendors} />
        <StatCard label="Active Production Plans" value={data.activeProductionPlans} />
        <StatCard label="Production Unfulfilled" value={data.totalProductionUnfulfilled} />
        <StatCard label="Warehouse Material Value" value={idr(data.warehouseMaterialValue)} />
        <StatCard label="Vendor Material Value" value={idr(data.vendorMaterialValue)} />
        <StatCard label="COGS Aktif" value={data.cogsChangeCount} />
        <StatCard label="Total Defect Qty" value={data.totalDefectQty} />
        <StatCard label="Finance Belum Dibayar" value={data.unpaidFinanceCount} />
      </div>
    </div>
  );
}
