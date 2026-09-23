"use client";
import { useEffect, useMemo, useState } from "react";
import { apiList, apiCreate, apiCalc } from "@/lib/api-client";
import { useUser } from "@/components/UserContext";
import { useToast } from "@/components/ToastContext";
import Modal from "@/components/Modal";
import EmptyState from "@/components/EmptyState";
import AutocompleteInput from "@/components/AutocompleteInput";

const TX_TYPES = [
  { value: "Purchase", label: "Purchase (Supplier → Warehouse/Vendor)", defaultSource: "Supplier" },
  { value: "Transfer", label: "Transfer (Warehouse → Vendor)", defaultSource: "Warehouse" },
  { value: "VendorTransfer", label: "Vendor Transfer (Vendor → Vendor)" },
  { value: "Return", label: "Return (Vendor → Warehouse)" },
  { value: "DirectPurchase", label: "Direct Purchase (Supplier → Vendor)", defaultSource: "Supplier" },
];

export default function MaterialTransactionsPage() {
  const { currentUser } = useUser();
  const { showToast } = useToast();
  const [materials, setMaterials] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [vendorBalances, setVendorBalances] = useState([]);
  const [open, setOpen] = useState(false);

  const [form, setForm] = useState({
    date: "",
    txType: "Purchase",
    materialName: "",
    quantity: "",
    unit: "",
    cogs: "",
    sourceVendorId: "",
    destVendorId: "",
    reference: "",
    note: "",
  });

  const refresh = async () => {
    const [m, v, t, vb] = await Promise.all([
      apiList("materials"),
      apiList("vendors"),
      apiList("materialTransactions"),
      apiCalc("vendor-balances"),
    ]);
    setMaterials(m);
    setVendors(v);
    setTransactions(t);
    setVendorBalances(vb);
  };

  useEffect(() => {
    refresh();
  }, []);

  const vendorName = (id) => vendors.find((v) => v.id === id)?.name || id;

  const resolveSourceDest = () => {
    const type = form.txType;
    if (type === "Purchase") return { source: "Supplier", destination: form.destVendorId || "Warehouse" };
    if (type === "Transfer") return { source: "Warehouse", destination: form.destVendorId };
    if (type === "VendorTransfer") return { source: form.sourceVendorId, destination: form.destVendorId };
    if (type === "Return") return { source: form.sourceVendorId, destination: "Warehouse" };
    if (type === "DirectPurchase") return { source: "Supplier", destination: form.destVendorId };
    return { source: "", destination: "" };
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.materialName || !form.quantity) return;
    const { source, destination } = resolveSourceDest();
    if (!destination && form.txType !== "Purchase") {
      showToast("Tujuan wajib dipilih", "error");
      return;
    }
    try {
      await apiCreate(
        "materialTransactions",
        {
          date: form.date,
          txType: form.txType,
          materialName: form.materialName,
          quantity: Number(form.quantity),
          unit: form.unit,
          cogs: Number(form.cogs) || 0,
          source,
          destination,
          reference: form.reference,
          note: form.note,
        },
        currentUser
      );
      showToast("Transaksi material disimpan");
      setOpen(false);
      setForm({ date: "", txType: "Purchase", materialName: "", quantity: "", unit: "", cogs: "", sourceVendorId: "", destVendorId: "", reference: "", note: "" });
      refresh();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const needsSourceVendor = form.txType === "VendorTransfer" || form.txType === "Return";
  const needsDestVendor = form.txType !== "Return";

  const vendorGroups = useMemo(() => {
    const groups = {};
    for (const row of vendorBalances) {
      if (!groups[row.location]) groups[row.location] = { name: row.locationLabel, rows: [] };
      groups[row.location].rows.push(row);
    }
    return Object.values(groups);
  }, [vendorBalances]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">Material Transactions</div>
        <button className="btn-primary" onClick={() => setOpen(true)}>
          + Transaction
        </button>
      </div>

      <div>
        <div className="font-medium mb-2 text-sm text-gray-600">Vendor Material Balance</div>
        {vendorGroups.length === 0 ? (
          <EmptyState title="Belum ada material di vendor." />
        ) : (
          <div className="flex flex-col gap-3">
            {vendorGroups.map((g) => (
              <div key={g.name} className="card">
                <div className="font-medium mb-2">{g.name}</div>
                <table className="w-full text-sm">
                  <thead className="text-left text-gray-500">
                    <tr>
                      <th className="py-1">Material</th>
                      <th className="py-1 text-right">Qty</th>
                      <th className="py-1 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((r) => (
                      <tr key={r.materialName} className="border-t border-gray-100">
                        <td className="py-1">{r.materialName}</td>
                        <td className="py-1 text-right">
                          {r.qty} {r.unit}
                        </td>
                        <td className="py-1 text-right">Rp{Number(r.totalValue || 0).toLocaleString("id-ID")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="font-medium mb-2 text-sm text-gray-600">Transaction History</div>
        {transactions.length === 0 ? (
          <EmptyState title="No transactions yet." />
        ) : (
          <div className="overflow-x-auto card p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Material</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2">From → To</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} className="border-t border-gray-100">
                    <td className="px-3 py-2">{t.date || "-"}</td>
                    <td className="px-3 py-2">{t.txType}</td>
                    <td className="px-3 py-2 font-medium">{t.materialName}</td>
                    <td className="px-3 py-2 text-right">{t.quantity}</td>
                    <td className="px-3 py-2 text-gray-500">
                      {t.source === "Supplier" || t.source === "Warehouse" ? t.source : vendorName(t.source)} →{" "}
                      {t.destination === "Warehouse" ? "Warehouse" : vendorName(t.destination)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Add Material Transaction">
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div>
            <label className="label">Transaction Type</label>
            <select className="input" value={form.txType} onChange={(e) => setForm({ ...form, txType: e.target.value })}>
              {TX_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Material</label>
            <AutocompleteInput
              value={form.materialName}
              onChange={(v) => setForm({ ...form, materialName: v })}
              options={materials.map((m) => m.name)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Quantity</label>
              <input type="number" className="input" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
            </div>
            <div>
              <label className="label">Unit</label>
              <input className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            </div>
          </div>
          {needsSourceVendor && (
            <div>
              <label className="label">Source Vendor</label>
              <select className="input" value={form.sourceVendorId} onChange={(e) => setForm({ ...form, sourceVendorId: e.target.value })}>
                <option value="">Pilih vendor</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {needsDestVendor && (
            <div>
              <label className="label">Destination Vendor</label>
              <select className="input" value={form.destVendorId} onChange={(e) => setForm({ ...form, destVendorId: e.target.value })}>
                <option value="">Pilih vendor</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Date</label>
              <input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <label className="label">COGS</label>
              <input type="number" className="input" value={form.cogs} onChange={(e) => setForm({ ...form, cogs: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Reference</label>
            <input className="input" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
          </div>
          <div>
            <label className="label">Note</label>
            <input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
          <button type="submit" className="btn-primary mt-2">
            Simpan
          </button>
        </form>
      </Modal>
    </div>
  );
}
