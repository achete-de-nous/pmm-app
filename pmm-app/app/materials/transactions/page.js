"use client";
import { useEffect, useMemo, useState } from "react";
import { apiList, apiCreate } from "@/lib/api-client";
import { useUser } from "@/components/UserContext";
import { useToast } from "@/components/ToastContext";
import Modal from "@/components/Modal";
import SearchableSelect from "@/components/SearchableSelect";

const UNITS = ["Meter", "Pcs"];
const num = (v) => Number(v) || 0;
const idr = (n) => "Rp" + Math.round(n || 0).toLocaleString("id-ID");
const ALL_MATERIALS = "__ALL__";

const emptyForm = { fromLoc: "", toLoc: "", materialName: "", quantity: "", unit: "", deliveryDate: "", reference: "", note: "" };

export default function MaterialTransactionsPage() {
  const { currentUser } = useUser();
  const { showToast } = useToast();
  const [materials, setMaterials] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const refresh = async () => {
    const [m, v] = await Promise.all([apiList("materials"), apiList("vendors")]);
    setMaterials(m);
    setVendors(v);
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
  const locationSelectOptions = useMemo(
    () => locationOptions.map((id) => ({ value: id, label: locationLabel(id) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locationOptions, vendors]
  );

  // Material Name filter: an explicit "All" entry shows every material in the
  // dropdown (the default) - picking a specific one narrows down to just that.
  const materialFilterOptions = useMemo(
    () => [{ value: ALL_MATERIALS, label: "All" }, ...materials.map((m) => ({ value: m.name, label: m.name }))],
    [materials]
  );
  const materialFilter = form.materialName || ALL_MATERIALS;

  const selectedMaterial = materials.find((m) => m.name === form.materialName);
  const pricePerUnit = num(selectedMaterial?.currentCOGS);
  const materialCost = num(form.quantity) * pricePerUnit;

  const selectMaterial = (name) => {
    if (name === ALL_MATERIALS) {
      setForm((f) => ({ ...f, materialName: "" }));
      return;
    }
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
      refresh();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">Material Transactions</div>
        <button className="btn-primary" onClick={() => setOpen(true)}>
          + Transaction
        </button>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Add Material Transaction">
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Dari</label>
              <SearchableSelect
                value={form.fromLoc}
                onChange={(v) => setForm({ ...form, fromLoc: v })}
                options={locationSelectOptions}
                placeholder="Pilih lokasi"
              />
            </div>
            <div>
              <label className="label">Ke</label>
              <SearchableSelect
                value={form.toLoc}
                onChange={(v) => setForm({ ...form, toLoc: v })}
                options={locationSelectOptions}
                placeholder="Pilih lokasi"
              />
            </div>
          </div>

          <div>
            <label className="label">Material Name</label>
            <SearchableSelect
              value={materialFilter}
              onChange={selectMaterial}
              options={materialFilterOptions}
              placeholder="All"
            />
            <div className="text-xs text-gray-400 mt-1">Pilih "All" untuk menampilkan seluruh material, lalu pilih material yang dituju.</div>
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
