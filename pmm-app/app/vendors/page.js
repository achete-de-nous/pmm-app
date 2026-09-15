"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiList, apiCreate } from "@/lib/api-client";
import { useUser } from "@/components/UserContext";
import { useToast } from "@/components/ToastContext";
import Modal from "@/components/Modal";
import EmptyState from "@/components/EmptyState";

export default function VendorsPage() {
  const { currentUser } = useUser();
  const { showToast } = useToast();
  const [vendors, setVendors] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", vendorCode: "", contactPerson: "", phone: "", email: "", address: "", notes: "" });

  const refresh = async () => setVendors(await apiList("vendors"));

  useEffect(() => {
    refresh();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name) return;
    try {
      await apiCreate("vendors", form, currentUser);
      showToast("Vendor disimpan");
      setOpen(false);
      setForm({ name: "", vendorCode: "", contactPerson: "", phone: "", email: "", address: "", notes: "" });
      refresh();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">Vendors</div>
        <button className="btn-primary" onClick={() => setOpen(true)}>
          + Vendor
        </button>
      </div>

      {vendors.length === 0 ? (
        <EmptyState title="No vendors yet. Add your first vendor." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {vendors.map((v) => (
            <Link key={v.id} href={`/vendors/${v.id}`} className="card hover:border-ink transition-colors">
              <div className="font-medium">{v.name}</div>
              <div className="text-sm text-gray-500">{v.contactPerson || "-"}</div>
              <div className="text-sm text-gray-500">{v.phone || v.email || ""}</div>
            </Link>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Add Vendor">
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div>
            <label className="label">Vendor Name</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Vendor Code</label>
              <input className="input" value={form.vendorCode} onChange={(e) => setForm({ ...form, vendorCode: e.target.value })} />
            </div>
            <div>
              <label className="label">Contact Person</label>
              <input className="input" value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Phone</label>
              <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Address</label>
            <input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div>
            <label className="label">Notes</label>
            <input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <button type="submit" className="btn-primary mt-2">
            Simpan
          </button>
        </form>
      </Modal>
    </div>
  );
}
