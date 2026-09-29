"use client";
import { useEffect, useMemo, useState } from "react";
import { apiList, apiCreate, apiCalc } from "@/lib/api-client";
import { useUser } from "@/components/UserContext";
import { useToast } from "@/components/ToastContext";
import Modal from "@/components/Modal";
import EmptyState from "@/components/EmptyState";

const UNITS = ["Meter", "Pcs"];
const num = (v) => Number(v) || 0;
const idr = (n) => "Rp" + Math.round(n || 0).toLocaleString("id-ID");

const emptyForm = { fromLoc: "", toLoc: "", materialName: "", quantity: "", unit: "", deliveryDate: "", reference: "", note: "" };

export default function MaterialTransactionsPage() {
  const { currentUser } = useUser();
  const { showToast } = useToast();
  const [materials, setMaterials] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [vendorBalances, setVendorBalances] = useState([]);
  const [open, setOpen] = useState(false);
  const [materialSearch, setMaterialSearch] = useState("");
  const [form, setForm] = useState(emptyForm);

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

  // "Dari"/"Ke" dropdown: Supplier and Warehouse are always available as fixed
  // locations alongside every Vendor - material still needs to enter the system
  // from a Supplier into the Warehouse before it can move on to a sewing vendor.
  const locationOptions = useMemo(() => ["Supplier", "Warehouse", ...vendors.map((v) => v.id)], [vendors]);
  const locationLabel = (id) => (id === "Warehouse" || id === "Supplier" ? id : vendorName(id));

  const filteredMaterialOptions = useMemo(() => {
    const q = materialSearch.trim().toLowerCase();
    if (!q) return materials;
    return materials.filter((m) => m.name.toLowerCase().includes(q));
  }, [materials, materialSearch]);

  const selectedMaterial = materials.find((m) => m.name === form.materialName);
  const pricePerUnit = num(selectedMaterial?.currentCOGS);
  const materialCost = num(form.quantity) * pricePerUnit;

  const selectMaterial = (name) => {
    const mat = materials.find((m) => m.name === name);
    setForm((f) => ({ ...f, materialName: name, unit: mat?.unit || f.unit }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.materialName || !form.quantity || !form.toLoc || !form.fromLoc) {
      showToast("Dari, Ke, Material, dan Quantity wajib diisi", "error");
      return;
    }
    if (form.fromLoc === form.toLoc) {
      showToast("Dari dan Ke tidak boleh sama", "error");
      return;
    }
    try {
      await apiCreate(
        "materialTransactions",
        {
          materialName: form.materialName,
          quantity: Number(form.quantity),
          unit: form.unit,
          materialCost,
          source: form.fromLoc,
          destination: form.toLoc,
          deliveryDate: form.deliveryDate,
          reference: form.reference,
          note: form.note,
        },
        currentUser
      );
      showToast("Transaksi material disimpan");
      setOpen(false);
      setForm(emptyForm);
      setMaterialSearch("");
      refresh();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

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
                        <td className="py-1 text-right">{idr(r.totalValue)}</td>
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
                  <th className="px-3 py-2">Delivery Date</th>
                  <th className="px-3 py-2">Material</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2">From → To</th>
                  <th className="px-3 py-2 text-right">Material Cost</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} className="border-t border-gray-100">
                    <td className="px-3 py-2">{t.deliveryDate || t.date || "-"}</td>
                    <td className="px-3 py-2 font-medium">{t.materialName}</td>
                    <td className="px-3 py-2 text-right">
                      {t.quantity} {t.unit}
                    </td>
                    <td className="px-3 py-2 text-gray-500">
                      {locationLabel(t.source)} → {locationLabel(t.destination)}
                    </td>
                    <td className="px-3 py-2 text-right">{idr(t.materialCost ?? t.cogs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Add Material Transaction">
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Dari</label>
              <select className="input" value={form.fromLoc} onChange={(e) => setForm({ ...form, fromLoc: e.target.value })}>
                <option value="">Pilih lokasi</option>
                {locationOptions.map((id) => (
                  <option key={id} value={id}>
                    {locationLabel(id)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Ke</label>
              <select className="input" value={form.toLoc} onChange={(e) => setForm({ ...form, toLoc: e.target.value })}>
                <option value="">Pilih lokasi</option>
                {locationOptions.map((id) => (
                  <option key={id} value={id}>
                    {locationLabel(id)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Material</label>
            <input
              className="input mb-1"
              placeholder="Cari material..."
              value={materialSearch}
              onChange={(e) => setMaterialSearch(e.target.value)}
            />
            <select className="input" value={form.materialName} onChange={(e) => selectMaterial(e.target.value)}>
              <option value="">Pilih material</option>
              {filteredMaterialOptions.map((m) => (
                <option key={m.id} value={m.name}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Quantity</label>
              <input type="number" className="input" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
            </div>
            <div>
              <label className="label">Unit</label>
              <select className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                <option value="">Pilih unit</option>
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Delivery Date</label>
            <input type="date" className="input" value={form.deliveryDate} onChange={(e) => setForm({ ...form, deliveryDate: e.target.value })} />
          </div>

          <div className="bg-gray-50 rounded-lg px-3 py-2 flex items-center justify-between text-sm">
            <span className="text-gray-500">Material Cost (Qty × Harga/Unit {idr(pricePerUnit)})</span>
            <span className="font-semibold">{idr(materialCost)}</span>
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
