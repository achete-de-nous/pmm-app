"use client";
import { useEffect, useRef, useState } from "react";
import { apiList, apiCreate, apiUpdate, apiDelete, apiPost } from "@/lib/api-client";
import { useUser } from "@/components/UserContext";
import { useToast } from "@/components/ToastContext";
import Modal from "@/components/Modal";
import ConfirmDialog from "@/components/ConfirmDialog";
import EmptyState from "@/components/EmptyState";
import { downloadProductTemplate, parseProductFile, classifyRows } from "@/lib/productImport";

const idr = (n) => "Rp" + Math.round(n || 0).toLocaleString("id-ID");

const emptyForm = { sku: "", productName: "", productNameNoVariant: "", price: "", collection: "" };

const STATUS_LABEL = {
  new: { text: "Baru", cls: "bg-green-50 text-green-700" },
  "duplicate-existing": { text: "SKU sudah terdaftar", cls: "bg-amber-50 text-amber-700" },
  "duplicate-file": { text: "Duplikat di file", cls: "bg-red-50 text-red-700" },
  error: { text: "Error", cls: "bg-red-50 text-red-700" },
};

export default function ProductsPage() {
  const { currentUser } = useUser();
  const { showToast } = useToast();
  const [products, setProducts] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Import flow state
  const [importOpen, setImportOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [headerError, setHeaderError] = useState(null);
  const [parsedRows, setParsedRows] = useState([]); // classified rows
  const [duplicateStrategy, setDuplicateStrategy] = useState("skip");
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  const refresh = async () => setProducts(await apiList("products"));

  useEffect(() => {
    refresh();
  }, []);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (p) => {
    setEditing(p);
    setForm({
      sku: p.sku || "",
      productName: p.productName || "",
      productNameNoVariant: p.productNameNoVariant || "",
      price: p.price ?? "",
      collection: p.collection || "",
    });
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.productName || !form.productNameNoVariant) {
      showToast("Product Name dan Product Name w/o Variant wajib diisi", "error");
      return;
    }
    try {
      const payload = { ...form, price: Number(form.price) || 0 };
      if (editing) {
        await apiUpdate("products", editing.id, payload, currentUser);
        showToast("Product diupdate");
      } else {
        await apiCreate("products", payload, currentUser);
        showToast("Product disimpan");
      }
      setOpen(false);
      setForm(emptyForm);
      setEditing(null);
      refresh();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const confirmDelete = async () => {
    try {
      await apiDelete("products", deleteTarget.id, currentUser);
      showToast(`${deleteTarget.productName} dihapus`);
      setDeleteTarget(null);
      refresh();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  // ---- Import File flow ----

  const openImport = () => {
    setFileName("");
    setHeaderError(null);
    setParsedRows([]);
    setDuplicateStrategy("skip");
    setImportOpen(true);
  };

  const closeImport = () => {
    setImportOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParsedRows([]);
    setHeaderError(null);
    try {
      const { headerError, rows } = await parseProductFile(file);
      if (headerError) {
        setHeaderError(headerError);
        return;
      }
      if (rows.length === 0) {
        setHeaderError("File tidak berisi data. Pastikan ada baris data di bawah header.");
        return;
      }
      const classified = classifyRows(rows, products);
      setParsedRows(classified);
    } catch (err) {
      setHeaderError(err.message);
    }
  };

  const hasBlockingIssues =
    !!headerError || parsedRows.some((r) => r.status === "error" || r.status === "duplicate-file");
  const hasExistingDuplicates = parsedRows.some((r) => r.status === "duplicate-existing");
  const importableCount = parsedRows.filter((r) => r.status === "new" || r.status === "duplicate-existing").length;

  const confirmImport = async () => {
    if (hasBlockingIssues || parsedRows.length === 0) return;
    setImporting(true);
    try {
      const rowsToSend = parsedRows
        .filter((r) => r.status === "new" || r.status === "duplicate-existing")
        .map((r) => ({
          sku: r.sku,
          productName: r.productName,
          productNameNoVariant: r.productNameNoVariant,
          price: r.price,
          collection: r.collection,
        }));
      const result = await apiPost("/api/products/import", {
        rows: rowsToSend,
        duplicateStrategy,
        user: currentUser,
      });
      const parts = [];
      if (result.created) parts.push(`${result.created} ditambahkan`);
      if (result.updated) parts.push(`${result.updated} diupdate`);
      if (result.skipped) parts.push(`${result.skipped} dilewati`);
      showToast(parts.length > 0 ? parts.join(", ") : "Tidak ada perubahan", result.errors?.length ? "error" : "success");
      closeImport();
      refresh();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">Product</div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={openImport}>
            Import File
          </button>
          <button className="btn-primary" onClick={openAdd}>
            + Product
          </button>
        </div>
      </div>

      {products.length === 0 ? (
        <EmptyState title="No products yet. Add your first product." />
      ) : (
        <div className="overflow-x-auto card p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2">Product Name</th>
                <th className="px-3 py-2">Product Name w/o Variant</th>
                <th className="px-3 py-2 text-right">Harga</th>
                <th className="px-3 py-2">Collection</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-t border-gray-100">
                  <td className="px-3 py-2">{p.sku || "-"}</td>
                  <td className="px-3 py-2 font-medium">{p.productName}</td>
                  <td className="px-3 py-2 text-gray-500">{p.productNameNoVariant}</td>
                  <td className="px-3 py-2 text-right">{idr(p.price)}</td>
                  <td className="px-3 py-2">{p.collection || "-"}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button className="text-xs text-gray-400 hover:text-ink px-2 py-1" onClick={() => openEdit(p)}>
                      Edit
                    </button>
                    <button className="text-xs text-gray-400 hover:text-red-600 px-2 py-1" onClick={() => setDeleteTarget(p)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit Product" : "Add Product"}>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div>
            <label className="label">SKU</label>
            <input className="input" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          </div>
          <div>
            <label className="label">Product Name</label>
            <input className="input" value={form.productName} onChange={(e) => setForm({ ...form, productName: e.target.value })} />
          </div>
          <div>
            <label className="label">Product Name w/o Variant</label>
            <input
              className="input"
              value={form.productNameNoVariant}
              onChange={(e) => setForm({ ...form, productNameNoVariant: e.target.value })}
            />
            <div className="text-xs text-gray-400 mt-1">Value ini yang akan muncul di dropdown Product pada tab COGS.</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Harga</label>
              <input type="number" className="input" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            </div>
            <div>
              <label className="label">Collection</label>
              <input className="input" value={form.collection} onChange={(e) => setForm({ ...form, collection: e.target.value })} />
            </div>
          </div>
          <button type="submit" className="btn-primary mt-2">
            Simpan
          </button>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Hapus Product"
        message={`Yakin ingin menghapus "${deleteTarget?.productName}"? COGS yang sudah dibuat untuk product ini tidak akan terhapus.`}
        confirmLabel="Hapus"
        danger
      />

      <Modal open={importOpen} onClose={closeImport} title="Import Product dari File">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="text-sm text-gray-500">
              Upload file Excel (.xlsx) atau CSV (.csv) dengan header: <br />
              <span className="font-mono text-xs">SKU | Product | Product Name w/o Variant | Harga | Collection</span>
            </div>
            <button type="button" className="btn-secondary self-start" onClick={downloadProductTemplate}>
              Download Product Template
            </button>
          </div>

          <div>
            <label className="label">Pilih File</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              className="block w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
            />
            {fileName && <div className="text-xs text-gray-400 mt-1">{fileName}</div>}
          </div>

          {headerError && (
            <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{headerError}</div>
          )}

          {parsedRows.length > 0 && (
            <>
              <div className="text-sm font-medium">Preview ({parsedRows.length} baris)</div>
              <div className="overflow-x-auto max-h-64 overflow-y-auto border border-gray-100 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-left text-gray-500 sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5">Baris</th>
                      <th className="px-2 py-1.5">SKU</th>
                      <th className="px-2 py-1.5">Product</th>
                      <th className="px-2 py-1.5">Product Name w/o Variant</th>
                      <th className="px-2 py-1.5 text-right">Harga</th>
                      <th className="px-2 py-1.5">Collection</th>
                      <th className="px-2 py-1.5">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.map((r, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="px-2 py-1.5 text-gray-400">{r.rowNumber}</td>
                        <td className="px-2 py-1.5">{r.sku || "-"}</td>
                        <td className="px-2 py-1.5">{r.productName || "-"}</td>
                        <td className="px-2 py-1.5">{r.productNameNoVariant || "-"}</td>
                        <td className="px-2 py-1.5 text-right">{r.price ? idr(r.price) : "-"}</td>
                        <td className="px-2 py-1.5">{r.collection || "-"}</td>
                        <td className="px-2 py-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-[11px] ${STATUS_LABEL[r.status].cls}`}>
                            {r.status === "error" ? r.errors.join(", ") : STATUS_LABEL[r.status].text}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {parsedRows.some((r) => r.status === "duplicate-file") && (
                <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">
                  Ada SKU yang duplikat di dalam file ini. Perbaiki file sebelum import bisa dilanjutkan.
                </div>
              )}
              {parsedRows.some((r) => r.status === "error") && (
                <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">
                  Ada baris dengan data tidak valid. Perbaiki file sebelum import bisa dilanjutkan.
                </div>
              )}

              {hasExistingDuplicates && !hasBlockingIssues && (
                <div className="flex flex-col gap-2 bg-amber-50 rounded-lg px-3 py-2.5">
                  <div className="text-sm text-amber-800">
                    Beberapa SKU sudah terdaftar di sistem. Pilih tindakan untuk baris tersebut:
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      checked={duplicateStrategy === "skip"}
                      onChange={() => setDuplicateStrategy("skip")}
                    />
                    Lewati (Skip) — jangan ubah data yang sudah ada
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      checked={duplicateStrategy === "update"}
                      onChange={() => setDuplicateStrategy("update")}
                    />
                    Update — timpa data yang sudah ada dengan data dari file
                  </label>
                </div>
              )}

              <button
                type="button"
                className="btn-primary disabled:opacity-40"
                disabled={hasBlockingIssues || importableCount === 0 || importing}
                onClick={confirmImport}
              >
                {importing ? "Mengimport..." : `Confirm Import (${importableCount} baris)`}
              </button>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
