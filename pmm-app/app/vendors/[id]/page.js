"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiList, apiCalc } from "@/lib/api-client";
import EmptyState from "@/components/EmptyState";

export default function VendorDetailPage() {
  const { id } = useParams();
  const [vendor, setVendor] = useState(null);
  const [plans, setPlans] = useState([]);
  const [balances, setBalances] = useState([]);
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    (async () => {
      const [vendors, allPlans, vb, allTx] = await Promise.all([
        apiList("vendors"),
        apiList("productionPlans"),
        apiCalc("vendor-balances", { vendorId: id }),
        apiList("materialTransactions"),
      ]);
      setVendor(vendors.find((v) => v.id === id));
      setPlans(allPlans.filter((p) => p.vendorId === id));
      setBalances(vb);
      setTransactions(allTx.filter((t) => t.source === id || t.destination === id));
    })();
  }, [id]);

  if (!vendor) return <div className="text-sm text-gray-400">Memuat...</div>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="text-lg font-semibold">{vendor.name}</div>
        {vendor.vendorType && (
          <span className="inline-block text-xs px-2 py-0.5 rounded-full border border-gray-200 text-gray-600 mt-1">
            {vendor.vendorType}
          </span>
        )}
        <div className="text-sm text-gray-500 mt-1">
          {vendor.contactPerson || "-"} · {vendor.phone || vendor.email || "-"}
        </div>
      </div>

      <div>
        <div className="font-medium mb-2 text-sm text-gray-600">Production Plans</div>
        {plans.length === 0 ? (
          <EmptyState title="Belum ada production plan untuk vendor ini." />
        ) : (
          <div className="overflow-x-auto card p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-3 py-2">Article</th>
                  <th className="px-3 py-2 text-right">Planned</th>
                  <th className="px-3 py-2 text-right">Fulfilled</th>
                  <th className="px-3 py-2 text-right">Unfulfilled</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-medium">{p.articleName}</td>
                    <td className="px-3 py-2 text-right">{p.plannedQty}</td>
                    <td className="px-3 py-2 text-right">{p.fulfilledQty || 0}</td>
                    <td className="px-3 py-2 text-right">{Math.max(0, (p.plannedQty || 0) - (p.fulfilledQty || 0))}</td>
                    <td className="px-3 py-2">{p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <div className="font-medium mb-2 text-sm text-gray-600">Material Balance</div>
        {balances.length === 0 ? (
          <EmptyState title="Belum ada material di vendor ini." />
        ) : (
          <div className="overflow-x-auto card p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-3 py-2">Material</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((b) => (
                  <tr key={b.materialName} className="border-t border-gray-100">
                    <td className="px-3 py-2">{b.materialName}</td>
                    <td className="px-3 py-2 text-right">
                      {b.qty} {b.unit}
                    </td>
                    <td className="px-3 py-2 text-right">Rp{Number(b.totalValue || 0).toLocaleString("id-ID")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <div className="font-medium mb-2 text-sm text-gray-600">Material Transaction History</div>
        {transactions.length === 0 ? (
          <EmptyState title="Belum ada transaksi." />
        ) : (
          <div className="overflow-x-auto card p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Material</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} className="border-t border-gray-100">
                    <td className="px-3 py-2">{t.date || "-"}</td>
                    <td className="px-3 py-2">{t.txType}</td>
                    <td className="px-3 py-2">{t.materialName}</td>
                    <td className="px-3 py-2 text-right">{t.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
