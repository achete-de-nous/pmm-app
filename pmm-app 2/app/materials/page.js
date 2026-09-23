"use client";
import { useEffect, useState } from "react";
import { apiList, apiCreate, apiCalc } from "@/lib/api-client";
import { useUser } from "@/components/UserContext";
import { useToast } from "@/components/ToastContext";
import Modal from "@/components/Modal";
import EmptyState from "@/components/EmptyState";
import AutocompleteInput from "@/components/AutocompleteInput";

const UNITS = ["Meter", "Yard", "Kg", "Pcs", "Roll", "Pack", "Botol"];

export default function MaterialsPage() {
  const { currentUser } = useUser();
  const { showToast } = useToast();
  const [materials, setMaterials] = useState([]);
  const [balances, setBalances] = useState([]);
  const [matOpen, setMatOpen] = useState(false);
  const [balOpen, setBalOpen] = useState(false);

  const [matForm, setMatForm] = useState({ name: "", category: "", unit: "Meter", currentCOGS: "", supplier: "", minimumStock: "", notes: "" });
  const [balForm, setBalForm] = useState({ materialName: "", qty: "", location: "Warehouse", date: "", cogs: "", note: "" });

  const refresh = async () => {
    const [m, wb] = await Promise.all([apiList("materials"), apiCalc("warehouse-balances")]);
    setMaterials(m);
    setBalances(wb);
  };

  useEffect(() => {
    refresh();
  }, []);

  const submitMaterial = async (e) => {
    e.preventDefault();
    if (!matForm.name) return;
    try {
      await apiCreate(
        "materials",
        { ...matForm, currentCOGS: Number(matForm.currentCOGS) || 0, minimumStock: Number(matForm.minimumStock) || 0 },
        currentUser
      );
      showToast("Material disimpan");
      setMatOpen(false);
      setMatForm({ name: "", category: "", unit: "Meter", currentCOGS: "", supplier: "", minimumStock: "", notes: "" });
      refresh();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const submitBalance = async (e) => {
    e.preventDefault();
    if (!balForm.materialName || !balForm.qty) return;
    try {
      const exists = materials.some((m) => m.name.toLowerCase() === balForm.materialName.toLowerCase());
      if (!exists) {
        await apiCreate("materials", { name: balForm.materialName, unit: "", currentCOGS: Number(balForm.cogs) || 0 }, currentUser);
      }
      await apiCreate(
        "materialInitialBalances",
        {
          materialName: balForm.materialName,
          qty: Number(balForm.qty),
          location: balForm.location || "Warehouse",
          date: balForm.date,
          cogs: Number(balForm.cogs) || 0,
          note: balForm.note,
        },
        currentUser
      );
      showToast("Initial material balance disimpan");
      setBalOpen(false);
      setBalForm({ materialName: "", qty: "", location: "Warehouse", date: "", cogs: "", note: "" });
      refresh();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">Materials</div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setBalOpen(true)}>
            + Initial Balance
          </button>
          <button className="btn-primary" onClick={() => setMatOpen(true)}>
            + Material
          </button>
        </div>
      </div>

      <div>
        <div className="font-medium mb-2 text-sm text-gray-600">Material Master</div>
        {materials.length === 0 ? (
          <EmptyState title="No materials yet. Add your first material." />
        ) : (
          <div className="overflow-x-auto card p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Unit</th>
                  <th className="px-3 py-2 text-right">Current COGS</th>
                  <th className="px-3 py-2">Supplier</th>
                </tr>
              </thead>
              <tbody>
                {materials.map((m) => (
                  <tr key={m.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-medium">{m.name}</td>
                    <td className="px-3 py-2">{m.category || "-"}</td>
                    <td className="px-3 py-2">{m.unit || "-"}</td>
                    <td className="px-3 py-2 text-right">Rp{Number(m.currentCOGS || 0).toLocaleString("id-ID")}</td>
                    <td className="px-3 py-2">{m.supplier || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <div className="font-medium mb-2 text-sm text-gray-600">Warehouse Balance</div>
        {balances.length === 0 ? (
          <EmptyState title="Belum ada balance di warehouse." />
        ) : (
          <div className="overflow-x-auto card p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-3 py-2">Material</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2">Unit</th>
                  <th className="px-3 py-2 text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((b) => (
                  <tr key={b.materialName} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-medium">{b.materialName}</td>
                    <td className="px-3 py-2 text-right">{b.qty}</td>
                    <td className="px-3 py-2">{b.unit}</td>
                    <td className="px-3 py-2 text-right">Rp{Number(b.totalValue || 0).toLocaleString("id-ID")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={matOpen} onClose={() => setMatOpen(false)} title="Add Material">
        <form onSubmit={submitMaterial} className="flex flex-col gap-3">
          <div>
            <label className="label">Material Name</label>
            <input className="input" value={matForm.name} onChange={(e) => setMatForm({ ...matForm, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Category</label>
              <input className="input" value={matForm.category} onChange={(e) => setMatForm({ ...matForm, category: e.target.value })} />
            </div>
            <div>
              <label className="label">Unit</label>
              <AutocompleteInput value={matForm.unit} onChange={(v) => setMatForm({ ...matForm, unit: v })} options={UNITS} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Current COGS</label>
              <input type="number" className="input" value={matForm.currentCOGS} onChange={(e) => setMatForm({ ...matForm, currentCOGS: e.target.value })} />
            </div>
            <div>
              <label className="label">Minimum Stock</label>
              <input type="number" className="input" value={matForm.minimumStock} onChange={(e) => setMatForm({ ...matForm, minimumStock: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Supplier</label>
            <input className="input" value={matForm.supplier} onChange={(e) => setMatForm({ ...matForm, supplier: e.target.value })} />
          </div>
          <div>
            <label className="label">Notes</label>
            <input className="input" value={matForm.notes} onChange={(e) => setMatForm({ ...matForm, notes: e.target.value })} />
          </div>
          <button type="submit" className="btn-primary mt-2">
            Simpan
          </button>
        </form>
      </Modal>

      <Modal open={balOpen} onClose={() => setBalOpen(false)} title="Add Initial Material Balance">
        <form onSubmit={submitBalance} className="flex flex-col gap-3">
          <div>
            <label className="label">Material Name</label>
            <AutocompleteInput
              value={balForm.materialName}
              onChange={(v) => setBalForm({ ...balForm, materialName: v })}
              options={materials.map((m) => m.name)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Qty</label>
              <input type="number" className="input" value={balForm.qty} onChange={(e) => setBalForm({ ...balForm, qty: e.target.value })} />
            </div>
            <div>
              <label className="label">Date</label>
              <input type="date" className="input" value={balForm.date} onChange={(e) => setBalForm({ ...balForm, date: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Location</label>
              <input className="input" value={balForm.location} onChange={(e) => setBalForm({ ...balForm, location: e.target.value })} />
            </div>
            <div>
              <label className="label">COGS</label>
              <input type="number" className="input" value={balForm.cogs} onChange={(e) => setBalForm({ ...balForm, cogs: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Note</label>
            <input className="input" value={balForm.note} onChange={(e) => setBalForm({ ...balForm, note: e.target.value })} />
          </div>
          <button type="submit" className="btn-primary mt-2">
            Simpan
          </button>
        </form>
      </Modal>
    </div>
  );
}
